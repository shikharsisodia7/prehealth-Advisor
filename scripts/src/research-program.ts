/**
 * Targeted, per-school research for the remaining tail.
 *
 * Generic discovery has plateaued, so this works the way a person would: establish the
 * institution's real domain, search that domain, render what it finds, and follow the links a
 * prerequisite reference points at -- catalogues, handbooks, leveling sequences, PDFs.
 *
 * It reports evidence only. It never writes prerequisite data; extraction still owns that.
 */
import { chromium, type Browser } from "playwright";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import fs from "node:fs";
import path from "node:path";
import { entityLabelMatchesInstitution } from "./extraction-rules.js";
import { SearchBudget } from "./search-budget.js";

const budget = new SearchBudget(path.join(process.cwd(), "..", "data", "search-usage.json"), {
  serper: Number(process.env.COMPLETION_SERPER_CAP || 2_000),
  tavily: Number(process.env.COMPLETION_TAVILY_CAP || 800),
});

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const argVal = (flag: string): string | null => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1]! : null;
};
const IDS = argVal("--ids")?.split(",").map(Number) ?? null;
const SLUG = argVal("--slug");
const LIMIT = Number(argVal("--limit") ?? 200);

/** Vocabulary a programme actually uses for entry coursework, per profession. */
const TERMS: Record<string, string[]> = {
  "speech-language-pathology": [
    "prerequisite coursework",
    "leveling courses communication sciences disorders",
    "CSD prerequisite certificate",
  ],
  medicine: ["premedical coursework requirements", "admission required coursework"],
  "occupational-therapy": ["occupational therapy prerequisite courses", "OTD prerequisite coursework"],
  nursing: ["nursing prerequisite courses", "prerequisite worksheet nursing admission"],
  "physician-assistant": ["physician assistant prerequisite courses", "PA prerequisite coursework"],
  dietetics: ["dietetics prerequisite courses", "DPD required courses"],
  pharmacy: ["PharmD prerequisite courses", "pre-pharmacy coursework"],
  "physical-therapy": ["DPT prerequisite courses", "physical therapy prerequisite coursework"],
  dental: ["predental coursework requirements", "dental prerequisite courses"],
  "prosthetics-orthotics": ["prosthetics orthotics prerequisite courses"],
  postbac: ["postbaccalaureate premedical prerequisites", "postbac required coursework"],
};

const SUBJECT =
  /\b(anatomy|physiology|biology|chemistry|organic|physics|statistics|psychology|microbiology|biochemistry|sociology|nutrition|calculus|genetics|phonetics|audiology|neuroscience)\b/gi;

function subjectsIn(text: string): string[] {
  return [...new Set((text.match(SUBJECT) ?? []).map((s) => s.toLowerCase()))];
}
/** Words that identify the page as belonging to this profession, not merely to a science degree. */
const PROF_IDENT: Record<string, RegExp> = {
  "speech-language-pathology": /speech-language|speech language|communication sciences|communicative sciences|\bslp\b|audiolog/i,
  medicine: /medical school|doctor of medicine|osteopathic|\bmd program\b|premedical/i,
  "occupational-therapy": /occupational therapy|\botd\b|\bmot\b/i,
  nursing: /nursing|\bbsn\b|\babsn\b|\bmepn\b/i,
  "physician-assistant": /physician assistant|\bpa program\b|\bcaspa\b/i,
  dietetics: /dietetic|nutrition and dietetics|\bdpd\b|registered dietitian/i,
  pharmacy: /pharmacy|\bpharmd\b|pre-pharmacy/i,
  "physical-therapy": /physical therapy|\bdpt\b|\bptcas\b/i,
  dental: /dental|\bdds\b|\bdmd\b|predental/i,
  "prosthetics-orthotics": /prosthetic|orthotic/i,
  postbac: /postbaccalaureate|post-baccalaureate|postbac|premedical/i,
};

/**
 * A page qualifies only when it both lists coursework AND identifies itself as this
 * profession's programme.
 *
 * Requiring science subjects plus the word "prerequisite" was not enough: Cleveland State's
 * Psychology B.A. and Nursing B.S.N. catalogue pages both satisfied it, and were nearly
 * attached to nursing, occupational therapy and speech-pathology rows respectively.
 */
function looksLikeList(text: string, slug: string): boolean {
  const hasCourses = subjectsIn(text).length >= 3 && /prerequisit|required course|course requirement|leveling|foundational/i.test(text);
  if (!hasCourses) return false;
  const ident = PROF_IDENT[slug];
  return ident ? ident.test(text) : true;
}

interface Got { status: number | string; title: string; text: string; links: Array<{ href: string; label: string }> }

async function pageText(b: Browser, url: string): Promise<Got> {
  const ctx = await b.newContext({ userAgent: UA });
  const p = await ctx.newPage();
  try {
    const resp = await p.goto(url, { waitUntil: "domcontentloaded", timeout: 35000 });
    await p.waitForTimeout(1800);
    // Expand accordions and tabs -- admissions pages routinely hide the list inside them.
    // These run in the page, not in Node, so they are passed as source strings: the scripts
    // package has no DOM lib and typing them as closures fails the project typecheck.
    try {
      await p.evaluate(
        `document.querySelectorAll('details').forEach(d => d.setAttribute('open','true'));
         document.querySelectorAll('[aria-expanded="false"]').forEach(el => { try { el.click(); } catch (e) {} });`,
      );
      await p.waitForTimeout(1200);
    } catch { /* page may block evaluate */ }
    const text = String(await p.evaluate(`document.body ? document.body.innerText : ''`)).replace(/\s+/g, " ");
    const links = (await p.evaluate(
      `Array.from(document.querySelectorAll('a[href]')).slice(0,400).map(a => ({
         href: a.href,
         label: (a.textContent || '').replace(/\\s+/g,' ').trim().slice(0,90)
       }))`,
    )) as Array<{ href: string; label: string }>;
    const title = String(await p.evaluate(`document.title || ''`)).replace(/\s+/g, " ").trim();
    return { status: resp?.status() ?? "no-response", title, text, links };
  } catch (e) {
    return { status: (e as Error).message.slice(0, 50), title: "", text: "", links: [] };
  } finally {
    await ctx.close();
  }
}

let searchFailures = 0;
let searchCalls = 0;

/**
 * Site-restricted search.
 *
 * DuckDuckGo's html endpoint needs no key, but it now answers a burst of site: queries with a
 * challenge page: HTTP 202 carrying no results. Returning [] for that made every row look like
 * "nothing published" when nothing had actually been searched, so it is tried first and Serper
 * is used when it comes back empty. Failures are counted and reported rather than swallowed.
 */
async function search(query: string): Promise<string[]> {
  searchCalls++;
  try {
    const res = await fetch("https://html.duckduckgo.com/html/", {
      method: "POST",
      headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ q: query }).toString(),
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) {
      const html = await res.text();
      const out: string[] = [];
      for (const m of html.matchAll(/uddg=([^&"]+)/g)) {
        try { out.push(decodeURIComponent(m[1]!)); } catch { /* skip malformed */ }
      }
      const links = [...new Set(out)].filter((u) => /^https?:\/\//.test(u));
      if (links.length) return links;
    }
  } catch { /* fall through to the metered provider */ }

  const key = process.env.SERPER_API_KEY;
  if (!key || !budget.canSpend("serper")) { searchFailures++; return []; }
  try {
    budget.spend("serper");
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "content-type": "application/json" },
      body: JSON.stringify({ q: query, num: 10 }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) { searchFailures++; return []; }
    const j: any = await res.json();
    return (j.organic ?? []).map((o: any) => o.link ?? "").filter(Boolean);
  } catch {
    searchFailures++;
    return [];
  }
}

/** True when the domain's own front page says it is this institution. */
const domainIdCache = new Map<string, boolean>();
async function domainIsInstitution(b: Browser, domain: string, name: string): Promise<boolean> {
  const key = `${domain}|${name}`;
  const hit = domainIdCache.get(key);
  if (hit !== undefined) return hit;
  let ok = false;
  for (const url of [`https://${domain}/`, `https://www.${domain}/`]) {
    const got = await pageText(b, url);
    if (got.status !== 200) continue;
    // The <title> names the institution; body text starts with "Skip to main content".
    // Site titles also append boilerplate ("... Homepage", "... | Boone, North Carolina").
    const title = got.title.replace(/(homepage|home|official site|official website|website)/gi, " ").trim();
    const core = name.split(/[-–—,]/)[0] ?? name;

    // Word overlap alone accepts a different school in the same place, because a city name is
    // not an identity: "Saint Louis University" and "Maryville University of Saint Louis" both
    // reduce to [saint, louis], so slu.edu was accepted for the Maryville program. Require the
    // institution's own leading distinctive word to be present as well.
    const lead = core.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
      .find((w) => w.length >= 4 && !["university", "college", "school", "institute", "health", "sciences", "science", "medical", "medicine", "center", "state", "the"].includes(w));
    const leadPresent = !lead || title.toLowerCase().includes(lead);

    for (const seg of [title, ...title.split(/[|·—–]/).map((x) => x.trim())].filter((x) => x.length >= 4)) {
      if (leadPresent && (entityLabelMatchesInstitution(seg, name) || entityLabelMatchesInstitution(seg, core))) { ok = true; break; }
    }
    if (ok) break;
  }
  domainIdCache.set(key, ok);
  return ok;
}

const where = ["directory_status='active'", "verification_status in ('draft','imported','needs_review','outdated')"];
if (IDS) where.push(`id in (${IDS.join(",")})`);
if (SLUG) where.push(`profession_slug='${SLUG}'`);
const rows = await db.execute(
  sql.raw(
    `select id,name,program_name,profession_slug,coalesce(website_url,'') w from program_schools where ${where.join(" and ")} order by profession_slug, name limit ${LIMIT}`,
  ),
);

const browser = await chromium.launch({ headless: true });
const findings: any[] = [];

for (const r of rows.rows as any[]) {
  const terms = TERMS[r.profession_slug] ?? ["prerequisite courses"];
  const seedHost = (() => { try { return new URL(r.w).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  const root = seedHost.split(".").slice(-2).join(".");

  // The stored seed's domain cannot be assumed to be this school's. Maryville University's row
  // points at catalog.slu.edu -- Saint Louis University -- so searching that domain returns
  // another institution's requirements. The domain is used only once it identifies itself.
  const rootBelongs = root ? await domainIsInstitution(browser, root, String(r.name)) : false;

  const candidates: string[] = [];
  if (rootBelongs) {
    for (const t of terms.slice(0, 2)) candidates.push(...(await search(`site:${root} ${t}`)).slice(0, 4));
    if (r.w) candidates.push(r.w);
  } else {
    // Fall back to naming the institution, and keep only results the name search itself returns.
    for (const t of terms.slice(0, 2)) candidates.push(...(await search(`"${r.name}" ${t}`)).slice(0, 5));
  }

  let best: any = null;
  const seen = new Set<string>();
  for (const url of candidates.slice(0, 7)) {
    if (seen.has(url)) continue;
    seen.add(url);
    const got = await pageText(browser, url);
    const subs = subjectsIn(got.text);
    if (looksLikeList(got.text, r.profession_slug)) {
      if (!best || subs.length > best.subjects.length) best = { url, status: got.status, subjects: subs, textLen: got.text.length };
    } else if (/prerequisit|leveling|foundational/i.test(got.text)) {
      // A page that only REFERS to prerequisites usually links to where they live.
      const follow = got.links
        .filter((l) => /prerequisit|leveling|curriculum|catalog|handbook|requirement/i.test(l.label + " " + l.href))
        .slice(0, 3);
      for (const f of follow) {
        if (seen.has(f.href)) continue;
        seen.add(f.href);
        const sub = await pageText(browser, f.href);
        if (looksLikeList(sub.text, r.profession_slug)) {
          const ss = subjectsIn(sub.text);
          if (!best || ss.length > best.subjects.length) best = { url: f.href, status: sub.status, subjects: ss, textLen: sub.text.length, via: url };
        }
      }
    }
    if (best && best.subjects.length >= 5) break;
  }

  findings.push({ id: r.id, name: r.name, profession: r.profession_slug, best });
  const tag = best ? "LIST" : "----";
  const detail = best ? `${best.subjects.length} subj  ${String(best.url).slice(0, 62)}` : "";
  console.log(`${String(r.id).padStart(5)} ${tag} ${String(r.name).slice(0, 34).padEnd(36)} ${detail}`);
}

await browser.close();
fs.writeFileSync(path.join(process.cwd(), "..", "data", `research-${SLUG ?? "ids"}.json`), JSON.stringify(findings, null, 2));
console.log(`\nRESEARCHED ${findings.length}  found=${findings.filter((f) => f.best).length}`);
process.exit(0);
