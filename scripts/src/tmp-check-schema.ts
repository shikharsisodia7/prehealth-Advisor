import { db, programSchoolsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
async function main() {
  const rows = await db.select({id: programSchoolsTable.id, name: programSchoolsTable.name, programName: programSchoolsTable.programName}).from(programSchoolsTable).where(eq(programSchoolsTable.professionSlug, "postbac"));
  // print rows with name containing 'Drexel'
  for (const r of rows) if (r.name.includes("Drexel")) console.log(r.id, "|", r.name, "|", r.programName);
  console.log("---dupes check---");
  const nameCounts: Record<string, number> = {};
  for (const r of rows) nameCounts[r.name] = (nameCounts[r.name]||0)+1;
  const dupes = Object.entries(nameCounts).filter(([k,v])=>v>1);
  console.log("duplicate name count:", dupes.length, "of total", rows.length);
  console.log(dupes.slice(0,20));
  process.exit(0);
}
main();
