/**
 * Flag any row whose source URL names a profession or degree track other than the row's own.
 *
 * This does not depend on a directory entry, which is what the earlier postbac audit needed and
 * why it missed rows: it skipped every row it could not match to AAMC's file, and five further
 * Tulane one-year master's rows were carrying the medical school's MD prerequisites unnoticed.
 * Cleveland State's postbac rows were sourced from an occupational therapy admissions page.
 *
 * The test is on the URL path only. A postbaccalaureate programme sitting on the medical
 * school's own MD admissions page is describing a different set of applicants, and a row whose
 * evidence names another profession outright is answering a question nobody asked of it.
 */
import { eq, sql } from "drizzle-orm";
import { db, programSchoolsTable } from "@workspace/db";
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const log: string[] = [];

/**
 * Path markers that identify which programme a page is about.
 *
 * Matched on segment boundaries rather than a leading slash: Drexel's occupational therapy page
 * sits at /department-of-occupational-therapy/ms-in-occupational-therapy/, where the marker is
 * preceded by "of-", and Murray State's is at /nursing-and-health-sciences/ot/. Requiring a
 * slash immediately before the marker missed both and left "nursing" as the deepest match.
 */
const B = String.raw`(^|[/_.-])`;
const E = String.raw`([/_.-]|$)`;
const MARKERS: Array<{ slug: string; re: RegExp }> = [
  { slug: "occupational-therapy", re: new RegExp(`${B}(occupational[-_]?therapy|otd|msot|ot)${E}`, "i") },
  { slug: "physical-therapy", re: new RegExp(`${B}(physical[-_]?therapy|dpt|ptcas|pt)${E}`, "i") },
  { slug: "speech-language-pathology", re: new RegExp(`${B}(speech[-_]?language[-_]?pathology|speech[-_]?language|communication[-_]?sciences|communication[-_]?disorders|communicative[-_]?disorders|slp|csd)${E}`, "i") },
  { slug: "nursing", re: new RegExp(`${B}(nursing|bsn|msn|absn|mepn|dnp)${E}`, "i") },
  { slug: "pharmacy", re: new RegExp(`${B}(pharmacy|pharmd)${E}`, "i") },
  { slug: "physician-assistant", re: new RegExp(`${B}(physician[-_]?assistant|physician[-_]?assistant[-_]?studies|pa)${E}`, "i") },
  { slug: "dentistry", re: new RegExp(`${B}(dental[-_]?medicine|dentistry|dental|dmd|dds)${E}`, "i") },
  { slug: "dietetics", re: new RegExp(`${B}(dietetics|dietetic[-_]?internship|nutrition)${E}`, "i") },
  { slug: "veterinary", re: new RegExp(`${B}(veterinary|dvm)${E}`, "i") },
  { slug: "optometry", re: new RegExp(`${B}(optometry|optometric)${E}`, "i") },
  { slug: "prosthetics-orthotics", re: new RegExp(`${B}(orthotics[-_]?and[-_]?prosthetics|prosthetics[-_]?and[-_]?orthotics|orthotics|prosthetics)${E}`, "i") },
];

/**
 * A postbaccalaureate page routinely names the profession it prepares students for, and that
 * naming is not a mismatch: "postbaccalaureate-pre-pa-certificate" and "pre-pharmd-post-bacc"
 * are postbac programmes. Without this exemption the audit calls a row wrong for citing exactly
 * the right page.
 */
const NAMES_POSTBAC = /(post-?bacc?alaureate|post-?bacc|postbac)/i;
/** The medical school's own MD track. Its prerequisites are a claim about MD applicants. */
const MD_TRACK = /(\/md-program\/|\/m-d-program\/|\/md\/admission|\/admissions\/md\/|admission\.med\.|\/medical-student-admissions|\/medicine-md\/|\/allopathic-medicine|\/doctor-of-medicine|\/medicine\/md\/)/i;
/** Dentistry is stored under two slugs in this dataset. */
const SAME: Record<string, string> = { dentistry: "dental", dental: "dentistry" };

const rows = await db.execute(sql.raw(`
  select id, name, profession_slug p, coalesce(program_name,'') pn, coalesce(source_url,'') s,
         jsonb_array_length(coalesce(prereq_courses,'[]'::jsonb)) n, verification_status vs
  from program_schools
  where directory_status='active' and verification_status in ('verified','no_prereqs_published')
    and coalesce(source_url,'') <> '' order by profession_slug, name`));

let flagged = 0;
for (const r of rows.rows as any[]) {
  const stored = String(r.s);
  let pathOnly = stored;
  try { const u = new URL(stored); pathOnly = `/${u.hostname.split(".").slice(0, -2).join(".")}${u.pathname}`; } catch { /* raw */ }

  const own = String(r.p);
  // A URL is hierarchical: college, then department, then programme. Fairleigh Dickinson's
  // occupational therapy page lives at /colleges-schools/pharmacy/otd/admissions/ because the
  // School of Pharmacy and Health Sciences houses the OTD, and Murray State's OT page sits under
  // /nursing-and-health-sciences/ot/. Matching any marker anywhere calls both of those wrong.
  // The deepest marker is the programme; anything earlier is the unit that contains it.
  let deepest: { slug: string; at: number } | null = null;
  for (const m of MARKERS) {
    const found = m.re.exec(pathOnly);
    if (found && (deepest === null || found.index > deepest.at)) deepest = { slug: m.slug, at: found.index };
  }
  const hit = deepest && deepest.slug !== own && SAME[deepest.slug] !== own
    && !(own === "postbac" && NAMES_POSTBAC.test(pathOnly))
    ? { slug: deepest.slug }
    : undefined;
  // A row in a clinical profession legitimately cites its own school of medicine; only a
  // postbaccalaureate row is misdescribed by the MD track, because it is the one whose
  // applicants have not yet applied to medical school.
  const mdWrong = own === "postbac" && MD_TRACK.test(pathOnly) && !NAMES_POSTBAC.test(pathOnly);
  if (!hit && !mdWrong) continue;

  flagged++;
  const why = hit ? `source is a ${hit.slug} page` : "source is the medical school's MD admissions page";
  console.log(`WRONG ${String(r.id).padStart(5)} ${String(r.p).padEnd(22)} ${String(r.name).slice(0, 30).padEnd(32)} courses=${String(r.n).padStart(2)}  (${why})`);
  console.log(`        ${stored.slice(0, 130)}`);

  if (!APPLY) continue;
  // The courses describe the page that was read, and that page is a different programme. They
  // are removed, and the source with them, so discovery starts again rather than returning to
  // the same wrong page. The prior value is kept in the note and in the corrections log.
  log.push(JSON.stringify({ id: r.id, name: r.name, profession: own, at: new Date().toISOString(), priorSource: stored, reason: why }));
  await db.update(programSchoolsTable).set({
    prereqCourses: [] as any,
    sourceUrl: null,
    verificationStatus: "needs_review",
    lastVerified: null,
    verificationNote: `Reset ${new Date().toISOString().slice(0, 10)}: the recorded prerequisites were read from ${stored}, where ${why}. Requirements for a different programme are a different claim about a different set of applicants, so they have been removed and the row returned for extraction against a correct source.`,
  }).where(eq(programSchoolsTable.id, r.id));
}
if (APPLY && log.length) {
  fs.appendFileSync(path.join(process.cwd(), "..", "data", "seed-corrections.jsonl"), log.join("\n") + "\n");
}
console.log(`\nCHECKED=${rows.rows.length} WRONG_SOURCE=${flagged}`);
process.exit(0);
