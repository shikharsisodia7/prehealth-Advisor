/**
 * record-blockers.ts
 * Records directory_sources rows for professions whose authoritative
 * nationwide directory could NOT be ingested, with the exact blocker and the
 * documented import path (import-directory.ts JSON format).
 * Idempotent: upserts by (professionSlug, sourceName).
 */
import { eq } from "drizzle-orm";
import { db, directorySourcesTable } from "@workspace/db";

const RETRIEVED = "2026-07-23";
const IMPORT_PATH =
  "Import path: prepare JSON per scripts/src/import-directory.ts format and run it — idempotent, never deletes.";

const blockers = [
  {
    professionSlug: "dental",
    degreeType: null,
    sourceName: "CODA Find-a-Program (predoctoral DDS/DMD)",
    sourceUrl: "https://coda.ada.org/find-a-program",
    notes: `Blocked: coda.ada.org/find-a-program is a JavaScript search application; program data is loaded client-side with no static HTML, JSON endpoint, or exportable list discovered (HTML contains no embedded program data; /api probing returned 404). ADEA institution listings (dim.adea.org/institutions-by-state/) are likewise a JS form without static results. ${IMPORT_PATH}`,
  },
  {
    professionSlug: "occupational-therapy",
    degreeType: null,
    sourceName: "ACOTE School Directory (OT Masters + OT Doctorate)",
    sourceUrl: "https://acoteonline.org/schools/",
    notes: `Blocked: acoteonline.org school directory renders program data (degree level, status, location) client-side via JavaScript; the WP REST API exposes 670 'school' posts but with empty content/ACF fields, and individual school pages contain no server-rendered program details. Facet counts confirm ~516 accredited programs across OT/OTA levels. ${IMPORT_PATH}`,
  },
  {
    professionSlug: "genetic-counseling",
    degreeType: null,
    sourceName: "ACGC Program Directory",
    sourceUrl: "https://www.gceducation.org/find-a-program/",
    notes: `Partially blocked: ACGC's find-a-program page lists accredited program names and website links (~57 programs) but provides NO per-program city/state in the served HTML; the older /program-directory/ URL returns 404/502. Program existence is confirmable but location data (required by our schema) is not available from the source page. ${IMPORT_PATH}`,
  },
  {
    professionSlug: "dietetics",
    degreeType: null,
    sourceName: "ACEND Accredited Programs Directory",
    sourceUrl:
      "https://www.eatrightpro.org/acend/accredited-programs/accredited-education-programs",
    notes: `Blocked: ACEND's accredited-programs directory on eatrightpro.org is a JavaScript application (fetched HTML contains navigation only, no program list). ${IMPORT_PATH}`,
  },
  {
    professionSlug: "nursing",
    degreeType: "ABSN",
    sourceName: "AACN Program Directory (accelerated baccalaureate)",
    sourceUrl:
      "https://www.aacnnursing.org/students/nursing-education-pathways/accelerated-programs",
    notes: `Blocked: AACN's institutional program directory requires a MyAACN login (fetch returned a login form); the public accelerated-programs page is descriptive only, with no program list. ${IMPORT_PATH}`,
  },
  {
    professionSlug: "nursing",
    degreeType: "MEPN",
    sourceName: "AACN Program Directory (master's entry)",
    sourceUrl: "https://www.aacnnursing.org/about-aacn/member-schools",
    notes: `Blocked: same as ABSN — AACN directory is behind MyAACN login; no public machine-readable list of master's-entry (MEPN) programs found. ${IMPORT_PATH}`,
  },
  {
    professionSlug: "postbac",
    degreeType: null,
    sourceName: "AAMC Postbaccalaureate Premedical Programs Database",
    sourceUrl: "https://mec.aamc.org/postbac/#/index",
    notes: `Blocked: the AAMC postbac database (mec.aamc.org) is a JavaScript single-page application; fetched HTML contains no program data and no public API was identified. ${IMPORT_PATH}`,
  },
] as const;

async function main() {
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
