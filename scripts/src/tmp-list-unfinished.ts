import { db, programSchoolsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

async function main() {
  const slug = process.argv[2];
  const rows = await db
    .select()
    .from(programSchoolsTable)
    .where(
      and(
        eq(programSchoolsTable.professionSlug, slug),
        eq(programSchoolsTable.directoryStatus, "active"),
        inArray(programSchoolsTable.verificationStatus, ["draft", "needs_review", "outdated"]),
      ),
    );
  for (const r of rows) console.log(r.id, "|", r.name, "|", r.programName, "|", r.city, r.state, "|", r.websiteUrl);
  console.log(`Total: ${rows.length}`);
  process.exit(0);
}
main();
