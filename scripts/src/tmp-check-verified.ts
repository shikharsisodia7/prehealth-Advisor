import { db, programSchoolsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
async function main() {
  const rows = await db.select().from(programSchoolsTable).where(and(eq(programSchoolsTable.professionSlug, "postbac"), eq(programSchoolsTable.verificationStatus, "verified")));
  for (const r of rows) {
    console.log("====", r.name, "|", r.programName);
    console.log(JSON.stringify(r.prereqCourses, null, 2));
    console.log("note:", r.verificationNote);
  }
  process.exit(0);
}
main();
