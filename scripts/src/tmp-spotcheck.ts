import { db, programSchoolsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
async function main() {
  const rows = await db.select().from(programSchoolsTable).where(inArray(programSchoolsTable.id, [369, 373, 364]));
  for (const r of rows) {
    console.log("---", r.id, r.name, "|", r.verificationStatus);
    console.log("src:", r.sourceUrl);
    console.log("courses:", (r.prereqCourses || []).map((c) => `${c.name}${c.labRequired ? " (lab)" : ""}`).join(" | ").slice(0, 350));
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
