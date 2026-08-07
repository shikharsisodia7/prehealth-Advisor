/**
 * record-blockers.ts
 * Records directory_sources rows for professions whose authoritative
 * nationwide directory could NOT be ingested, with the exact blocker and the
 * documented import path (import-directory.ts JSON format).
 * Idempotent: upserts by (professionSlug, sourceName).
 *
 * Also removes STALE blocker rows for sources that have since been unlocked
 * and imported (CODA dental, ACOTE OT, ACGC genetic counseling, ACEND
 * dietetics, AACN nursing — all ingested 2026-08-07; AAMC postbac — ingested
 * 2026-08-07 via the REST API at api.mec.aamc.org/postbac-service/services-rs;
 * see data/directories/*.json source notes for the working access paths).
 */
import { and, eq } from "drizzle-orm";
import { db, directorySourcesTable } from "@workspace/db";

const RETRIEVED = "2026-08-07";
const IMPORT_PATH =
  "Import path: prepare JSON per scripts/src/import-directory.ts format and run it — idempotent, never deletes.";

/** No currently-blocked professions — all directories have been successfully imported. */
const blockers: Array<{
  professionSlug: string;
  degreeType: string | null;
  sourceName: string;
  sourceUrl: string;
  notes: string;
}> = [];

/** Blocker rows that are now superseded by successful imports. */
const staleBlockers: Array<{ professionSlug: string; sourceName: string }> = [
  { professionSlug: "dental", sourceName: "CODA Find-a-Program (predoctoral DDS/DMD)" },
  { professionSlug: "occupational-therapy", sourceName: "ACOTE School Directory (OT Masters + OT Doctorate)" },
  { professionSlug: "genetic-counseling", sourceName: "ACGC Program Directory" },
  { professionSlug: "dietetics", sourceName: "ACEND Accredited Programs Directory" },
  { professionSlug: "nursing", sourceName: "AACN Program Directory (accelerated baccalaureate)" },
  { professionSlug: "nursing", sourceName: "AACN Program Directory (master's entry)" },
  // AAMC postbac: originally blocked at the Angular SPA level, but the underlying
  // REST API at api.mec.aamc.org/postbac-service/services-rs/programs/ was
  // accessible and ingested on 2026-08-07 (338 programs).
  { professionSlug: "postbac", sourceName: "AAMC Postbaccalaureate Premedical Programs Database" },
];

async function main() {
  for (const s of staleBlockers) {
    const rows = await db
      .select()
      .from(directorySourcesTable)
      .where(eq(directorySourcesTable.professionSlug, s.professionSlug));
    const match = rows.find(
      (r) => r.sourceName === s.sourceName && r.coverageStatus === "blocked",
    );
    if (match) {
      await db
        .delete(directorySourcesTable)
        .where(eq(directorySourcesTable.id, match.id));
      console.log(`removed stale blocker: ${s.professionSlug} / ${s.sourceName}`);
    }
  }

  for (const b of blockers) {
    const rows = await db
      .select()
      .from(directorySourcesTable)
      .where(eq(directorySourcesTable.professionSlug, b.professionSlug));
    const match = rows.find((r) => r.sourceName === b.sourceName);
    const values = {
      professionSlug: b.professionSlug,
      degreeType: b.degreeType,
      sourceName: b.sourceName,
      sourceUrl: b.sourceUrl,
      retrievedAt: RETRIEVED,
      sourceProgramCount: "unknown",
      coverageStatus: "blocked" as const,
      notes: b.notes,
    };
    if (match) {
      await db
        .update(directorySourcesTable)
        .set(values)
        .where(eq(directorySourcesTable.id, match.id));
      console.log(`updated blocker: ${b.professionSlug} / ${b.sourceName}`);
    } else {
      await db.insert(directorySourcesTable).values(values);
      console.log(`recorded blocker: ${b.professionSlug} / ${b.sourceName}`);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
