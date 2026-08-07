/**
 * import-postbac-directory.ts
 * ---------------------------
 * Re-imports the 338 AAMC postbac programs from data/directories/postbac.json
 * into the dev DB. Safe to re-run: uses externalId + professionSlug as the
 * stable key; skips any existing "verified" record.
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/import-postbac-directory.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, programSchoolsTable, directorySourcesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR_FILE = path.resolve(__dirname, "../../data/directories/postbac.json");

interface DirectoryProgram {
  name: string;
  programName: string;
  city?: string;
  state: string;
  websiteUrl?: string;
  externalId: string;
}

interface DirectoryFile {
  professionSlug: string;
  source: {
    name: string;
    url: string;
    retrievedAt: string;
    sourceProgramCount: number;
    coverageStatus: string;
    notes: string;
  };
  programs: DirectoryProgram[];
}

async function main() {
  const raw: DirectoryFile = JSON.parse(fs.readFileSync(DIR_FILE, "utf-8"));
  const { professionSlug, source, programs } = raw;

  console.log(`Importing ${programs.length} ${professionSlug} programs from directory...`);

  // Upsert the directorySourcesTable entry
  const existingSource = await db
    .select()
    .from(directorySourcesTable)
    .where(eq(directorySourcesTable.professionSlug, professionSlug));

  if (existingSource.length === 0) {
    await db.insert(directorySourcesTable).values({
      professionSlug,
      sourceName: source.name,
      sourceUrl: source.url,
      retrievedAt: source.retrievedAt,
      sourceProgramCount: String(source.sourceProgramCount),
      coverageStatus: source.coverageStatus as "complete" | "incomplete" | "blocked" | "unreconciled",
      notes: source.notes,
    });
    console.log(`Inserted directorySourcesTable entry for ${professionSlug}`);
  } else {
    await db
      .update(directorySourcesTable)
      .set({
        sourceName: source.name,
        sourceUrl: source.url,
        retrievedAt: source.retrievedAt,
        sourceProgramCount: String(source.sourceProgramCount),
        coverageStatus: source.coverageStatus as "complete" | "incomplete" | "blocked" | "unreconciled",
        notes: source.notes,
      })
      .where(eq(directorySourcesTable.professionSlug, professionSlug));
    console.log(`Updated directorySourcesTable entry for ${professionSlug}`);
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const prog of programs) {
    const existing = await db
      .select()
      .from(programSchoolsTable)
      .where(
        and(
          eq(programSchoolsTable.professionSlug, professionSlug),
          eq(programSchoolsTable.externalId, prog.externalId),
        ),
      );

    if (existing.length > 0) {
      // Skip verified records; update others to refresh directory data
      if (existing[0].verificationStatus === "verified") {
        skipped++;
        continue;
      }
      await db
        .update(programSchoolsTable)
        .set({
          name: prog.name,
          programName: prog.programName,
          city: prog.city ?? null,
          state: prog.state,
          websiteUrl: prog.websiteUrl ?? null,
          directoryStatus: "active",
          directorySource: source.name,
          lastDirectoryVerified: source.retrievedAt,
        })
        .where(eq(programSchoolsTable.id, existing[0].id));
      updated++;
    } else {
      await db.insert(programSchoolsTable).values({
        professionSlug,
        externalId: prog.externalId,
        name: prog.name,
        programName: prog.programName,
        city: prog.city ?? null,
        state: prog.state,
        websiteUrl: prog.websiteUrl ?? null,
        directoryStatus: "active",
        directorySource: source.name,
        lastDirectoryVerified: source.retrievedAt,
        verificationStatus: "draft",
        prereqCourses: [],
        prereqSources: [],
        aliases: [],
      });
      inserted++;
    }
  }

  console.log(`\nImport complete:`);
  console.log(`  Inserted:         ${inserted}`);
  console.log(`  Updated:          ${updated}`);
  console.log(`  Skipped (verified): ${skipped}`);
  console.log(`  Total processed:  ${inserted + updated + skipped}`);

  // Verify count
  const all = await db
    .select({ id: programSchoolsTable.id })
    .from(programSchoolsTable)
    .where(
      and(
        eq(programSchoolsTable.professionSlug, professionSlug),
        eq(programSchoolsTable.directoryStatus, "active"),
      ),
    );
  console.log(`  Active in DB now: ${all.length}`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
