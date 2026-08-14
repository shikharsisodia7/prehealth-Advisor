/**
 * tmp-mark-inactive.ts
 * ---------------------
 * One-off: mark a discontinued/non-admitting program as directoryStatus="inactive"
 * with an explicit evidence-backed note, matched by (professionSlug, name).
 * Read-back verified like the other upsert scripts.
 *
 * Run: npx tsx src/tmp-mark-inactive.ts <professionSlug> <exact institution name> <note>
 */
import { db, programSchoolsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const TODAY = new Date().toISOString().slice(0, 10);

async function main() {
  const professionSlug = process.argv[2];
  const institution = process.argv[3];
  const note = process.argv[4];
  if (!professionSlug || !institution || !note) {
    throw new Error("Usage: tsx src/tmp-mark-inactive.ts <professionSlug> <institution> <note>");
  }
  const matches = await db
    .select()
    .from(programSchoolsTable)
    .where(and(eq(programSchoolsTable.professionSlug, professionSlug), eq(programSchoolsTable.name, institution)));
  if (matches.length === 0) {
    console.log(`MISSING ${institution}`);
    process.exit(1);
  }
  const row = matches[0];
  await db
    .update(programSchoolsTable)
    .set({
      directoryStatus: "inactive",
      lastDirectoryVerified: TODAY,
      verificationNote: note,
    })
    .where(eq(programSchoolsTable.id, row.id));

  const [check] = await db.select().from(programSchoolsTable).where(eq(programSchoolsTable.id, row.id));
  const good = check?.directoryStatus === "inactive";
  if (!good) throw new Error(`READ-BACK FAILED: status=${check?.directoryStatus}`);
  console.log(`OK id=${row.id} ${row.name}: marked directoryStatus=inactive`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
