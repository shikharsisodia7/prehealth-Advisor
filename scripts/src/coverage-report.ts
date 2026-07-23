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
        const profSources = sources.filter((s) => s.professionSlug === prof.slug);
        const sourceTotal = profSources.reduce((acc, s) => {
          const n = parseInt(s.sourceProgramCount ?? "", 10);
          return isNaN(n) ? acc : acc + n;
        }, 0);
        const anyBlocked = profSources.some((s) => s.coverageStatus === "blocked");
        const anyComplete = profSources.some((s) => s.coverageStatus === "complete");
        return {
          professionSlug: prof.slug,
          professionName: prof.name,
          directoryPrograms: active.length,
          inactivePrograms: rows.length - active.length,
          prereqStatusCounts: rows.reduce<Record<string, number>>((acc, r) => {
            acc[r.verificationStatus] = (acc[r.verificationStatus] ?? 0) + 1;
            return acc;
          }, {}),
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
            status: anyBlocked && !anyComplete
              ? "directory-not-populated-source-blocked"
              : anyComplete
                ? active.length >= sourceTotal
                  ? "reconciled"
                  : "under-source-count"
                : "no-source-recorded",
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
