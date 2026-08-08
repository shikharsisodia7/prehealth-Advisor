/**
 * upsert-prereq-batch.ts
 * ----------------------
 * Generic idempotent upsert of machine-extracted prerequisite records.
 * Reads a batch JSON file (array of {id, institution, sourceUrl, courses, otherConditions})
 * produced by the extraction pipeline, writes prereqCourses + provenance, sets
 * verificationStatus = "verified" with an explicit machine-verification note,
 * and performs a post-write read-back assertion (status, sourceUrl, course count).
 *
 * The batch file's numeric `id` is the ORIGINAL database's row id at the time
 * of extraction — it is NOT portable across a rebuilt/reseeded database where
 * auto-increment ids are assigned in a different order. Rows are therefore
 * looked up by exact (professionSlug, name) match, the same identity import-
 * directory.ts relies on; `id` is retained only for log messages. When more
 * than one batch row maps to a single reconciled directory row (duplicate
 * campus entries later consolidated), only the first is applied and the rest
 * are logged as skipped rather than guessed at.
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/upsert-prereq-batch.ts <batch-file.json> [professionSlug]
 * Safe to re-run.
 */
import fs from "node:fs";
import path from "node:path";
import { db, programSchoolsTable, type PrereqItem, type PrereqSource } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const TODAY = new Date().toISOString().slice(0, 10);

interface BatchCourse {
  name: string;
  classification: string;
  labRequired?: boolean;
  semesterCredits?: string;
  quarterCredits?: string;
  courseCount?: string;
  minGrade?: string;
  details?: string;
}
interface BatchProgram {
  id: number;
  institution: string;
  sourceUrl: string;
  hasPrereqList: boolean;
  otherConditions?: string | null;
  courses: BatchCourse[];
}

function num(s?: string): number | null {
  if (!s) return null;
  const m = String(s).match(/[\d.]+/);
  return m ? Number(m[0]) : null;
}

function toItem(c: BatchCourse): PrereqItem {
  const cls = ["required", "recommended", "preferred", "informational", "unclear"].includes(
    c.classification,
  )
    ? (c.classification as PrereqItem["classification"])
    : c.classification === "conditional"
      ? "unclear"
      : "needs_review";
  const detailParts = [c.details, c.minGrade ? `Minimum grade: ${c.minGrade}` : null].filter(
    Boolean,
  );
  return {
    name: c.name,
    classification: cls,
    details: detailParts.length ? detailParts.join(". ") : null,
    labRequired: c.labRequired ?? null,
    courseCount: num(c.courseCount),
    semesterCredits: num(c.semesterCredits),
    quarterCredits: num(c.quarterCredits),
    otherConditions: null,
  };
}

async function main() {
  const file = process.argv[2];
  const professionSlug = process.argv[3] ?? "physical-therapy";
  if (!file) throw new Error("Usage: tsx src/upsert-prereq-batch.ts <batch-file.json> [professionSlug]");
  const batch: BatchProgram[] = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));

  const appliedNames = new Set<string>();
  let ok = 0;
  for (const p of batch) {
    if (!p.hasPrereqList || p.courses.length === 0) {
      console.log(`SKIP ${p.id} ${p.institution} — no prereq list extracted`);
      continue;
    }
    const matches = await db
      .select()
      .from(programSchoolsTable)
      .where(
        and(
          eq(programSchoolsTable.professionSlug, professionSlug),
          eq(programSchoolsTable.name, p.institution),
        ),
      );
    if (matches.length === 0) {
      console.log(`MISSING ${p.id} ${p.institution} — no DB row matches this name in ${professionSlug}`);
      continue;
    }
    if (matches.length > 1) {
      console.log(
        `AMBIGUOUS ${p.id} ${p.institution} — ${matches.length} rows share this name; applying to the first (id=${matches[0].id}) only`,
      );
    }
    const row = matches[0];
    if (appliedNames.has(p.institution)) {
      console.log(`DUPLICATE ${p.id} ${p.institution} — directory has a single reconciled row already updated by an earlier batch entry; skipping`);
      continue;
    }
    if (row.verificationStatus === "verified" && (row.prereqCourses?.length ?? 0) > 0) {
      console.log(`ALREADY VERIFIED ${p.id} ${row.name} (${row.prereqCourses!.length} courses) — leaving intact`);
      appliedNames.add(p.institution);
      continue;
    }
    const items = p.courses.map(toItem);
    const existingSources: PrereqSource[] = (row.prereqSources as PrereqSource[]) ?? [];
    const newSource: PrereqSource = {
      url: p.sourceUrl,
      title: null,
      sourceType: p.sourceUrl.endsWith(".pdf") ? "handbook_pdf" : "program_page",
      retrievedAt: TODAY,
      contentHash: null,
      extractionMethod: p.sourceUrl.endsWith(".pdf") ? "pdf_text" : "http",
    };
    const sources = existingSources.some((s) => s.url === newSource.url)
      ? existingSources
      : [...existingSources, newSource];

    await db
      .update(programSchoolsTable)
      .set({
        prereqCourses: items,
        prereqSources: sources,
        sourceUrl: p.sourceUrl,
        lastVerified: TODAY,
        verificationStatus: "verified",
        verificationNote:
          "Machine-verified from official source, no human review. " +
          (p.otherConditions ? `Page conditions: ${p.otherConditions}` : ""),
      })
      .where(eq(programSchoolsTable.id, row.id));

    // Post-write read-back assertion
    const [check] = await db
      .select()
      .from(programSchoolsTable)
      .where(eq(programSchoolsTable.id, row.id));
    const good =
      check?.verificationStatus === "verified" &&
      check?.sourceUrl === p.sourceUrl &&
      (check?.prereqCourses?.length ?? 0) === items.length;
    if (!good) {
      throw new Error(
        `READ-BACK FAILED for ${p.id}: status=${check?.verificationStatus} url=${check?.sourceUrl} courses=${check?.prereqCourses?.length}`,
      );
    }
    ok++;
    appliedNames.add(p.institution);
    console.log(`OK ${p.id} -> db id=${row.id} ${row.name}: ${items.length} courses, verified`);
  }
  console.log(`Done — ${ok} program(s) upserted and read-back verified.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
