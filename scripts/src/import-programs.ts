/**
 * import-programs.ts
 * -------------------
 * Import program school prerequisite data from a CSV or JSON file.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts exec tsx src/import-programs.ts path/to/file.csv
 *   pnpm --filter @workspace/scripts exec tsx src/import-programs.ts path/to/file.json
 *
 * Supported field names (CSV header or JSON keys):
 *   profession          – required (slug: "medicine", "physical-therapy", "nursing", …)
 *   degree_type         – required for nursing ("ABSN" or "MEPN"); optional otherwise
 *   school_name         – required
 *   program_name        – required
 *   city                – optional
 *   state               – required (2-letter code)
 *   requirement_name    – required (one row per prerequisite)
 *   requirement_details – optional
 *   course_count        – optional integer
 *   semester_credits    – optional number
 *   quarter_credits     – optional number
 *   lab_required        – optional ("true"/"yes"/1 → true; "false"/"no"/0 → false)
 *   other_conditions    – optional
 *   classification      – optional (default "required"); one of:
 *                         required | recommended | preferred |
 *                         informational | unclear | needs_review
 *   official_source_url – required
 *   last_verified       – optional (YYYY-MM-DD)
 *   verification_status – optional; controls how the record status is set:
 *                         • "no_prereqs_published" → record status set to
 *                           "no_prereqs_published" on both inserts and merges
 *                           (use for programs with a confirmed empty prereq list).
 *                         • any other value, or absent → "imported" normally;
 *                           EXCEPTION: when ALL prereq rows for a school have
 *                           classification="informational", the record is set to
 *                           "needs_review" instead (blocked/inaccessible sites).
 *   internal_notes      – optional (stored in details if requirement_details absent)
 *   external_id         – optional; when provided, used as the primary lookup key
 *                         to match the existing directory record instead of name
 *
 * Rules:
 *   - Rows missing any required field are flagged and skipped.
 *   - Duplicate school+profession rows are merged (prereqs appended).
 *   - Imported rows receive verificationStatus = "imported".
 *     EXCEPTION: schools where every prereq row is informational get
 *     verificationStatus = "needs_review" (blocked/inaccessible source).
 *   - Existing "verified" records for the same school are not overwritten.
 */

import fs from "node:fs";
import path from "node:path";
import { db, programSchoolsTable, type InsertProgramSchool } from "@workspace/db";
import type { PrereqItem } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";

// ── CSV parser (minimal, handles quoted fields) ────────────────────────────

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let inQuotes = false;
  let current = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsv(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/\s+/g, "_"),
  );
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] ?? "").trim();
    });
    return row;
  });
}

// ── Field validation + coercion ────────────────────────────────────────────

const REQUIRED_FIELDS = [
  "profession",
  "school_name",
  "program_name",
  "state",
  "requirement_name",
  "official_source_url",
];

const VALID_CLASSIFICATIONS = [
  "required",
  "recommended",
  "preferred",
  "informational",
  "unclear",
  "needs_review",
] as const;

type Classification = (typeof VALID_CLASSIFICATIONS)[number];

function coerceBool(v: string | undefined): boolean | undefined {
  if (!v) return undefined;
  if (/^(true|yes|1)$/i.test(v)) return true;
  if (/^(false|no|0)$/i.test(v)) return false;
  return undefined;
}

function coerceNumber(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}

function coerceInt(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return isNaN(n) ? undefined : n;
}

// ── Import logic ───────────────────────────────────────────────────────────

interface ParsedRow {
  externalId?: string;
  profession: string;
  degreeType?: string;
  schoolName: string;
  programName: string;
  city?: string;
  state: string;
  requirementName: string;
  requirementDetails?: string;
  courseCount?: number;
  semesterCredits?: number;
  quarterCredits?: number;
  labRequired?: boolean;
  otherConditions?: string;
  classification: Classification;
  /** When "no_prereqs_published", the record status is set to that value
   *  on both inserts and merges, regardless of prerequisite classification. */
  inputVerificationStatus?: "no_prereqs_published";
  sourceUrl: string;
  lastVerified?: string;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: tsx import-programs.ts <file.csv|file.json>");
    process.exit(1);
  }

  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(absPath, "utf-8");
  const ext = path.extname(absPath).toLowerCase();

  let rawRows: Record<string, string>[];
  if (ext === ".json") {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      console.error("JSON file must be an array of objects.");
      process.exit(1);
    }
    rawRows = parsed.map((r: Record<string, unknown>) => {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(r)) {
        out[k.toLowerCase().replace(/\s+/g, "_")] = String(v ?? "").trim();
      }
      return out;
    });
  } else if (ext === ".csv") {
    rawRows = parseCsv(content);
  } else {
    console.error("Unsupported file type. Use .csv or .json");
    process.exit(1);
  }

  console.log(`Parsed ${rawRows.length} row(s) from ${absPath}`);

  // Validate and parse rows
  const valid: ParsedRow[] = [];
  let skipped = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const lineNum = i + 2; // 1-based + header
    const missing: string[] = [];

    for (const field of REQUIRED_FIELDS) {
      if (!row[field]) missing.push(field);
    }

    if (missing.length > 0) {
      console.warn(`  ⚠ Row ${lineNum}: skipped — missing required fields: ${missing.join(", ")}`);
      skipped++;
      continue;
    }

    const rawClassification = row.classification || "required";
    if (!VALID_CLASSIFICATIONS.includes(rawClassification as Classification)) {
      console.warn(
        `  ⚠ Row ${lineNum}: invalid classification "${rawClassification}" — defaulting to "required"`,
      );
    }
    const classification: Classification = VALID_CLASSIFICATIONS.includes(
      rawClassification as Classification,
    )
      ? (rawClassification as Classification)
      : "required";

    valid.push({
      externalId: row.external_id || undefined,
      profession: row.profession,
      degreeType: row.degree_type || undefined,
      schoolName: row.school_name,
      programName: row.program_name,
      city: row.city || undefined,
      state: row.state.toUpperCase(),
      requirementName: row.requirement_name,
      requirementDetails:
        row.requirement_details || row.internal_notes || undefined,
      courseCount: coerceInt(row.course_count),
      semesterCredits: coerceNumber(row.semester_credits),
      quarterCredits: coerceNumber(row.quarter_credits),
      labRequired: coerceBool(row.lab_required),
      otherConditions: row.other_conditions || undefined,
      classification,
      inputVerificationStatus:
        row.verification_status === "no_prereqs_published"
          ? "no_prereqs_published"
          : undefined,
      sourceUrl: row.official_source_url,
      lastVerified: row.last_verified || undefined,
    });
  }

  console.log(`  ${valid.length} valid row(s), ${skipped} skipped`);
  if (valid.length === 0) {
    console.log("Nothing to import.");
    process.exit(0);
  }

  // Group by stable identity: prefer externalId, else profession+schoolName+programName
  const bySchool = new Map<string, ParsedRow[]>();
  for (const row of valid) {
    const key = row.externalId
      ? `extid:${row.externalId}`
      : `${row.profession}||${row.schoolName}||${row.programName}`;
    const existing = bySchool.get(key) ?? [];
    existing.push(row);
    bySchool.set(key, existing);
  }

  let inserted = 0;
  let skippedVerified = 0;
  let merged = 0;

  for (const [key, rows] of bySchool) {
    const first = rows[0];
    const schoolKey = `${first.profession}/${first.schoolName}`;

    // Look up the existing record — by externalId first (stable), then by name
    let existing;
    if (first.externalId) {
      // Scope lookup by BOTH profession and externalId — externalIds are not
      // globally unique across professions (two different accreditors can issue
      // the same code for different programs).
      existing = await db
        .select()
        .from(programSchoolsTable)
        .where(
          and(
            eq(programSchoolsTable.professionSlug, first.profession),
            eq(programSchoolsTable.externalId, first.externalId),
          ),
        );

      if (existing.length === 0) {
        // externalId not found — fall back to name so we can still match
        console.warn(
          `  ⚠ externalId "${first.externalId}" not in DB — falling back to name match for "${schoolKey}"`,
        );
        existing = await db
          .select()
          .from(programSchoolsTable)
          .where(
            and(
              eq(programSchoolsTable.professionSlug, first.profession),
              eq(programSchoolsTable.name, first.schoolName),
              isNull(programSchoolsTable.externalId),
            ),
          );
      }
    } else {
      existing = await db
        .select()
        .from(programSchoolsTable)
        .where(
          and(
            eq(programSchoolsTable.professionSlug, first.profession),
            eq(programSchoolsTable.name, first.schoolName),
          ),
        );
    }

    const verifiedRecord = existing.find(
      (r) => r.verificationStatus === "verified",
    );
    if (verifiedRecord) {
      console.log(
        `  ↳ Skipping "${schoolKey}" — verified record already exists (id=${verifiedRecord.id}). Update manually.`,
      );
      skippedVerified++;
      continue;
    }

    // Build prereq items
    const prereqCourses: PrereqItem[] = rows.map((r) => ({
      name: r.requirementName,
      details: r.requirementDetails ?? null,
      classification: r.classification,
      labRequired: r.labRequired,
      courseCount: r.courseCount,
      semesterCredits: r.semesterCredits,
      quarterCredits: r.quarterCredits,
      otherConditions: r.otherConditions,
    }));

    const draftRecord = existing.find(
      (r) =>
        r.verificationStatus === "imported" ||
        r.verificationStatus === "draft" ||
        r.verificationStatus === "needs_review" ||
        r.verificationStatus === "no_prereqs_published",
    );

    // Determine the target status (priority order):
    // 1. If the input rows carry verification_status="no_prereqs_published",
    //    use that — the program is confirmed to not publish specific prerequisites.
    //    This also preserves the status when an existing DB record has it.
    // 2. If ALL incoming prereqs are informational → "needs_review"
    //    (blocked/inaccessible source needing manual resolution).
    // 3. Otherwise → "imported" (real prereq data pending human verification).
    const allInformational =
      prereqCourses.length > 0 &&
      prereqCourses.every((p) => p.classification === "informational");
    const targetStatus =
      first.inputVerificationStatus === "no_prereqs_published" ||
      draftRecord?.verificationStatus === "no_prereqs_published"
        ? "no_prereqs_published"
        : allInformational
          ? "needs_review"
          : "imported";

    if (draftRecord) {
      // Replace prereqs (full overwrite on re-import, deduplicating by name)
      const dedupedPrereqs = prereqCourses.reduce<PrereqItem[]>((acc, p) => {
        if (!acc.some((e) => e.name === p.name)) acc.push(p);
        return acc;
      }, []);
      await db
        .update(programSchoolsTable)
        .set({
          prereqCourses: dedupedPrereqs,
          verificationStatus: targetStatus,
          sourceUrl: first.sourceUrl,
          lastVerified: first.lastVerified ?? draftRecord.lastVerified,
        })
        .where(eq(programSchoolsTable.id, draftRecord.id));
      console.log(`  ↳ Merged "${schoolKey}" into existing draft (id=${draftRecord.id}) → ${targetStatus}`);
      merged++;
    } else {
      // Insert new record — only reached when no directory record exists at all
      const insertData: InsertProgramSchool = {
        professionSlug: first.profession,
        externalId: first.externalId ?? null,
        name: first.schoolName,
        programName: first.programName,
        city: first.city,
        state: first.state,
        degreeType: first.degreeType ?? null,
        sourceUrl: first.sourceUrl,
        lastVerified: first.lastVerified ?? null,
        verificationStatus: targetStatus,
        prereqCourses,
      };
      await db.insert(programSchoolsTable).values(insertData);
      console.log(`  ↳ Inserted "${schoolKey}" with ${prereqCourses.length} prerequisite(s) → ${targetStatus}`);
      inserted++;
    }
  }

  console.log(`\nImport complete.`);
  console.log(`  Inserted:         ${inserted}`);
  console.log(`  Merged:           ${merged}`);
  console.log(`  Skipped (verified): ${skippedVerified}`);
  console.log(`  Skipped (invalid):  ${skipped}`);
  console.log(
    `\nImported records are set to "imported" (real prereqs) or "needs_review" (blocked sources).`,
  );
  console.log(
    `A human reviewer must confirm "imported" requirements against official sources`,
  );
  console.log(`before setting verificationStatus="verified".`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
