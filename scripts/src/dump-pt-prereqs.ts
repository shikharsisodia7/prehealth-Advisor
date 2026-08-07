/**
 * dump-pt-prereqs.ts
 * Prints the full verified prereq data for a single program as JSON.
 */
import { db, programSchoolsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const id = parseInt(process.argv[2] ?? "308");

async function main() {
  const [r] = await db
    .select()
    .from(programSchoolsTable)
    .where(eq(programSchoolsTable.id, id));

  if (!r) { console.error("Not found"); process.exit(1); }
  console.log(`ID ${r.id}: ${r.name}`);
  console.log(`sourceUrl: ${r.sourceUrl}`);
  console.log(`lastVerified: ${r.lastVerified}`);
  console.log(`externalId: ${r.externalId}`);
  console.log(`state: ${r.state}`);
  console.log(`city: ${r.city}`);
  console.log(`verificationNote: ${(r.verificationNote ?? "").slice(0, 300)}`);
  console.log("prereqCourses:", JSON.stringify(r.prereqCourses, null, 2));
  console.log("prereqSources:", JSON.stringify(r.prereqSources, null, 2));
  process.exit(0);
}
main().catch(console.error);
