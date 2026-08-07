/**
 * check-prereq-status.ts
 * Quick status check for CAA and Pathologists' Assistant programs.
 */
import { db, programSchoolsTable } from "@workspace/db";
import { inArray, sql } from "drizzle-orm";

async function main() {
  const rows = await db
    .select({
      name: programSchoolsTable.name,
      professionSlug: programSchoolsTable.professionSlug,
      verificationStatus: programSchoolsTable.verificationStatus,
      prereqCount: sql<number>`jsonb_array_length(prereq_courses)`,
    })
    .from(programSchoolsTable)
    .where(
      inArray(programSchoolsTable.professionSlug, [
        "anesthesiologist-assistant",
        "pathologists-assistant",
      ]),
    );

  const byStatus = rows.reduce(
    (acc, r) => {
      acc[r.verificationStatus] = (acc[r.verificationStatus] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  console.log("Status breakdown:", JSON.stringify(byStatus));
  console.log(`\nTotal programs: ${rows.length}`);

  for (const prof of ["anesthesiologist-assistant", "pathologists-assistant"]) {
    const profRows = rows
      .filter((r) => r.professionSlug === prof)
      .sort((a, b) => a.name.localeCompare(b.name));
    console.log(`\n── ${prof} (${profRows.length} programs) ──`);
    for (const r of profRows) {
      const icon =
        r.verificationStatus === "imported"
          ? "✓"
          : r.verificationStatus === "needs_review"
            ? "?"
            : "-";
      console.log(
        `  [${icon}] ${r.name.slice(0, 45).padEnd(45)} ${r.prereqCount} courses | ${r.verificationStatus}`,
      );
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
