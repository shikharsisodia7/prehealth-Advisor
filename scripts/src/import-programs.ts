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
 *   verification_status – optional; always overridden to "imported" on import
 *   internal_notes      – optional (stored in details if requirement_details absent)
 *
 * Rules:
 *   - Rows missing any required field are flagged and skipped.
 *   - Duplicate school+profession rows are merged (prereqs appended).
 *   - Imported rows always receive verificationStatus = "imported"
 *     (never auto-verified; a human reviewer must set it to "verified").
 *   - Existing "verified" records for the same school are not overwritten.
 */

import fs from "node:fs";
import path from "node:path";
import { db, programSchoolsTable, type InsertProgramSchool } from "@workspace/db";
import type { PrereqItem } from "@workspace/db";
import { mergeDraftRecord } from "./merge-utils.js";
import { eq, and } from "drizzle-orm";

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
      sourceUrl: row.official_source_url,
      lastVerified: row.last_verified || undefined,
    });
  }

  console.log(`  ${valid.length} valid row(s), ${skipped} skipped`);
  if (valid.length === 0) {
    console.log("Nothing to import.");
    process.exit(0);
  }

  // Group by school (profession + school_name + program_name)
  const bySchool = new Map<string, ParsedRow[]>();
  for (const row of valid) {
    const key = `${row.profession}||${row.schoolName}||${row.programName}`;
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

    // Check if a verified record already exists for this school+profession
    const existing = await db
      .select()
      .from(programSchoolsTable)
      .where(
        and(
          eq(programSchoolsTable.professionSlug, first.profession),
          eq(programSchoolsTable.name, first.schoolName),
        ),
      );

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
      (r) => r.verificationStatus === "imported" || r.verificationStatus === "draft",
    );

    if (draftRecord) {
      // Merge prereqs into existing draft (pure logic in merge-utils.ts,
      // covered by regression tests — source URL must never be dropped).
      const mergeResult = mergeDraftRecord({
        existingPrereqs: draftRecord.prereqCourses,
        existingSourceUrl: draftRecord.sourceUrl,
        existingLastVerified: draftRecord.lastVerified,
        incomingPrereqs: prereqCourses,
        incomingSourceUrl: first.sourceUrl,
        incomingLastVerified: first.lastVerified ?? null,
      });
      await db
        .update(programSchoolsTable)
        .set({
          prereqCourses: mergeResult.prereqCourses,
          verificationStatus: "imported",
          sourceUrl: mergeResult.sourceUrl,
          lastVerified: mergeResult.lastVerified,
        })
        .where(eq(programSchoolsTable.id, draftRecord.id));
      console.log(`  ↳ Merged "${schoolKey}" into existing draft (id=${draftRecord.id})`);
      merged++;
    } else {
      // Insert new record
      const insertData: InsertProgramSchool = {
        professionSlug: first.profession,
        name: first.schoolName,
        programName: first.programName,
        city: first.city,
        state: first.state,
        degreeType: first.degreeType ?? null,
        sourceUrl: first.sourceUrl,
        lastVerified: first.lastVerified ?? null,
        verificationStatus: "imported",
        prereqCourses,
      };
      await db.insert(programSchoolsTable).values(insertData);
      console.log(`  ↳ Inserted "${schoolKey}" with ${prereqCourses.length} prerequisite(s)`);
      inserted++;
    }
  }

  console.log(`\nImport complete.`);
  console.log(`  Inserted:         ${inserted}`);
  console.log(`  Merged:           ${merged}`);
  console.log(`  Skipped (verified): ${skippedVerified}`);
  console.log(`  Skipped (invalid):  ${skipped}`);
  console.log(
    `\nAll imported records are set to verificationStatus="imported".`,
  );
  console.log(
    `A human reviewer must confirm requirements against official sources`,
  );
  console.log(`before setting verificationStatus="verified".`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
