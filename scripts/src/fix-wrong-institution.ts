/**
 * Find and reset rows whose evidence belongs to a different institution.
 *
 * Seventeen active rows carry https://ox.ac.uk as their website: every one is named
 * "University of ..." or "The University of ...", which is what a name lookup returns for the
 * University of Oxford. Several of those rows are marked verified, and their prerequisite
 * sources are wrong too -- UC San Diego's pharmacy row cites Colorado's, the University of New
 * England's cites Western New England, Incarnate Word's cites Maryland, and the University of
 * Mississippi's cites an aggregator.
 *
 * Requirements taken from another school are wrong regardless of how confidently they were
 * recorded, so those rows lose their prerequisites and return to needs_review rather than
 * keeping data that cannot be attributed.
 */
import { sql, eq } from "drizzle-orm";
import { db, programSchoolsTable } from "@workspace/db";
import fs from "node:fs";
import { entityLabelMatchesInstitution } from "./extraction-rules.js";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** Hosts that cannot be any US health-professions programme's own site. */
const FOREIGN = /(^|\.)ox\.ac\.uk$|(^|\.)ammancity\.gov\.jo$|(^|\.)sanantonio\.gov$/i;
const AGGREGATOR = /(^|\.)(learn\.org|usnews\.com|niche\.com|petersons\.com|gradschools\.com|collegefactual\.com|studentdoctor\.net|allaccessdietetics\.com)$/i;

const STOP = new Set(["university", "the", "of", "at", "college", "school", "institute", "health", "sciences", "science",
  "medical", "medicine", "center", "centre", "state", "campus", "program", "programs", "and", "for"]);

/**
 * Whether a domain's own front page identifies it as this institution.
 *
 * Comparing the institution's distinctive word against the domain text does not work: it
 * rejects every school that uses an acronym, and pharmacy.uic.edu really is the University of
 * Illinois Chicago, health.usf.edu really is South Florida and uttyler.edu really is UT Tyler.
 * Asking the site who it is avoids guessing from spelling.
 */
const idCache = new Map<string, boolean>();
async function domainIsInstitution(domain: string, name: string): Promise<boolean | "unreadable"> {
  const key = `${domain}|${name}`;
  if (idCache.has(key)) return idCache.get(key)!;
  const core = String(name).split(/[-–—,]/)[0] ?? name;
  for (const url of [`https://${domain}/`, `https://www.${domain}/`]) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(18000), redirect: "follow" });
      if (!res.ok) continue;
      const html = (await res.text()).slice(0, 60_000);
      const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim();
      if (!title) continue;
      const segs = [title, ...title.split(/[|·—–-]/).map((s) => s.trim())].filter((s) => s.length >= 4);
      const ok = segs.some((s) => entityLabelMatchesInstitution(s, String(name)) || entityLabelMatchesInstitution(s, core));
      idCache.set(key, ok);
      return ok;
    } catch { /* try the www form */ }
  }
  return "unreadable";
}

function host(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

const rows = await db.execute(sql.raw(`
  select id, profession_slug, name, state, verification_status,
         coalesce(website_url,'') w, coalesce(source_url,'') s,
         jsonb_array_length(coalesce(prereq_courses,'[]'::jsonb)) pc
  from program_schools
  where directory_status='active'
    and (website_url ~* 'ox\\.ac\\.uk|ammancity|sanantonio\\.gov'
      or source_url ~* 'learn\\.org|usnews|niche\\.com|petersons|gradschools|collegefactual|studentdoctor')
  order by profession_slug, id`));

let cleared = 0;
let reset = 0;

for (const r of rows.rows as any[]) {
  const wHost = host(r.w);
  const sHost = host(r.s);

  const websiteForeign = FOREIGN.test(wHost);
  const sourceAggregator = AGGREGATOR.test(sHost);

  // Each of these was checked by reading the source domain's own front page. The automated
  // identity test could not decide them: it clears schools that spell their name out and
  // rejects every school that uses an acronym, so unthealth.edu ("UNT Health Fort Worth"),
  // health.usf.edu ("USF Health"), uttyler.edu, pharmacy.uic.edu and web.uri.edu all look
  // wrong to it while genuinely belonging to their programme.
  const CONFIRMED_WRONG_SOURCE: Record<number, string> = {
    1477: 'pharmacy.cuanschutz.edu is the University of Colorado Anschutz, not UC San Diego',
    1500: 'wne.edu is Western New England University, not the University of New England',
    1516: 'pharmacy.umaryland.edu titles itself "University of Maryland School of Pharmacy", not Incarnate Word',
    1517: 'pacificu.edu titles itself "Pacific University", a different school from the University of the Pacific',
    2734: "slhs.utexas.edu is UT Austin's speech department, not UT San Antonio",
    2777: 'learn.org is an aggregator, not an official university site',
  };
  const confirmed = CONFIRMED_WRONG_SOURCE[Number(r.id)];

  const problems: string[] = [];
  if (websiteForeign) problems.push(`website ${wHost} is not this institution`);
  if (sourceAggregator) problems.push(`source ${sHost} is an aggregator, not an official site`);
  if (confirmed) problems.push(confirmed);
  if (!problems.length) continue;

  // Prerequisites are discarded only where the source was confirmed by hand to be another
  // school's. Everything else simply loses the wrong website URL and keeps its evidence.
  const dropData = Boolean(confirmed);
  console.log(`${dropData ? "RESET " : "CLEAR "} ${r.id} ${String(r.name).slice(0, 40).padEnd(42)} [${r.verification_status}, ${r.pc} prereqs] ${problems.join("; ")}`);

  if (APPLY) {
    fs.appendFileSync(
      path.join(process.cwd(), "..", "data", "seed-corrections.jsonl"),
      `${JSON.stringify({ at: new Date().toISOString(), id: r.id, name: r.name, from: r.w, to: "", why: problems.join("; ") })}\n`,
    );
    if (dropData) {
      await db.update(programSchoolsTable)
        .set({
          websiteUrl: null, sourceUrl: null, prereqCourses: [], prereqSources: [],
          verificationStatus: "needs_review", lastVerified: null,
          verificationNote: `Reset 2026-08-25: ${problems.join("; ")}. Prerequisites recorded from another institution cannot be attributed to this programme, so they were removed rather than left in place.`,
        })
        .where(eq(programSchoolsTable.id, r.id));
      reset++;
    } else {
      await db.update(programSchoolsTable)
        .set({ websiteUrl: null, verificationNote: `Cleared 2026-08-25: ${problems.join("; ")}. The official source on this row is unaffected.` })
        .where(eq(programSchoolsTable.id, r.id));
      cleared++;
    }
  }
}

console.log(`\nCLEARED=${cleared} RESET=${reset} applyMode=${APPLY}`);
process.exit(0);
