/**
 * Record a prerequisite list that was read directly from a school's own published document.
 *
 * Some sources cannot be reached by the automated worker even though the school publishes the
 * data plainly. UAGM's dental requirements are a table stored inside its PDF as a raster image:
 * pypdf and `pdftotext -layout` both return the sentence introducing the table and then nothing,
 * which looks exactly like a school that declines to list its prerequisites. Rendering the page
 * and reading it is still the school's own statement, so the row can be finalized -- but only
 * with the source URL and the reason the automated path failed recorded alongside it, so the
 * provenance of a hand-read row is never weaker than an extracted one.
 *
 * This never infers a requirement. Every course written here has to appear in the cited document.
 */
import { eq, sql } from "drizzle-orm";
import { db, programSchoolsTable } from "@workspace/db";
import fs from "node:fs";

type Course = {
  name: string;
  details?: string | null;
  labRequired?: boolean | null;
  semesterCredits?: number | null;
  quarterCredits?: number | null;
  courseCount?: number | null;
  classification?: string;
  otherConditions?: string | null;
};
type Finding = {
  id: number;
  sourceUrl: string;
  /** The document's own wording that introduces the list, quoted verbatim. */
  evidence: string;
  /** Why the automated reader could not take it, so the row's history stays honest. */
  why: string;
  conditions?: string;
  courses: Course[];
};

const APPLY = process.argv.includes("--apply");
const file = process.argv.find((a) => a.endsWith(".json"));
if (!file) throw new Error("pass a findings JSON file");
const findings: Finding[] = JSON.parse(fs.readFileSync(file, "utf8"));

for (const f of findings) {
  const cur = await db.execute(sql.raw(
    `select id, name, profession_slug, verification_status from program_schools where id = ${Number(f.id)}`));
  const row = cur.rows[0] as any;
  if (!row) { console.log(`MISSING ${f.id}`); continue; }
  if (!f.courses.length) { console.log(`EMPTY ${f.id} -- refusing to finalize a row with no courses`); continue; }

  const courses = f.courses.map((c) => ({
    name: c.name,
    details: c.details ?? null,
    courseCount: c.courseCount ?? null,
    labRequired: c.labRequired ?? null,
    classification: c.classification ?? "required",
    quarterCredits: c.quarterCredits ?? null,
    otherConditions: c.otherConditions ?? null,
    semesterCredits: c.semesterCredits ?? null,
  }));

  const note = [
    `Read by hand from the programme's own published document on ${new Date().toISOString().slice(0, 10)}.`,
    `Source statement: "${f.evidence}"`,
    `The automated reader could not take it: ${f.why}`,
    f.conditions ? `Page conditions: ${f.conditions}` : "",
  ].filter(Boolean).join(" ");

  console.log(`${APPLY ? "APPLY " : "DRYRUN"} ${f.id} ${String(row.name).slice(0, 44).padEnd(46)} ${courses.length} courses`);
  for (const c of courses) console.log(`        - ${c.name}${c.semesterCredits ? ` (${c.semesterCredits} cr)` : ""}${c.labRequired ? " + lab" : ""}`);
  if (!APPLY) continue;

  await db.update(programSchoolsTable).set({
    prereqCourses: courses as any,
    sourceUrl: f.sourceUrl,
    verificationStatus: "verified",
    lastVerified: new Date().toISOString(),
    verificationNote: note,
  }).where(eq(programSchoolsTable.id, f.id));
}
console.log(`DONE findings=${findings.length} applyMode=${APPLY}`);
process.exit(0);
