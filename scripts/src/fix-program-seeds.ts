/**
 * Correct the stored prerequisites URL for programs the completion worker cannot finish,
 * accepting a candidate page only when it is published BY that institution.
 *
 * Some seeds are simply wrong: the row for Philadelphia College of Osteopathic Medicine
 * pointed at ammancity.gov.jo. The worker then crawls the wrong site forever and the program
 * never completes, so this repoints it at a page the school itself publishes.
 *
 * A first pass validated candidates by checking the page text named the school. That accepts
 * pages that merely REFERENCE the school: University of the Pacific's transfer-equivalency
 * tables matched both Rhode Island and Puerto Rico, stmary.edu matched University of Mary, and
 * utc.edu matched Tennessee State. Mentioning a school is not the same as speaking for it, so
 * provenance is established from the domain instead -- the institution's official website per
 * Wikidata P856, with the entity label checked against the program name so a wrong entity
 * cannot smuggle in a wrong domain.
 *
 * Writes only websiteUrl/sourceUrl. Prerequisite extraction still runs through the normal
 * validated pipeline afterwards, so nothing here can put requirements into the database.
 */
import { sql, eq } from "drizzle-orm";
import { db, programSchoolsTable } from "@workspace/db";
import fs from "node:fs";
import path from "node:path";
import { entityLabelMatchesInstitution } from "./extraction-rules.js";
import { SearchBudget } from "./search-budget.js";

const APPLY = process.argv.includes("--apply");
const SLUGS = (() => {
  const i = process.argv.indexOf("--slugs");
  if (i >= 0) return process.argv[i + 1]!.split(",");
  return ["dental", "prosthetics-orthotics", "physical-therapy", "pharmacy", "dietetics", "physician-assistant"];
})();

// Queries here spend the same metered allowance as the worker's, so they are recorded against
// the same persisted budget -- counting them only inside the worker would let this tool drain
// the free tier invisibly.
const budget = new SearchBudget(path.join(process.cwd(), "..", "data", "search-usage.json"), {
  serper: Number(process.env.COMPLETION_SERPER_CAP || 2_000),
  tavily: Number(process.env.COMPLETION_TAVILY_CAP || 800),
});
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
// Aggregators are barred as evidence, and so are a school's own test/staging catalogues:
// search offered catalogtest.olemiss.edu, whose content carries no guarantee of being the
// requirements the school actually publishes.
const BANNED = /allaccessdietetics|niche\.com|usnews|petersons|gradschools\.com|collegefactual|studentdoctor|reddit|wikipedia|indeed|coursera|catalogtest|\/\/test[.-]|staging[.-]|\.dev\./i;

const PROF_TERM: Record<string, string> = {
  dental: "dental DDS DMD",
  "prosthetics-orthotics": "prosthetics orthotics",
  "physical-therapy": "DPT physical therapy",
  pharmacy: "PharmD pharmacy",
  dietetics: "dietetics nutrition",
  "physician-assistant": "physician assistant",
  "speech-language-pathology": "speech language pathology SLP masters",
  medicine: "medical school MD",
  nursing: "nursing BSN",
  "occupational-therapy": "occupational therapy OT",
  postbac: "postbaccalaureate premedical",
};

const PROF_HINT: Record<string, RegExp> = {
  dental: /dental|dds|dmd/i,
  "prosthetics-orthotics": /prosthet|orthot/i,
  "physical-therapy": /physical-?therapy|\bdpt\b|\bpt\b/i,
  pharmacy: /pharmac|pharmd/i,
  dietetics: /dietet|nutrition/i,
  // Degree abbreviations are how programme URLs usually name themselves: k-state publishes
  // its PA requirements under /programs/MPAS/, where \bpas\b cannot match.
  "physician-assistant": /physician-?assistant|\bpa\b|\bpas\b|\bmpas\b|\bmspas\b/i,
  // "communicat" covers both communication and COMMUNICATIVE sciences, and sphpath is the
  // program code some catalogues use -- Hampton and FIU were both rejected on spelling alone.
  "speech-language-pathology": /speech|slp|sphpath|communicat|csd|audiolog/i,
  medicine: /\bmd\b|medic|school-?of-?medicine/i,
  nursing: /nurs|bsn|\bdnp\b/i,
  "occupational-therapy": /occupational-?therapy|\bot\b|\botd\b/i,
  postbac: /post-?bac|postbaccalaureate|premed/i,
};

/**
 * How well a URL promises this program's prerequisites. A corrected seed is only worth writing
 * when it beats the seed already stored: search offered University of Mary's UNDERGRADUATE
 * admission-requirements page while the row already pointed at its DPT program page, and
 * overwriting would have aimed extraction at the wrong requirements entirely.
 */
function seedScore(url: string, slug: string): number {
  if (!url) return -1;
  return (/prereq|pre-requisit/i.test(url) ? 3 : 0)
    + (PROF_HINT[slug]?.test(url) ? 2 : 0)
    + (/admission|requirement|catalog|handbook/i.test(url) ? 1 : 0);
}

/**
 * True when the page itself is about this profession and states requirements.
 *
 * Used only to rescue a candidate whose URL does not spell the profession out. Both conditions
 * are required, so a general admissions page that happens to mention every programme, or a
 * department page with no requirements on it, still does not qualify.
 */
async function pageIsProgramRelevant(url: string, slug: string): Promise<boolean> {
  const hint = PROF_HINT[slug];
  if (!hint) return false;
  try {
    const r = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15000), redirect: "follow" });
    if (!r.ok) return false;
    const text = (await r.text())
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 40_000);
    return hint.test(text) && /prerequisit|required course|course requirement|admission requirement/i.test(text);
  } catch {
    return false;
  }
}

/** Registrable domain, keeping the extra label for public suffixes like ac.uk / edu.pr. */
function registrable(host: string): string {
  const p = host.replace(/^www\./, "").toLowerCase().split(".");
  if (p.length > 2 && /^(edu|ac|gov|co|org|com)$/.test(p[p.length - 2]!)) return p.slice(-3).join(".");
  return p.slice(-2).join(".");
}

/**
 * Wikidata throttles a burst of lookups. Returning null on the first failure silently turned
 * every throttled row into "no confirmed official domain", which reads exactly like a genuine
 * negative -- so failures are retried with backoff and any surviving failure is reported as an
 * error, never as an answer.
 */
let wdNextAllowed = 0;
const sleep = (ms: number) => new Promise((x) => setTimeout(x, ms));

async function wdJson(url: string): Promise<{ ok: true; json: any } | { ok: false; why: string }> {
  let why = "unknown";
  for (let attempt = 0; attempt < 5; attempt++) {
    // Wikidata answered 429 for a burst of lookups, so requests are spaced globally rather
    // than only backing off after a rejection.
    await sleep(Math.max(0, wdNextAllowed - Date.now()));
    wdNextAllowed = Date.now() + 1500;
    try {
      const r = await fetch(url, { headers: { "user-agent": "prehealth-advisor/1.0 (contact: repo maintainer)" }, signal: AbortSignal.timeout(20000) });
      if (r.ok) return { ok: true, json: await r.json() };
      why = `HTTP ${r.status}`;
      if (r.status === 429) {
        const retryAfter = Number(r.headers.get("retry-after"));
        wdNextAllowed = Date.now() + (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 20_000 * (attempt + 1));
        continue;
      }
      if (r.status < 500) break;
    } catch (e) { why = (e as Error).message; }
  }
  return { ok: false, why };
}

/** Resolved domains persist so a rerun after a throttle does not re-query what already worked. */
const CACHE_FILE = path.join(process.cwd(), "..", "data", "official-domains.json");
const cache: Record<string, string> = (() => {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")); } catch { return {}; }
})();
function cachePut(name: string, domain: string) {
  cache[name] = domain;
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

/** The institution's own domain, or "" when Wikidata cannot confirm one for THIS school. */
async function officialDomain(name: string): Promise<{ domain: string; error?: string }> {
  if (name in cache) return { domain: cache[name]! };
  const s = await wdJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&limit=5`);
  if (!s.ok) return { domain: "", error: `search ${s.why}` };
  for (const hit of s.json?.search ?? []) {
    const label = hit.display?.label?.value ?? hit.label ?? "";
    if (!entityLabelMatchesInstitution(label, name)) continue;
    const ent = await wdJson(`https://www.wikidata.org/wiki/Special:EntityData/${hit.id}.json`);
    if (!ent.ok) return { domain: "", error: `entity ${ent.why}` };
    const url = ent.json?.entities?.[hit.id]?.claims?.P856?.[0]?.mainsnak?.datavalue?.value;
    if (typeof url === "string") {
      try {
        const d = registrable(new URL(url).hostname);
        cachePut(name, d);
        return { domain: d };
      } catch { /* malformed claim */ }
    }
  }
  cachePut(name, "");
  return { domain: "" };
}

async function serper(q: string): Promise<string[]> {
  if (!budget.canSpend("serper")) throw new Error("serper budget exhausted");
  budget.spend("serper");
  const r = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": process.env.SERPER_API_KEY ?? "", "content-type": "application/json" },
    body: JSON.stringify({ q, num: 10 }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!r.ok) throw new Error(`serper HTTP ${r.status}`);
  const j: any = await r.json();
  return (j.organic ?? []).map((o: any) => o.link ?? "").filter(Boolean);
}

/**
 * True when the domain's own front page identifies itself as this institution.
 *
 * A second provenance route, needed because Wikidata has no confirmable entity for many
 * schools-within-universities (Tufts' DPT, Jefferson, Eastern Michigan) while their stored
 * seed already points at the right school. Unlike checking a deep page for the school's name,
 * this is self-identification by the domain itself, so a comparison table on someone else's
 * site cannot satisfy it -- pacific.edu's front page says University of the Pacific, never
 * University of Rhode Island. It also rejects the corrupt seeds: the row for Philadelphia
 * College of Osteopathic Medicine pointed at ammancity.gov.jo.
 */
const selfIdCache = new Map<string, Promise<boolean>>();
/** Domains whose front page could not be read at all, so identity is unknown, not disproved. */
const unreadableDomains = new Set<string>();
function domainSelfIdentifies(host: string, name: string): Promise<boolean> {
  const key = `${host}|${name}`;
  const hit = selfIdCache.get(key);
  if (hit) return hit;
  const p = (async () => {
    // Compare against the name before any campus/location qualifier: the seed for
    // "Tufts University - Boston, MA" is medicine.tufts.edu, which never says "Boston, MA".
    const core = String(name).split(/[-–—,]/)[0] ?? name;
    // Identity is compared with the same matcher the pipeline uses, not by looking for the
    // school's words somewhere on the page. A bag-of-words test accepted stmary.edu (University
    // of SAINT Mary, Kansas) for University of Mary and okcu.edu (Oklahoma CITY University) for
    // Oklahoma State, because a single distinctive word appears in both names.
    // A front page that cannot be fetched means identity is unknown, not disproved. Returning
    // false on a blocked request turned umich.edu's HTTP 403 into "not this institution",
    // which is the same mistake as reading a throttled Wikidata reply as a genuine negative.
    let everRead = false;
    for (const url of [`https://${host}/`, `https://www.${host}/`, `https://${host}/`]) {
      try {
        const r = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15000), redirect: "follow" });
        if (!r.ok) { await sleep(1200); continue; }
        everRead = true;
        const html = (await r.text()).slice(0, 60_000);
        const raw = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
        const title = raw.replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
        if (!title) continue;
        // Site titles append a tagline ("Tufts University | Medford, MA"); test each segment.
        const segments = [title, ...title.split(/[|·—–-]/).map((x) => x.trim())].filter((x) => x.length >= 4);
        if (segments.some((seg) => entityLabelMatchesInstitution(seg, name) || entityLabelMatchesInstitution(seg, core))) return true;
      } catch { /* try the next form */ }
    }
    if (!everRead) unreadableDomains.add(host);
    return false;
  })();
  selfIdCache.set(key, p);
  return p;
}

function seedHostOf(u: unknown): string {
  try { return registrable(new URL(String(u)).hostname); } catch { return ""; }
}

const ONLY = (() => {
  const i = process.argv.indexOf("--ids");
  return i >= 0 ? new Set(process.argv[i + 1]!.split(",").map(Number)) : null;
})();

/**
 * Third route to an institution's domain, for schools Wikidata has no confirmable entity for.
 *
 * Every unfinished row comes from an accreditor directory, so the institution itself is
 * authoritative even when its stored URL is junk. The candidate domain still has to pass the
 * same front-page identity test as the other routes, so this widens what can be looked up
 * without lowering what counts as proof.
 */
async function officialDomainViaSearch(name: string): Promise<string> {
  let links: string[];
  try { links = await serper(`${name} official website`); } catch { return ""; }
  const seen = new Set<string>();
  for (const link of links.slice(0, 6)) {
    if (BANNED.test(link)) continue;
    let d = "";
    try { d = registrable(new URL(link).hostname); } catch { continue; }
    if (!d || seen.has(d)) continue;
    seen.add(d);
    if (await domainSelfIdentifies(d, name)) return d;
  }
  return "";
}

const rows = await db.execute(sql.raw(`
  select id, name, profession_slug, website_url
  from program_schools
  where directory_status='active' and verification_status in ('draft','needs_review')
    and profession_slug in (${SLUGS.map((s) => `'${s}'`).join(",")})
  order by profession_slug, id`));

let accepted = 0, rejected = 0;
for (const r of rows.rows as any[]) {
  if (ONLY && !ONLY.has(Number(r.id))) continue;
  const res = await officialDomain(r.name);
  if (res.error) { console.log(`ERROR  ${r.id} ${String(r.name).slice(0, 34).padEnd(36)} wikidata ${res.error}`); continue; }
  let official = res.domain;
  if (!official) official = await officialDomainViaSearch(r.name);
  const seedHost = seedHostOf(r.website_url);
  const seedDomain = seedHost ? registrable(seedHost) : "";
  const seedTrusted = seedDomain !== "" && (seedDomain === official || (await domainSelfIdentifies(seedDomain, r.name)));
  const trusted = new Set([official, seedTrusted ? seedDomain : ""].filter(Boolean));
  if (trusted.size === 0) {
    rejected++;
    const why = unreadableDomains.size > 0 && seedHostOf(r.website_url) && unreadableDomains.has(seedHostOf(r.website_url))
      ? "could not read the institution's site to confirm it"
      : "no confirmed official domain";
    console.log(`REJECT ${r.id} ${String(r.name).slice(0, 34).padEnd(36)} (${why})`);
    continue;
  }

  let chosen = "";
  try {
    // A plain name query returns whatever ranks highest for the school, which for a program
    // buried in a department is often the generic admissions page -- Brigham Young, Catholic
    // and Cleveland State all had a bare homepage seed and crawled into /admissions. Once the
    // institution's own domain is known, a site-restricted query asks the right question.
    // Site-restricted first: it is the more precise question, and a general query returns a
    // full page of results, so ordering it first would leave the restricted one never run.
    const queries: string[] = [];
    for (const d of trusted) queries.push(`site:${d} ${PROF_TERM[r.profession_slug]} prerequisite courses admission`);
    queries.push(`${r.name} ${PROF_TERM[r.profession_slug]} admission prerequisite courses`);

    const collected: string[] = [];
    for (const q of queries) {
      try { collected.push(...(await serper(q))); } catch { /* budget or transport */ }
      // Keep going while nothing looks like a prerequisites page for this profession.
      if (collected.some((u) => /prereq|pre-requisit/i.test(u) && PROF_HINT[r.profession_slug]?.test(u))) break;
    }
    const links = (collected)
      .filter((u, i, a) => a.indexOf(u) === i)
      .filter((u) => !BANNED.test(u))
      .filter((u) => { try { return registrable(new URL(u).hostname) !== ""; } catch { return false; } })
      .sort((a, b) => {
        const sc = (u: string) => (/prereq|pre-requisit/i.test(u) ? 6 : 0) + (/admission|requirement/i.test(u) ? 3 : 0) + (/catalog|handbook/i.test(u) ? 2 : 0);
        return sc(b) - sc(a);
      });

    for (const link of links.slice(0, 5)) {
      let dom = "";
      try { dom = registrable(new URL(link).hostname); } catch { continue; }
      // A school may publish on a second domain it owns (shps.lsuhs.edu for LSU Health), so a
      // candidate domain that identifies itself as this institution counts too -- but only when
      // no official domain was confirmed in the first place. Name matching cannot separate two
      // institutions in the same city whose distinguishing words are all generic: "UT Health
      // Science Center San Antonio" reduces to [san, antonio] exactly as "University of Texas
      // at San Antonio" does, and uthscsa.edu was accepted for the utsa.edu program. Once the
      // official domain is known, it is better evidence than any name comparison.
      const allowSelfId = official === "";
      if (!trusted.has(dom) && !(allowSelfId && (await domainSelfIdentifies(dom, r.name)))) continue;
      try {
        const res = await fetch(link, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15000), redirect: "follow" });
        if (res.ok) { chosen = link; break; }
      } catch { /* unreachable candidate */ }
      await new Promise((x) => setTimeout(x, 300));
    }
  } catch (e) {
    console.log(`ERROR  ${r.id} ${(e as Error).message}`);
    continue;
  }

  // A replacement must promise THIS program's requirements, not merely rank above a bare
  // homepage. Beating the stored seed alone let a generic page win whenever the seed was just
  // the institution root: UC Santa Barbara's undergraduate transfer-eligibility page and
  // Purdue's all-programs graduate requirements page both scored 1 against a homepage's 0.
  const MIN_REPLACEMENT_SCORE = 2;
  let urlScore = seedScore(chosen, r.profession_slug);
  // Judging relevance from URL spelling alone is brittle: FIU publishes the SLP requirements
  // under the program code SPHPATH, and Hampton under "communicative sciences", so both were
  // dismissed for words their URLs never had to contain. When the URL is unconvincing, let the
  // page's own text vouch for it instead -- it has to name this profession AND talk about
  // requirements, which a generic transfer-eligibility page does not.
  if (chosen && urlScore < MIN_REPLACEMENT_SCORE && (await pageIsProgramRelevant(chosen, r.profession_slug))) {
    urlScore = MIN_REPLACEMENT_SCORE;
  }
  if (chosen && urlScore < MIN_REPLACEMENT_SCORE) {
    rejected++;
    console.log(`WEAK   ${r.id} score=${urlScore} ${String(r.name).slice(0, 30).padEnd(32)} ${chosen.slice(0, 60)}`);
  } else if (chosen && seedScore(chosen, r.profession_slug) <= seedScore(trusted.has(seedDomain) ? String(r.website_url ?? "") : "", r.profession_slug)) {
    rejected++;
    console.log(`KEEP   ${r.id} ${String(r.name).slice(0, 30).padEnd(32)} (stored seed already aims better)`);
  } else if (chosen) {
    accepted++;
    console.log(`ACCEPT ${r.id} [${[...trusted].join("|")}] ${String(r.name).slice(0, 30).padEnd(32)} -> ${chosen.slice(0, 84)}`);
    if (APPLY) {
      // Record what was replaced. The first apply pass overwrote seeds with no way to put them
      // back, which is the wrong property for a tool that rewrites data in place.
      fs.appendFileSync(
        path.join(process.cwd(), "..", "data", "seed-corrections.jsonl"),
        `${JSON.stringify({ at: new Date().toISOString(), id: r.id, name: r.name, from: r.website_url ?? "", to: chosen })}\n`,
      );
      await db.update(programSchoolsTable).set({ sourceUrl: chosen, websiteUrl: chosen }).where(eq(programSchoolsTable.id, r.id));
    }
  } else {
    rejected++;
    console.log(`REJECT ${r.id} [${[...trusted].join("|")}] ${String(r.name).slice(0, 30).padEnd(32)} (no page on the institution's own domain)`);
  }
  await new Promise((x) => setTimeout(x, 600));
}
console.log(`\naccepted=${accepted} rejected=${rejected} applied=${APPLY}`);
process.exit(0);
export {};
