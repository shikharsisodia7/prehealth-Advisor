/**
 * check-pt-status.ts
 * ------------------
 * DB read-back assertions for the 7 queued PT programs (IDs 302–310, excluding
 * the already-verified Faulkner 303 and UAB 305 which are baseline).
 *
 * Strict requirements: every target program must be "verified" with ≥1 course
 * and a non-null source URL. Exits non-zero on any failure.
 */
import { db, programSchoolsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

async function main() {
  const ids = [302, 303, 304, 305, 306, 307, 308, 309, 310];
  const rows = await db
    .select({
      id: programSchoolsTable.id,
      name: programSchoolsTable.name,
      professionSlug: programSchoolsTable.professionSlug,
      verificationStatus: programSchoolsTable.verificationStatus,
      sourceUrl: programSchoolsTable.sourceUrl,
      lastVerified: programSchoolsTable.lastVerified,
      prereqCourses: programSchoolsTable.prereqCourses,
      prereqSources: programSchoolsTable.prereqSources,
    })
    .from(programSchoolsTable)
    .where(inArray(programSchoolsTable.id, ids));

  rows.sort((a, b) => a.id - b.id);

  console.log(`Found ${rows.length} row(s)\n`);
  for (const r of rows) {
    const courses = r.prereqCourses ?? [];
    const sources = r.prereqSources ?? [];
    console.log(`ID ${r.id}: ${r.name}`);
    console.log(`  profession:    ${r.professionSlug}`);
    console.log(`  status:        ${r.verificationStatus}`);
    console.log(`  sourceUrl:     ${r.sourceUrl ?? "null"}`);
    console.log(`  lastVerified:  ${r.lastVerified ?? "null"}`);
    console.log(`  courses:       ${courses.length}`);
    console.log(`  sources:       ${sources.length}`);
    courses.slice(0, 5).forEach(c => console.log(`    - [${c.classification}] ${c.name}`));
    if (courses.length > 5) console.log(`    ... and ${courses.length - 5} more`);
    console.log();
  }

  // Strict assertions: all 9 programs must be verified with ≥1 course and a source URL
  let allOk = true;
  const REQUIRED_IDS = [302, 303, 304, 305, 306, 307, 308, 309, 310];
  for (const id of REQUIRED_IDS) {
    const row = rows.find(r => r.id === id);
    if (!row) {
      console.log(`ASSERTION FAIL: ID ${id} not found in DB`);
      allOk = false;
      continue;
    }
    const statusOk = row.verificationStatus === "verified";
    const sourceOk = !!row.sourceUrl;
    const courseCountOk = (row.prereqCourses ?? []).length >= 1;
    const sourcesOk = (row.prereqSources ?? []).length >= 1;
    if (!statusOk || !sourceOk || !courseCountOk || !sourcesOk) {
      console.log(
        `ASSERTION FAIL ID ${id} (${row.name}): ` +
        `status=${row.verificationStatus}[${statusOk ? "ok" : "NEED verified"}] ` +
        `source=${sourceOk ? "ok" : "FAIL(null)"} ` +
        `courses=${(row.prereqCourses ?? []).length}[${courseCountOk ? "ok" : "NEED ≥1"}] ` +
        `sources=${(row.prereqSources ?? []).length}[${sourcesOk ? "ok" : "NEED ≥1"}]`
      );
      allOk = false;
    } else {
      console.log(
        `ASSERTION OK   ID ${id}: verified | ${(row.prereqCourses ?? []).length} courses | ` +
        `${(row.prereqSources ?? []).length} sources | src=${row.sourceUrl?.slice(0, 55)}`
      );
    }
  }
  console.log(`\nAll assertions ${allOk ? "PASSED ✓" : "FAILED ✗"}`);
  process.exit(allOk ? 0 : 1);
}

main().catch(console.error);
