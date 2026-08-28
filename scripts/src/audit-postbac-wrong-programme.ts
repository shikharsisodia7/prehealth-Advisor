/**
 * Find verified postbac rows whose evidence came from a different programme at the same school.
 *
 * Most stored URLs that differ from the directory's are harmless: the worker found a deeper page
 * under the same programme (Bryn Mawr's /postbac/admissions-aid/how-apply against the directory's
 * /postbac). Those share a path segment, and share it distinctively.
 *
 * The harmful case is a row whose evidence sits on the medical school's own MD admissions page.
 * A postbac programme's prerequisites and an MD programme's prerequisites are different claims,
 * and recording one as the other misinforms exactly the student the row exists to serve.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { programSchoolsTable } from "@workspace/db";

const APPLY = process.argv.includes("--apply");

const dir = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "data", "directories", "postbac.json"), "utf8"));
const byId = new Map<string, any>(dir.programs.map((p: any) => [String(p.externalId), p]));

/** Path words too common to prove two URLs are the same programme. */
const GENERIC = new Set([
  "www", "edu", "com", "org", "academics", "admissions", "admission", "programs", "program", "index",
  "graduate", "graduate-programs", "degrees", "education", "apply", "requirements", "students",
  "html", "aspx", "cfm", "php", "en", "academic", "school", "degree-programs", "masters", "future-students",
]);
/**
 * Distinctive words in a URL's path and subdomain, excluding the registrable domain.
 *
 * Both URLs belong to the same institution by construction, so the domain is shared no matter
 * which programme each page describes. Counting it as overlap made every row look like a match:
 * Baylor's MD admissions page and its MS in Biomedical Sciences both contain "bcm", and the audit
 * passed a row whose postbac prerequisites had been read off the MD programme's page.
 */
function tokens(u: string): Set<string> {
  let host = "", pathname = u;
  try {
    const parsed = new URL(/^https?:\/\//.test(u) ? u : `https://${u}`);
    host = parsed.hostname;
    pathname = parsed.pathname + parsed.search;
  } catch { /* fall back to the raw string */ }
  const domain = host.split(".").slice(-2).join(".");
  const subdomain = host.endsWith(domain) ? host.slice(0, -domain.length) : "";
  return new Set(
    `${subdomain}/${pathname}`.toLowerCase().split(/[/.\-_?=&#]+/)
      .filter((t) => t.length > 2 && !GENERIC.has(t)),
  );
}

/** A page that belongs to the medical school's own MD track, not to a postbaccalaureate programme. */
const MD_TRACK = /(\/md-program\/|\/m-d-program\/|\/md\/admissions|admission\.med\.|\/school-of-medicine\/.*admiss|\/medical-student-admissions|\/medicine-md\/|\/allopathic-medicine|\/doctor-of-medicine)/i;
/** A page about undergraduate study, which a postbaccalaureate applicant has already finished. */
const UNDERGRAD = /(\/undergraduate|\/bachelors-degree\/|first-year-students|\/pre-med$|\/prospective-freshmen)/i;
/**
 * A URL that names a postbaccalaureate programme is this row's programme wherever it is filed.
 * Worcester State publishes its postbac programme under the undergraduate catalogue's admissions
 * section, so the path contains "undergraduate" and the correct page would have been discarded.
 */
const NAMES_POSTBAC = /(post-?bacc?alaureate|postbac)/i;

const rows = await db.execute(sql.raw(`
  select id, name, coalesce(external_id,'') ext, coalesce(source_url,'') s,
         jsonb_array_length(coalesce(prereq_courses,'[]'::jsonb)) n
  from program_schools
  where directory_status='active' and profession_slug='postbac'
    and verification_status in ('verified','no_prereqs_published')
  order by name`));

let flagged = 0, shared = 0, unrelated = 0;
for (const r of rows.rows as any[]) {
  const p = byId.get(String(r.ext));
  const stored = String(r.s);
  if (!p?.websiteUrl || !stored) continue;
  const overlap = [...tokens(stored)].filter((t) => tokens(String(p.websiteUrl)).has(t));
  if (overlap.length > 0) { shared++; continue; }

  const why = NAMES_POSTBAC.test(stored)
    ? ""
    : MD_TRACK.test(stored)
      ? "MD admissions page"
      : UNDERGRAD.test(stored)
        ? "undergraduate page"
        : "";
  if (!why) { unrelated++; continue; }
  flagged++;
  console.log(`WRONG ${String(r.id).padStart(5)} ${String(r.name).slice(0, 34).padEnd(36)} courses=${String(r.n).padStart(2)}  (${why})`);
  console.log(`   stored: ${stored}`);
  console.log(`ontheAAMC: ${p.websiteUrl}  [${p.programName}]`);

  if (!APPLY) continue;
  // The recorded courses describe the page that was read, and that page is another programme.
  // They are removed rather than re-pointed, and the row goes back for extraction against the
  // URL its own directory entry names.
  const url = String(p.websiteUrl).replace(/^https?:\/\/(?=https?:\/\/)/i, "");
  await db.update(programSchoolsTable).set({
    prereqCourses: [] as any,
    sourceUrl: url,
    websiteUrl: url,
    verificationStatus: "needs_review",
    lastVerified: null,
    verificationNote: `Reset ${new Date().toISOString().slice(0, 10)}: the recorded prerequisites came from ${stored}, which is this university's ${why}, not its "${p.programName}" postbaccalaureate programme. Requirements for a different programme are a different claim, so they have been removed and the row re-seeded with the URL the AAMC postbac directory publishes for it.`,
  }).where(eq(programSchoolsTable.id, r.id));
}
console.log(`\nCHECKED=${rows.rows.length} sharesProgrammePath=${shared} noOverlapButNotFlagged=${unrelated} WRONG_PROGRAMME=${flagged}`);
process.exit(0);
