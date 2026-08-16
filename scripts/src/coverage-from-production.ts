/**
 * coverage-from-production.ts
 * ---------------------------
 * Regenerates data/coverage-report.json + .md from the live production API
 * when DATABASE_URL is unavailable on this machine. Preserves directory
 * source / reconciliation metadata from the previous report.
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/coverage-from-production.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "data/coverage-report.json");
const OUT_MD = path.join(ROOT, "data/coverage-report.md");
const BASE = process.env.PRODUCTION_API_BASE || "https://prehealth-advisor.vercel.app/api";

type PrevProfession = {
  professionSlug: string;
  professionName: string;
  directoryAttributedPrograms?: number;
  manualPrograms?: unknown[];
  inactivePrograms?: number;
  sources?: unknown[];
  reconciliation?: {
    sourceReportedTotal: number | null;
    inDatabase: number;
    directoryAttributed: number;
    delta: number;
    status: string;
  };
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function main() {
  const prev: { professions?: PrevProfession[] } = fs.existsSync(OUT)
    ? JSON.parse(fs.readFileSync(OUT, "utf8"))
    : { professions: [] };
  const prevBySlug = new Map((prev.professions ?? []).map((p) => [p.professionSlug, p]));

  const professions = await fetchJson<Array<{ slug: string; name: string }>>(`${BASE}/professions`);
  const reportProfessions = [];

  for (const prof of professions) {
    const rows = await fetchJson<
      Array<{ verificationStatus?: string; directoryStatus?: string }>
    >(`${BASE}/program-schools?professionSlug=${encodeURIComponent(prof.slug)}`);
    const active = rows.filter((r) => !r.directoryStatus || r.directoryStatus === "active");
    const verified = active.filter((r) => r.verificationStatus === "verified");
    const noSpecific = active.filter((r) => r.verificationStatus === "no_prereqs_published");
    const blocked = active.filter((r) =>
      ["source_blocked", "unavailable"].includes(r.verificationStatus ?? ""),
    );
    const unfinished = active.filter((r) =>
      ["draft", "imported", "needs_review", "outdated"].includes(r.verificationStatus ?? ""),
    );
    const counts: Record<string, number> = {};
    for (const r of active) {
      const st = r.verificationStatus ?? "unknown";
      counts[st] = (counts[st] ?? 0) + 1;
    }
    const prior = prevBySlug.get(prof.slug);
    const pct = active.length
      ? Math.round(((verified.length + noSpecific.length) / active.length) * 1000) / 10
      : null;
    reportProfessions.push({
      professionSlug: prof.slug,
      professionName: prior?.professionName ?? prof.name,
      directoryPrograms: active.length,
      directoryAttributedPrograms: prior?.directoryAttributedPrograms ?? active.length,
      manualPrograms: prior?.manualPrograms ?? [],
      inactivePrograms: prior?.inactivePrograms ?? 0,
      prereqStatusCounts: counts,
      prereqVerifiedCount: verified.length,
      prereqNoSpecificPrereqsCount: noSpecific.length,
      prereqBlockedCount: blocked.length,
      prereqUnfinishedCount: unfinished.length,
      prereqVerifiedPct: pct,
      sources: prior?.sources ?? [],
      reconciliation: prior?.reconciliation ?? {
        sourceReportedTotal: null,
        inDatabase: active.length,
        directoryAttributed: active.length,
        delta: 0,
        status: "unknown-without-db",
      },
    });
  }

  reportProfessions.sort((a, b) => a.professionName.localeCompare(b.professionName));
  const report = {
    generatedAt: new Date().toISOString(),
    generatedFrom: "production-api",
    professions: reportProfessions,
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");

  const lines = [
    "# Prerequisite Coverage Audit",
    "",
    `Generated: ${report.generatedAt} (from live production API)`,
    "",
    "| Profession | Active | Verified | No specific courses | Blocked | Unfinished | Final-status coverage | Directory reconciliation |",
    "|---|---:|---:|---:|---:|---:|---:|---|",
  ];
  for (const p of reportProfessions) {
    const recon = p.reconciliation?.status ?? "unknown";
    lines.push(
      `| ${p.professionName} | ${p.directoryPrograms} | ${p.prereqVerifiedCount} | ${p.prereqNoSpecificPrereqsCount} | ${p.prereqBlockedCount} | ${p.prereqUnfinishedCount} | ${p.prereqVerifiedPct ?? 0}% | ${recon} |`,
    );
  }
  const unfinished = reportProfessions.reduce((a, p) => a + p.prereqUnfinishedCount, 0);
  const verified = reportProfessions.reduce((a, p) => a + p.prereqVerifiedCount, 0);
  const nsp = reportProfessions.reduce((a, p) => a + p.prereqNoSpecificPrereqsCount, 0);
  const active = reportProfessions.reduce((a, p) => a + p.directoryPrograms, 0);
  lines.push(
    "",
    "## Totals",
    "",
    `- Active programs: ${active}`,
    `- Verified: ${verified}`,
    `- No specific courses: ${nsp}`,
    `- Unfinished: ${unfinished}`,
    `- Final-status coverage: ${active ? Math.round(((verified + nsp) / active) * 1000) / 10 : 0}%`,
    "",
    "## Remaining externally blocked programs",
    "",
  );
  fs.writeFileSync(OUT_MD, lines.join("\n") + "\n");
  console.log(
    `Wrote coverage from production: active=${active} verified=${verified} nsp=${nsp} unfinished=${unfinished}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
