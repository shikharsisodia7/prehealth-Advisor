/**
 * tmp-upsert-by-id.ts
 * --------------------
 * Same behavior as upsert-prereq-batch.ts but matches DB rows by exact
 * primary key `id` instead of (professionSlug, name). Needed because many
 * postbac rows share an institution `name` (e.g. 6 different Drexel
 * University College of Medicine programs) — name-based matching risks
 * silently applying one program's course list to a different program's row.
 * The batch id must be the row's real, current-DB `id` (as returned by
 * tmp-list-unfinished.ts), not an id from an old export.
 *
 * Run: npx tsx src/tmp-upsert-by-id.ts <batch-file.json>
 */
import fs from "node:fs";
import path from "node:path";
import { db, programSchoolsTable, type PrereqItem, type PrereqSource } from "@workspace/db";
import { eq } from "drizzle-orm";

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
  if (!file) throw new Error("Usage: tsx src/tmp-upsert-by-id.ts <batch-file.json>");
  const batch: BatchProgram[] = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));

  let ok = 0;
  for (const p of batch) {
    if (!p.hasPrereqList || p.courses.length === 0) {
      console.log(`SKIP ${p.id} ${p.institution} — no prereq list extracted`);
      continue;
    }
    const [row] = await db
      .select()
      .from(programSchoolsTable)
      .where(eq(programSchoolsTable.id, p.id));
    if (!row) {
      console.log(`MISSING ${p.id} ${p.institution} — no DB row with this id`);
      continue;
    }
    if (row.verificationStatus === "verified" && (row.prereqCourses?.length ?? 0) > 0) {
      console.log(`ALREADY VERIFIED ${p.id} ${row.name} (${row.prereqCourses!.length} courses) — leaving intact`);
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
    console.log(`OK ${p.id} -> db id=${row.id} ${row.name}: ${items.length} courses, verified`);
  }
  console.log(`Done — ${ok} program(s) upserted and read-back verified.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
