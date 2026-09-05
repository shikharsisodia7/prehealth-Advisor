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
 *
 * This audit previously carried its own copy of the profession-marker list, duplicated from
 * extraction-rules.ts. That duplication is exactly how the University of Oklahoma, OHSU, and UC
 * Riverside MD rows slipped through: both copies were missing a "medicine" marker and the
 * "physician-associate" spelling, and fixing one copy without the other would have left this
 * audit reporting WRONG_SOURCE=0 while the completion worker's own validation had moved on.
 * There is now exactly one profession-marker list, in extraction-rules.ts, and both the worker
 * and this audit call the same sourceProfessionConflicts function against it.
 */
import { eq, sql } from "drizzle-orm";
import { db, programSchoolsTable } from "@workspace/db";
import fs from "node:fs";
import path from "node:path";
import { sourceProfessionConflicts } from "./extraction-rules.js";

const APPLY = process.argv.includes("--apply");
const log: string[] = [];

const rows = await db.execute(sql.raw(`
  select id, name, profession_slug p, coalesce(program_name,'') pn, coalesce(source_url,'') s,
         jsonb_array_length(coalesce(prereq_courses,'[]'::jsonb)) n, verification_status vs
  from program_schools
  where directory_status='active' and verification_status in ('verified','no_prereqs_published')
    and coalesce(source_url,'') <> '' order by profession_slug, name`));

let flagged = 0;
for (const r of rows.rows as any[]) {
  const stored = String(r.s);
  const own = String(r.p);
  const why = sourceProfessionConflicts(stored, own);
  if (!why) continue;

  flagged++;
  console.log(`WRONG ${String(r.id).padStart(5)} ${own.padEnd(28)} ${String(r.name).slice(0, 30).padEnd(32)} courses=${String(r.n).padStart(2)}  (${why})`);
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
