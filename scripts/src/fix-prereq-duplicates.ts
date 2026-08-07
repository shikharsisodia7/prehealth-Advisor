/**
 * fix-prereq-duplicates.ts
 * Fixes duplicate records created when import-programs matched a shorter
 * name (e.g. "University of Maryland School of Medicine") while the original
 * directory record had the full NAACLS name. Copies prereq data from the
 * newly-inserted record to the original, then deletes the duplicate.
 */
import { eq, and, isNull } from "drizzle-orm";
import { db, programSchoolsTable } from "@workspace/db";

const FIXES = [
  {
    originalExternalId: "naacls-2143",
    importedName: "University of Maryland School of Medicine",
  },
  {
    originalExternalId: "naacls-2818",
    importedName: "University of Toledo",
  },
];

async function main() {
  for (const fix of FIXES) {
    // Find the original row (has externalId)
    const origRows = await db
      .select()
      .from(programSchoolsTable)
      .where(eq(programSchoolsTable.externalId, fix.originalExternalId));

    if (origRows.length === 0) {
      console.log(`  SKIP: original ${fix.originalExternalId} not found`);
      continue;
    }
    const orig = origRows[0];

    // Find the newly-inserted row (no externalId, matches name exactly)
    const dupRows = await db
      .select()
      .from(programSchoolsTable)
      .where(
        and(
          eq(programSchoolsTable.name, fix.importedName),
          eq(programSchoolsTable.professionSlug, orig.professionSlug),
          isNull(programSchoolsTable.externalId),
        ),
      );

    if (dupRows.length === 0) {
      console.log(`  SKIP: no duplicate row found for "${fix.importedName}"`);
      continue;
    }
    const dup = dupRows[0];

    console.log(`  Fixing ${fix.originalExternalId}: copying ${dup.prereqCourses?.length ?? 0} prereqs from id=${dup.id} → id=${orig.id}`);

    // Copy prereq data to original
    await db
      .update(programSchoolsTable)
      .set({
        prereqCourses: dup.prereqCourses,
        verificationStatus: dup.verificationStatus,
        sourceUrl: dup.sourceUrl,
        lastVerified: dup.lastVerified,
      })
      .where(eq(programSchoolsTable.id, orig.id));

    // Delete duplicate
    await db
      .delete(programSchoolsTable)
      .where(eq(programSchoolsTable.id, dup.id));

    console.log(`  Done: updated original, deleted duplicate id=${dup.id}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
