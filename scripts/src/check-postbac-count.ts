import { db, programSchoolsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function main() {
  const rows = await db
    .select({
      id: programSchoolsTable.id,
      name: programSchoolsTable.name,
      verificationStatus: programSchoolsTable.verificationStatus,
      directoryStatus: programSchoolsTable.directoryStatus,
    })
    .from(programSchoolsTable)
    .where(eq(programSchoolsTable.professionSlug, "postbac"));

  console.log(`Postbac rows in DB: ${rows.length}`);
  const active = rows.filter(r => r.directoryStatus === "active");
  const byStatus: Record<string, number> = {};
  for (const r of rows) {
    byStatus[r.verificationStatus] = (byStatus[r.verificationStatus] ?? 0) + 1;
  }
  console.log("directoryStatus=active:", active.length);
  console.log("By verificationStatus:", JSON.stringify(byStatus, null, 2));
  process.exit(0);
}
main().catch(console.error);
