/**
 * complete-prereqs.ts
 * -------------------
 * Automated full-database prerequisite completion worker.
 *
 * Pipeline per program (resumable, checkpointed in data/completion-state.json):
 *   1. discover  — candidate official URLs (stored sourceUrl/websiteUrl, cached
 *                  queue candidates, same-domain keyword links, Firecrawl or
 *                  DuckDuckGo/Bing search fallback)
 *   2. fetch     — retrieve official page(s), cache HTML with content hash
 *   3. extract   — OpenAI structured output (strict JSON schema) over the
 *                  retrieved OFFICIAL text only; never invents requirements
 *   4. validate  — shape/classification checks; reject empty or malformed
 *   5. persist   — non-destructive update with provenance + verification note
 *   6. read-back — post-write assertion (status, sourceUrl, course count)
 *
 * Statuses assigned:
 *   verified              — explicit prerequisite coursework extracted from official source
 *   no_prereqs_published  — official source states no specific course prerequisites
 *   needs_review          — sources retrieved but no usable requirement list found yet
 *   (source_blocked is only set after all retrieval methods fail; see failure queue)
 *
 * Usage:
 *   Load repo-root `.env` (DATABASE_URL, OPENAI_API_KEY, optional FIRECRAWL_API_KEY,
 *   JINA_API_KEY, KEENABLE_API_KEY). Never commit `.env`. Copy `.env.example` for names only.
 *   If Firecrawl returns 401/402, this worker disables it for the rest of the run
 *   and continues over Keenable / Jina / HTTP / Wikidata / DuckDuckGo / Bing.
 *
 *   pnpm --filter @workspace/scripts run complete:prereqs -- --limit 10 --profession physical-therapy
 *   pnpm --filter @workspace/scripts run complete:prereqs -- --all-unfinished
 *   pnpm --filter @workspace/scripts run complete:prereqs -- --retry-failures
 */
import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, programSchoolsTable, type PrereqItem, type PrereqSource } from "@workspace/db";
import {
  nativeSiteSearch,
  probeProgramHosts,
  rootDomainOf,
  sitemapCandidates,
} from "./native-discovery.js";
import { NO_PREREQ_ASSERTION, entityLabelMatchesInstitution, institutionTokens } from "./extraction-rules.js";
import { SearchBudget } from "./search-budget.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const CACHE_DIR = path.join(ROOT, "data/prereq-source-cache");
const QUEUE_DIR = path.join(ROOT, "data/prereq-review-queue");
const STATE_FILE = path.join(ROOT, "data/completion-state.json");
const TODAY = new Date().toISOString().slice(0, 10);
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 HealthProfessionsPlanner/1.0";

function loadRepoDotEnv() {
  const envPath = path.join(ROOT, ".env");
  try {
    const text = fs.readFileSync(envPath, "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i < 1) continue;
      const name = line.slice(0, i).trim();
      let val = line.slice(i + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[name]) process.env[name] = val;
    }
  } catch {
    /* .env is optional when the shell already exported keys */
  }
}
loadRepoDotEnv();

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? "";
// Additional extraction providers. Both offer free tiers far above OpenAI's per-day request
// cap and both answered faster than gpt-4o-mini in testing, so extraction no longer stalls
// when any one provider is rate-limited.
const GROQ_KEY = process.env.GROQ_API_KEY ?? "";
const GROQ_MODEL = process.env.COMPLETION_GROQ_MODEL || "openai/gpt-oss-120b";
const GEMINI_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_MODEL = process.env.COMPLETION_GEMINI_MODEL || "gemini-2.5-flash";
let JINA_KEY = process.env.JINA_API_KEY ?? "";
let jinaDisabledReason = "";
function disableJina(reason: string) {
  if (!JINA_KEY) return;
  console.warn(`Jina disabled for this run: ${reason}`);
  jinaDisabledReason = reason;
  JINA_KEY = "";
}
let FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY ?? "";
let firecrawlDisabledReason = "";
function disableFirecrawl(reason: string) {
  if (!FIRECRAWL_KEY) return;
  console.warn(`Firecrawl disabled for this run: ${reason}`);
  firecrawlDisabledReason = reason;
  FIRECRAWL_KEY = "";
}
let KEENABLE_KEY = (process.env.KEENABLE_API_KEY ?? "").trim();
let keenableDisabledReason = "";
function disableKeenable(reason: string) {
  if (!KEENABLE_KEY) return;
  console.warn(`Keenable disabled for this run: ${reason}`);
  keenableDisabledReason = reason;
  KEENABLE_KEY = "";
}
function keenableAuthHeaders(): Record<string, string> {
  return { "X-API-Key": KEENABLE_KEY, accept: "application/json" };
}
const KEYWORDS = [
  "prerequisite", "pre-requisite", "admission-requirements", "admission_requirements",
  "admissions", "admission", "requirements", "required-course", "how-to-apply",
  "apply", "eligibility", "prospective", "application-requirements", "catalog", "handbook",
  "curriculum", "coursework", "bsn", "absn", "msn", "mepn", "dpt", "otd", "pharmd",
  "leveling", "communication-sciences", "communication-disorders", "pre-pharmacy", "csd",
  "checksheet", "plan-of-study", "course-list", "required-coursework", "pre-professional",
  "non-csd", "background-course", "prerequisite-coursework", "academic-requirements",
];
const CONCURRENCY = Number(process.env.COMPLETION_CONCURRENCY || 3);
const PER_DOMAIN_DELAY_MS = 900;
const OPENAI_MODEL = process.env.COMPLETION_MODEL || "gpt-4o-mini";

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// ── Durable per-program state ────────────────────────────────────────────────

type Stage =
  | "unstarted" | "source_discovery" | "source_fetched" | "extracted"
  | "validated" | "persisted" | "finalized" | "failed";

// Bump this when the retrieval/extraction architecture changes materially (new fallback method,
// a previously-broken dependency fixed, etc). Programs that exhausted their attempt budget under
// an older generation get exactly one fresh attempt under the new one, without losing their prior
// failure history (state[id].error still holds the last message from whichever generation).
// Gen 7: reject music/law/wrong-dept medicine crawls; boost medschool/pharmd URL scoring;
// broader open-web medicine discovery; longer OpenAI 429 backoff.
// Gen 8: official-domain discovery (program-subdomain probing, native CMS site search,
// sitemap harvesting) plus a circuit breaker that stops burning per-query timeouts on
// search engines that are bot-blocked or out of credit. Records that exhausted gen 7 --
// when discovery had no working search backend at all -- get a fresh attempt under this.
// Gen 10: three keyless search backends (DuckDuckGo lite, Marginalia, Brave HTML) replacing
// engines that only served bot-challenge pages; Groq and Gemini as extraction providers
// alongside OpenAI, removing the per-day request ceiling; generic graduate-admissions pages
// demoted so department pages outrank them; parent-institution name resolution fixed for
// donor-named and campus-qualified schools; a wider second-chance crawl.
//
// 341 of the 421 remaining programs were locked out by gen 9's attempt limit and had never
// been tried against any of that.
// Gen 11: metered search (Serper/Tavily) is now available and the query cap can be raised.
// The 240 programs left after gen 10 are overwhelmingly "page found, but no prerequisite list
// on it" -- discovery reaching *a* page rather than *the* page. Query depth was capped at 1
// while the only search was free engines that throttled; with roughly 2,000 metered queries
// still unspent against 240 programs, several targeted queries each is affordable and is a
// materially different attempt rather than a repeat of the same work.
const CURRENT_PIPELINE_GEN = 11;

interface ProgramState {
  stage: Stage;
  lastAttempt: string;
  attempts: number;
  finalStatus?: string;
  error?: string;
  sourceUrl?: string;
  pipelineGen?: number;
}
type StateMap = Record<string, ProgramState>;

function loadState(): StateMap {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}
let state: StateMap = loadState();
function sleepSync(ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* spin — keep saveState sync for callers */ }
}
function saveState() {
  // Desktop/OneDrive/AV can briefly lock this file on Windows; retry instead of killing the queue.
  const data = JSON.stringify(state, null, 1);
  const tmp = `${STATE_FILE}.${process.pid}.tmp`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      fs.writeFileSync(tmp, data);
      try {
        fs.renameSync(tmp, STATE_FILE);
      } catch {
        fs.copyFileSync(tmp, STATE_FILE);
        try { fs.unlinkSync(tmp); } catch { /* ignore */ }
      }
      return;
    } catch (e) {
      lastErr = e;
      sleepSync(40 * 2 ** attempt);
    }
  }
  console.warn(`warning: failed to persist completion-state.json after retries: ${lastErr instanceof Error ? lastErr.message : lastErr}`);
}
function setState(id: number, patch: Partial<ProgramState>) {
  const prev = state[id] ?? { stage: "unstarted", lastAttempt: "", attempts: 0 };
  state[id] = { ...prev, ...patch, lastAttempt: new Date().toISOString() };
  saveState();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

const domainLastHit = new Map<string, number>();
async function politeDelay(url: string) {
  const host = new URL(url).hostname;
  const last = domainLastHit.get(host) ?? 0;
  const wait = last + PER_DOMAIN_DELAY_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  domainLastHit.set(host, Date.now());
}

interface Fetched { url: string; html: string; text: string; hash: string; contentType: string }

async function firecrawlScrape(url: string): Promise<Fetched> {
  if (!FIRECRAWL_KEY) throw new Error(firecrawlDisabledReason || "Firecrawl not configured");
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { authorization: `Bearer ${FIRECRAWL_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    signal: AbortSignal.timeout(60_000),
  });
  if (res.status === 402 || res.status === 401) {
    disableFirecrawl(`scrape HTTP ${res.status}`);
    throw new Error(`Firecrawl scrape HTTP ${res.status}`);
  }
  if (res.status === 429) {
    // Transient rate limit — wait and let caller fall back; do not permanently disable.
    await new Promise((r) => setTimeout(r, 5000));
    throw new Error(`Firecrawl scrape HTTP 429`);
  }
  if (!res.ok) throw new Error(`Firecrawl scrape HTTP ${res.status}`);
  const body = (await res.json()) as { data?: { markdown?: string } };
  const md = body.data?.markdown ?? "";
  if (!md.trim()) throw new Error("Firecrawl returned empty content");
  return {
    url, html: md, text: md.slice(0, 160_000),
    hash: crypto.createHash("sha256").update(md).digest("hex"),
    contentType: "text/markdown",
  };
}

async function firecrawlSearch(query: string): Promise<string[]> {
  if (!FIRECRAWL_KEY) return [];
  const res = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: { authorization: `Bearer ${FIRECRAWL_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ query, limit: 5 }),
    signal: AbortSignal.timeout(45_000),
  });
  if (res.status === 402 || res.status === 401) {
    disableFirecrawl(`search HTTP ${res.status}`);
    return [];
  }
  if (!res.ok) throw new Error(`Firecrawl search HTTP ${res.status}`);
  const body = (await res.json()) as { data?: Array<{ url?: string }> };
  return (body.data ?? []).map((d) => d.url).filter((u): u is string => !!u);
}

async function keenableSearch(query: string): Promise<string[]> {
  if (!KEENABLE_KEY) return [];
  await politeDelay("https://api.keenable.ai/search");
  const res = await fetch("https://api.keenable.ai/v1/search", {
    method: "POST",
    headers: { ...keenableAuthHeaders(), "content-type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 402 || res.status === 401 || res.status === 403) {
    disableKeenable(`search HTTP ${res.status}`);
    return [];
  }
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 2000));
    throw new Error("Keenable search HTTP 429");
  }
  if (!res.ok) throw new Error(`Keenable search HTTP ${res.status}`);
  const body = (await res.json()) as { results?: Array<{ url?: string }> };
  return (body.results ?? []).map((d) => d.url).filter((u): u is string => !!u);
}

async function keenableFetch(url: string): Promise<Fetched> {
  if (!KEENABLE_KEY) throw new Error(keenableDisabledReason || "Keenable not configured");
  await politeDelay("https://api.keenable.ai/fetch");
  const endpoint = `https://api.keenable.ai/v1/fetch?url=${encodeURIComponent(url)}&live=true`;
  const res = await fetch(endpoint, {
    headers: keenableAuthHeaders(),
    signal: AbortSignal.timeout(60_000),
  });
  if (res.status === 402 || res.status === 401 || res.status === 403) {
    disableKeenable(`fetch HTTP ${res.status}`);
    throw new Error(`Keenable fetch HTTP ${res.status}`);
  }
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 2000));
    throw new Error("Keenable fetch HTTP 429");
  }
  if (!res.ok) throw new Error(`Keenable fetch HTTP ${res.status}`);
  const body = (await res.json()) as { content?: string; url?: string };
  const md = (body.content ?? "").replace(/\u0000/g, "").trim();
  if (md.length < 300) throw new Error("Keenable too little text");
  return {
    url: body.url || url,
    html: md,
    text: md.slice(0, 160_000),
    hash: crypto.createHash("sha256").update(md).digest("hex"),
    contentType: "text/markdown",
  };
}

async function fetchOfficial(url: string): Promise<Fetched> {
  const primary = normalizeCandidateUrl(url) ?? url;
  const attempts = [primary];
  if (/^https:\/\//i.test(primary)) {
    attempts.push("http://" + primary.slice("https://".length));
  }
  let lastError: unknown;
  for (const attemptUrl of attempts) {
    await politeDelay(attemptUrl);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(attemptUrl, {
          headers: {
            "user-agent": USER_AGENT,
            accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5",
            "accept-language": "en-US,en;q=0.9",
            "cache-control": "no-cache",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(25_000),
        });
        if (!res.ok) {
          const err = new Error(`HTTP ${res.status}`);
          // Do not retry permanent client failures — heuristic paths produce many 404s.
          if (res.status === 404 || res.status === 410 || res.status === 403 || res.status === 401) throw err;
          throw err;
        }
        const contentType = res.headers.get("content-type") ?? "";
        if (contentType.includes("pdf") || /\.pdf($|\?)/i.test(attemptUrl)) {
          if (FIRECRAWL_KEY) {
            try { return await firecrawlScrape(res.url || attemptUrl); } catch { /* fall through */ }
          }
          return extractPdfText(res.url || attemptUrl);
        }
        const html = await res.text();
        return {
          url: res.url, html, text: stripHtml(html).slice(0, 160_000),
          hash: crypto.createHash("sha256").update(html).digest("hex"),
          contentType,
        };
      } catch (e) {
        lastError = e;
        const msg = e instanceof Error ? e.message : String(e);
        if (/HTTP (401|403|404|410)\b/.test(msg)) break; // try alternate scheme if any
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

let sharedBrowserPromise: Promise<import("playwright").Browser> | null = null;
async function getSharedBrowser(): Promise<import("playwright").Browser> {
  if (!sharedBrowserPromise) {
    sharedBrowserPromise = import("playwright").then(({ chromium }) =>
      chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
    );
  }
  return sharedBrowserPromise;
}

async function closeSharedBrowser() {
  if (sharedBrowserPromise) {
    try {
      const browser = await sharedBrowserPromise;
      await browser.close();
    } catch { /* ignore */ }
    sharedBrowserPromise = null;
  }
}

let browserUseCount = 0;

/** Renders JS-heavy admissions/prerequisite pages via headless Chromium when plain fetch yields thin content. */
/**
 * Per-program budget for headless-browser renders.
 *
 * Each render is capped at 45s, but nothing capped how many a single program could trigger:
 * six ranked candidates each falling through to a render is 270s of rendering alone, on top
 * of the crawl, which is why programs kept exceeding even a 420s bound. Workers run
 * concurrently inside one process, so the budget has to be per-program rather than a module
 * counter -- AsyncLocalStorage scopes it to the program currently being processed.
 */
const renderBudget = new AsyncLocalStorage<{ remaining: number }>();
// Two renders per programme was set when rendering was a rare last resort behind Jina,
// Keenable and Firecrawl. Those keys are all dead now, so the browser is the only way to read
// a site that refuses plain HTTP, and the budget was being exhausted before the candidate that
// needed it -- NYU's and Purdue's catalogues answer a bot challenge and return 159 characters
// to a plain fetch, so every candidate on those hosts needs the browser.
//
// Raising it to six was still not enough for a programme whose whole catalogue is behind a
// challenge. The real bound on cost is the per-programme deadline, which already stops a slow
// programme regardless of how it is spending its time; counting renders on top of that mostly
// stopped programmes that had a readable page in reach.
const MAX_RENDERS_PER_PROGRAM = Number(process.env.COMPLETION_MAX_RENDERS || 14);

async function fetchRendered(url: string): Promise<Fetched> {
  const budget = renderBudget.getStore();
  if (budget) {
    if (budget.remaining <= 0) {
      throw new Error("Browser render: per-program render budget exhausted");
    }
    budget.remaining -= 1;
  }
  return fetchRenderedGuarded(url);
}

async function fetchRenderedGuarded(url: string): Promise<Fetched> {
  // Every Playwright call below (newContext/newPage/route/evaluate/content) has no built-in
  // timeout of its own. If the shared Chromium process wedges — which happens over a multi-hour
  // run rendering hundreds of pages — those calls hang forever and permanently strand whichever
  // worker called in. A hard outer race is the only thing that can recover from that; on timeout
  // we also drop the shared browser instance so the NEXT call launches a fresh one instead of
  // reusing whatever got stuck.
  const TIMEOUT_MS = 45_000;
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Browser render: hard timeout after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
  });
  try {
    return await Promise.race([fetchRenderedInner(url), timeout]);
  } catch (e) {
    if (e instanceof Error && e.message.includes("hard timeout")) {
      sharedBrowserPromise = null; // force a fresh browser next call — this one may be wedged
    }
    throw e;
  } finally {
    clearTimeout(timer!);
  }
}

async function fetchRenderedInner(url: string): Promise<Fetched> {
  await politeDelay(url);
  browserUseCount += 1;
  // Recycle the shared browser periodically — long-lived Chromium instances accumulate memory/
  // zombie-tab pressure over hundreds of renders in a multi-hour run and become more likely to wedge.
  if (browserUseCount % 100 === 0) await closeSharedBrowser();
  const browser = await getSharedBrowser();
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1366, height: 900 },
  });
  const page = await context.newPage();
  try {
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (type === "image" || type === "font" || type === "media") return route.abort();
      return route.continue();
    });
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (!res) throw new Error("Browser render: no response");
    if (!res.ok() && res.status() !== 304) throw new Error(`Browser render HTTP ${res.status()}`);
    // Give hydration/accordion content a moment to settle.
    await page.waitForTimeout(1500);
    // Some sites answer the first request with a bot challenge and only serve the page after it
    // resolves: NYU's postbaccalaureate pages redirect to ?challenge=... and return an empty
    // 202, so a fixed wait captured nothing and the programme was recorded as "too little text".
    // Waiting for content to appear reads the page a browser would have shown a person.
    for (let waited = 0; waited < 8000; waited += 1000) {
      const soFar = stripHtml(await page.content());
      if (soFar.length >= 200) break;
      await page.waitForTimeout(1000);
    }
    // Expand common accordion/tab admissions widgets so hidden prerequisite text becomes visible
    // text. The selector list is widened with [data-toggle] and .collapsible because Denver
    // College of Nursing puts its entire prerequisite table behind headers carrying neither
    // aria-expanded nor a Bootstrap accordion class; a plain read of that page returned the
    // section headings and nothing else.
    try {
      await page.evaluate(`
        (function () {
          var clickable = document.querySelectorAll('[aria-expanded="false"], .accordion-button, .accordion-header, .accordion-title, [data-toggle], [data-bs-toggle], .collapsible, [role="tab"], summary');
          for (var i = 0; i < clickable.length; i++) { try { clickable[i].click(); } catch (e) {} }
        })()
      `);
      await page.waitForTimeout(500);
      // Clicking is not enough when a panel is hidden by CSS rather than by a widget's own
      // state, so anything still collapsed is forced visible. This only reveals text the page
      // already contains; it cannot introduce text the school did not publish.
      await page.addStyleTag({
        content: ".collapse,.accordion-collapse,.panel-collapse,[hidden]{display:block !important;visibility:visible !important;height:auto !important;max-height:none !important;opacity:1 !important}",
      });
      await page.waitForTimeout(400);
    } catch { /* best effort */ }
    const html = await page.content();
    // A bot challenge leaves its one-time token on the URL. Citing that as the official source
    // gives a reader a link that is specific to this run rather than to the page.
    const finalUrl = (() => {
      try {
        const u = new URL(page.url());
        for (const p of ["challenge", "sessionid", "session_id", "cf_chl_tk", "__cf_chl_tk", "token"]) u.searchParams.delete(p);
        return u.toString().replace(/\?$/, "");
      } catch {
        return page.url();
      }
    })();
    const text = stripHtml(html).slice(0, 160_000);
    if (text.length < 200) throw new Error("Browser render: too little text");
    return {
      url: finalUrl,
      html,
      text,
      hash: crypto.createHash("sha256").update(html).digest("hex"),
      contentType: "text/html",
    };
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

const BLOCKED_SEARCH_HOSTS =
  /reddit\.com|facebook\.com|twitter\.com|x\.com|youtube\.com|tiktok\.com|quora\.com|studentdoctor\.net|collegevine\.com|niche\.com|gradschools\.com|petersons\.com|wikipedia\.org|linkedin\.com|indeed\.com|glassdoor\.com|nextgenmedprep\.com|skillnation\.|admitva\.com|myworkdaysite\.com|collegexpress|cappex\.com|princetonreview|shemmassian|accepted\.com|prospectivedoctor|beatthegmat|msuspartans\.com|sidearmsports|ncaa\.com|perfdrive\.com|botmanager|akamaihd\.net|challenge\.cloudflare/i;

const DIRECTORY_HUB_HOSTS =
  /ada\.org|adea\.org|lcme\.org|aacom\.org|aacomas\.|acpe-accredit\.org|aae\.org|optometriceducation\.org|aaopt\.org|caspa\.liaison|otcas\.|ptcas\.|pharmacycas\.|aavmc\.org|liaisoncas\.|ncope\.org|capteonline\.org|acoteonline\.org|caahep\.org|caahi?m\.org|naacls\.org|acend\.|eatright\.org|aamc\.org|students-residents\.aamc|apps\.asha\.org|asha\.org\/eweb/i;

function isDirectoryHubUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const normalized = normalizeCandidateUrl(url) ?? url;
    const u = new URL(normalized.startsWith("http") ? normalized : `https://${normalized}`);
    return DIRECTORY_HUB_HOSTS.test(`${u.hostname}${u.pathname}`);
  } catch {
    return false;
  }
}

/** Athletics marketing sites mistakenly stored as program websites (e.g. msuspartans.com). */
function isAthleticsOrSportsUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const hay = url.toLowerCase();
  return /spartans\.com|sidearm|athletics|\/sports\/|gogoes|goducks|gohuskies|und\.com|ncaa/i.test(hay) &&
    !/nursing|pharmacy|medicine|therapy|physician|slp|csd|prerequisite/i.test(hay);
}

/** Search scrapes sometimes emit broken punycode hosts (xn--...) that are not real campuses. */
function isGarbageDiscoveredUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase();
    if (/xn--/i.test(host)) return true; // US .edu programs do not need punycode hosts
    if (host.length > 80) return true;
    if (/urgentcaremap|locationsloma|wikigeisinger/i.test(host)) return true;
    return false;
  } catch {
    return true;
  }
}

/** Application portals and undergrad marketing pages that drown out graduate prereq lists. */
function isLowValueCandidate(url: string): boolean {
  const hay = url.toLowerCase();
  if (isAthleticsOrSportsUrl(url)) return true;
  // A school announces a programme in its newsroom and publishes the requirements on the
  // programme page. Oklahoma Baptist's press release is slugged
  // "...-speech-language-pathology-prerequisite-courses", so it reads like the requirements
  // page and scores like one, but a news post is not where requirements live.
  if (/\/(news|blog|press|stories|story|events?|profiles?|magazine|newsroom)\//i.test(hay)) return true;
  if (isGarbageDiscoveredUrl(url)) return true;
  // Bot/WAF challenge interstitial pages (e.g. NYU admissions.html?challenge=...).
  if (/[?&]challenge=|cf-challenge|captcha|akamai|_guard|security-check|perfdrive|botmanager|ssa=/i.test(hay)) return true;
  if (/ellucian|crmrecruit|apply-gobaylor|myworkday|commonapp|slate\.|targetx/.test(hay)) return true;
  if (/financial-aid|tuition|video-tour|virtual-office|visit-campus|campus-tour|housing/.test(hay)) return true;
  // Site chrome that can never carry prerequisite coursework. A crawl seeded at a bare
  // homepage surfaces these constantly -- SUNY Upstate's crawl spent its candidate slots on
  // /privacy.php and /prospective/finaid/ -- and each one costs a fetch plus an OpenAI
  // extraction before failing as "no usable prereq list". Matched on path segments so a
  // legitimate page is not caught by a substring.
  if (/\/(privacy|terms|accessibility|sitemap|copyright|disclaimer|nondiscrimination|finaid|scholarships?|parking|maps?|directions|emergency|covid|alumni|giving|donate|careers|jobs|employment|library|bookstore|athletics|news|events|blog|newsroom|press|social-media|contact-us)(\.\w+)?\/?($|[?#])/i.test(hay)) {
    return true;
  }
  // State/federal portals that match institution tokens (e.g. "Texas", "Virginia") but are not schools.
  if (/\.(gov)([/?#]|$)/i.test(hay) && !/\.edu/i.test(hay)) return true;
  if (/undergraduate-admissions|\/freshman|first-year|high-school-students|undergrad\/apply|precollege/.test(hay) &&
      !hasGradOrProfessionPath(hay)) {
    return true;
  }
  // Generic campus chrome that recently flooded the nursing queue with false "no usable list" failures.
  if (/academic-catalog\.php|\/core-curriculum\/?$|admissions-disability|\/calendar\/?$|\/visit\/?$|\/advisement\/?$/.test(hay)) {
    return true;
  }
  if (/admissions-events|prospective-students\.php|info\.html$|\/transfer\.html|\/transfer\/?$|international-student/.test(hay) &&
      !/graduate|slp|csd|dpt|otd|pharmd|msn|mepn|absn|physician|post-bacc|postbac|prerequisite|nursing|occupational|physical/.test(hay)) {
    return true;
  }
  if (/international\/requirements-transfer|readmission-and-non-degree|non-degree/.test(hay) &&
      !/nursing|absn|mepn|prerequisite|accelerated/.test(hay)) {
    return true;
  }
  if (/library\.|\/library\/|iucat\.|worldcat|summer-camp|studentorgs|facultystaff|faculty-staff|alumni|giving|donate/i.test(hay) &&
      !/prereq|admission|requirement|nursing|slp|csd|dpt|otd|pharm/i.test(hay)) {
    return true;
  }
  // News/media/events and tech checklists drown discovery without course lists.
  if (/\/news\/|news-and-media|white-coat|videos?\/|spotlight|alumni-spotlight|laptop-requirements|blog\//i.test(hay) &&
      !/prerequisite|pre-requisite|admission-requirements|coursework/i.test(hay)) {
    return true;
  }
  // Wrong-department chrome that medicine/pharmacy crawls keep landing on.
  if (/\/music\/|faculty-development-center|graduate-certificate-academic-medicine|collegeadmissions\./i.test(hay) &&
      !/medicine\/admissions|medschool|pharmd|prerequisite/i.test(hay)) {
    return true;
  }
  return false;
}

let searchChain: Promise<void> = Promise.resolve();
async function withSearchLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = searchChain;
  let release!: () => void;
  searchChain = new Promise<void>((r) => { release = r; });
  await prev;
  try {
    // Keyless engines were measured reliable at ~2.5s spacing; tighter pacing is what
    // rate-limits them.
    await new Promise((r) => setTimeout(r, Number(process.env.COMPLETION_SEARCH_DELAY_MS || 9000)));
    return await fn();
  } finally {
    release();
  }
}

/**
 * Keyless search backends that still work from this host.
 *
 * The conclusion that "every search engine is blocked" came from testing
 * html.duckduckgo.com, which rate-limits after about two queries. The LITE endpoint behaves
 * completely differently: measured across six stuck programs at ~2.5s spacing it returned the
 * institution's own pages 6/6 times with no errors, where Brave HTML managed 2/6 (four 429s)
 * and Marginalia 4/6. None needs an API key, an account or payment.
 *
 * Ordered by that measured reliability. Everything returned is filtered downstream by
 * looksLikeOfficialProgramUrl, so these only ever DISCOVER a candidate -- the evidence still
 * has to come from the institution's own domain.
 */
/**
 * Metered search providers.
 *
 * These are free-tier keys with a fixed lifetime allowance, and they are the only search that
 * works reliably from this host -- both scored 3/3 on programs the keyless engines could not
 * resolve, returning the exact pages discovery needs (GWU's MD admissions requirements,
 * Bradley's catalog entry for its speech-language-hearing-sciences major). Every query is
 * counted against a persisted budget so the allowance cannot be spent twice by the worker
 * restarting, and each provider drops out of the chain once its cap is reached, falling back
 * to the keyless engines.
 */
const SERPER_KEY = process.env.SERPER_API_KEY ?? "";
const TAVILY_KEY = process.env.TAVILY_API_KEY ?? "";
const searchBudget = new SearchBudget(
  path.join(ROOT, "data/search-usage.json"),
  {
    serper: Number(process.env.COMPLETION_SERPER_CAP || 2_000),
    tavily: Number(process.env.COMPLETION_TAVILY_CAP || 800),
  },
);

async function serperSearch(query: string): Promise<string[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": SERPER_KEY, "content-type": "application/json" },
    body: JSON.stringify({ q: query, num: 10 }),
    signal: AbortSignal.timeout(25_000),
  });
  searchBudget.spend("serper");
  if (!res.ok) throw new Error(`Serper HTTP ${res.status}`);
  const json = (await res.json()) as { organic?: Array<{ link?: string }> };
  return (json.organic ?? []).map((o) => o.link ?? "").filter(Boolean).slice(0, 12);
}

async function tavilySearch(query: string): Promise<string[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { authorization: `Bearer ${TAVILY_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ query, max_results: 10, search_depth: "basic" }),
    signal: AbortSignal.timeout(25_000),
  });
  searchBudget.spend("tavily");
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  const json = (await res.json()) as { results?: Array<{ url?: string }> };
  return (json.results ?? []).map((r) => r.url ?? "").filter(Boolean).slice(0, 12);
}

function extractResultUrls(html: string): string[] {
  const urls = new Set<string>();
  for (const m of html.matchAll(/https?:\/\/[^"'<> )\\]+/g)) {
    const u = m[0].replace(/&amp;/g, "&").replace(/[.,)]+$/, "");
    if (/duckduckgo\.com|brave\.com|marginalia\.nu|w3\.org|schema\.org|gstatic|googleapis/i.test(u)) continue;
    if (u.length > 300) continue;
    urls.add(u);
  }
  return [...urls].slice(0, 12);
}

async function duckDuckGoLiteSearch(query: string): Promise<string[]> {
  const res = await fetch("https://lite.duckduckgo.com/lite/", {
    method: "POST",
    headers: {
      "user-agent": USER_AGENT,
      "content-type": "application/x-www-form-urlencoded",
      accept: "text/html",
    },
    body: `q=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(15_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`DuckDuckGo lite HTTP ${res.status}`);
  return extractResultUrls(await res.text());
}

async function marginaliaSearch(query: string): Promise<string[]> {
  const res = await fetch(`https://old-search.marginalia.nu/search?query=${encodeURIComponent(query)}`, {
    headers: { "user-agent": USER_AGENT, accept: "text/html" },
    signal: AbortSignal.timeout(15_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Marginalia HTTP ${res.status}`);
  return extractResultUrls(await res.text());
}

async function braveHtmlSearch(query: string): Promise<string[]> {
  const res = await fetch(`https://search.brave.com/search?q=${encodeURIComponent(query)}`, {
    headers: { "user-agent": USER_AGENT, accept: "text/html", "accept-language": "en-US,en;q=0.9" },
    signal: AbortSignal.timeout(15_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Brave HTML HTTP ${res.status}`);
  return extractResultUrls(await res.text());
}

async function duckDuckGoSearch(query: string): Promise<string[]> {
  const res = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "user-agent": USER_AGENT,
      "content-type": "application/x-www-form-urlencoded",
      accept: "text/html",
    },
    body: `q=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(10_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`DuckDuckGo search HTTP ${res.status}`);
  const html = await res.text();
  const urls: string[] = [];
  for (const m of html.matchAll(/uddg=([^&"]+)/gi)) {
    try {
      const decoded = decodeURIComponent(m[1]);
      if (/^https?:\/\//i.test(decoded)) urls.push(decoded);
    } catch { /* skip */ }
  }
  for (const m of html.matchAll(/class="result__a"[^>]*href="([^"]+)"/gi)) {
    const href = m[1];
    if (href.startsWith("http")) urls.push(href);
    else {
      try {
        const u = new URL(href, "https://duckduckgo.com");
        const uddg = u.searchParams.get("uddg");
        if (uddg) urls.push(uddg);
      } catch { /* skip */ }
    }
  }
  for (const m of html.matchAll(/href="([^"]+)"[^>]*class="result__a"/gi)) {
    if (m[1].startsWith("http")) urls.push(m[1]);
  }
  return [...new Set(urls)].slice(0, 8);
}

function normalizeDiscoveredUrl(raw: string): string | null {
  // Bing cites often use "›" breadcrumb separators instead of "/".
  let text = stripHtml(raw).replace(/\s+/g, "").replace(/›/g, "/").replace(/…/g, "");
  if (!/^https?:\/\//i.test(text)) {
    if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) text = `https://${text}`;
    else return null;
  }
  try {
    const u = new URL(text);
    u.hash = "";
    if (!/^https?:$/i.test(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

async function bingSearch(query: string): Promise<string[]> {
  const res = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(30_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Bing search HTTP ${res.status}`);
  const html = await res.text();
  const urls: string[] = [];
  for (const m of html.matchAll(/<cite[^>]*>([\s\S]*?)<\/cite>/gi)) {
    const normalized = normalizeDiscoveredUrl(m[1]);
    if (normalized) urls.push(normalized);
  }
  for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/gi)) {
    const u = m[1];
    if (/bing\.|microsoft\.|msn\.|live\.com|aka\.ms|creativecommons/i.test(u)) continue;
    const normalized = normalizeDiscoveredUrl(u);
    if (normalized) urls.push(normalized);
  }
  return [...new Set(urls)].slice(0, 12);
}

async function googleSearch(query: string): Promise<string[]> {
  const res = await fetch(`https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&num=10`, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(20_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Google search HTTP ${res.status}`);
  const html = await res.text();
  if (/unusual traffic|captcha|sorry\/index/i.test(html) && html.length < 20_000) {
    throw new Error("Google search blocked");
  }
  const urls: string[] = [];
  for (const m of html.matchAll(/href="\/url\?q=(https?:\/\/[^"&]+)/gi)) {
    try {
      const decoded = decodeURIComponent(m[1]);
      if (/google\.|gstatic\.|youtube\.|webcache/i.test(decoded)) continue;
      urls.push(decoded);
    } catch { /* skip */ }
  }
  for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/gi)) {
    const u = m[1];
    if (/google\.|gstatic\.|schema\.org|youtube\./i.test(u)) continue;
    urls.push(u);
  }
  return [...new Set(urls)].slice(0, 10);
}

/**
 * Circuit breaker for search backends.
 *
 * Google/Bing answer HTTP 200 with a bot-challenge body and DuckDuckGo starts returning
 * HTTP 202 after ~2 queries, so a dead engine looks "reachable" and silently costs its full
 * timeout on every single query (Bing's is 30s). Left unguarded that burned ~96s per program
 * on searches that can never succeed. After MAX_DEAD consecutive empty/failed results an
 * engine is skipped until COOLDOWN_MS has passed, then given one probe to recover.
 */
const SEARCH_DEAD_STREAK: Record<string, number> = {};
const SEARCH_DEAD_UNTIL: Record<string, number> = {};
const MAX_DEAD = 3;
const SEARCH_COOLDOWN_MS = 15 * 60_000;

function engineAvailable(name: string): boolean {
  const until = SEARCH_DEAD_UNTIL[name] ?? 0;
  if (until && Date.now() < until) return false;
  return true;
}

function noteEngineResult(name: string, gotResults: boolean): void {
  if (gotResults) {
    SEARCH_DEAD_STREAK[name] = 0;
    SEARCH_DEAD_UNTIL[name] = 0;
    return;
  }
  const streak = (SEARCH_DEAD_STREAK[name] ?? 0) + 1;
  SEARCH_DEAD_STREAK[name] = streak;
  if (streak >= MAX_DEAD) {
    SEARCH_DEAD_UNTIL[name] = Date.now() + SEARCH_COOLDOWN_MS;
    SEARCH_DEAD_STREAK[name] = 0;
    console.warn(`search engine ${name} circuit-opened for ${SEARCH_COOLDOWN_MS / 60000}m (no usable results)`);
  }
}

async function tryEngine(
  name: string,
  run: () => Promise<string[]>,
  accept: (urls: string[]) => string[],
): Promise<string[] | null> {
  if (!engineAvailable(name)) return null;
  try {
    const useful = accept(await run());
    noteEngineResult(name, useful.length > 0);
    return useful.length ? useful : null;
  } catch {
    noteEngineResult(name, false);
    return null;
  }
}

/** True when every general search backend is currently circuit-open. */
export function allSearchEnginesDown(): boolean {
  return ["serper", "tavily", "keenable", "firecrawl", "ddglite", "marginalia", "bravehtml", "google", "bing", "duckduckgo"].every((e) => !engineAvailable(e));
}

let keylessRotation = 0;
async function webSearch(query: string): Promise<string[]> {
  // Skip the global search lock entirely when nothing is answering — the 1.2s serialized
  // delay is pure cost if every engine is circuit-open.
  if (allSearchEnginesDown()) return [];
  return withSearchLock(async () => {
    if (KEENABLE_KEY) {
      const r = await tryEngine("keenable", () => keenableSearch(query), (u) => u.filter((x) => !BLOCKED_SEARCH_HOSTS.test(x)));
      if (r) return r;
    }
    if (FIRECRAWL_KEY) {
      const r = await tryEngine("firecrawl", () => firecrawlSearch(query), (u) => u);
      if (r) return r;
    }
    // Metered providers first: they are the only search that works reliably from this host
    // (3/3 each on programs the keyless engines could not resolve), and each stops being
    // offered once its budget is spent.
    if (SERPER_KEY && searchBudget.canSpend("serper")) {
      const r = await tryEngine("serper", () => serperSearch(query), (u) => u.filter((x) => !BLOCKED_SEARCH_HOSTS.test(x)));
      if (r) return r;
    }
    if (TAVILY_KEY && searchBudget.canSpend("tavily")) {
      const r = await tryEngine("tavily", () => tavilySearch(query), (u) => u.filter((x) => !BLOCKED_SEARCH_HOSTS.test(x)));
      if (r) return r;
    }
    // Keyless engines, rotated. Measured in isolation: DuckDuckGo lite 6/6, Marginalia 4/6,
    // Brave 2/6, against 0/6 for the Google and Bing scrapers which serve only bot-challenge
    // pages. Always trying them in the same order put the entire query load on DuckDuckGo,
    // which then rate-limited and returned nothing -- so rotate the starting point and spread
    // the load across all three.
    const keyless: Array<[string, () => Promise<string[]>]> = [
      ["ddglite", () => duckDuckGoLiteSearch(query)],
      ["marginalia", () => marginaliaSearch(query)],
      ["bravehtml", () => braveHtmlSearch(query)],
    ];
    const offset = keylessRotation++ % keyless.length;
    for (let i = 0; i < keyless.length; i++) {
      const [name, fn] = keyless[(offset + i) % keyless.length];
      const r = await tryEngine(name, fn, (u) => u.filter((x) => !BLOCKED_SEARCH_HOSTS.test(x)));
      if (r) return r;
    }
    {
      const r = await tryEngine("google", () => googleSearch(query), (u) => u.filter((x) => !BLOCKED_SEARCH_HOSTS.test(x)));
      if (r) return r;
    }
    {
      const r = await tryEngine(
        "bing",
        () => bingSearch(query),
        (u) => {
          const useful = u.filter((x) => !BLOCKED_SEARCH_HOSTS.test(x) && !/wikipedia|usnews|britannica/i.test(x));
          return useful.length >= 2 ? useful : [];
        },
      );
      if (r) return r;
    }
    {
      const r = await tryEngine("duckduckgo", () => duckDuckGoSearch(query), (u) => u);
      if (r) return r;
    }
    return [];
  });
}

function professionKeywords(slug: string): string[] {
  const map: Record<string, string[]> = {
    "physical-therapy": ["physical therapy", "dpt"],
    "occupational-therapy": ["occupational therapy", "otd", "msot"],
    "physician-assistant": ["physician assistant", "physician associate"],
    "anesthesiologist-assistant": ["anesthesiologist assistant", "anesthesia"],
    "pathologists-assistant": ["pathologist"],
    medicine: ["medicine", "medical", "md program", "m.d.", "osteopathic"],
    "osteopathic-medicine": ["osteopathic", "d.o."],
    dental: ["dental", "dentistry"],
    optometry: ["optometry"],
    pharmacy: ["pharmacy", "pharmd"],
    veterinary: ["veterinary", "dvm"],
    podiatry: ["podiatr"],
    postbac: ["post-bac", "postbac", "post bac", "premed", "pre-med", "linkage"],
    nursing: ["nursing", "bsn", "msn", "absn", "mepn"],
    dietetics: ["dietetic", "nutrition", "rdn"],
    "genetic-counseling": ["genetic counseling"],
    "speech-language-pathology": [
      "speech", "language pathology", "slp", "communication sciences",
      "communication disorders", "communicative", "csd", "speech-language", "leveling",
    ],
    "prosthetics-orthotics": ["prosthetic", "orthotic", "o&p"],
  };
  return map[slug] ?? slug.split("-").filter((w) => w.length > 3);
}


function universitySearchName(name: string): string {
  return name
    .replace(/\s*[-–—].*$/u, "")
    .replace(/\s+\((?:PharmD|MD|DO|DPT|OTD|MSN|ABSN|MEPN|SLP).*$/i, "")
    .replace(/\s+(?:Harrison|John \w+|Marnix E\.? Heersink|Frederick P\.? Whiddon)\s+(?:College|School).+$/i, "")
    .replace(/\s+(?:School|College|Department|Division|Program) of .+$/i, "")
    .replace(/\s+(?:College of Pharmacy|School of Pharmacy|College of Medicine|School of Medicine|School of Dentistry|School of Nursing).+$/i, "")
    .trim();
}

function hostMatchesWebsite(urlHost: string, websiteUrl: string | null | undefined): boolean {
  if (!websiteUrl) return false;
  try {
    const home = new URL(websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`).hostname.replace(/^www\./i, "").toLowerCase();
    const host = urlHost.replace(/^www\./i, "").toLowerCase();
    return host === home || host.endsWith(`.${home}`) || home.endsWith(`.${host}`);
  } catch {
    return false;
  }
}

function hasGradOrProfessionPath(hay: string): boolean {
  // "undergraduate" contains the substring "graduate" — strip it before testing.
  const h = hay.toLowerCase().replace(/undergraduate/g, " ");
  return /(?:graduate|slp\b|csd\b|\bdpt\b|\botd\b|pharmd|\bmsn\b|mepn|absn|physician|post-?bacc|postbac|communication|occupational|physical-therapy|pa-program)/i.test(h);
}

const CAMPUS_HOST_HINTS: Array<[RegExp, RegExp]> = [
  [/\bgreensboro\b/i, /uncg|greensboro/i],
  [/\bcharlotte\b/i, /charlotte|uncc/i],
  [/\bwilmington\b/i, /uncw|wilmington/i],
  [/\basheville\b/i, /unca|asheville/i],
  [/\bpembroke\b/i, /uncp|pembroke/i],
  [/\bchapel hill\b|\bchapel-hill\b/i, /(^|\.)unc\.edu$/i],
];

/** Known official host aliases that do not literally contain institution name tokens. */
const INSTITUTION_HOST_ALIASES: Array<[RegExp, RegExp]> = [
  [/\bnew jersey\b/i, /tcnj/i],
  [/\bcolorado(?:\s+springs)?\b/i, /uccs|colorado\.edu|uccs\.edu/i],
  [/\bnorth texas\b|\bunthsc\b|\bhs center\b/i, /unt|unthealth|unthsc/i],
  [/\bwashington\b/i, /(^|\.)uw\.edu$|washington\.edu|uw\.edu|depts\.washington/i],
  [/\bnorthern arizona\b/i, /nau\.edu/i],
  [/\buniversity of arizona\b/i, /arizona\.edu/i],
  [/\bnorthwestern state\b/i, /nsula/i],
  [/\bnortheastern state\b/i, /nsuok/i],
  [/\btexas christian\b|\bchristian university\b/i, /tcu\.edu|mdschool\.tcu/i],
  [/\bsouthern illinois\b/i, /siu\.edu/i],
  [/\bsan diego state\b/i, /sdsu\.edu/i],
  [/\bkaiser\b/i, /kaiserpermanente|kp\.org|medschool\.kp\.edu|schoolofmedicine\.kaiser/i],
  [/\bloma linda\b/i, /llu\.edu|lluh\.org/i],
  [/\bucla\b|geffen\b/i, /medschool\.ucla|ucla\.edu/i],
  [/\byale\b/i, /medicine\.yale|yale\.edu/i],
  [/\bstanford\b/i, /med\.stanford|stanford\.edu/i],
  [/\bnorthwestern\b/i, /feinberg\.northwestern|northwestern\.edu/i],
  [/\bhackensack\b/i, /hackensackmeridian|hmhn\.org/i],
];

function campusHostConflicts(name: string, host: string): boolean {
  return CAMPUS_HOST_HINTS.some(([nameRe, hostRe]) => nameRe.test(name) && !hostRe.test(host));
}

const US_STATE_CODES = new Set([
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id", "il", "in", "ia", "ks",
  "ky", "la", "me", "md", "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny",
  "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv",
  "wi", "wy",
]);

/**
 * True when a per-campus catalogue host names a different state than the programme's campus.
 *
 * A university with campuses in several states publishes a catalogue for each, and the
 * institution guard cannot tell them apart because both belong to the same university.
 * Midwestern's Glendale (Arizona) programmes kept being sourced from
 * catalog.il.midwestern.edu, the Illinois catalogue, even after the row was repointed.
 */
function catalogHostStateConflicts(host: string, state: string): boolean {
  const m = /^catalogs?\.([a-z]{2})\./i.exec(host);
  const sub = m?.[1]?.toLowerCase();
  if (!sub || !US_STATE_CODES.has(sub)) return false;
  const rowState = String(state ?? "").trim().toLowerCase();
  return rowState.length === 2 && US_STATE_CODES.has(rowState) && sub !== rowState;
}

function hostMatchesInstitutionAlias(name: string, host: string): boolean {
  return INSTITUTION_HOST_ALIASES.some(([nameRe, hostRe]) => nameRe.test(name) && hostRe.test(host));
}

/** True when a URL's host looks like a different institution (e.g. pennwest.edu for Bradley). */
// Department/school subdomains (nursing.unc.edu, pharmacy.university.edu, grad.school.edu, ...)
// describe the DEPARTMENT, not the institution, by design -- they will never appear in the
// institution's own name and must not be judged against it as if they were a mismatch signal.
const DEPARTMENT_SUBDOMAIN_WORDS = new Set([
  "nursing", "pharmacy", "dental", "dentistry", "medicine", "medical", "health", "nutrition",
  "engineering", "business", "law", "education", "science", "sciences", "arts", "music",
  "kinesiology", "optometry", "podiatry", "veterinary", "psychology", "counseling", "therapy",
  "graduate", "nursingdept", "chsp", "cshs", "shp", "hsc", "healthsciences",
  // Campus chrome / application portals — not institution names.
  "programs", "admissions", "admission", "applicant", "applicants", "application", "apply",
  "portal", "document", "viewer", "provider", "documentproviderviewer", "programapplication",
  "academic", "academics", "catalog", "catalogs", "online", "students", "student", "faculty",
  "alumni", "news", "events", "college", "school", "department", "offices", "office", "services",
  "familymedicine", "mdschool", "medex", "johnsonbethel", "tcom", "physician", "assistants",
]);

function websiteConflictsWithInstitution(url: string, name: string): boolean {
  try {
    const raw = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const host = new URL(raw).hostname.replace(/^www\./i, "").toLowerCase();
    if (campusHostConflicts(name, host)) return true;
    // A state government portal is never a program's official site, but its name token
    // matches the institution ("Louisiana State University ..." -> louisiana.gov), which
    // otherwise passes the alias check below and poisons the whole crawl.
    if (/\.gov$/i.test(host)) return true;
    // Wikidata answers "University of ..." with whichever famous university matches loosely:
    // ox.ac.uk appeared on seventeen rows, and blocking that one domain simply produced
    // cam.ac.uk on the next run. British and Australasian academic suffixes are refused
    // outright, since no programme in these US accreditor directories is hosted on one.
    if (/\.(ac\.uk|ac\.nz|edu\.au|ac\.za|ac\.in)$/i.test(host)) return true;
    // Municipal portals do not all use the .gov suffix, and a city shares its name with the
    // schools in it: denvergov.org passed as "Denver College of Nursing" because "denver" is
    // the college's distinctive word.
    if (/(^|\.)(\w+gov|cityof\w+|\w+county)\.(org|com|net)$/i.test(host)) return true;
    if (hostMatchesInstitutionAlias(name, host)) return false;
    const nameNorm = normalize(name);
    if (institutionTokens(name).some((t) => host.includes(t))) return false;
    // Campus catalog hosts (catalog.dyu.edu, catalogs.eku.edu) are usually official.
    if (/^catalogs?\./i.test(host) && /\.edu$/i.test(host)) return false;
    // Judge the registrable campus label only (tcnj.edu / programs.tcnj.edu → "tcnj"),
    // not department subdomains that previously caused false "mismatched institution" rejects.
    const labels = host.replace(/\.(edu|org|com|net|gov)$/i, "").split(".");
    const base = labels[labels.length - 1] ?? "";
    // Short .edu labels are accepted: universities use opaque acronyms and contractions that
    // share no text with their name (lmunet, iupuc, uiw, valpo, emich, mnsu, wustl, uchc), so
    // judging them by spelling produces overwhelmingly false rejections -- an acronym-based
    // rule flagged 309 active rows of which all but two were correct. Wrong seeds of this kind
    // are caught by seedMentionsInstitution below, which reads the page instead of the domain.
    if (base.length <= 6 && /\.edu$/i.test(host)) return false; // tcnj, uccs, bsu, uw, nau
    if (/\.edu$/i.test(host)) {
      const nameLetters = normalize(name).replace(/[^a-z0-9]/g, "");
      // A contraction of the name: appstate.edu for Appalachian State University. Checked as a
      // subsequence so it cannot match an unrelated school -- cuanschutz is not a subsequence
      // of "university of california san diego".
      let i = 0;
      for (const ch of nameLetters) { if (ch === base[i]) i++; if (i === base.length) break; }
      if (i === base.length) return false;
      // Initials plus a place: csuohio.edu for Cleveland State University. The label must start
      // with the institution's own initials, which an unrelated school's label will not.
      const initials = normalize(name).split(" ").filter(Boolean).map((w) => w[0]).join("");
      if (initials.length >= 3 && base.startsWith(initials.slice(0, 3))) return false;
    }
    const hostWords = [base].filter((w) => w.length >= 6 && !DEPARTMENT_SUBDOMAIN_WORDS.has(w));
    return hostWords.some((w) => !nameNorm.includes(w) && !institutionTokens(name).some((t) => w.includes(t) || t.includes(w)));
  } catch {
    return false;
  }
}

/** Upgrade http→https, add missing schemes, drop empty/bogus URLs, unwrap duplicated schemes. */
function normalizeCandidateUrl(url: string): string | null {
  if (!url || url.startsWith("cache:")) return url || null;
  let u = url.trim();
  // Directory imports sometimes store http://https://host/...
  u = u.replace(/^http:\/\/https:\/\//i, "https://");
  u = u.replace(/^https:\/\/https:\/\//i, "https://");
  u = u.replace(/^http:\/\/http:\/\//i, "http://");
  while (/^https?:\/\/https?:\/\//i.test(u)) {
    u = u.replace(/^https?:\/\//i, "");
  }
  if (/^https?:\/\/\/?$/i.test(u) || u === "http://" || u === "https://") return null;
  // Bare hosts/paths from directory imports (e.g. www.twu.edu/ot/) must get a scheme.
  if (!/^https?:\/\//i.test(u) && !u.startsWith("cache:")) {
    if (/^[a-z0-9.-]+\.[a-z]{2,}([/:?]|$)/i.test(u)) u = `https://${u}`;
    else return null;
  }
  if (/^http:\/\//i.test(u)) {
    u = "https://" + u.slice("http://".length);
  }
  try {
    const parsed = new URL(u);
    if (!parsed.hostname || parsed.hostname === ".") return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Progressively shorter name variants for entity lookup.
 *
 * Directory names carry a donor-named school ("University of Pikeville Tanner College of
 * Dental Medicine", "University of the Pacific Arthur A. Dugoni School of Dentistry").
 * Stripping only the "<School> of <X>" clause leaves the donor tokens attached, which match
 * no Wikidata entity, so also walk trailing words off until the parent institution remains.
 * Stops at the institution head word so we never truncate into a different university.
 */
function institutionNameVariants(name: string): string[] {
  const variants = [name, universitySearchName(name)];

  // Many medical schools name the parent institution AFTER the school:
  // "Frank H. Netter MD School of Medicine at Quinnipiac University",
  // "Sidney Kimmel Medical College at Thomas Jefferson University",
  // "Medical College of Georgia at Augusta University".
  // Trailing-word truncation destroys exactly the part that identifies the
  // institution, so lift the "... at <Parent>" tail out as its own variant.
  // Drop a leading article: the tail of "... at the University of South Alabama" is "the
  // University of South Alabama", which matches no Wikidata entity even though the
  // institution is perfectly well known.
  const atParent = /\bat\s+(.{4,}?)\s*$/i.exec(name);
  if (atParent) variants.push(atParent[1].trim().replace(/^the\s+/i, ""));

  // Directory data writes campus names with a dash ("University of North Carolina-Greensboro")
  // where Wikidata writes "at" ("University of North Carolina at Greensboro"), so no entity
  // matches. This is not merely a miss: universitySearchName truncates at the first dash,
  // leaving "University of North Carolina" -- a DIFFERENT institution whose website would then
  // be attached to the Greensboro program. Offer the "at" spelling before any truncated form.
  // Wikidata uses either spelling for a campus -- "University of North Carolina at
  // Greensboro" but "California State University, Los Angeles" -- so offer both.
  if (/\S[-–—]\S|\S\s[-–—]\s\S/.test(name)) {
    variants.push(name.replace(/\s*[-–—]\s*/u, " at "));
    variants.push(name.replace(/\s*[-–—]\s*/u, ", "));
  }

  // Truncations, shortest first.
  //
  // The parent institution is the SHORTEST truncation ("Boston University" from "Boston
  // University Aram V. Chobanian & Edward Avedisian School of Medicine"), and it is the one
  // most likely to be a real Wikidata entity -- the intermediate forms ("Boston University
  // Aram V.") match nothing. Generated longest-first and then capped, the useful variant was
  // always the one cut off, so donor-named schools never resolved at all.
  const words = universitySearchName(name).split(/\s+/);
  const truncations: string[] = [];
  for (let end = words.length - 1; end >= 2; end--) {
    truncations.push(words.slice(0, end).join(" "));
    // Once the tail is the institution head word itself, further truncation changes identity.
    if (/^(university|college|institute|school|academy)$/i.test(words[end - 1])) break;
  }
  variants.push(...truncations.reverse());
  return [...new Set(variants.map((v) => v.trim()).filter((v) => v.length >= 6))].slice(0, 8);
}

/**
 * Wikidata is the fallback that rescues programs with a missing or wrong stored website,
 * so it must not be squandered. Every program tries several name variants and workers run
 * concurrently, which trips Wikidata's rate limiter; a throttled reply is plain text, so
 * `.json()` throws and the lookup silently degrades into "unresolved" exactly when it is
 * needed most. Cache per institution name (many programs share one) and serialise requests
 * with a small delay plus backoff on throttling.
 */
const wikidataCache = new Map<string, Promise<string | null>>();
let wikidataChain: Promise<unknown> = Promise.resolve();
let wikidataBackoffUntil = 0;

async function wikidataFetchJson(url: string): Promise<any | null> {
  const run = async (): Promise<any | null> => {
    // Wait out a throttle rather than failing through it. Returning null here marked the
    // program "no official candidate URLs" and burned an attempt, and because the backoff is
    // process-wide a single throttled response did that to every program processed in the
    // next 60 seconds across all workers -- precisely the no-seed rows for which Wikidata is
    // the only route to a candidate URL. Requests are already serialised, so waiting costs
    // throughput but never correctness.
    const waitFor = wikidataBackoffUntil - Date.now();
    if (waitFor > 0) {
      await new Promise((r) => setTimeout(r, Math.min(waitFor, 90_000)));
    }
    await new Promise((r) => setTimeout(r, 350));
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 429 || res.status === 503) {
      wikidataBackoffUntil = Date.now() + 60_000;
      return null;
    }
    if (!res.ok) return null;
    const body = await res.text();
    // A throttled/error reply is plain text, not JSON.
    if (!body.startsWith("{") && !body.startsWith("[")) {
      if (/too many requests|rate limit/i.test(body)) wikidataBackoffUntil = Date.now() + 60_000;
      return null;
    }
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  };
  const next = wikidataChain.then(run, run);
  wikidataChain = next.catch(() => undefined);
  return next;
}

async function wikidataOfficialWebsite(name: string): Promise<string | null> {
  const hit = wikidataCache.get(name);
  if (hit) return hit;
  const p = wikidataOfficialWebsiteUncached(name).catch(() => null);
  wikidataCache.set(name, p);
  return p;
}

async function wikidataOfficialWebsiteUncached(name: string): Promise<string | null> {
  const queries = institutionNameVariants(name);
  for (const q of queries) {
    try {
      const searchJsonRaw = await wikidataFetchJson(
        `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(q)}&language=en&format=json&limit=5`,
      );
      if (!searchJsonRaw) continue;
      const searchJson = searchJsonRaw as { search?: Array<{ id: string; label?: string }> };
      for (const hit of searchJson.search ?? []) {
        const entJson = (await wikidataFetchJson(
          `https://www.wikidata.org/wiki/Special:EntityData/${hit.id}.json`,
        )) as {
          entities?: Record<string, { claims?: { P856?: Array<{ mainsnak?: { datavalue?: { value?: string } } }> } }>;
        } | null;
        if (!entJson) continue;
        const url = entJson.entities?.[hit.id]?.claims?.P856?.[0]?.mainsnak?.datavalue?.value;
        if (!url || !/^https?:\/\//i.test(url) || BLOCKED_SEARCH_HOSTS.test(url) || isDirectoryHubUrl(url)) {
          continue;
        }
        // websiteConflictsWithInstitution exists to distrust a STORED url of unknown
        // provenance. Applied to Wikidata's official-website claim it discards correct
        // answers, because universities routinely use an acronym domain that shares no
        // tokens with the spelled-out name: Cleveland State University -> csuohio.edu,
        // University of North Texas -> unthealth.edu. Those are exactly the programs that
        // reach Wikidata at all -- rows with no stored seed -- so rejecting them left the
        // record with no candidate URL whatsoever. Trust the claim when the matched entity
        // is genuinely this institution; otherwise fall back to the host-name heuristic.
        if (entityLabelMatchesInstitution(hit.label ?? "", name) || !websiteConflictsWithInstitution(url, name)) {
          return url.replace(/\/$/, "");
        }
      }
    } catch {
      /* try next query */
    }
  }
  return null;
}

interface ProgramRow {
  id: number; name: string; professionSlug: string; programName: string;
  websiteUrl: string | null; sourceUrl: string | null;
  degreeType?: string | null;
  /** Campus state, used to reject a sibling campus's catalogue. */
  state?: string | null;
  prereqSources: PrereqSource[] | null; verificationStatus: string;
  prereqCourses: PrereqItem[] | null;
}

/**
 * True when a URL is this institution's official course catalog hosted on a catalog vendor.
 *
 * Universities publish the catalog -- an authoritative source for prerequisite coursework --
 * under an institution-named subdomain on a vendor platform (unco.smartcatalogiq.com,
 * <school>.acalog.com). The vendor's registrable domain shares no text with the school name,
 * so the host-name heuristic refuses it. Matching the vendor subdomain against the
 * institution's own .edu label is exact: "unco" in unco.smartcatalogiq.com is the same label
 * as unco.edu, which we already hold for the program.
 */
const CATALOG_VENDOR_HOST =
  /\.(smartcatalogiq\.com|acalog\.com|courseleaf\.com|coursedog\.com|elluciancloud\.com)$/i;

function isOfficialCatalogMirror(url: string, program: ProgramRow): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    if (!CATALOG_VENDOR_HOST.test(host)) return false;
    const label = host.split(".")[0];
    if (label.length < 3) return false;
    for (const known of [program.websiteUrl, program.sourceUrl]) {
      if (!known) continue;
      try {
        const knownHost = new URL(known).hostname.replace(/^www\./i, "").toLowerCase();
        const knownLabel = knownHost.replace(/\.(edu|org|com|net)$/i, "").split(".").pop() ?? "";
        if (knownLabel.length >= 3 && knownLabel === label) return true;
      } catch {
        /* skip unparseable */
      }
    }
    return false;
  } catch {
    return false;
  }
}

function looksLikeOfficialProgramUrl(url: string, program: ProgramRow): boolean {
  try {
    const u = new URL(url);
    if (!/^https?:$/i.test(u.protocol)) return false;
    if (BLOCKED_SEARCH_HOSTS.test(u.hostname)) return false;
    if (isDirectoryHubUrl(url)) return false;
    if (isLowValueCandidate(url)) return false;
    if (websiteConflictsWithInstitution(url, program.name)) return false;
    // Reject generic state/federal portals that match a token like "illinois"/"georgia".
    if (/\.(gov)$/i.test(u.hostname) && !/\.edu$/i.test(u.hostname)) {
      if (/^(www\.)?(usa|usa\.gov|[a-z]{2})\.gov$/i.test(u.hostname) ||
          /(myflorida|illinois\.gov|georgia\.gov|ny\.gov|ca\.gov|texas\.gov)/i.test(u.hostname)) {
        return false;
      }
    }
    const hay = `${u.hostname} ${u.pathname}`.toLowerCase();
    const tokens = institutionTokens(program.name);
    const nameHit =
      hostMatchesWebsite(u.hostname, program.websiteUrl) ||
      tokens.length === 0 ||
      tokens.some((t) => hay.includes(t));
    const professionHit = professionKeywords(program.professionSlug).some((k) =>
      hay.includes(normalize(k).replace(/ /g, "-")) || hay.includes(normalize(k)),
    );
    // Reject clear cross-profession / wrong-department paths.
    const foreign =
      (program.professionSlug === "speech-language-pathology" && /\/nursing|\/dpt|\/otd|\/physician-assistant|\/pharm|\/occupational/i.test(hay) && !/speech|slp|csd|communicat|language/i.test(hay)) ||
      (program.professionSlug === "nursing" && /\/slp|\/csd|\/speech-language|\/dpt|\/otd|\/physician-assistant|\/occupational/i.test(hay) && !/nursing|bsn|msn|absn|mepn/i.test(hay)) ||
      (program.professionSlug === "physical-therapy" && /\/nursing|\/slp|\/csd|\/otd|\/physician-assistant|\/occupational/i.test(hay) && !/physical|dpt|pt-/i.test(hay)) ||
      (program.professionSlug === "occupational-therapy" && /\/nursing|\/slp|\/csd|\/dpt|\/physician-assistant|\/pharm/i.test(hay) && !/occupational|otd|msot|ot-/i.test(hay)) ||
      (program.professionSlug === "physician-assistant" && /\/nursing|\/slp|\/csd|\/dpt|\/otd|\/pharm/i.test(hay) && !/physician|assistant|pa-program|\/pa\//i.test(hay)) ||
      (program.professionSlug === "medicine" && /\/music\/|\/law\/|\/business\/|\/engineering\/|faculty-development|graduate-certificate-academic|collegeadmissions\./i.test(hay) && !/medicine|medical|medschool|osteopath|amcas|md-/i.test(hay)) ||
      (program.professionSlug === "pharmacy" && /\/nursing|\/dpt|\/otd|\/medicine|\/slp|\/physician-assistant/i.test(hay) && !/pharm|pharmacy/i.test(hay));
    if (foreign) return false;
    const eduHost = /\.edu$/i.test(u.hostname) || /\.ac\.[a-z.]+$/i.test(u.hostname);
    const pathHint = /admissions|prerequisite|catalog|handbook|apply|requirements/i.test(hay);
    // Require institution match plus either profession signal or admissions/prereq path.
    // Bare .edu homepages still pass when profession appears in host/path.
    return nameHit && (professionHit || (eduHost && pathHint));
  } catch {
    return false;
  }
}

function scoreCandidateUrl(url: string, program: ProgramRow): number {
  try {
    const u = new URL(url.startsWith("cache:") ? url.split("|")[1] : url);
    const hay = `${u.hostname}${u.pathname}`.toLowerCase();
    let score = 0;
    if (/\.edu$/i.test(u.hostname)) score += 5;
    if (/prereq|pre-requisite/.test(hay)) score += 8;
    if (/requirement/.test(hay)) score += 4;
    if (/\.pdf($|\?)/i.test(hay) && /prereq|requirement|checklist|coursework/i.test(hay)) score += 6;
    if (/admiss|apply|prospective/.test(hay)) score += 3;
    if (/catalog|handbook|checksheet/.test(hay)) score += 3;
    if (/academic-catalog|core-curriculum|course-catalog/.test(hay) && !/prereq|nursing|absn|mepn|dpt|otd|slp|pharm/.test(hay)) {
      score -= 6;
    }
    if (professionKeywords(program.professionSlug).some((k) => hay.includes(normalize(k).replace(/ /g, "-")))) score += 4;
    if (/csd|slp|speech-language|communicat/.test(hay) && program.professionSlug === "speech-language-pathology") score += 6;
    if (/absn|accelerated.*nursing|direct-entry|mepn|entry-level.*nursing/.test(hay) && program.professionSlug === "nursing") score += 6;
    if (program.professionSlug === "speech-language-pathology" && /\/nursing|\/dpt\b|physician-assistant|\/pharmd/i.test(hay) && !/speech|slp|csd|communicat/i.test(hay)) {
      score -= 12;
    }
    if (/undergraduate|freshman|first-year|high-school|undergrad-admissions/.test(hay) &&
        !hasGradOrProfessionPath(hay)) {
      score -= 8;
    }
    // A university-wide graduate-admissions page scores well on generic keywords (.edu +5,
    // "requirement" +4, "admiss" +3) while naming no specific programme, so it kept outranking
    // the department page that actually lists the coursework -- speech-language-pathology
    // programs were repeatedly extracting grad.uconn.edu/admissions/requirements and
    // gradschool.fsu.edu instead of their own CSD department. Demote generic graduate-intake
    // pages that carry no profession signal at all.
    const mentionsProfession =
      professionKeywords(program.professionSlug).some(
        (k) => hay.includes(normalize(k).replace(/ /g, "-")) || hay.includes(normalize(k).replace(/ /g, "")),
      ) || /csd|slp|speech|communicat|nursing|dpt|otd|pharm|dental|physician-assistant|dietet|optometr|podiatr|veterin/.test(hay);
    if (!mentionsProfession &&
        /^(grad|gradschool|graduate|admissions?)\.|\/(graduate|grad)-?(school|admissions?|studies)|\/admissions?\/(requirements?|apply|international|graduate)/.test(hay)) {
      score -= 10;
    }
    if (/\/news\/|news-and-media|white-coat|videos?\/|spotlight|laptop-requirements|summer-camp|blog\//i.test(hay)) {
      score -= 10;
    }
    if (/leveling|non-csd|prerequisite-courses|course-requirements|checksheet/i.test(hay)) score += 5;
    if (program.professionSlug === "medicine" && /medschool|school-of-medicine|medicine\/admissions|md-program|osteopathic|amcas|aacomas/i.test(hay)) {
      score += 8;
    }
    if (program.professionSlug === "medicine" && /\/music\/|\/law\/|\/business\/|faculty-development|collegeadmissions/i.test(hay)) {
      score -= 15;
    }
    if (program.professionSlug === "pharmacy" && /pharmd|pharmacy\/admissions|pre-pharmacy|prepharmacy/i.test(hay)) {
      score += 8;
    }
    if (program.websiteUrl) {
      try {
        const host = new URL(program.websiteUrl).hostname.replace(/^www\./, "");
        if (u.hostname.replace(/^www\./, "").endsWith(host.replace(/^www\./, ""))) score += 6;
      } catch { /* ignore */ }
    }
    return score;
  } catch {
    return 0;
  }
}

// ── Discovery ────────────────────────────────────────────────────────────────

function keywordLinks(html: string, base: string, professionTerms: string[]): string[] {
  const scored = new Map<string, number>();
  const baseUrl = new URL(base);
  const rootDomain = baseUrl.hostname.split(".").slice(-2).join(".");
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const u = new URL(m[1], baseUrl);
      if (!u.hostname.endsWith(rootDomain)) continue;
      if (isLowValueCandidate(u.toString())) continue;
      const hay = `${u.pathname} ${stripHtml(m[2])}`.toLowerCase();
      // A link labeled/pathed with the program's own profession (e.g. "Nursing", "/nursing/")
      // must be followable even when it doesn't also contain a generic admissions keyword yet —
      // otherwise the crawl can never reach the department page it would discover "requirements"
      // from in the first place, and falls back to a search layer that's frequently bot-blocked.
      const matchesKeyword = KEYWORDS.some((k) => hay.includes(k));
      const matchesProfession = professionTerms.some(
        (t) => hay.includes(normalize(t).replace(/ /g, "-")) || hay.includes(normalize(t)),
      );
      if (!matchesKeyword && !matchesProfession) continue;
      u.hash = "";
      let score = 0;
      if (/prereq|pre-requisite/.test(hay)) score += 5;
      if (/requirement/.test(hay)) score += 3;
      if (/admiss/.test(hay)) score += 2;
      if (professionTerms.some((t) => hay.includes(normalize(t).replace(/ /g, "-")) || hay.includes(normalize(t)))) score += 6;
      if (/graduate|curriculum|bsn|absn|dpt|otd|leveling|csd|slp/.test(hay)) score += 2;
      if (/undergraduate/.test(hay) && !/graduate/.test(hay)) score -= 4;
      if (u.hostname === baseUrl.hostname) score += 1;
      scored.set(u.toString(), Math.max(scored.get(u.toString()) ?? 0, score));
    } catch { /* skip malformed */ }
  }
  return [...scored.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([u]) => u);
}

const PREREQ_PAGE_HINT =
  /prerequi|pre-requisit|required courses|admission requirements|course requirements|prerequisite coursework|minimum requirements|leveling|pre-professional|pre-pharmacy|pre-nursing|communication sciences|communication disorders|non-csd|csd background|essential functions|applicant requirements|coursework requirements|academic requirements/i;

/** Detect SPA/bot shells that look "fetched" but lack usable course text. */
function looksLikeJsShell(html: string, text: string): boolean {
  if (text.length >= 2500) return false;
  const h = html.slice(0, 8000).toLowerCase();
  if (/__next_data__|window\.__nuxt|ng-version=|data-reactroot|id=["']root["']|id=["']app["']/i.test(h) && text.length < 1200) {
    return true;
  }
  if (/enable javascript|please enable cookies|checking your browser|cf-browser-verification|attention required/i.test(text)) {
    return true;
  }
  return text.length < 500 && /<script/i.test(html);
}

/** BFS same-domain crawl from program website — primary discovery when search APIs are blocked. */
async function crawlSiteForCandidates(
  seedUrl: string,
  program: ProgramRow,
  maxDepth = 3,
  maxPages = 18,
): Promise<string[]> {
  if (!seedUrl || seedUrl.startsWith("cache:") || isDirectoryHubUrl(seedUrl)) return [];
  // Hard professions need a deeper crawl — department hubs rarely list courses on the landing page.
  const hard =
    /speech-language-pathology|nursing|medicine|pharmacy|postbac|occupational-therapy|physical-therapy/.test(
      program.professionSlug,
    );
  if (hard) {
    maxDepth = Math.max(maxDepth, 4);
    maxPages = Math.max(maxPages, 20);
  }
  // A bare institution homepage is several hops further from the answer than a department
  // page: homepage -> academics -> college -> department -> admissions -> prerequisites. At
  // depth 4 the crawl reaches the department and stops just short, which is why programs
  // seeded with only "https://www.school.edu/" fail while ones seeded with a department page
  // succeed. Spend the extra budget only on those seeds.
  try {
    const seedPath = new URL(seedUrl).pathname.replace(/\/+$/, "");
    if (hard && seedPath.length <= 1) {
      maxDepth = Math.max(maxDepth, 6);
      maxPages = Math.max(maxPages, 32);
    }
  } catch {
    /* unparseable seed keeps the default budget */
  }
  // PDFs are allowed — fetchWithFallback/extractPdfText can read them without Firecrawl.
  const seen = new Set<string>();
  const found: string[] = [];
  const queue: Array<{ url: string; depth: number }> = [{ url: seedUrl, depth: 0 }];
  const terms = professionKeywords(program.professionSlug);

  // Stop crawling on a wall-clock deadline, not just a page count. A deep crawl over slow
  // pages could consume a program's entire time budget and then be killed outright, throwing
  // away every candidate it had already found; medicine and pharmacy programs seeded with a
  // bare homepage were timing out this way. Returning what has been found so far lets
  // extraction still run against the best candidates instead of the program failing wholesale.
  const crawlDeadline = Date.now() + Number(process.env.COMPLETION_CRAWL_BUDGET_MS || 90_000);

  while (queue.length && seen.size < maxPages) {
    if (Date.now() > crawlDeadline) break;
    // Early-exit once we have several strong prereq pages — avoids 20–28 page crawls starving the queue.
    if (found.length >= 4) break;
    const next = queue.shift();
    if (!next) break;
    const { url, depth } = next;
    const key = url.split("#")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      // Crawl must stay fast: direct HTTP only. Jina/browser/PDF fallbacks run later on ranked candidates.
      const page = await fetchOfficial(url);
      if (page.text.length >= 300 && PREREQ_PAGE_HINT.test(page.text)) {
        found.push(page.url);
      }
      if (depth >= maxDepth) continue;
      // Thin/JS shells still expose useful <a href> targets for the next hop.
      for (const link of keywordLinks(page.html || page.text, page.url, terms).slice(0, 10)) {
        const linkKey = link.split("#")[0];
        if (!seen.has(linkKey) && !isDirectoryHubUrl(link) && !isLowValueCandidate(link)) {
          queue.push({ url: link, depth: depth + 1 });
        }
      }
    } catch {
      /* skip unreachable pages */
    }
  }
  return found;
}

async function discoverCandidates(program: ProgramRow, deadline = Infinity): Promise<string[]> {
  const outOfTime = () => Date.now() > deadline;
  const candidates: string[] = [];
  // Normalize stored URLs once so scheme-less directory imports become fetchable.
  if (program.websiteUrl) program.websiteUrl = normalizeCandidateUrl(program.websiteUrl);
  if (program.sourceUrl) program.sourceUrl = normalizeCandidateUrl(program.sourceUrl);

  try {
    const queue = JSON.parse(fs.readFileSync(path.join(QUEUE_DIR, `${program.id}.json`), "utf8"));
    if (queue.root?.cacheFile) candidates.push(`cache:${queue.root.cacheFile}|${queue.root.url}`);
    for (const s of queue.candidateOfficialSources ?? []) {
      if (s.url && /prereq|requirement|admission|apply|prospective/i.test(s.url) && !isDirectoryHubUrl(s.url)) {
        candidates.push(s.url);
      }
    }
  } catch { /* no queue file */ }

  if (program.sourceUrl && !isDirectoryHubUrl(program.sourceUrl)) candidates.push(program.sourceUrl);
  if (program.websiteUrl && !isDirectoryHubUrl(program.websiteUrl) && !isAthleticsOrSportsUrl(program.websiteUrl)) candidates.push(program.websiteUrl);

  let usableWebsite =
    program.websiteUrl && !isDirectoryHubUrl(program.websiteUrl) && !isAthleticsOrSportsUrl(program.websiteUrl) && !websiteConflictsWithInstitution(program.websiteUrl, program.name)
      ? program.websiteUrl
      : null;
  // Wrong-institution websites (e.g. Bradley → pennwest.edu) must not seed the crawl.
  if (program.websiteUrl && (websiteConflictsWithInstitution(program.websiteUrl, program.name) || isAthleticsOrSportsUrl(program.websiteUrl) || isGarbageDiscoveredUrl(program.websiteUrl))) {
    program.websiteUrl = null;
  }
  if (!usableWebsite) {
    const home = await wikidataOfficialWebsite(program.name);
    if (home) {
      program.websiteUrl = home;
      usableWebsite = home;
      candidates.push(home);
      try {
        await db
          .update(programSchoolsTable)
          .set({ websiteUrl: home })
          .where(eq(programSchoolsTable.id, program.id));
      } catch { /* non-fatal */ }
    }
  }
  // A stored directory URL can be syntactically fine but dead (departments get renamed/merged
  // years after the directory import). Detect that up front so a 404 seed doesn't silently
  // starve the whole crawl -- fall back to a freshly rediscovered homepage instead.
  if (usableWebsite) {
    try {
      await fetchOfficial(usableWebsite);
    } catch (e) {
      if (e instanceof Error && /HTTP 404|HTTP 410/.test(e.message)) {
        const freshHome = await wikidataOfficialWebsite(program.name);
        if (freshHome && freshHome !== usableWebsite) {
          usableWebsite = freshHome;
          program.websiteUrl = freshHome;
          candidates.push(freshHome);
          try {
            await db.update(programSchoolsTable).set({ websiteUrl: freshHome }).where(eq(programSchoolsTable.id, program.id));
          } catch { /* non-fatal */ }
        }
      }
    }
  }
  const seedPages = [usableWebsite, program.sourceUrl].filter((u): u is string => !!u && !isDirectoryHubUrl(u));

  // ---------------------------------------------------------------------------
  // Official-domain discovery.
  //
  // Runs before the search layer because every general search backend (Google, Bing,
  // DuckDuckGo, Firecrawl, Jina, Keenable) is bot-blocked or unfunded from this host.
  // Stored seeds are usually a generic university homepage (utah.edu) rather than the
  // program site, so probe the predictable program subdomain/path first, then use the
  // institution's own site search and sitemap. Everything found is on the institution's
  // own domain, so it is authoritative by construction.
  // ---------------------------------------------------------------------------
  // Skip official-domain discovery when a stored seed already points at a program-specific
  // prerequisite/admissions page. Probing subdomains, five CMS search endpoints and the
  // sitemap costs tens of requests per program, which is wasted when the answer is already
  // in hand -- and that cost is paid on every program in every round.
  const seedAlreadySpecific = candidates.some(
    (c) => !c.startsWith("cache:") && /prereq|admission|requirement|apply|coursework/i.test(c),
  );

  const nativeHosts: string[] = [];
  if (usableWebsite && !seedAlreadySpecific) {
    try {
      const root = rootDomainOf(new URL(usableWebsite).hostname);
      const probed = await probeProgramHosts(root, program.professionSlug, fetchOfficial);
      for (const p of probed) {
        nativeHosts.push(new URL(p).hostname);
        candidates.push(p);
      }
      // Always keep the stored host in play as a fallback search/sitemap target.
      nativeHosts.push(new URL(usableWebsite).hostname);
    } catch { /* malformed stored URL */ }
  }

  const professionQuery = professionKeywords(program.professionSlug)[0] ?? program.professionSlug;
  for (const host of [...new Set(nativeHosts)].slice(0, 2)) {
    try {
      const hits = await nativeSiteSearch(
        host,
        [`${professionQuery} prerequisites`, `${professionQuery} admission requirements`],
        fetchOfficial,
        program.professionSlug,
      );
      candidates.push(...hits.filter((u) => !isDirectoryHubUrl(u) && !isLowValueCandidate(u)));
    } catch { /* site search unavailable */ }
    try {
      const hits = await sitemapCandidates(host, program.professionSlug, fetchOfficial);
      candidates.push(...hits.filter((u) => !isDirectoryHubUrl(u) && !isLowValueCandidate(u)));
    } catch { /* no sitemap */ }
  }

  // Multi-hop crawl from known official pages (works without Firecrawl/search).
  for (const seed of [...nativeHosts.slice(0, 1).map((h) => `https://${h}/`), ...seedPages].slice(0, 3)) {
    if (outOfTime()) break;
    const crawled = await crawlSiteForCandidates(seed, program);
    candidates.push(...crawled);
    // Also keep one-hop keyword links even if text hint missed (for secondary expand).
    try {
      const page = await fetchWithFallback(seed);
      candidates.push(...keywordLinks(page.html, page.url, professionKeywords(program.professionSlug)));
    } catch { /* skip */ }
    if (crawled.length >= 2) break;
  }

  // Search when crawl did not already find strong official candidates.
  const crawledStrong = candidates.filter((c) => /prereq|requirement|admiss|catalog|handbook/i.test(c)).length;
  if (usableWebsite && crawledStrong < 2) {
    try {
      const host = new URL(usableWebsite).hostname.replace(/^www\./, "");
      const professionLabel = professionKeywords(program.professionSlug)[0] ?? program.professionSlug;
      const degreeHint = program.degreeType ? ` ${program.degreeType}` : "";
      const queries = [
        `"${program.name}" "${professionLabel}"${degreeHint} prerequisites site:${host}`,
        `${program.name} ${program.programName} prerequisites site:${host}`,
        `${program.name}${degreeHint} admission requirements prerequisites site:${host}`,
        ...(program.professionSlug === "nursing"
          ? [
              `${program.name} ABSN prerequisite courses site:${host}`,
              `${program.name} MEPN prerequisite courses site:${host}`,
              `${program.name} accelerated nursing prerequisites site:${host}`,
              `${program.name} BSN prerequisite coursework site:${host}`,
              `${program.name} nursing admission requirements biology chemistry site:${host}`,
            ]
          : []),
        ...(program.professionSlug === "speech-language-pathology"
          ? [
              `${program.name} SLP prerequisite courses site:${host}`,
              `${program.name} communication sciences disorders prerequisites site:${host}`,
              `${program.name} CSD leveling courses site:${host}`,
              `${program.name} speech-language pathology admission requirements site:${host}`,
              `${program.name} MS SLP prerequisite coursework site:${host}`,
              `${program.name} communication disorders graduate admissions prerequisites site:${host}`,
              `${program.name} non-CSD applicant leveling requirements site:${host}`,
              `${program.name} ASHA SLP prerequisite courses site:${host}`,
            ]
          : []),
        ...(program.professionSlug === "physician-assistant"
          ? [
              `${program.name} PA prerequisite courses site:${host}`,
              `${program.name} physician assistant prerequisites site:${host}`,
            ]
          : []),
        ...(program.professionSlug === "pharmacy"
          ? [
              `${program.name} PharmD prerequisite courses site:${host}`,
              `${program.name} pre-pharmacy requirements site:${host}`,
              `${program.name} PharmD admission requirements checklist PDF site:${host}`,
              `${program.name} PharmD required coursework biology chemistry site:${host}`,
              `${program.name} pharmacy school prerequisite course list site:${host}`,
              `${program.name} PharmD prerequisites filetype:pdf site:${host}`,
              `${program.name} prepharmacy course requirements site:${host}`,
            ]
          : []),
        ...(program.professionSlug === "medicine"
          ? [
              `${program.name} medical school prerequisite courses site:${host}`,
              `${program.name} MD admission requirements coursework site:${host}`,
              `${program.name} DO admission requirements coursework site:${host}`,
              `${program.name} AMCAS prerequisites site:${host}`,
              `${program.name} AACOMAS prerequisites site:${host}`,
              `${program.name} medical school competency based admissions site:${host}`,
              `${program.name} entering class requirements coursework site:${host}`,
              `${program.name} MD program required undergraduate courses site:${host}`,
              `${program.name} medical school admissions course requirements PDF site:${host}`,
              `${program.name} medical school prerequisites filetype:pdf site:${host}`,
              `${program.name} school of medicine admission requirements biology chemistry physics site:${host}`,
            ]
          : []),
        ...(program.professionSlug === "postbac"
          ? [
              `${program.name} postbaccalaureate prerequisites site:${host}`,
              `${program.name} post-bacc admission requirements site:${host}`,
              `${program.name} premed postbacc prerequisites site:${host}`,
              `${program.name} linkage program prerequisites site:${host}`,
              `${program.name} post-baccalaureate premedical coursework requirements site:${host}`,
              `${program.name} postbacc curriculum required courses site:${host}`,
            ]
          : []),
        ...(program.professionSlug === "occupational-therapy"
          ? [
              `${program.name} OTD prerequisite courses site:${host}`,
              `${program.name} occupational therapy prerequisites site:${host}`,
              `${program.name} MSOT admission requirements site:${host}`,
            ]
          : []),
        ...(program.professionSlug === "physical-therapy"
          ? [
              `${program.name} DPT prerequisite courses site:${host}`,
              `${program.name} physical therapy prerequisites site:${host}`,
            ]
          : []),
        ...(program.professionSlug === "dietetics"
          ? [
              `${program.name} dietetics prerequisites site:${host}`,
              `${program.name} coordinated program dietetics admission requirements site:${host}`,
            ]
          : []),
      ];
      // Cap queries per program. The profession-specific lists run to a dozen or more, and at
      // one search apiece the keyless engines are driven far past the rate they tolerate --
      // DuckDuckGo lite answered 6/6 in isolation at 2.5s spacing but returns nothing once the
      // worker is issuing every query for every program. The list is ordered most-specific
      // first, so the later entries add little.
      const MAX_SEARCH_QUERIES = Number(process.env.COMPLETION_MAX_QUERIES || 4);
      for (const q of queries.slice(0, MAX_SEARCH_QUERIES)) {
        const urls = await webSearch(q);
        candidates.push(...urls.filter((u) => {
          try {
            return new URL(u).hostname.replace(/^www\./, "").endsWith(host) && looksLikeOfficialProgramUrl(u, program);
          } catch { return false; }
        }));
        if (candidates.filter((c) => /prereq|requirement|admiss/i.test(c)).length >= 5) break;
      }
    } catch { /* non-fatal */ }
  }

  // A candidate only counts as "strong" if it is plausibly about THIS programme.
  //
  // Matching the bare word "requirement" or "admission" meant a university-wide intake page
  // satisfied this test and suppressed the search layer entirely, so the programs that most
  // needed searching never got it: GWU sat on
  // graduate.admissions.gwu.edu/international-student-application-requirements and never
  // looked further. Require either a profession signal or an explicit prerequisite/catalog
  // page before deciding no search is needed.
  const hasStrongCandidate = candidates.some((c) => {
    if (/\/admissions\/prerequisites$/i.test(c)) return false;
    const hay = c.toLowerCase();
    const professionSignal =
      professionKeywords(program.professionSlug).some(
        (k) => hay.includes(normalize(k).replace(/ /g, "-")) || hay.includes(normalize(k).replace(/ /g, "")),
      ) || /csd|slp|speech|communicat|nursing|dpt|otd|pharm|dental|physician-assistant|dietet|optometr|podiatr|veterin|anesthes|patholog|prosthet|genetic/.test(hay);
    const explicitPrereqPage = /prereq|pre-requisit|catalog|handbook|checksheet|required-cours|course-requirement/i.test(hay);
    return professionSignal || explicitPrereqPage;
  });
  // With a metered provider available, search unconditionally rather than only when the
  // existing candidates look weak.
  //
  // hasStrongCandidate is satisfied by any profession-relevant URL, so a department landing
  // page counted as "good enough" and suppressed search for the programs that most needed it:
  // Truman State sat on its communication-disorders department page, which carries no
  // prerequisite list, and never searched. Serper and Tavily answer 3/3 on exactly these
  // cases. Spend is bounded by the persisted budget instead, which is the honest constraint --
  // roughly one query per program against a 2,800-query cap.
  const meteredSearchAvailable =
    (SERPER_KEY && searchBudget.canSpend("serper")) || (TAVILY_KEY && searchBudget.canSpend("tavily"));
  if (!outOfTime() && (meteredSearchAvailable || !usableWebsite || !hasStrongCandidate)) {
    try {
      const openQueries = [
        `${program.name} ${program.programName} official admissions prerequisites coursework`,
        ...(program.professionSlug === "medicine"
          ? [
              `${universitySearchName(program.name)} school of medicine admission requirements prerequisites`,
              `${universitySearchName(program.name)} MD program prerequisite courses site:.edu`,
              `"${universitySearchName(program.name)}" "prerequisite" (biology OR chemistry OR physics) (medicine OR "medical school" OR MD) site:.edu`,
            ]
          : []),
        ...(program.professionSlug === "pharmacy"
          ? [`${universitySearchName(program.name)} PharmD prerequisite courses site:.edu`]
          : []),
      ];
      for (const q of openQueries) {
        const urls = (await webSearch(q)).filter((u) => looksLikeOfficialProgramUrl(u, program) && !isGarbageDiscoveredUrl(u));
        candidates.push(...urls);
        const validated = urls
          .filter((u) => {
            try { return /\.edu$/i.test(new URL(u).hostname) || /\.org$/i.test(new URL(u).hostname); } catch { return false; }
          })
          .sort((a, b) => scoreCandidateUrl(b, program) - scoreCandidateUrl(a, program))[0];
        if (validated && (!program.websiteUrl || isDirectoryHubUrl(program.websiteUrl) || isGarbageDiscoveredUrl(program.websiteUrl))) {
          await db
            .update(programSchoolsTable)
            .set({ websiteUrl: new URL(validated).origin })
            .where(eq(programSchoolsTable.id, program.id));
          program.websiteUrl = new URL(validated).origin;
          usableWebsite = program.websiteUrl;
        }
        if (candidates.filter((c) => /prereq|requirement|admiss/i.test(c)).length >= 3) break;
      }
    } catch { /* non-fatal */ }
  }

  // Last resort: the stored website may belong to a different institution while still passing
  // the token check ("Northeast Ohio Medical University" -> northeastern.edu, "Louisiana State
  // University School of Dentistry" -> louisiana.gov). Those seeds poison every downstream hop,
  // so when nothing was discovered, re-resolve the institution against Wikidata and run
  // official-domain discovery again on the corrected domain.
  if (!candidates.length && !outOfTime()) {
    try {
      const canonical = await wikidataOfficialWebsite(program.name);
      const canonicalHost = canonical ? new URL(canonical).hostname : null;
      const storedHost = program.websiteUrl ? new URL(program.websiteUrl).hostname : null;
      if (canonicalHost && (!storedHost || rootDomainOf(canonicalHost) !== rootDomainOf(storedHost))) {
        candidates.push(canonical!);
        program.websiteUrl = canonical!;
        try {
          await db
            .update(programSchoolsTable)
            .set({ websiteUrl: canonical! })
            .where(eq(programSchoolsTable.id, program.id));
        } catch { /* non-fatal */ }

        const root = rootDomainOf(canonicalHost);
        candidates.push(...(await probeProgramHosts(root, program.professionSlug, fetchOfficial)));
        for (const host of [...new Set([canonicalHost, ...candidates.map((c) => { try { return new URL(c).hostname; } catch { return ""; } }).filter(Boolean)])].slice(0, 2)) {
          try {
            candidates.push(
              ...(await nativeSiteSearch(host, [`${professionQuery} prerequisites`], fetchOfficial, program.professionSlug)),
            );
          } catch { /* site search unavailable */ }
          try {
            candidates.push(...(await sitemapCandidates(host, program.professionSlug, fetchOfficial)));
          } catch { /* no sitemap */ }
        }
        for (const seed of [canonical!, ...candidates.slice(0, 2)]) {
          candidates.push(...(await crawlSiteForCandidates(seed, program)));
        }
      }
    } catch { /* wikidata unavailable */ }
  }

  // Prefer HTML candidates first, but keep PDFs — local pypdf extract works without Firecrawl.
  const ranked = [...new Set(candidates.map(normalizeCandidateUrl).filter((u): u is string => !!u))]
    .filter((u) => u.startsWith("cache:") || !isLowValueCandidate(u))
    .sort((a, b) => scoreCandidateUrl(b, program) - scoreCandidateUrl(a, program));
  const htmlFirst = ranked.filter((u) => !/\.pdf($|\?)/i.test(u));
  const pdfs = ranked.filter((u) => /\.pdf($|\?)/i.test(u));
  return [...htmlFirst, ...pdfs];
}

// ── OpenAI structured extraction ─────────────────────────────────────────────

interface ExtractedCourse {
  name: string;
  classification: "required" | "recommended" | "conditional";
  labRequired: boolean | null;
  courseCount: number | null;
  semesterCredits: number | null;
  quarterCredits: number | null;
  minGrade: string | null;
  details: string | null;
}
interface Extraction {
  hasPrereqList: boolean;
  statesNoPrereqs: boolean;
  noPrereqsEvidenceQuote: string | null;
  courses: ExtractedCourse[];
  otherConditions: string | null;
}

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    hasPrereqList: { type: "boolean" },
    statesNoPrereqs: { type: "boolean" },
    noPrereqsEvidenceQuote: { type: ["string", "null"] },
    courses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          classification: { type: "string", enum: ["required", "recommended", "conditional"] },
          labRequired: { type: ["boolean", "null"] },
          courseCount: { type: ["number", "null"] },
          semesterCredits: { type: ["number", "null"] },
          quarterCredits: { type: ["number", "null"] },
          minGrade: { type: ["string", "null"] },
          details: { type: ["string", "null"] },
        },
        required: ["name", "classification", "labRequired", "courseCount", "semesterCredits", "quarterCredits", "minGrade", "details"],
        additionalProperties: false,
      },
    },
    otherConditions: { type: ["string", "null"] },
  },
  required: ["hasPrereqList", "statesNoPrereqs", "noPrereqsEvidenceQuote", "courses", "otherConditions"],
  additionalProperties: false,
} as const;

let openaiDisabledReason = "";
function disableOpenAI(reason: string) {
  if (!OPENAI_KEY) return;
  console.warn(`OpenAI semantic enhancement unavailable; continuing deterministic-only extraction. Reason: ${reason}`);
  openaiDisabledReason = reason;
}

// With CONCURRENCY=4 workers each free to fire an OpenAI call whenever they reach extraction,
// bursts regularly exceed the account's requests-per-minute limit ("Rate limit reached for
// gpt-4o-mini" observed repeatedly in practice) even though the account has quota. A small
// counting semaphore smooths those bursts without serializing the whole pipeline down to the
// network-bound crawl/fetch work, which doesn't hit this limit.
/**
 * How many extraction calls may be in flight at once.
 *
 * This was 2 while the worker pool ran 16 programs concurrently, so extractions queued behind
 * each other and a program burned its whole time budget waiting for a slot rather than doing
 * work. Phase timing showed extractions "taking" 104-168s -- almost entirely queue wait, since
 * the measurement wraps the semaphore -- which is why bounding the crawl and capping browser
 * renders changed nothing: the bottleneck was downstream of both.
 *
 * Raising it to 12 turned out to be counterproductive: the account sits at gpt-4o-mini's
 * per-day request cap, whose rolling limiter frees roughly one request every nine seconds, so
 * a wide pool just produces bursts that are immediately rejected. Keep the pool narrow and let
 * Retry-After pace the calls -- throughput here is bounded by the account's quota, not by us.
 */
const OPENAI_MAX_CONCURRENT = Number(process.env.COMPLETION_OPENAI_CONCURRENCY || 3);
let openaiInFlight = 0;
const openaiWaitQueue: Array<() => void> = [];
async function withOpenAiSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (openaiInFlight >= OPENAI_MAX_CONCURRENT) {
    await new Promise<void>((resolve) => openaiWaitQueue.push(resolve));
  }
  openaiInFlight += 1;
  try {
    return await fn();
  } finally {
    openaiInFlight -= 1;
    const next = openaiWaitQueue.shift();
    if (next) next();
  }
}

async function extractWithOpenAI(program: ProgramRow, pageText: string, url: string): Promise<Extraction> {
  if (openaiDisabledReason) throw new Error(openaiDisabledReason);
  return withOpenAiSlot(() => extractWithOpenAIInner(program, pageText, url));
}

/**
 * Narrow a fetched page to the part that can actually contain prerequisites.
 *
 * Extraction was sending up to 100,000 characters -- roughly 25,000 tokens of mostly
 * navigation, footers and unrelated programme copy -- which made a single call take two
 * minutes. Phase timing showed extractions at 113-147s while 429s stayed flat, so the cost was
 * payload size, not rate limiting.
 *
 * The opening of the page is always kept because it carries the programme identity the model
 * needs to decide whether the list belongs to THIS programme, and the window is centred on the
 * first prerequisite-like mention. Pages under the cap are passed through untouched, so short
 * pages behave exactly as before and nothing that was previously visible to the model is lost
 * on them.
 */
/** Subject words used only to judge which part of a long page holds the coursework. */
const EXCERPT_SUBJECTS =
  /(biolog\w*|chemistr\w*|organic|physic\w*|anatom\w*|physiolog\w*|microbiolog\w*|biochem\w*|statistic\w*|psycholog\w*|sociolog\w*|calculus|genetic\w*|nutrition|english|composition)/gi;

export function relevantExcerpt(pageText: string, maxChars = 18_000): string {
  if (pageText.length <= maxChars) return pageText;
  const head = pageText.slice(0, 2_000);
  const windowChars = maxChars - head.length;

  // Centre on the mention that actually has coursework around it, not the first one. A page
  // titled "Admissions prerequisites and requirements" matches in its own heading and nav, so
  // centring on the first match framed the navigation and left the list outside the window:
  // Nevada's medical school lists biology, chemistry, organic chemistry, physics and
  // biochemistry with credit counts, and the model was shown none of it.
  const hint = new RegExp(PREREQ_PAGE_HINT.source, PREREQ_PAGE_HINT.flags.includes("g") ? PREREQ_PAGE_HINT.flags : `${PREREQ_PAGE_HINT.flags}g`);
  let best: { start: number; score: number } | null = null;
  for (const m of pageText.matchAll(hint)) {
    if (m.index == null) continue;
    const start = Math.max(2_000, m.index - Math.floor(windowChars * 0.2));
    const slice = pageText.slice(start, start + windowChars);
    const subjects = new Set((slice.match(EXCERPT_SUBJECTS) ?? []).map((x) => x.toLowerCase()));
    // Credit counts are the strongest sign a real list is present rather than a mention of one.
    const credits = (slice.match(/\b\d+\s*(?:semester\s+)?(?:credit|hour|unit)s?\b/gi) ?? []).length;
    const score = subjects.size * 3 + Math.min(credits, 10);
    if (!best || score > best.score) best = { start, score };
  }
  if (!best) return pageText.slice(0, maxChars);
  return `${head}\n...\n${pageText.slice(best.start, best.start + windowChars)}`;
}

async function extractWithOpenAIInner(program: ProgramRow, pageText: string, url: string): Promise<Extraction> {
  const payload = {
    model: OPENAI_MODEL,
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: { name: "prereq_extraction", strict: true, schema: EXTRACTION_SCHEMA },
    },
    messages: [
      {
        role: "system",
        content:
          "You extract admission prerequisite coursework from OFFICIAL university program pages. " +
          "NEVER invent, infer, or borrow requirements not explicitly present in the provided text. " +
          "Missing values must be null. Set hasPrereqList=true only when the text contains an actual prerequisite " +
          "coursework list for THIS program. Set statesNoPrereqs=true only when the text explicitly states there are " +
          "no specific course prerequisites — and then noPrereqsEvidenceQuote MUST contain the exact sentence from the " +
          "text making that statement. A page that lists named courses with credits DOES have a prerequisite list, so " +
          "hasPrereqList must be true and statesNoPrereqs false, even when the same page also says some other item is " +
          "recommended rather than required: Nevada lists Biology, Chemistry, Organic Chemistry, Physics and Biochemistry " +
          "with credit counts and adds \"although not required\" about a separate item, and was read as requiring nothing. " +
          "text making that statement. Course names must be the actual subjects as written (e.g. 'Human Anatomy with lab'); " +
          "NEVER emit placeholders like 'Prerequisite Course 1'. If the page only links to prerequisites elsewhere without " +
          "listing them, set hasPrereqList=false. Include non-course admission items (GPA, GRE, hours, degree) only when " +
          "presented as prerequisites, using classification per the text.",
      },
      {
        role: "user",
        content:
          `Program: ${program.programName} at ${program.name} (profession: ${program.professionSlug}).\n` +
          `Official source URL: ${url}\n\nOFFICIAL PAGE TEXT:\n${relevantExcerpt(pageText)}`,
      },
    ],
  };
  return runExtractionProviders(payload);
}

/**
 * Extraction providers, tried in order until one answers.
 *
 * OpenAI alone capped completion at its per-day request limit: measured capacity was ~240
 * calls an hour against hundreds of programs needing several calls each. Groq and Gemini each
 * offer a free tier well above that and both answered faster than OpenAI in testing
 * (gpt-oss-20b 429ms, flash-lite 753ms, against gpt-4o-mini's 1.3s), so a provider being
 * rate-limited no longer stalls the queue -- it just moves to the next one.
 *
 * Every provider is asked for the SAME strict JSON schema and the same no-fabrication system
 * prompt, and every result goes through validExtraction, whose evidence-quote check is
 * verified against the full page text. So which provider answered cannot change what counts
 * as acceptable evidence.
 */
type ProviderName = "openai" | "groq" | "gemini";
const providerDeadUntil: Record<string, number> = {};

/** Gemini's responseSchema rejects additionalProperties; strip it recursively. */
function geminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(geminiSchema);
  if (schema && typeof schema === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
      if (k === "additionalProperties" || k === "strict") continue;
      out[k] = geminiSchema(v);
    }
    return out;
  }
  return schema;
}

async function callOpenAiCompatible(
  name: ProviderName,
  url: string,
  key: string,
  model: string,
  payload: any,
): Promise<{ ok: true; value: Extraction } | { ok: false; status: number; body: string; retryAfter?: number }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ ...payload, model }),
    signal: AbortSignal.timeout(120_000),
  });
  if (res.ok) {
    const body = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    return { ok: true, value: JSON.parse(body.choices[0].message.content) as Extraction };
  }
  const body = await res.text().catch(() => "");
  const ra = Number(res.headers.get("retry-after"));
  return { ok: false, status: res.status, body, retryAfter: Number.isFinite(ra) ? ra : undefined };
}

async function callGemini(key: string, model: string, payload: any): Promise<Extraction> {
  const system = payload.messages.find((m: any) => m.role === "system")?.content ?? "";
  const user = payload.messages.find((m: any) => m.role === "user")?.content ?? "";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${system}\n\n${user}` }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: geminiSchema(EXTRACTION_SCHEMA),
        },
      }),
      signal: AbortSignal.timeout(120_000),
    },
  );
  if (!res.ok) {
    const b = await res.text().catch(() => "");
    const err = new Error(`Gemini HTTP ${res.status}: ${b.slice(0, 200)}`);
    if (res.status === 429 || res.status >= 500) providerDeadUntil.gemini = Date.now() + 60_000;
    throw err;
  }
  const json = (await res.json()) as any;
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return JSON.parse(text) as Extraction;
}

async function runExtractionProviders(payload: any): Promise<Extraction> {
  const chain: Array<{ name: ProviderName; run: () => Promise<Extraction> }> = [];

  if (OPENAI_KEY && !openaiDisabledReason) {
    chain.push({
      name: "openai",
      run: async () => {
        const r = await callOpenAiCompatible("openai", "https://api.openai.com/v1/chat/completions", OPENAI_KEY, OPENAI_MODEL, payload);
        if (r.ok) return r.value;
        if (r.status === 401 || /insufficient_quota|credit_balance_exhausted/i.test(r.body)) {
          disableOpenAI(`HTTP ${r.status} ${r.body.slice(0, 120)}`);
        } else if (r.status === 429 || r.status >= 500) {
          providerDeadUntil.openai = Date.now() + Math.min((r.retryAfter ?? 10) * 1000 + 500, 30_000);
        }
        throw new Error(`OpenAI HTTP ${r.status}: ${r.body.slice(0, 200)}`);
      },
    });
  }
  if (GROQ_KEY) {
    chain.push({
      name: "groq",
      run: async () => {
        const r = await callOpenAiCompatible("groq", "https://api.groq.com/openai/v1/chat/completions", GROQ_KEY, GROQ_MODEL, payload);
        if (r.ok) return r.value;
        if (r.status === 429 || r.status >= 500) {
          providerDeadUntil.groq = Date.now() + Math.min((r.retryAfter ?? 10) * 1000 + 500, 60_000);
        }
        throw new Error(`Groq HTTP ${r.status}: ${r.body.slice(0, 200)}`);
      },
    });
  }
  if (GEMINI_KEY) {
    chain.push({ name: "gemini", run: () => callGemini(GEMINI_KEY, GEMINI_MODEL, payload) });
  }

  let lastError: Error | null = null;
  // Two passes: the second gives a provider that was briefly rate-limited a chance to recover
  // rather than failing the program outright.
  for (let pass = 0; pass < 2; pass++) {
    for (const p of chain) {
      if ((providerDeadUntil[p.name] ?? 0) > Date.now()) continue;
      try {
        return await p.run();
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
      }
    }
    if (pass === 0 && chain.length) await new Promise((r) => setTimeout(r, 4_000));
  }
  throw lastError ?? new Error("all extraction providers failed");
}

// ── Validation + persistence ─────────────────────────────────────────────────

function toPrereqItem(c: ExtractedCourse): PrereqItem {
  const cls: PrereqItem["classification"] =
    c.classification === "required" ? "required"
    : c.classification === "recommended" ? "recommended"
    : "unclear";
  const details = [c.details, c.minGrade ? `Minimum grade: ${c.minGrade}` : null]
    .filter(Boolean).join(". ") || null;
  return {
    name: c.name, classification: cls, details,
    labRequired: c.labRequired, courseCount: c.courseCount,
    semesterCredits: c.semesterCredits, quarterCredits: c.quarterCredits,
    otherConditions: null,
  };
}

const PLACEHOLDER_NAME = /^(prerequisite|required)?\s*course\s*\d*$|^(course|subject|requirement)\s+\d+$/i;
const META_ADMISSION_NAME =
  /^(completion of|cumulative gpa|minimum gpa|overall gpa|foreign language|uk core|please view|bachelor(?:'s)? degree|bs or ba|ba or bs|lpn program|military training|active license|observation hours|shadowing|cpr certification|background check|drug screen|immunization|technical standards|essential functions)\b/i;
const SUBJECT_HINT = /biolog|chem|physic|anatom|physiol|a\s*&\s*p|psych|stat|math|calc|english|writ|composit|sociolog|microbio|genetic|biochem|kinesiol|nutrit|exercise|humanit|social|science|communicat|econom|algebra|literature|history|language|medical terminolog|gpa|gre|degree|bachelor|experience|hours|observ|shadow|cpr|certif|phonetic|audiolog|speech|hearing|aural|linguist|swallow|dysphag|voice|fluency|articulat|disorder|neurolog|csd|patholog|organic|immunolog|pathophys|lifespan|developmental|pharmacol|patient|clinical|statistics|calculus|physics|lab|health assessment|human development|microbiology|organic chem|general chem|nursing|holistic|epidemiolog|research methods|public health|biostat/i;
const COURSE_SUBJECT_HINT = /biolog|chem|physic|anatom|physiol|a\s*&\s*p|psych|stat(?:istics)?|math|calc|english|writ|composit|sociolog|microbio|genetic|biochem|kinesiol|nutrit|phonetic|audiolog|speech|hearing|linguist|organic|immunolog|pathophys|pharmacol|epidemiolog|biostat|microbiology|physics|algebra|literature|history|economics|communication sciences|medical terminolog/i;

/** Fields a no-prerequisite quote can be about, used to reject one belonging to another. */
const OWN_FIELD_IN_QUOTE: Record<string, RegExp> = {
  medicine: /medical school|medicine|premedical|osteopathic/i,
  postbac: /postbaccalaureate|post-baccalaureate|postbac|premedical|pre-health/i,
  nursing: /nursing|BSN|ABSN/i,
  "physician-assistant": /physician assistant|CASPA/i,
  "occupational-therapy": /occupational therapy/i,
  "physical-therapy": /physical therapy|DPT/i,
  "speech-language-pathology": /speech|communication sciences|communicative/i,
  pharmacy: /pharmacy|PharmD/i,
  dental: /dental/i,
  dietetics: /dietetic|nutrition/i,
  veterinary: /veterinar/i,
};
const OTHER_FIELD_IN_QUOTE: Array<[string, RegExp]> = [
  ["law", /law school|J\.?D\.?/i],
  ["business", /business school|MBA/i],
  ["theology", /divinity|seminary/i],
  ["engineering", /engineering/i],
  ...Object.entries(OWN_FIELD_IN_QUOTE).map(([k, v]) => [k, v] as [string, RegExp]),
];

function validExtraction(ex: Extraction, pageText: string, program: ProgramRow, sourceUrl = ""): boolean {
  const pageNorm = normalize(pageText);
  const urlHay = sourceUrl.toLowerCase();
  const onTopic =
    professionKeywords(program.professionSlug).some((k) => pageNorm.includes(normalize(k))) ||
    (program.professionSlug === "nursing" && /\b(bsn|msn|absn|mepn|rn\b|dnp)\b/i.test(pageText)) ||
    (program.professionSlug === "physician-assistant" && /\b(pa\b|physician assistant|caspa)\b/i.test(pageText)) ||
    (program.professionSlug === "medicine" && /\b(md\b|do\b|amcas|aacomas|medical school)\b/i.test(pageText)) ||
    // Shared prerequisite-course hubs (e.g. MCPHS) often omit the profession word in body copy.
    (/prerequi|admission-requirements|required-coursework|course-requirements/i.test(urlHay) &&
      COURSE_SUBJECT_HINT.test(pageText) &&
      (professionKeywords(program.professionSlug).some((k) => urlHay.includes(normalize(k).replace(/ /g, "-")) || pageNorm.includes(normalize(k))) ||
        program.professionSlug === "nursing" ||
        program.professionSlug === "pharmacy" ||
        program.professionSlug === "medicine"));
  if (ex.statesNoPrereqs) {
    const quote = ex.noPrereqsEvidenceQuote?.trim() ?? "";
    // A sentence about another field is not this programme saying it requires no coursework.
    // Cleveland State's postbaccalaureate row kept resting on "there are no required
    // prerequisite courses for law school", which is true and irrelevant.
    const namesAnotherField = OTHER_FIELD_IN_QUOTE.some(([slug, re]) => slug !== program.professionSlug && re.test(quote));
    const namesOwnField = OWN_FIELD_IN_QUOTE[program.professionSlug]?.test(quote) ?? false;
    if (namesAnotherField && !namesOwnField) return false;
    return quote.length >= 15 && pageNorm.includes(normalize(quote)) &&
      NO_PREREQ_ASSERTION.test(quote) && onTopic;
  }
  if (!ex.hasPrereqList || !onTopic) return false;
  if (!Array.isArray(ex.courses) || ex.courses.length < 2) return false;
  const names = ex.courses.map((c) => c.name ?? "");
  if (names.some((n) => typeof n !== "string" || n.length < 2 || n.length > 300)) return false;
  if (names.some((n) => PLACEHOLDER_NAME.test(n.trim()))) return false;
  // Reject admissions-meta lists (GPA/degree/license) with no real coursework subjects.
  if (names.filter((n) => META_ADMISSION_NAME.test(n.trim())).length >= Math.ceil(names.length / 2)) return false;
  const courseLike = names.filter((n) => COURSE_SUBJECT_HINT.test(n) && !META_ADMISSION_NAME.test(n.trim())).length;
  if (courseLike < 2) return false;
  const plausible = names.filter((n) => SUBJECT_HINT.test(n)).length;
  // Short official lists (2 courses) must both be plausible subjects; longer lists need majority.
  if (names.length <= 2) return plausible === names.length && courseLike === names.length;
  return plausible >= Math.ceil(names.length / 2);
}

async function persistResult(
  program: ProgramRow, ex: Extraction, source: Fetched,
): Promise<"verified" | "no_prereqs_published"> {
  const status = ex.statesNoPrereqs && !ex.courses.length ? "no_prereqs_published" : "verified";
  const items = ex.courses.map(toPrereqItem);
  const existing = program.prereqSources ?? [];
  const entry: PrereqSource = {
    url: source.url, title: null,
    sourceType: source.contentType.includes("markdown") ? "other_official" : "program_page",
    retrievedAt: TODAY, contentHash: source.hash,
    extractionMethod: source.contentType.includes("markdown") ? "browser" : "http",
  };
  const sources = existing.some((s) => s.url === entry.url)
    ? existing.map((s) => (s.url === entry.url ? { ...s, retrievedAt: TODAY, contentHash: source.hash } : s))
    : [...existing, entry];

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = path.join(CACHE_DIR, `${program.id}-${source.hash.slice(0, 16)}.html`);
  if (!fs.existsSync(cacheFile)) fs.writeFileSync(cacheFile, source.html);

  try {
    await db.update(programSchoolsTable).set({
      prereqCourses: items,
      prereqSources: sources,
      sourceUrl: source.url,
      lastVerified: TODAY,
      verificationStatus: status,
      verificationNote:
        `Machine-verified from official source via automated completion worker (${OPENAI_MODEL} structured extraction), no human review.` +
        (status === "no_prereqs_published" && ex.noPrereqsEvidenceQuote
          ? ` Source statement: "${ex.noPrereqsEvidenceQuote.slice(0, 300)}"`
          : "") +
        (ex.otherConditions ? ` Page conditions: ${ex.otherConditions.slice(0, 400)}` : ""),
    }).where(eq(programSchoolsTable.id, program.id));
  } catch (e) {
    const err = e as { message?: string; cause?: { message?: string; code?: string } };
    throw new Error(
      `persist failed for ${program.id}: ${err?.cause?.message || err?.message || String(e)}` +
        (err?.cause?.code ? ` [${err.cause.code}]` : ""),
    );
  }

  const [check] = await db.select().from(programSchoolsTable).where(eq(programSchoolsTable.id, program.id));
  if (!check || check.verificationStatus !== status || check.sourceUrl !== source.url ||
      (check.prereqCourses?.length ?? 0) !== items.length) {
    throw new Error(`read-back mismatch for ${program.id}`);
  }
  return status;
}

// ── Per-program pipeline ─────────────────────────────────────────────────────

async function extractPdfText(url: string): Promise<Fetched> {
  // A single 403 is not treated as permanent here, unlike the HTML path. Eastern Michigan's
  // orthotics handbook answered 403 once and 200 on every retry seconds later, so the program
  // was recorded as having no usable prerequisite list because of momentary WAF throttling.
  let res: Response | undefined;
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    await politeDelay(url);
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));
    const r = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/pdf,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(45_000),
    });
    if (r.ok) { res = r; break; }
    lastStatus = r.status;
    // 404/410 really are permanent; throttling responses are worth another attempt.
    if (r.status === 404 || r.status === 410) break;
  }
  if (!res) throw new Error(`PDF HTTP ${lastStatus}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) throw new Error("PDF too small");
  // Some "download?inline" endpoints return HTML error shells — require a real PDF header.
  if (buf.slice(0, 5).toString("utf8") !== "%PDF-") {
    throw new Error("PDF response missing %PDF- header");
  }
  const tmpPdf = path.join(CACHE_DIR, `pdf-${process.pid}-${Date.now()}.pdf`);
  const tmpTxt = `${tmpPdf}.txt`;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(tmpPdf, buf);
  try {
    const { spawnSync } = await import("node:child_process");
    const py = `
import sys
text = ""
try:
    from pypdf import PdfReader
    reader = PdfReader(sys.argv[1])
    parts = []
    for page in reader.pages[:40]:
        try:
            parts.append(page.extract_text() or "")
        except Exception:
            pass
    text = "\\n".join(parts).strip()
except Exception as e:
    sys.stderr.write(f"pypdf:{e}\\n")
if len(text) < 200:
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(sys.argv[1])
        parts = []
        for i, page in enumerate(doc):
            if i >= 40: break
            parts.append(page.get_text() or "")
        text = "\\n".join(parts).strip()
    except Exception as e:
        sys.stderr.write(f"pymupdf:{e}\\n")
open(sys.argv[2], "w", encoding="utf-8").write(text)
print(len(text))
`;
    const first = spawnSync("python", ["-c", py, tmpPdf, tmpTxt], { encoding: "utf8", timeout: 90_000 });
    const run = first.status === 0 ? first : spawnSync("python3", ["-c", py, tmpPdf, tmpTxt], { encoding: "utf8", timeout: 90_000 });
    if (run.status !== 0) {
      throw new Error(`PDF extract failed: ${(run.stderr || run.stdout || "").slice(0, 200)}`);
    }
    const text = fs.existsSync(tmpTxt) ? fs.readFileSync(tmpTxt, "utf8") : "";
    if (text.trim().length < 200) throw new Error("PDF text extraction too short");
    return {
      url: res.url,
      html: text,
      text: text.slice(0, 160_000),
      hash: crypto.createHash("sha256").update(text).digest("hex"),
      contentType: "application/pdf",
    };
  } finally {
    try { fs.unlinkSync(tmpPdf); } catch { /* ignore */ }
    try { fs.unlinkSync(tmpTxt); } catch { /* ignore */ }
  }
}

async function fetchJinaReader(url: string): Promise<Fetched> {
  if (!JINA_KEY) throw new Error("Jina not configured");
  await politeDelay("https://r.jina.ai/");
  const headers: Record<string, string> = {
    "user-agent": USER_AGENT,
    accept: "text/plain",
    "x-return-format": "markdown",
  };
  if (JINA_KEY) headers.authorization = `Bearer ${JINA_KEY}`;
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers,
    signal: AbortSignal.timeout(45_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Jina reader HTTP ${res.status}`);
  const text = (await res.text()).replace(/\u0000/g, "").trim();
  if (text.length < 300) throw new Error("Jina reader too little text");
  return {
    url,
    html: text,
    text: text.slice(0, 160_000),
    hash: crypto.createHash("sha256").update(text).digest("hex"),
    contentType: "text/markdown",
  };
}

async function fetchWayback(url: string): Promise<Fetched> {
  const avail = await fetch(
    `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`,
    { headers: { "user-agent": USER_AGENT, accept: "application/json" }, signal: AbortSignal.timeout(15_000) },
  );
  if (!avail.ok) throw new Error(`Wayback availability HTTP ${avail.status}`);
  const body = (await avail.json()) as { archived_snapshots?: { closest?: { available?: boolean; url?: string } } };
  const snap = body.archived_snapshots?.closest;
  if (!snap?.available || !snap.url) throw new Error("No Wayback snapshot");
  // Prefer an identity iframe-less snapshot URL.
  const snapshotUrl = snap.url.replace(/(\/\d{14})([a-z]{2}_)?\//i, "$1id_/");
  const fetched = await fetchOfficial(snapshotUrl);
  return { ...fetched, url }; // keep logical URL as the live official page
}

async function fetchWithFallback(url: string): Promise<Fetched> {
  // Prefer fast direct HTTP; use Keenable/Jina/Firecrawl for PDFs, blocks, JS shells, and fetch failures.
  const looksPdf = /\.pdf($|\?)/i.test(url) || /\/media\/\d+\/download/i.test(url) || /[?&]inline(?:=|$)/i.test(url);
  if (looksPdf) {
    if (FIRECRAWL_KEY) {
      try { return await firecrawlScrape(url); } catch { /* fall through to local PDF extract */ }
    }
    // Keep the underlying reason: "PDF extract failed" alone cannot distinguish a blocked
    // fetch from an unparseable file, and the verification note is the audit trail for why a
    // program was left unfinished.
    let pdfError = "no PDF reader available";
    try { return await extractPdfText(url); } catch (e) { pdfError = (e as Error).message; }
    if (JINA_KEY) {
      try { return await fetchJinaReader(url); } catch { /* fall through */ }
    }
    throw new Error(`PDF extract failed for ${url}: ${pdfError}`);
  }
  try {
    const fetched = await fetchOfficial(url);
    if (fetched.text.length >= 300 && !looksLikeJsShell(fetched.html, fetched.text)) return fetched;
    if (JINA_KEY) {
      try { return await fetchJinaReader(url); } catch { /* fall through */ }
    }
    if (KEENABLE_KEY) {
      try { return await keenableFetch(url); } catch { /* fall through */ }
    }
    if (FIRECRAWL_KEY) {
      try { return await firecrawlScrape(url); } catch { /* fall through */ }
    }
    // Thin content / JS shell from plain fetch — render it locally.
    //
    // The render's own error used to be discarded and the empty fetch returned instead, so the
    // programme was recorded as "too little text" whatever had actually gone wrong. Losing the
    // reason makes a render that never ran indistinguishable from a page with nothing on it.
    try {
      return await fetchRendered(url);
    } catch (renderError) {
      const why = renderError instanceof Error ? renderError.message : String(renderError);
      if (fetched.text.length < 300) throw new Error(`plain fetch returned ${fetched.text.length} chars; render failed: ${why}`);
    }
    return fetched;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const blocked = /HTTP 403|HTTP 401|HTTP 429|timeout|fetch failed|too little text/i.test(msg);
    if (blocked && KEENABLE_KEY) {
      try { return await keenableFetch(url); } catch { /* try jina next */ }
    }
    if (blocked && JINA_KEY) {
      try { return await fetchJinaReader(url); } catch { /* try browser next */ }
    }
    if (blocked) {
      try { return await fetchRendered(url); } catch { /* try firecrawl next */ }
    }
    if (FIRECRAWL_KEY && blocked) {
      try { return await firecrawlScrape(url); } catch { /* try wayback next */ }
    }
    if (/HTTP 403|HTTP 401|HTTP 429|fetch failed|timeout/i.test(msg)) {
      try { return await fetchWayback(url); } catch { /* fall through */ }
    }
    if (FIRECRAWL_KEY) {
      try { return await firecrawlScrape(url); } catch { /* try browser as last resort */ }
    }
    try { return await fetchRendered(url); } catch { /* fall through */ }
    throw e;
  }
}

function processProgram(program: ProgramRow): Promise<string> {
  // Give each program its own headless-render budget for the whole of its processing.
  return renderBudget.run({ remaining: MAX_RENDERS_PER_PROGRAM }, () => processProgramInner(program));
}

async function processProgramInner(program: ProgramRow): Promise<string> {
  const isNewGen = (state[program.id]?.pipelineGen ?? 1) < CURRENT_PIPELINE_GEN;
  setState(program.id, {
    stage: "source_discovery",
    attempts: isNewGen ? 1 : (state[program.id]?.attempts ?? 0) + 1,
    error: undefined,
    pipelineGen: CURRENT_PIPELINE_GEN,
  });

  // Fix scheme-less directory URLs in Neon so crawl/search can use them.
  //
  // The row is re-read first, and the write is conditional on the stored value still being the
  // one this run loaded. A run holds its queue snapshot for hours, so without that guard it
  // writes a stale URL back over a seed curated in the meantime: John Carroll was researched by
  // hand and set to jcu.edu/academics/..., and a worker that had started earlier normalized its
  // snapshot copy of the dead AAMC URL from http to https, saw a difference, and reverted the
  // row. Losing hand research to a background job is worse than leaving a URL unnormalized.
  const fresh = (await db.execute(sql.raw(
    `select coalesce(website_url,'') w, coalesce(source_url,'') s from program_schools where id = ${program.id}`,
  ))).rows[0] as { w: string; s: string } | undefined;
  const storedWeb = fresh?.w || null;
  const storedSrc = fresh?.s || null;
  if (storedWeb !== program.websiteUrl || storedSrc !== program.sourceUrl) {
    // Someone changed the row since this run queued it. Their value wins, and this run uses it.
    program.websiteUrl = storedWeb;
    program.sourceUrl = storedSrc;
  }
  const normWeb = program.websiteUrl ? normalizeCandidateUrl(program.websiteUrl) : null;
  const normSrc = program.sourceUrl ? normalizeCandidateUrl(program.sourceUrl) : null;
  if (normWeb !== program.websiteUrl || normSrc !== program.sourceUrl) {
    program.websiteUrl = normWeb;
    program.sourceUrl = normSrc;
    try {
      await db.update(programSchoolsTable).set({
        websiteUrl: normWeb,
        sourceUrl: normSrc,
      }).where(and(
        eq(programSchoolsTable.id, program.id),
        sql`coalesce(source_url, '') = ${storedSrc ?? ""}`,
      ));
    } catch { /* non-fatal */ }
  }
  if (program.websiteUrl && (websiteConflictsWithInstitution(program.websiteUrl, program.name) || isGarbageDiscoveredUrl(program.websiteUrl))) {
    program.websiteUrl = null;
    try {
      await db.update(programSchoolsTable).set({ websiteUrl: null }).where(eq(programSchoolsTable.id, program.id));
    } catch { /* non-fatal */ }
  }

  // Phase timing. Programs were exceeding a 420s budget and neither the crawl deadline nor the
  // render cap explained it, so record where the time actually goes instead of guessing again.
  const phaseStart = Date.now();
  // Bound discovery as a whole, not just the crawl inside it. Subdomain probing, CMS search
  // and sitemap traversal sit outside the crawl deadline, and together they were measured at
  // 116-183s; added to the extraction queue that is the entire 420s program budget, which is
  // why bare-homepage speech-language-pathology programs timed out with nothing to show.
  // Whatever has been discovered when the deadline passes is still used.
  const DISCOVERY_BUDGET_MS = Number(process.env.COMPLETION_DISCOVERY_BUDGET_MS || 150_000);
  const candidates = await discoverCandidates(program, Date.now() + DISCOVERY_BUDGET_MS);
  const discoveryMs = Date.now() - phaseStart;
  if (discoveryMs > 60_000) {
    console.warn(`[timing] ${program.id} discovery took ${Math.round(discoveryMs / 1000)}s (${candidates.length} candidates)`);
  }
  if (!candidates.length) {
    setState(program.id, { stage: "failed", error: "no official candidate URLs" });
    return "failed";
  }

  let best: { fetched: Fetched; ex: Extraction } | null = null;
  const errors: string[] = [];
  const tryCandidates = candidates
    .map(normalizeCandidateUrl)
    .filter((c): c is string => !!c)
    .slice(0, 12);
  const fetchedPages: Fetched[] = [];
  for (const candidate of tryCandidates) {
    try {
      let fetched: Fetched;
      if (candidate.startsWith("cache:")) {
        const [file, url] = candidate.slice(6).split("|");
        const html = fs.readFileSync(path.join(ROOT, file), "utf8");
        fetched = { url, html, text: stripHtml(html).slice(0, 160_000), hash: crypto.createHash("sha256").update(html).digest("hex"), contentType: "text/html" };
      } else {
        fetched = await fetchWithFallback(candidate);
      }
      setState(program.id, { stage: "source_fetched", sourceUrl: fetched.url });
      if (fetched.text.length < 300) { errors.push(`${candidate}: too little text`); continue; }
      fetchedPages.push(fetched);
    } catch (e) {
      errors.push(`${candidate}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const fetchMs = Date.now() - phaseStart - discoveryMs;
  if (fetchMs > 60_000) {
    console.warn(`[timing] ${program.id} candidate fetch took ${Math.round(fetchMs / 1000)}s (${fetchedPages.length} pages)`);
  }

  // Prefer pages that already mention prerequisites before spending OpenAI calls.
  const rankedPages = [...fetchedPages].sort((a, b) => {
    const as = (PREREQ_PAGE_HINT.test(a.text) ? 2 : 0) + (a.text.length > 2000 ? 1 : 0);
    const bs = (PREREQ_PAGE_HINT.test(b.text) ? 2 : 0) + (b.text.length > 2000 ? 1 : 0);
    return bs - as;
  });

  // Extraction calls are the scarce resource: the account's daily request quota allows about
  // 240 calls an hour, so spending up to six on one program starves the queue while only about
  // a quarter of programs finalize anyway. The pages are already ranked with pages that mention
  // prerequisites first, so the later candidates are the weakest ones -- trying three good
  // candidates for two programs beats six mediocre ones for one. Raise COMPLETION_MAX_EXTRACTIONS
  // once the account's rate limit is lifted.
  const MAX_EXTRACTIONS = Number(process.env.COMPLETION_MAX_EXTRACTIONS || 3);
  for (const fetched of rankedPages.slice(0, MAX_EXTRACTIONS)) {
    try {
      if (!PREREQ_PAGE_HINT.test(fetched.text) && rankedPages.some((p) => PREREQ_PAGE_HINT.test(p.text))) {
        continue; // skip weak pages when a stronger candidate exists
      }
      const exStart = Date.now();
      const ex = await extractWithOpenAI(program, fetched.text, fetched.url);
      const exMs = Date.now() - exStart;
      if (exMs > 45_000) {
        console.warn(`[timing] ${program.id} extraction took ${Math.round(exMs / 1000)}s for ${fetched.url.slice(0, 70)}`);
      }
      setState(program.id, { stage: "extracted" });
      if (!validExtraction(ex, fetched.text, program, fetched.url)) {
        // Set COMPLETION_DEBUG_EXTRACTION=1 to see what the model returned. "No usable prereq
        // list" cannot distinguish a page with nothing on it from a page whose list the model
        // missed, and those need opposite responses.
        if (process.env.COMPLETION_DEBUG_EXTRACTION) {
          console.warn(
            `[extract] ${program.id} ${fetched.url}
` +
              `  hasPrereqList=${ex.hasPrereqList} statesNoPrereqs=${ex.statesNoPrereqs} courses=${ex.courses?.length ?? 0}
` +
              `  names=${JSON.stringify((ex.courses ?? []).map((c) => c.name).slice(0, 8))}
` +
              `  textLen=${fetched.text.length}`,
          );
        }
        errors.push(`${fetched.url}: no usable prereq list`);
        continue;
      }
      // A sibling campus's catalogue describes a different programme, however official it is.
      try {
        const fetchedHost = new URL(fetched.url).hostname.replace(/^www\./i, "").toLowerCase();
        if (catalogHostStateConflicts(fetchedHost, program.state ?? "")) {
          errors.push(`${fetched.url}: catalogue for a different campus than ${program.state ?? "?"}`);
          continue;
        }
      } catch { /* unparsable url is handled elsewhere */ }
      best = { fetched, ex };
      if (ex.hasPrereqList && ex.courses.length >= 4) break;
    } catch (e) {
      errors.push(`${fetched.url}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!best) {
    for (const candidate of tryCandidates.slice(0, 5)) {
      if (candidate.startsWith("cache:") || isDirectoryHubUrl(candidate)) continue;
      try {
        const rootPage = await fetchWithFallback(candidate);
        for (const link of keywordLinks(rootPage.html, rootPage.url, professionKeywords(program.professionSlug)).slice(0, 10)) {
          try {
            const fetched = await fetchWithFallback(link);
            if (fetched.text.length < 300) continue;
            const ex = await extractWithOpenAI(program, fetched.text, fetched.url);
            if (validExtraction(ex, fetched.text, program, fetched.url)) { best = { fetched, ex }; break; }
          } catch { /* try next link */ }
        }
      } catch { /* try next candidate */ }
      if (best) break;
    }
  }

  if (!best) {
    setState(program.id, { stage: "failed", error: errors.slice(0, 4).join(" || ").slice(0, 500) });
    await db.update(programSchoolsTable).set({
      verificationNote: `Automated completion attempt ${TODAY} did not find a usable official prerequisite list yet. Errors: ${errors.slice(0, 2).join("; ").slice(0, 300)}`,
    }).where(eq(programSchoolsTable.id, program.id));
    return "failed";
  }

  setState(program.id, { stage: "validated" });
  if (websiteConflictsWithInstitution(best.fetched.url, program.name) && !isOfficialCatalogMirror(best.fetched.url, program)) {
    setState(program.id, { stage: "failed", error: `refusing mismatched institution URL ${best.fetched.url}` });
    return "failed";
  }
  const status = await persistResult(program, best.ex, best.fetched);
  setState(program.id, { stage: "finalized", finalStatus: status, sourceUrl: best.fetched.url });
  return status;
}

// ── Queue + concurrency ──────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const get = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const limit = get("--limit") ? Number(get("--limit")) : Infinity;
  const profession = get("--profession");
  const retryFailures = argv.includes("--retry-failures");
  const allUnfinished = argv.includes("--all-unfinished");
  // --ids 123,456 : process exactly these program ids, bypassing the eligibility filters.
  // Needed to reproduce and debug one program without waiting for a full sweep.
  const explicitIds = (get("--ids") ?? "").split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0);
  if (!profession && !allUnfinished && !retryFailures && !explicitIds.length && !Number.isFinite(limit)) {
    throw new Error("Choose --limit N, --profession <slug>, --all-unfinished, or --retry-failures");
  }
  if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY is required for structured extraction");

  // On a new pipeline generation, reopen attempt-limit source_blocked rows so they get another
  // real discovery pass instead of remaining permanently blocked from older worker limits.
  if (allUnfinished || retryFailures) {
    const reopenNote = ` | Reopened for pipeline gen ${CURRENT_PIPELINE_GEN} retry (prior attempt-limit block is not a final professor outcome).`;
    const reopened = await db.execute(sql`
      update program_schools
      set verification_status = 'needs_review',
          verification_note = left(coalesce(verification_note,'') || ${reopenNote}, 2000)
      where directory_status = 'active'
        and verification_status = 'source_blocked'
        and verification_note ilike '%Genuinely source-blocked after%attempts%'
      returning id
    `);
    const ids = (((reopened as unknown as { rows?: Array<{ id: number }> }).rows) ?? []);
    for (const row of ids) {
      const prev = state[row.id];
      state[row.id] = {
        stage: "unstarted",
        lastAttempt: new Date().toISOString(),
        attempts: Math.min(prev?.attempts ?? 0, 2),
        error: `reopened for pipeline gen ${CURRENT_PIPELINE_GEN}`,
        pipelineGen: CURRENT_PIPELINE_GEN,
      };
    }
    if (ids.length) {
      saveState();
      console.log(`Reopened ${ids.length} attempt-limit source_blocked program(s) for pipeline gen ${CURRENT_PIPELINE_GEN}.`);
    }
  }

  const [{ count, dbName }] = await db
    .select({
      count: sql<number>`count(*)::int`,
      dbName: sql<string>`current_database()`,
    })
    .from(programSchoolsTable);
  console.log(`Database identity: ${dbName}, ${count} program rows. Firecrawl: ${FIRECRAWL_KEY ? "on" : "off"}. Jina: ${JINA_KEY ? "on" : "off"}. Keenable: ${KEENABLE_KEY ? "on" : "off"}.`);
  if (count < 100) throw new Error("Refusing bulk run: program_schools has <100 rows — wrong database?");

  const rows = await db.select().from(programSchoolsTable).where(and(
    eq(programSchoolsTable.directoryStatus, "active"),
    inArray(programSchoolsTable.verificationStatus, ["draft", "imported", "needs_review", "outdated"]),
    profession ? eq(programSchoolsTable.professionSlug, profession) : undefined,
  ));

  const professionPriority: Record<string, number> = {
    // Prefer largest unfinished gaps once nursing/PA are mostly done.
    medicine: 0,
    pharmacy: 1,
    postbac: 2,
    "speech-language-pathology": 3,
    "occupational-therapy": 4,
    "physical-therapy": 5,
    dietetics: 6,
    nursing: 7,
    "physician-assistant": 8,
    dental: 9,
    "genetic-counseling": 10,
    "prosthetics-orthotics": 11,
  };
  // A program with no realistic path to success (every discoverable candidate URL exhausted,
  // repeatedly) must not consume retry-failures time forever -- each round it stays in the queue
  // is a round where a program that failed once, and might succeed on a second try, does not get
  // that try. Past this many total attempts, individually document it as source_blocked instead
  // of retrying it again.
  const MAX_ATTEMPTS_BEFORE_BLOCKED = 18;
  let queue = explicitIds.length
    ? (rows as ProgramRow[]).filter((r) => explicitIds.includes(r.id))
    : (rows as ProgramRow[]).filter((r) => {
    const s = state[r.id];
    if (s?.stage === "finalized") return false;
    if (s?.stage === "failed" && (s.attempts ?? 0) >= MAX_ATTEMPTS_BEFORE_BLOCKED) return false;
    if (retryFailures) {
      // Cool off chronic failures so each retry round can spend time on fresher misses.
      // They remain eligible for all-unfinished until attempt ceiling / next pipeline gen.
      if ((s?.attempts ?? 0) >= 8) return false;
      return s?.stage === "failed";
    }
    // Programs that exhausted retries under an older pipeline generation (e.g. before PDF/browser
    // rendering fallbacks or a working OpenAI key existed) get exactly one fresh shot under the
    // current generation rather than staying excluded forever.
    const exhaustedThisGen = (s?.pipelineGen ?? 1) >= CURRENT_PIPELINE_GEN && (s?.attempts ?? 0) >= 3;
    if (s?.stage === "failed" && exhaustedThisGen) return false;
    return true;
  });

  // Individually document (not silently drop) every program that just crossed the attempt
  // ceiling for the first time -- this is the genuine-blocker record required by the completion
  // gate, not a bulk "give up" pass over records that were merely never queued.
  for (const r of rows as ProgramRow[]) {
    const s = state[r.id];
    if (s?.stage === "failed" && (s.attempts ?? 0) >= MAX_ATTEMPTS_BEFORE_BLOCKED && !s.finalStatus) {
      try {
        await db.update(programSchoolsTable).set({
          verificationStatus: "source_blocked",
          lastVerified: TODAY,
          verificationNote:
            `Genuinely source-blocked after ${s.attempts} attempts across multiple discovery methods ` +
            `(direct HTTP, Jina Reader, headless-browser rendering, PDF extraction, same-domain crawl, ` +
            `and OpenAI structured extraction where content was retrieved). Last attempt: ${s.error ?? "unknown"}`.slice(0, 2000),
        }).where(eq(programSchoolsTable.id, r.id));
        setState(r.id, { stage: "finalized", finalStatus: "source_blocked" });
      } catch { /* leave for a later run to retry documenting */ }
    }
  }
  queue.sort((a, b) => {
    const aAttempts = state[a.id]?.attempts ?? 0;
    const bAttempts = state[b.id]?.attempts ?? 0;
    // Prefer fresh / low-attempt programs so chronic hard cases do not monopolize every round.
    if (aAttempts !== bAttempts) return aAttempts - bAttempts;
    const aSite = a.websiteUrl && !isDirectoryHubUrl(a.websiteUrl) && !isGarbageDiscoveredUrl(a.websiteUrl) && !websiteConflictsWithInstitution(a.websiteUrl, a.name) ? 0 : 1;
    const bSite = b.websiteUrl && !isDirectoryHubUrl(b.websiteUrl) && !isGarbageDiscoveredUrl(b.websiteUrl) && !websiteConflictsWithInstitution(b.websiteUrl, b.name) ? 0 : 1;
    if (aSite !== bSite) return aSite - bSite;
    return (professionPriority[a.professionSlug] ?? 50) - (professionPriority[b.professionSlug] ?? 50);
  });
  queue = queue.slice(0, Number.isFinite(limit) ? Number(limit) : queue.length);
  console.log(`Queue: ${queue.length} program(s) to process.`);

  const counts: Record<string, number> = {};
  let index = 0;

  /**
   * Bound how long one program may hold a worker slot.
   *
   * processProgram had no time limit, so a pathological program -- a deep crawl over slow
   * pages, a large PDF, a browser render that hangs -- occupied its slot indefinitely. With
   * 16 workers that showed up as ~24 programs completed in 31 minutes, roughly 20 minutes per
   * program, while the queue sat idle behind the stragglers.
   *
   * A timed-out program is left unfinished and retried in a later round rather than being
   * finalized, so no result is invented and nothing already persisted is lost: processProgram
   * checkpoints state and writes verified results as it goes. If the abandoned work does
   * finish afterwards its result still lands, which is strictly a bonus.
   */
  // Sized so a bounded crawl (COMPLETION_CRAWL_BUDGET_MS) plus discovery and up to six
  // extraction attempts fit inside it; at 240s the crawl alone could exhaust the budget and
  // the program was killed with its candidates unused.
  const PROGRAM_TIMEOUT_MS = Number(process.env.COMPLETION_PROGRAM_TIMEOUT_MS || 420_000);
  async function processWithTimeout(program: ProgramRow): Promise<string> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        processProgram(program),
        new Promise<string>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`program timeout after ${Math.round(PROGRAM_TIMEOUT_MS / 1000)}s`)),
            PROGRAM_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function workerLoop(workerId: number) {
    while (index < queue.length) {
      const program = queue[index++];
      try {
        const outcome = await processWithTimeout(program);
        counts[outcome] = (counts[outcome] ?? 0) + 1;
        console.log(`[w${workerId}] ${program.id} ${program.name} (${program.professionSlug}) → ${outcome} [${index}/${queue.length}]`);
      } catch (e) {
        counts.error = (counts.error ?? 0) + 1;
        setState(program.id, { stage: "failed", error: e instanceof Error ? e.message : String(e) });
        console.warn(`[w${workerId}] ${program.id} ${program.name} → ERROR ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => workerLoop(i + 1)));
  console.log("Outcome counts:", JSON.stringify(counts));
  const failed = Object.entries(state).filter(([, s]) => s.stage === "failed");
  console.log(`Failure queue size: ${failed.length}`);
  await closeSharedBrowser();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  await closeSharedBrowser().catch(() => {});
  process.exit(1);
});

// Neon/pg can emit async socket errors that would otherwise kill the whole queue.
function isTransientNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code = err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code) : "";
  return /Connection terminated|ECONNRESET|ECONNREFUSED|read ECONNRESET|Client has encountered a connection error|ERR_ASSERTION|UND_ERR|socket hang up|fetch failed|EPIPE|ETIMEDOUT/i.test(`${code} ${msg}`);
}

// This worker must survive for hours unattended. Every program is already isolated in its
// own try/catch inside workerLoop, so an exception that escapes to here is always safe to
// log-and-continue rather than kill the whole run and lose accumulated progress.
process.on("uncaughtException", (err) => {
  console.warn(`non-fatal uncaught exception (continuing): ${err instanceof Error ? err.stack || err.message : err}`);
});
process.on("unhandledRejection", (reason) => {
  console.warn(`non-fatal unhandled rejection (continuing): ${reason instanceof Error ? reason.stack || reason.message : reason}`);
});
