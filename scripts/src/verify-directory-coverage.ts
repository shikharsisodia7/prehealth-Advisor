/**
 * verify-directory-coverage.ts
 * ----------------------------
 * Authoritative directory-coverage gate.
 *
 * Failure conditions (exit 1):
 *   1. A profession in professionsTable has NO complete source in
 *      directory_sources, unless it is in APPROVED_BLOCKED.
 *   2. A profession in professionsTable has ZERO active programs in
 *      program_schools, unless it is in APPROVED_BLOCKED.
 *   3. A profession has an unexpected "blocked" source row (i.e. blocked
 *      source exists for a slug not in APPROVED_BLOCKED).
 *   4. A complete source's program count disagrees with the DB count by
 *      more than RECONCILE_TOLERANCE (surfaced as a warning, not a hard
 *      failure — the source figure may include international programs we
 *      deliberately exclude).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts exec tsx src/verify-directory-coverage.ts
 */

import {
  db,
  professionsTable,
  directorySourcesTable,
  programSchoolsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Profession slugs whose directories are known/approved to be blocked.
 * Any slug listed here is exempt from the "must have a complete source"
 * and "must have active programs" requirements.
 * Changing this list requires updating record-blockers.ts in lockstep.
 */
const APPROVED_BLOCKED = new Set<string>();

/** Tolerate up to this many extra programs in the source count vs DB count
 *  (international, inactive, or duplicate-campus rows the source includes
 *  but we intentionally exclude). */
const RECONCILE_TOLERANCE = 15;

async function main() {
  const professions = await db.select().from(professionsTable);
  const sources = await db.select().from(directorySourcesTable);
  const activePrograms = await db
    .select()
    .from(programSchoolsTable)
    .then((rows) => rows.filter((r) => r.directoryStatus === "active"));

  // Index sources by professionSlug
  const sourcesBySlug = new Map<
    string,
    { complete: typeof sources; blocked: typeof sources }
  >();
  for (const s of sources) {
    if (!sourcesBySlug.has(s.professionSlug)) {
      sourcesBySlug.set(s.professionSlug, { complete: [], blocked: [] });
    }
    const bucket = sourcesBySlug.get(s.professionSlug)!;
    if (s.coverageStatus === "complete") bucket.complete.push(s);
    else if (s.coverageStatus === "blocked") bucket.blocked.push(s);
  }

  // Index active program counts by professionSlug
  const activeCounts = new Map<string, number>();
  for (const p of activePrograms) {
    activeCounts.set(p.professionSlug, (activeCounts.get(p.professionSlug) ?? 0) + 1);
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const lines: string[] = [];

  for (const prof of professions.sort((a, b) => a.slug.localeCompare(b.slug))) {
    const { slug } = prof;
    const approved = APPROVED_BLOCKED.has(slug);
    const bucket = sourcesBySlug.get(slug) ?? { complete: [], blocked: [] };
    const count = activeCounts.get(slug) ?? 0;

    // Unexpected blocked source?
    if (!approved && bucket.blocked.length > 0) {
      for (const b of bucket.blocked) {
        errors.push(
          `[${slug}] Unexpected blocked source: "${b.sourceName}"`,
        );
      }
    }

    // Must have at least one complete source (unless approved exempt)
    if (!approved && bucket.complete.length === 0) {
      errors.push(
        `[${slug}] No complete directory source found (and not in APPROVED_BLOCKED).`,
      );
    }

    // Must have active programs (unless approved exempt)
    if (!approved && count === 0) {
      errors.push(`[${slug}] Zero active programs in DB.`);
    }

    // Reconciliation check: sum of all complete source-reported totals vs DB count.
    // Sources are summed because a single profession can have multiple sources
    // covering distinct degree types (e.g. MD + DO, ABSN + MEPN, MOT + OTD).
    const reportedTotals = bucket.complete
      .map((s) => parseInt(s.sourceProgramCount ?? "", 10))
      .filter((n) => !isNaN(n));
    if (reportedTotals.length > 0) {
      const reportedSum = reportedTotals.reduce((a, b) => a + b, 0);
      const delta = reportedSum - count; // positive = sources report more than DB
      if (delta < -RECONCILE_TOLERANCE) {
        errors.push(
          `[${slug}] DB has notably more programs (${count}) than sources report combined (${reportedSum}) — possible duplicate inserts.`,
        );
      } else if (delta > RECONCILE_TOLERANCE) {
        warnings.push(
          `[${slug}] Sources report ${reportedSum} combined; DB has ${count} active (delta ${delta} > tolerance ${RECONCILE_TOLERANCE}). May include international/inactive programs intentionally excluded.`,
        );
      }
    }

    const status = approved
      ? bucket.blocked.length > 0
        ? "blocked (approved)"
        : "approved-exempt"
      : bucket.complete.length > 0
        ? "complete"
        : "MISSING";
    lines.push(
      `  ${slug.padEnd(30)} ${String(count).padStart(4)} programs  [${status}]`,
    );
  }

  console.log("\n=== Directory coverage verification ===\n");
  for (const line of lines) console.log(line);

  const totalActive = activePrograms.length;
  console.log(`\nTotal active programs in DB: ${totalActive}`);

  if (warnings.length > 0) {
    console.log("\n⚠ Reconciliation warnings (investigate, not hard failures):");
    for (const w of warnings) console.log("  " + w);
  }

  if (errors.length > 0) {
    console.error("\n❌ Verification FAILED:");
    for (const e of errors) console.error("  " + e);
    process.exit(1);
  }

  console.log(
    `\n✅ All ${professions.length - APPROVED_BLOCKED.size} non-exempt professions have complete directory coverage.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
