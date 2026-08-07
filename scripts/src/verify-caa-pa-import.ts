/**
 * verify-caa-pa-import.ts
 * Verifies that:
 *   1. The canonical data file (caa-pa-all-programs.json) contains exactly 45
 *      distinct externalIds: 31 programs with real prerequisites and 14
 *      informational-only (blocked) records; all rows must have sourceUrl and
 *      last_verified set.
 *   2. The live database contains exactly 31 programs with verificationStatus
 *      "imported" and 14 with "needs_review" for the CAA and PA professions,
 *      each matched by externalId with non-null sourceUrl, non-null
 *      lastVerified, and a non-empty prereqCourses payload.
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

// Expected programs by externalId → expected status
const EXPECTED: Record<string, "imported" | "needs_review"> = {
  // ── Anesthesiologist Assistant — imported (real prerequisites) ──────────────
  "caahep-11020": "imported",  // Bluefield Auburn
  "caahep-11328": "imported",  // Bluefield Carolinas
  "caahep-11093": "imported",  // NSU Denver
  "caahep-120":   "imported",  // NSU Fort Lauderdale
  "caahep-9911":  "imported",  // NSU Jacksonville
  "caahep-11223": "imported",  // NSU Orlando
  "caahep-2760":  "imported",  // NSU Tampa Bay
  "caahep-6984":  "imported",  // Indiana University Indianapolis
  "caahep-11224": "imported",  // Saint Louis University
  "caahep-2360":  "imported",  // Univ. Missouri–Kansas City
  "caahep-9910":  "imported",  // Northeast Ohio Medical University
  "caahep-10957": "imported",  // Ohio Dominican University
  "caahep-11225": "imported",  // UTHealth Houston
  "caahep-6898":  "imported",  // Medical College of Wisconsin
  "caahep-113":   "imported",  // Emory University
  // ── Anesthesiologist Assistant — needs_review (blocked sources) ─────────────
  "caahep-3478":  "needs_review", // CU Anschutz
  "caahep-3125":  "needs_review", // CWRU Washington DC
  "caahep-110":   "needs_review", // CWRU Cleveland
  "caahep-11046": "needs_review", // CWRU Austin
  "caahep-2882":  "needs_review", // CWRU Houston
  "caahep-11021": "needs_review", // South University Orlando
  "caahep-9837":  "needs_review", // South University WPB
  "caahep-117":   "needs_review", // South University Savannah
  "caahep-11329": "needs_review", // KCU Joplin
  "caahep-11094": "needs_review", // UNM
  // ── Pathologists' Assistant — imported ──────────────────────────────────────
  "naacls-2687":  "imported",  // Univ. Alberta
  "naacls-2808":  "imported",  // Loma Linda
  "naacls-2061":  "imported",  // Quinnipiac
  "naacls-2146":  "imported",  // Rosalind Franklin
  "naacls-2682":  "imported",  // Tulane
  "naacls-2143":  "imported",  // Univ. Maryland SOM
  "naacls-2062":  "imported",  // Wayne State
  "naacls-2063":  "imported",  // Duke
  "naacls-2610":  "imported",  // Touro
  "naacls-2818":  "imported",  // Univ. Toledo
  "naacls-2724":  "imported",  // Univ. Toronto
  "naacls-2800":  "imported",  // Univ. Western Ontario
  "naacls-2184":  "imported",  // Drexel
  "naacls-2621":  "imported",  // Anderson University
  "naacls-2618":  "imported",  // UTHSC Memphis
  "naacls-2685":  "imported",  // Univ. Texas Medical Branch
  // ── Pathologists' Assistant — needs_review ──────────────────────────────────
  "naacls-2826":  "needs_review", // Univ. Calgary
  "naacls-2821":  "needs_review", // Old Dominion
  "naacls-7603":  "needs_review", // Carroll
  "naacls-2786":  "needs_review", // WVU
};

const TOTAL_EXPECTED = Object.keys(EXPECTED).length;
const IMPORTED_EXPECTED = Object.values(EXPECTED).filter((s) => s === "imported").length;
const NEEDS_REVIEW_EXPECTED = Object.values(EXPECTED).filter((s) => s === "needs_review").length;

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

  const informationalIds = new Set<string>();
  const realIds = new Set<string>();
  const missingSourceUrl: string[] = [];
  const missingLastVerified: string[] = [];

  for (const [id, { classes, sourceUrl, lastVerified }] of byId) {
    if (classes.every((c) => c === "informational")) {
      informationalIds.add(id);
    } else {
      realIds.add(id);
    }
    if (!sourceUrl) missingSourceUrl.push(id);
    if (!lastVerified) missingLastVerified.push(id);
  }

  console.log(`Data file: ${DATA_FILE}`);
  console.log(`  Total rows:                   ${rows.length}`);
  console.log(`  Distinct externalIds:         ${byId.size}`);
  console.log(`  Real prereq programs:         ${realIds.size}`);
  console.log(`  Blocked (informational-only): ${informationalIds.size}`);

  if (byId.size !== TOTAL_EXPECTED) {
    console.error(`✗ Expected ${TOTAL_EXPECTED} externalIds, got ${byId.size}`);
    pass = false;
  } else {
    console.log(`  ✓ ${TOTAL_EXPECTED} programs in data file`);
  }
  if (realIds.size !== IMPORTED_EXPECTED) {
    console.error(`✗ Expected ${IMPORTED_EXPECTED} real-prereq programs, got ${realIds.size}`);
    pass = false;
  } else {
    console.log(`  ✓ ${IMPORTED_EXPECTED} programs with real prerequisites`);
  }
  if (informationalIds.size !== NEEDS_REVIEW_EXPECTED) {
    console.error(`✗ Expected ${NEEDS_REVIEW_EXPECTED} informational-only programs, got ${informationalIds.size}`);
    pass = false;
  } else {
    console.log(`  ✓ ${NEEDS_REVIEW_EXPECTED} blocked programs (informational-only)`);
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
    if (!row.lastVerified) {
      issues.push(`NULL lastVerified: ${id} (${row.name})`);
    }
    if (!row.prereqCourses || row.prereqCourses.length === 0) {
      issues.push(`EMPTY prereqCourses: ${id} (${row.name})`);
    }
  }

  if (issues.length > 0) {
    console.error(`✗ ${issues.length} issue(s) found:`);
    for (const issue of issues) console.error(`  ${issue}`);
    pass = false;
  } else {
    const importedCount = Object.values(EXPECTED).filter((s) => s === "imported").length;
    const needsReviewCount = Object.values(EXPECTED).filter((s) => s === "needs_review").length;
    console.log(`  ✓ All ${TOTAL_EXPECTED} externalIds present in DB`);
    console.log(`  ✓ ${importedCount} programs with status "imported"`);
    console.log(`  ✓ ${needsReviewCount} programs with status "needs_review"`);
    console.log(`  ✓ All programs have non-null sourceUrl`);
    console.log(`  ✓ All programs have non-null lastVerified`);
    console.log(`  ✓ All programs have non-empty prereqCourses`);
  }

  if (pass) {
    console.log(`\n✓ All checks passed.`);
    process.exit(0);
  } else {
    console.error(`\n✗ Some checks failed. Re-run the import:`);
    console.error(`  pnpm --filter @workspace/scripts run import:caa-pa`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
