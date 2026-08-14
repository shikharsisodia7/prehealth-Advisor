/**
 * tmp-mark-no-prereqs-by-id.ts
 * -----------------------------
 * Same behavior as mark-no-prereqs.ts but matches DB rows by exact primary
 * key `id` instead of (professionSlug, name), for the same duplicate-name
 * safety reason as tmp-upsert-by-id.ts.
 *
 * Run: npx tsx src/tmp-mark-no-prereqs-by-id.ts <batch-file.json>
 */
import fs from "node:fs";
import path from "node:path";
import { db, programSchoolsTable, type PrereqSource } from "@workspace/db";
import { eq } from "drizzle-orm";

const TODAY = new Date().toISOString().slice(0, 10);

interface BatchEntry {
  id: number;
  institution: string;
  sourceUrl: string;
  evidenceQuote: string;
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: tsx src/tmp-mark-no-prereqs-by-id.ts <batch-file.json>");
  const batch: BatchEntry[] = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));

  let ok = 0;
  for (const p of batch) {
    const [row] = await db.select().from(programSchoolsTable).where(eq(programSchoolsTable.id, p.id));
    if (!row) {
      console.log(`MISSING ${p.id} ${p.institution}`);
      continue;
    }
    const existingSources: PrereqSource[] = (row.prereqSources as PrereqSource[]) ?? [];
    const newSource: PrereqSource = {
      url: p.sourceUrl,
      title: null,
      sourceType: "program_page",
      retrievedAt: TODAY,
      contentHash: null,
      extractionMethod: "http",
    };
    const sources = existingSources.some((s) => s.url === newSource.url) ? existingSources : [...existingSources, newSource];

    await db
      .update(programSchoolsTable)
      .set({
        prereqCourses: [],
        prereqSources: sources,
        sourceUrl: p.sourceUrl,
        lastVerified: TODAY,
        verificationStatus: "no_prereqs_published",
        verificationNote: `Machine-verified from official source, no human review. Explicit official statement: "${p.evidenceQuote}"`,
      })
      .where(eq(programSchoolsTable.id, row.id));

    const [check] = await db.select().from(programSchoolsTable).where(eq(programSchoolsTable.id, row.id));
    const good = check?.verificationStatus === "no_prereqs_published" && check?.sourceUrl === p.sourceUrl;
    if (!good) throw new Error(`READ-BACK FAILED for ${p.id}: status=${check?.verificationStatus}`);
    ok++;
    console.log(`OK ${p.id} -> db id=${row.id} ${row.name}: marked no_prereqs_published`);
  }
  console.log(`Done — ${ok} program(s) marked and read-back verified.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
