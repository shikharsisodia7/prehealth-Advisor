/**
 * mark-no-prereqs.ts
 * -------------------
 * Marks a program as verificationStatus="no_prereqs_published" based on an
 * explicit official statement (not absence of a course list). Reads a batch
 * JSON file of {id, institution, sourceUrl, evidenceQuote} and writes/read-
 * back-verifies each row, matched by (professionSlug, name) like
 * upsert-prereq-batch.ts.
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/mark-no-prereqs.ts <batch-file.json> <professionSlug>
 */
import fs from "node:fs";
import path from "node:path";
import { db, programSchoolsTable, type PrereqSource } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const TODAY = new Date().toISOString().slice(0, 10);

interface BatchEntry {
  id: number;
  institution: string;
  sourceUrl: string;
  evidenceQuote: string;
}

async function main() {
  const file = process.argv[2];
  const professionSlug = process.argv[3];
  if (!file || !professionSlug) throw new Error("Usage: tsx src/mark-no-prereqs.ts <batch-file.json> <professionSlug>");
  const batch: BatchEntry[] = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));

  let ok = 0;
  for (const p of batch) {
    const matches = await db
      .select()
      .from(programSchoolsTable)
      .where(and(eq(programSchoolsTable.professionSlug, professionSlug), eq(programSchoolsTable.name, p.institution)));
    if (matches.length === 0) {
      console.log(`MISSING ${p.id} ${p.institution}`);
      continue;
    }
    const row = matches[0];
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
