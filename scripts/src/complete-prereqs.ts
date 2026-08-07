/**
 * complete-prereqs.ts
 * -------------------
 * Automated full-database prerequisite completion worker.
 *
 * Pipeline per program (resumable, checkpointed in data/completion-state.json):
 *   1. discover  — candidate official URLs (stored sourceUrl/websiteUrl, cached
 *                  queue candidates, same-domain keyword links, Firecrawl
 *                  search when FIRECRAWL_API_KEY is configured)
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
 *   pnpm --filter @workspace/scripts run complete:prereqs -- --limit 10 --profession physical-therapy
 *   pnpm --filter @workspace/scripts run complete:prereqs -- --all-unfinished
 *   pnpm --filter @workspace/scripts run complete:prereqs -- --retry-failures
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, programSchoolsTable, type PrereqItem, type PrereqSource } from "@workspace/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const CACHE_DIR = path.join(ROOT, "data/prereq-source-cache");
const QUEUE_DIR = path.join(ROOT, "data/prereq-review-queue");
const STATE_FILE = path.join(ROOT, "data/completion-state.json");
const TODAY = new Date().toISOString().slice(0, 10);
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 HealthProfessionsPlanner/1.0";
const OPENAI_KEY = process.env.OPENAI_API_KEY ?? "";
const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY ?? "";
const KEYWORDS = [
  "prerequisite", "pre-requisite", "admission-requirements", "admission_requirements",
  "admissions", "admission", "requirements", "required-course", "how-to-apply",
  "apply", "eligibility", "prospective", "application-requirements", "catalog", "handbook",
];
const CONCURRENCY = 4;
const PER_DOMAIN_DELAY_MS = 2500;
const OPENAI_MODEL = process.env.COMPLETION_MODEL || "gpt-4o-mini";

// ── Durable per-program state ────────────────────────────────────────────────

type Stage =
  | "unstarted" | "source_discovery" | "source_fetched" | "extracted"
  | "validated" | "persisted" | "finalized" | "failed";

interface ProgramState {
  stage: Stage;
  lastAttempt: string;
  attempts: number;
  finalStatus?: string;
  error?: string;
  sourceUrl?: string;
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
function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
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

async function fetchOfficial(url: string): Promise<Fetched> {
  await politeDelay(url);
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/pdf;q=0.9,*/*;q=0.5" },
        redirect: "follow",
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("pdf")) {
        // PDFs need a document extractor; route through Firecrawl when available.
        if (FIRECRAWL_KEY) return await firecrawlScrape(url);
        throw new Error("PDF source requires Firecrawl parsing (key not configured)");
      }
      const html = await res.text();
      return {
        url: res.url, html, text: stripHtml(html).slice(0, 160_000),
        hash: crypto.createHash("sha256").update(html).digest("hex"),
        contentType,
      };
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// ── Firecrawl (primary retrieval when configured) ────────────────────────────

async function firecrawlScrape(url: string): Promise<Fetched> {
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { authorization: `Bearer ${FIRECRAWL_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    signal: AbortSignal.timeout(60_000),
  });
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
  const res = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: { authorization: `Bearer ${FIRECRAWL_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ query, limit: 5 }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Firecrawl search HTTP ${res.status}`);
  const body = (await res.json()) as { data?: Array<{ url?: string }> };
  return (body.data ?? []).map((d) => d.url).filter((u): u is string => !!u);
}

// ── Discovery ────────────────────────────────────────────────────────────────

function keywordLinks(html: string, base: string, professionTerms: string[]): string[] {
  const scored = new Map<string, number>();
  const baseUrl = new URL(base);
  const rootDomain = baseUrl.hostname.split(".").slice(-2).join(".");
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const u = new URL(m[1], baseUrl);
      if (!u.hostname.endsWith(rootDomain)) continue; // stay on the institution's domain
      const hay = `${u.pathname} ${stripHtml(m[2])}`.toLowerCase();
      if (!KEYWORDS.some((k) => hay.includes(k))) continue;
      u.hash = "";
      let score = 0;
      if (/prereq|pre-requisite/.test(hay)) score += 5;
      if (/requirement/.test(hay)) score += 3;
      if (/admiss/.test(hay)) score += 2;
      if (professionTerms.some((t) => hay.includes(normalize(t).replace(/ /g, "-")) || hay.includes(normalize(t)))) score += 6;
      if (u.hostname === baseUrl.hostname) score += 1;
      scored.set(u.toString(), Math.max(scored.get(u.toString()) ?? 0, score));
    } catch { /* skip malformed */ }
  }
  return [...scored.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([u]) => u);
}

interface ProgramRow {
  id: number; name: string; professionSlug: string; programName: string;
  websiteUrl: string | null; sourceUrl: string | null;
  prereqSources: PrereqSource[] | null; verificationStatus: string;
  prereqCourses: PrereqItem[] | null;
}

async function discoverCandidates(program: ProgramRow): Promise<string[]> {
  const candidates: string[] = [];
  // 1. queue file candidates from prior acquisition runs
  try {
    const queue = JSON.parse(fs.readFileSync(path.join(QUEUE_DIR, `${program.id}.json`), "utf8"));
    if (queue.root?.cacheFile) candidates.push(`cache:${queue.root.cacheFile}|${queue.root.url}`);
    for (const s of queue.candidateOfficialSources ?? []) {
      if (s.url && /prereq|requirement|admission|apply|prospective/i.test(s.url)) candidates.push(s.url);
    }
  } catch { /* no queue file */ }
  // 2. stored URLs
  if (program.sourceUrl) candidates.push(program.sourceUrl);
  if (program.websiteUrl) candidates.push(program.websiteUrl);
  // 3. Firecrawl official-domain search when configured
  if (FIRECRAWL_KEY && program.websiteUrl) {
    try {
      const host = new URL(program.websiteUrl).hostname.replace(/^www\./, "");
      const urls = await firecrawlSearch(
        `${program.name} ${program.programName} prerequisite courses admission requirements site:${host}`,
      );
      candidates.push(...urls.filter((u) => u.includes(host)));
    } catch { /* search failure is non-fatal */ }
  }
  return [...new Set(candidates)];
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

async function extractWithOpenAI(program: ProgramRow, pageText: string, url: string): Promise<Extraction> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${OPENAI_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
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
            "text making that statement. Course names must be the actual subjects as written (e.g. 'Human Anatomy with lab'); " +
            "NEVER emit placeholders like 'Prerequisite Course 1'. If the page only links to prerequisites elsewhere without " +
            "listing them, set hasPrereqList=false. Include non-course admission items (GPA, GRE, hours, degree) only when " +
            "presented as prerequisites, using classification per the text.",
        },
        {
          role: "user",
          content:
            `Program: ${program.programName} at ${program.name} (profession: ${program.professionSlug}).\n` +
            `Official source URL: ${url}\n\nOFFICIAL PAGE TEXT:\n${pageText.slice(0, 100_000)}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${res.status}: ${errBody.slice(0, 300)}`);
  }
  const body = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return JSON.parse(body.choices[0].message.content) as Extraction;
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
const SUBJECT_HINT = /biolog|chem|physic|anatom|physiol|psych|stat|math|calc|english|writ|composit|sociolog|microbio|genetic|biochem|kinesiol|nutrit|exercise|humanit|social|science|communicat|econom|algebra|literature|history|language|medical|terminolog|gpa|gre|degree|bachelor|experience|hours|observ|shadow|cpr|certif/i;

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// The quote must genuinely assert that prerequisites are absent, not be any random page sentence.
const NO_PREREQ_ASSERTION =
  /(no|not\s+require|not\s+have|without)[^.]{0,60}prerequis|prerequis[^.]{0,60}(are\s+not|not\s+required|none)/i;

function professionKeywords(slug: string): string[] {
  const map: Record<string, string[]> = {
    "physical-therapy": ["physical therapy", "dpt"],
    "occupational-therapy": ["occupational therapy", "otd", "msot"],
    "physician-assistant": ["physician assistant", "physician associate"],
    "anesthesiologist-assistant": ["anesthesiologist assistant", "anesthesia"],
    "pathologists-assistant": ["pathologist"],
    medicine: ["medicine", "medical", "md program", "m.d."],
    "osteopathic-medicine": ["osteopathic", "d.o."],
    dental: ["dental", "dentistry"],
    optometry: ["optometry"],
    pharmacy: ["pharmacy", "pharmd"],
    veterinary: ["veterinary", "dvm"],
    podiatry: ["podiatr"],
    postbac: ["post-bac", "postbac", "post bac"],
  };
  return map[slug] ?? slug.split("-").filter((w) => w.length > 3);
}

function validExtraction(ex: Extraction, pageText: string, program: ProgramRow): boolean {
  const pageNorm = normalize(pageText);
  const onTopic = professionKeywords(program.professionSlug).some((k) => pageNorm.includes(normalize(k)));
  if (ex.statesNoPrereqs) {
    // A "no prerequisites" claim requires (a) a verbatim quote that appears in the
    // retrieved page, (b) the quote actually asserting absence of prerequisites,
    // and (c) the page being about this profession's program at all.
    const quote = ex.noPrereqsEvidenceQuote?.trim() ?? "";
    return quote.length >= 15 && pageNorm.includes(normalize(quote)) &&
      NO_PREREQ_ASSERTION.test(quote) && onTopic;
  }
  if (!ex.hasPrereqList || !onTopic) return false;
  if (!Array.isArray(ex.courses) || ex.courses.length < 3) return false; // health programs list several; fewer = wrong page
  const names = ex.courses.map((c) => c.name ?? "");
  if (names.some((n) => typeof n !== "string" || n.length < 2 || n.length > 300)) return false;
  // Reject placeholder-style extractions ("Prerequisite Course 1", "Course 3"...)
  if (names.some((n) => PLACEHOLDER_NAME.test(n.trim()))) return false;
  // At least half of the entries must look like real subjects/requirements.
  const plausible = names.filter((n) => SUBJECT_HINT.test(n)).length;
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

  // cache raw content for change detection
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = path.join(CACHE_DIR, `${program.id}-${source.hash.slice(0, 16)}.html`);
  if (!fs.existsSync(cacheFile)) fs.writeFileSync(cacheFile, source.html);

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
      (ex.otherConditions ? ` Page conditions: ${ex.otherConditions}` : ""),
  }).where(eq(programSchoolsTable.id, program.id));

  // read-back assertion
  const [check] = await db.select().from(programSchoolsTable).where(eq(programSchoolsTable.id, program.id));
  if (!check || check.verificationStatus !== status || check.sourceUrl !== source.url ||
      (check.prereqCourses?.length ?? 0) !== items.length) {
    throw new Error(`read-back mismatch for ${program.id}`);
  }
  return status;
}

// ── Per-program pipeline ─────────────────────────────────────────────────────

async function processProgram(program: ProgramRow): Promise<string> {
  setState(program.id, { stage: "source_discovery", attempts: (state[program.id]?.attempts ?? 0) + 1, error: undefined });
  const candidates = await discoverCandidates(program);
  if (!candidates.length) {
    setState(program.id, { stage: "failed", error: "no official candidate URLs" });
    return "failed";
  }

  let best: { fetched: Fetched; ex: Extraction } | null = null;
  const errors: string[] = [];
  for (const candidate of candidates.slice(0, 5)) {
    try {
      let fetched: Fetched;
      if (candidate.startsWith("cache:")) {
        const [file, url] = candidate.slice(6).split("|");
        const html = fs.readFileSync(path.join(ROOT, file), "utf8");
        fetched = { url, html, text: stripHtml(html).slice(0, 160_000), hash: crypto.createHash("sha256").update(html).digest("hex"), contentType: "text/html" };
      } else {
        fetched = FIRECRAWL_KEY ? await firecrawlScrape(candidate).catch(() => fetchOfficial(candidate)) : await fetchOfficial(candidate);
      }
      setState(program.id, { stage: "source_fetched", sourceUrl: fetched.url });
      if (fetched.text.length < 300) { errors.push(`${candidate}: too little text`); continue; }

      const ex = await extractWithOpenAI(program, fetched.text, fetched.url);
      setState(program.id, { stage: "extracted" });
      if (!validExtraction(ex, fetched.text, program)) { errors.push(`${candidate}: no usable prereq list`); continue; }

      // keyword-link second hop: if root page had no list, try its prereq-ish links
      best = { fetched, ex };
      if (ex.hasPrereqList && ex.courses.length >= 4) break; // good enough — stop crawling
    } catch (e) {
      errors.push(`${candidate}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Second hop through same-domain keyword links from the best failed page
  if (!best) {
    for (const candidate of candidates.slice(0, 2)) {
      if (candidate.startsWith("cache:")) continue;
      try {
        const rootPage = await fetchOfficial(candidate);
        for (const link of keywordLinks(rootPage.html, rootPage.url, professionKeywords(program.professionSlug)).slice(0, 5)) {
          try {
            const fetched = await fetchOfficial(link);
            if (fetched.text.length < 300) continue;
            const ex = await extractWithOpenAI(program, fetched.text, fetched.url);
            if (validExtraction(ex, fetched.text, program)) { best = { fetched, ex }; break; }
          } catch { /* try next link */ }
        }
      } catch { /* try next candidate */ }
      if (best) break;
    }
  }

  if (!best) {
    setState(program.id, { stage: "failed", error: errors.slice(0, 4).join(" || ").slice(0, 500) });
    // do NOT mark source_blocked here — failure queue gets retried with alternate methods
    await db.update(programSchoolsTable).set({
      verificationNote: `Automated completion attempt ${TODAY} did not find a usable official prerequisite list yet. Errors: ${errors.slice(0, 2).join("; ").slice(0, 300)}`,
    }).where(eq(programSchoolsTable.id, program.id));
    return "failed";
  }

  setState(program.id, { stage: "validated" });
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
  if (!profession && !allUnfinished && !retryFailures && !Number.isFinite(limit)) {
    throw new Error("Choose --limit N, --profession <slug>, --all-unfinished, or --retry-failures");
  }
  if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY is required for structured extraction");

  // Database identity check before bulk writes
  const [{ count, dbName }] = await db
    .select({
      count: sql<number>`count(*)::int`,
      dbName: sql<string>`current_database()`,
    })
    .from(programSchoolsTable);
  console.log(`Database identity: ${dbName}, ${count} program rows. Firecrawl: ${FIRECRAWL_KEY ? "on" : "off (direct HTTP)"}.`);
  if (count < 100) throw new Error("Refusing bulk run: program_schools has <100 rows — wrong database?");

  const rows = await db.select().from(programSchoolsTable).where(and(
    eq(programSchoolsTable.directoryStatus, "active"),
    inArray(programSchoolsTable.verificationStatus, ["draft", "needs_review", "outdated"]),
    profession ? eq(programSchoolsTable.professionSlug, profession) : undefined,
  ));

  let queue = (rows as ProgramRow[]).filter((r) => {
    const s = state[r.id];
    if (s?.stage === "finalized") return false;
    if (retryFailures) return s?.stage === "failed";
    if (s?.stage === "failed" && (s.attempts ?? 0) >= 3) return false; // failure queue — separate pass
    return true;
  });
  queue = queue.slice(0, Number.isFinite(limit) ? Number(limit) : queue.length);
  console.log(`Queue: ${queue.length} program(s) to process.`);

  const counts: Record<string, number> = {};
  let index = 0;
  async function workerLoop(workerId: number) {
    while (index < queue.length) {
      const program = queue[index++];
      try {
        const outcome = await processProgram(program);
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
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
