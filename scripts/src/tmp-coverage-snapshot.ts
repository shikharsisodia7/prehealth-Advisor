import { db, programSchoolsTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";

async function main() {
  const rows = await db
    .select({
      professionSlug: programSchoolsTable.professionSlug,
      verificationStatus: programSchoolsTable.verificationStatus,
      count: sql<number>`count(*)`,
    })
    .from(programSchoolsTable)
    .where(eq(programSchoolsTable.directoryStatus, "active"))
    .groupBy(programSchoolsTable.professionSlug, programSchoolsTable.verificationStatus);

  const byProfession: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    byProfession[r.professionSlug] ??= {};
    byProfession[r.professionSlug][r.verificationStatus] = Number(r.count);
  }

  const summary = Object.entries(byProfession)
    .map(([slug, statuses]) => {
      const total = Object.values(statuses).reduce((a, b) => a + b, 0);
      const finalized = (statuses.verified ?? 0) + (statuses.no_prereqs_published ?? 0);
      const unfinished = total - finalized;
      return { slug, total, finalized, unfinished, statuses };
    })
    .sort((a, b) => b.unfinished - a.unfinished);

  let grandTotal = 0, grandFinalized = 0, grandUnfinished = 0;
  for (const s of summary) {
    console.log(
      `${s.slug.padEnd(25)} total=${String(s.total).padStart(4)} finalized=${String(s.finalized).padStart(4)} unfinished=${String(s.unfinished).padStart(4)} ${JSON.stringify(s.statuses)}`,
    );
    grandTotal += s.total;
    grandFinalized += s.finalized;
    grandUnfinished += s.unfinished;
  }
  console.log(`\nGRAND TOTAL: total=${grandTotal} finalized=${grandFinalized} unfinished=${grandUnfinished} coverage=${((grandFinalized / grandTotal) * 100).toFixed(1)}%`);
  process.exit(0);
}
main();
