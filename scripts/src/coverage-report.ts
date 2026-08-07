/**
 * coverage-report.ts
 * Produces a machine-readable reconciliation report comparing each
 * profession's authoritative directory source count against what is actually
 * in the database. Written to data/coverage-report.json at the repo root.
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/coverage-report.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, professionsTable, programSchoolsTable, directorySourcesTable } from "@workspace/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../../data/coverage-report.json");

async function main() {
  const professions = await db.select().from(professionsTable);
  const programs = await db.select().from(programSchoolsTable);
  const sources = await db.select().from(directorySourcesTable);

  const report = {
    generatedAt: new Date().toISOString(),
    professions: professions
      .map((prof) => {
        const rows = programs.filter((p) => p.professionSlug === prof.slug);
        const active = rows.filter((r) => r.directoryStatus === "active");
        const activeFromDirectory = active.filter((r) => !!r.directorySource);
        const activeManual = active.filter((r) => !r.directorySource);
        const profSources = sources.filter((s) => s.professionSlug === prof.slug);
        const sourceTotal = profSources.reduce((acc, s) => {
          const n = parseInt(s.sourceProgramCount ?? "", 10);
          return isNaN(n) ? acc : acc + n;
        }, 0);
        const anyBlocked = profSources.some((s) => s.coverageStatus === "blocked");
        const anyComplete = profSources.some((s) => s.coverageStatus === "complete");
        // Strict reconciliation: directory-attributed active rows must exactly
        // match the summed source counts (international/out-of-scope entries are
        // excluded at import time and documented in source notes). Manual rows
        // (verified seed programs outside the imported directory scope) are
        // reported separately, never silently counted as directory coverage.
        const delta = activeFromDirectory.length - sourceTotal;
        const status =
          anyBlocked && !anyComplete
            ? "directory-not-populated-source-blocked"
            : !anyComplete
              ? "no-source-recorded"
              : delta === 0
                ? "reconciled"
                : delta < 0
                  ? "under-source-count"
                  : "over-source-count";
        return {
          professionSlug: prof.slug,
          professionName: prof.name,
          directoryPrograms: active.length,
          directoryAttributedPrograms: activeFromDirectory.length,
          manualPrograms: activeManual.map((r) => ({
            name: r.name,
            state: r.state,
            verificationStatus: r.verificationStatus,
            note: "Active row not attributed to an imported directory source (verified program outside the imported directory scope, or awaiting attribution).",
          })),
          inactivePrograms: rows.length - active.length,
          prereqStatusCounts: active.reduce<Record<string, number>>((acc, r) => {
            acc[r.verificationStatus] = (acc[r.verificationStatus] ?? 0) + 1;
            return acc;
          }, {}),
          prereqVerifiedCount: active.filter((r) => r.verificationStatus === "verified").length,
          prereqVerifiedPct: active.length
            ? Math.round(
                (active.filter((r) => r.verificationStatus === "verified").length /
                  active.length) *
                  1000,
              ) / 10
            : null,
          sources: profSources.map((s) => ({
            name: s.sourceName,
            url: s.sourceUrl,
            retrievedAt: s.retrievedAt,
            sourceProgramCount: s.sourceProgramCount,
            coverageStatus: s.coverageStatus,
            notes: s.notes,
          })),
          reconciliation: {
            sourceReportedTotal: sourceTotal || null,
            inDatabase: active.length,
            directoryAttributed: activeFromDirectory.length,
            delta: anyComplete ? delta : null,
            status,
          },
        };
      })
      .sort((a, b) => a.professionSlug.localeCompare(b.professionSlug)),
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`Wrote ${OUT}`);
  for (const p of report.professions) {
    console.log(
      `  ${p.professionSlug}: ${p.directoryPrograms} in directory — ${p.reconciliation.status}`,
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
