/**
 * record-blockers.ts
 * Records directory_sources rows for professions whose authoritative
 * nationwide directory could NOT be ingested, with the exact blocker and the
 * documented import path (import-directory.ts JSON format).
 * Idempotent: upserts by (professionSlug, sourceName).
 *
 * Also removes STALE blocker rows for sources that have since been unlocked
 * and imported (CODA dental, ACOTE OT, ACGC genetic counseling, ACEND
 * dietetics, AACN nursing — all ingested 2026-08-07; see
 * data/directories/*.json source notes for the working access paths).
 */
import { and, eq } from "drizzle-orm";
import { db, directorySourcesTable } from "@workspace/db";

const RETRIEVED = "2026-08-07";
const IMPORT_PATH =
  "Import path: prepare JSON per scripts/src/import-directory.ts format and run it — idempotent, never deletes.";

const blockers = [
  {
    professionSlug: "postbac",
    degreeType: null,
    sourceName: "AAMC Postbaccalaureate Premedical Programs Database",
    sourceUrl: "https://mec.aamc.org/postbac/#/index",
    notes: `Blocked: the AAMC postbac database (mec.aamc.org/postbac) is an Angular single-page application. The app shell and JS bundles are fetchable, but every backend service endpoint on mec.aamc.org (config-service/services-rs/*, program service paths referenced in the bundles) fails at the network/TLS level from this environment across repeated attempts on 2026-08-07, and the legacy host apps.aamc.org/postbac returns 404. No static export, sitemap, or archived data set of the program list was found. ${IMPORT_PATH}`,
  },
] as const;

/** Blocker rows recorded on 2026-07-23 that are now superseded by successful imports. */
const staleBlockers: Array<{ professionSlug: string; sourceName: string }> = [
  { professionSlug: "dental", sourceName: "CODA Find-a-Program (predoctoral DDS/DMD)" },
  { professionSlug: "occupational-therapy", sourceName: "ACOTE School Directory (OT Masters + OT Doctorate)" },
  { professionSlug: "genetic-counseling", sourceName: "ACGC Program Directory" },
  { professionSlug: "dietetics", sourceName: "ACEND Accredited Programs Directory" },
  { professionSlug: "nursing", sourceName: "AACN Program Directory (accelerated baccalaureate)" },
  { professionSlug: "nursing", sourceName: "AACN Program Directory (master's entry)" },
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
