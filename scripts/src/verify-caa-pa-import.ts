/**
 * verify-caa-pa-import.ts
 * Verifies that all 45 CAA and Pathologists' Assistant programs in the
 * database have been fully processed:
 *   - 44 programs with verificationStatus="verified" (non-empty prereqCourses,
 *     non-null sourceUrl, non-null lastVerified)
 *   - 1 program with verificationStatus="no_prereqs_published"
 *     (University of Calgary — confirmed no published prerequisites)
 *
 * This is the post-verification check. Before verification the script
 * expected "imported"/"needs_review"; those statuses have been promoted.
 *
 * Exits 0 on success, 1 on any mismatch.
 *
 * Run:
 *   pnpm --filter @workspace/scripts run verify:caa-pa
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, programSchoolsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(
  __dirname,
  "../../data/prereqs/caa-pa-all-programs.json",
);

// Expected final status for every program by externalId.
// All programs have been verified against their official sources.
// University of Calgary (naacls-2826) is confirmed to not publish
// specific prerequisite courses; it remains "no_prereqs_published".
const EXPECTED: Record<string, "verified" | "no_prereqs_published"> = {
  // ── Anesthesiologist Assistant ───────────────────────────────────────────
  "caahep-11020": "verified",  // Bluefield Auburn
  "caahep-11328": "verified",  // Bluefield Carolinas
  "caahep-11093": "verified",  // NSU Denver
  "caahep-120":   "verified",  // NSU Fort Lauderdale
  "caahep-9911":  "verified",  // NSU Jacksonville
  "caahep-11223": "verified",  // NSU Orlando
  "caahep-2760":  "verified",  // NSU Tampa Bay
  "caahep-6984":  "verified",  // Indiana University Indianapolis
  "caahep-11224": "verified",  // Saint Louis University
  "caahep-2360":  "verified",  // Univ. Missouri–Kansas City
  "caahep-9910":  "verified",  // Northeast Ohio Medical University
  "caahep-10957": "verified",  // Ohio Dominican University
  "caahep-11225": "verified",  // UTHealth Houston
  "caahep-6898":  "verified",  // Medical College of Wisconsin
  "caahep-113":   "verified",  // Emory University
  "caahep-3478":  "verified",  // CU Anschutz (verified via alternate source)
  "caahep-3125":  "verified",  // CWRU Washington DC
  "caahep-110":   "verified",  // CWRU Cleveland
  "caahep-11046": "verified",  // CWRU Austin
  "caahep-2882":  "verified",  // CWRU Houston
  "caahep-11021": "verified",  // South University Orlando
  "caahep-9837":  "verified",  // South University WPB
  "caahep-117":   "verified",  // South University Savannah
  "caahep-11329": "verified",  // KCU Joplin
  "caahep-11094": "verified",  // UNM
  // ── Pathologists' Assistant ──────────────────────────────────────────────
  "naacls-2687":  "verified",  // Univ. Alberta
  "naacls-2808":  "verified",  // Loma Linda
  "naacls-2061":  "verified",  // Quinnipiac
  "naacls-2146":  "verified",  // Rosalind Franklin
  "naacls-2682":  "verified",  // Tulane
  "naacls-2143":  "verified",  // Univ. Maryland SOM
  "naacls-2062":  "verified",  // Wayne State
  "naacls-2063":  "verified",  // Duke
  "naacls-2610":  "verified",  // Touro
  "naacls-2818":  "verified",  // Univ. Toledo
  "naacls-2724":  "verified",  // Univ. Toronto
  "naacls-2800":  "verified",  // Univ. Western Ontario
  "naacls-2184":  "verified",  // Drexel
  "naacls-2621":  "verified",  // Anderson University
  "naacls-2618":  "verified",  // UTHSC Memphis
  "naacls-2685":  "verified",  // Univ. Texas Medical Branch
  "naacls-2826":  "no_prereqs_published", // Univ. Calgary — no prerequisites published
  "naacls-2821":  "verified",  // Old Dominion
  "naacls-7603":  "verified",  // Carroll
  "naacls-2786":  "verified",  // WVU
};

const TOTAL_EXPECTED = Object.keys(EXPECTED).length;
const VERIFIED_EXPECTED = Object.values(EXPECTED).filter((s) => s === "verified").length;
const NO_PREREQS_EXPECTED = Object.values(EXPECTED).filter((s) => s === "no_prereqs_published").length;

async function main() {
  let pass = true;

  // ── 1. Validate data file structure ────────────────────────────────────────
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`✗ Data file not found: ${DATA_FILE}`);
    process.exit(1);
  }

  const rows: Array<Record<string, string>> = JSON.parse(
    fs.readFileSync(DATA_FILE, "utf-8"),
  );

  const byId = new Map<string, { classes: string[]; sourceUrl: string; lastVerified: string }>();
  for (const row of rows) {
    const id = row.external_id;
    if (!id) continue;
    const existing = byId.get(id) ?? { classes: [], sourceUrl: "", lastVerified: "" };
    existing.classes.push(row.classification);
    if (row.official_source_url) existing.sourceUrl = row.official_source_url;
    if (row.last_verified) existing.lastVerified = row.last_verified;
    byId.set(id, existing);
  }

  const missingSourceUrl: string[] = [];
  const missingLastVerified: string[] = [];

  for (const [id, { sourceUrl, lastVerified }] of byId) {
    if (!sourceUrl) missingSourceUrl.push(id);
    if (!lastVerified) missingLastVerified.push(id);
  }

  console.log(`Data file: ${DATA_FILE}`);
  console.log(`  Total rows:          ${rows.length}`);
  console.log(`  Distinct externalIds:${byId.size}`);

  if (byId.size !== TOTAL_EXPECTED) {
    console.error(`✗ Expected ${TOTAL_EXPECTED} externalIds, got ${byId.size}`);
    pass = false;
  } else {
    console.log(`  ✓ ${TOTAL_EXPECTED} programs in data file`);
  }
  if (missingSourceUrl.length > 0) {
    console.error(`✗ Missing official_source_url for: ${missingSourceUrl.join(", ")}`);
    pass = false;
  } else {
    console.log(`  ✓ All programs have official_source_url`);
  }
  if (missingLastVerified.length > 0) {
    console.error(`✗ Missing last_verified for: ${missingLastVerified.join(", ")}`);
    pass = false;
  } else {
    console.log(`  ✓ All programs have last_verified`);
  }

  // ── 2. Validate live DB records ─────────────────────────────────────────────
  const dbRows = await db
    .select({
      externalId: programSchoolsTable.externalId,
      professionSlug: programSchoolsTable.professionSlug,
      verificationStatus: programSchoolsTable.verificationStatus,
      sourceUrl: programSchoolsTable.sourceUrl,
      lastVerified: programSchoolsTable.lastVerified,
      prereqCourses: programSchoolsTable.prereqCourses,
      name: programSchoolsTable.name,
    })
    .from(programSchoolsTable)
    .where(
      inArray(programSchoolsTable.professionSlug, [
        "anesthesiologist-assistant",
        "pathologists-assistant",
      ]),
    );

  const dbById = new Map(
    dbRows
      .filter((r) => r.externalId)
      .map((r) => [r.externalId as string, r]),
  );

  console.log(`\nDatabase check (${dbRows.length} total CAA/PA programs):`);

  const issues: string[] = [];

  for (const [id, expectedStatus] of Object.entries(EXPECTED)) {
    const row = dbById.get(id);
    if (!row) {
      issues.push(`MISSING: ${id}`);
      continue;
    }
    if (row.verificationStatus !== expectedStatus) {
      issues.push(`WRONG STATUS ${id}: expected "${expectedStatus}", got "${row.verificationStatus}" (${row.name})`);
    }
    if (!row.sourceUrl) {
      issues.push(`NULL sourceUrl: ${id} (${row.name})`);
    }
    // For verified programs: require non-null lastVerified and non-empty prereqCourses.
    // no_prereqs_published programs have no courses by definition.
    if (expectedStatus === "verified") {
      if (!row.lastVerified) {
        issues.push(`NULL lastVerified: ${id} (${row.name})`);
      }
      if (!row.prereqCourses || row.prereqCourses.length === 0) {
        issues.push(`EMPTY prereqCourses: ${id} (${row.name})`);
      }
    }
  }

  if (issues.length > 0) {
    console.error(`✗ ${issues.length} issue(s) found:`);
    for (const issue of issues) console.error(`  ${issue}`);
    pass = false;
  } else {
    console.log(`  ✓ All ${TOTAL_EXPECTED} externalIds present in DB`);
    console.log(`  ✓ ${VERIFIED_EXPECTED} programs with status "verified"`);
    console.log(`  ✓ ${NO_PREREQS_EXPECTED} program with status "no_prereqs_published" (Calgary)`);
    console.log(`  ✓ All verified programs have non-null sourceUrl and lastVerified`);
    console.log(`  ✓ All verified programs have non-empty prereqCourses`);
  }

  if (pass) {
    console.log(`\n✓ All checks passed.`);
    process.exit(0);
  } else {
    console.error(`\n✗ Some checks failed.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
