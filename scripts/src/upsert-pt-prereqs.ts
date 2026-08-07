/**
 * upsert-pt-prereqs.ts
 * --------------------
 * Idempotent upsert of verified prerequisite records for 7 queued PT programs:
 *   Alabama State (302), Samford (304), South Alabama (306), ATSU (307),
 *   Creighton AZ (308), Franklin Pierce AZ (309), Midwestern AZ (310).
 *
 * Source of record: data/prereqs/pt-queued-programs.json
 *   (one JSON row per prerequisite item, same format as caa-pa-all-programs.json)
 *
 * Unlike import-programs.ts, this script:
 *   - Sets verificationStatus = "verified" directly (human-reviewed sources)
 *   - Updates existing records unconditionally (no "skip if verified" guard)
 *   - Looks up programs by (professionSlug, name) — stable across DB resets
 *
 * Run: pnpm --filter @workspace/scripts run upsert:pt-prereqs
 * Safe to re-run: produces the same result on every execution.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, programSchoolsTable, type PrereqItem, type PrereqSource } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(__dirname, "../../data/prereqs/pt-queued-programs.json");
const TODAY = "2026-08-07";

// ── Parse flat rows from the data file ───────────────────────────────────────

interface FlatRow {
  profession: string;
  school_name: string;
  program_name: string;
  city?: string;
  state: string;
  requirement_name: string;
  requirement_details?: string;
  lab_required?: string;
  semester_credits?: string;
  quarter_credits?: string;
  course_count?: string;
  classification: string;
  official_source_url: string;
  last_verified?: string;
  other_conditions?: string;
}

interface ProgramRecord {
  schoolName: string;
  professionSlug: string;
  programName: string;
  city: string;
  state: string;
  sourceUrl: string;
  lastVerified: string;
  courses: PrereqItem[];
}

function buildCourse(row: FlatRow): PrereqItem {
  const course: PrereqItem = {
    name: row.requirement_name,
    classification: (row.classification || "required") as PrereqItem["classification"],
  };
  if (row.requirement_details?.trim()) course.details = row.requirement_details.trim();
  if (row.lab_required?.toLowerCase() === "true" || row.lab_required === "1") {
    course.labRequired = true;
  }
  if (row.semester_credits?.trim()) {
    const n = parseFloat(row.semester_credits);
    if (!isNaN(n)) course.semesterCredits = n;
  }
  if (row.quarter_credits?.trim()) {
    const n = parseFloat(row.quarter_credits);
    if (!isNaN(n)) course.quarterCredits = n;
  }
  if (row.course_count?.trim()) {
    const n = parseInt(row.course_count);
    if (!isNaN(n)) course.courseCount = n;
  }
  if (row.other_conditions?.trim()) course.otherConditions = row.other_conditions.trim();
  return course;
}

function buildPrereqSource(sourceUrl: string): PrereqSource {
  return {
    url: sourceUrl,
    title: "Official DPT admissions/prerequisite requirements",
    sourceType: "program_page",
    retrievedAt: TODAY,
    extractionMethod: "manual_review",
  };
}

function groupBySchool(rows: FlatRow[]): ProgramRecord[] {
  const map = new Map<string, ProgramRecord>();
  for (const row of rows) {
    const key = `${row.profession}|||${row.school_name}`;
    if (!map.has(key)) {
      map.set(key, {
        schoolName: row.school_name,
        professionSlug: row.profession,
        programName: row.program_name,
        city: row.city ?? "",
        state: row.state,
        sourceUrl: row.official_source_url,
        lastVerified: row.last_verified ?? TODAY,
        courses: [],
      });
    }
    map.get(key)!.courses.push(buildCourse(row));
    // Use the most specific (non-null) source URL
    if (row.official_source_url) {
      map.get(key)!.sourceUrl = row.official_source_url;
    }
  }
  return Array.from(map.values());
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`Data file not found: ${DATA_FILE}`);
    process.exit(1);
  }

  const rows: FlatRow[] = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  const programs = groupBySchool(rows);

  console.log(`Upserting ${programs.length} PT programs from ${path.basename(DATA_FILE)}...`);
  console.log(`Strategy: unconditional upsert → verificationStatus = "verified"\n`);

  let updated = 0;
  let inserted = 0;
  let errors = 0;

  for (const prog of programs) {
    try {
      // Find existing record by (professionSlug, name)
      const existing = await db
        .select()
        .from(programSchoolsTable)
        .where(
          and(
            eq(programSchoolsTable.professionSlug, prog.professionSlug),
            eq(programSchoolsTable.name, prog.schoolName),
          ),
        );

      // Build prereq source entry (primary source URL)
      const newSource = buildPrereqSource(prog.sourceUrl);
      const requiredCourses = prog.courses.filter(c => c.classification === "required").length;
      const verificationNote =
        `Requirements extracted 2026-08-07 from official program/admissions page ` +
        `(${prog.sourceUrl}). ` +
        `${requiredCourses} required course(s) recorded. ` +
        `Method: manual_review of cached/live HTML. ` +
        `Data file: data/prereqs/pt-queued-programs.json.`;

      if (existing.length > 0) {
        // Merge existing sources to preserve provenance chain; add new source if absent
        const existingSources: PrereqSource[] = existing[0].prereqSources ?? [];
        const mergedSources = existingSources.some(s => s.url === newSource.url)
          ? existingSources
          : [...existingSources, newSource];

        await db
          .update(programSchoolsTable)
          .set({
            prereqCourses: prog.courses,
            verificationStatus: "verified",
            sourceUrl: prog.sourceUrl,
            lastVerified: prog.lastVerified,
            prereqSources: mergedSources,
            verificationNote,
          })
          .where(eq(programSchoolsTable.id, existing[0].id));

        // Read-back assertion
        const [readBack] = await db
          .select()
          .from(programSchoolsTable)
          .where(eq(programSchoolsTable.id, existing[0].id));

        const ok =
          readBack?.verificationStatus === "verified" &&
          !!readBack?.sourceUrl &&
          (readBack?.prereqCourses ?? []).length === prog.courses.length;

        if (!ok) {
          console.error(
            `✗ ID ${existing[0].id} (${prog.schoolName}): READ-BACK FAILED — ` +
            `status=${readBack?.verificationStatus}, source=${!!readBack?.sourceUrl}, ` +
            `courses=${(readBack?.prereqCourses ?? []).length} (expected ${prog.courses.length})`
          );
          errors++;
        } else {
          console.log(
            `✓ ID ${existing[0].id} (${prog.schoolName}): updated → verified ` +
            `| ${prog.courses.length} courses | src=${prog.sourceUrl.slice(0, 55)}`
          );
          updated++;
        }
      } else {
        // No existing record — insert fresh (rare: program not yet in directory)
        await db.insert(programSchoolsTable).values({
          professionSlug: prog.professionSlug,
          name: prog.schoolName,
          programName: prog.programName,
          city: prog.city || null,
          state: prog.state,
          directoryStatus: "active",
          prereqCourses: prog.courses,
          verificationStatus: "verified",
          sourceUrl: prog.sourceUrl,
          lastVerified: prog.lastVerified,
          prereqSources: [newSource],
          verificationNote,
          aliases: [],
        });
        console.log(`+ ${prog.schoolName}: inserted new record → verified`);
        inserted++;
      }
    } catch (err) {
      console.error(`✗ ${prog.schoolName}: ERROR — ${err instanceof Error ? err.message : String(err)}`);
      errors++;
    }
  }

  console.log(`\n${"═".repeat(50)}`);
  console.log(`Summary:`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Errors:   ${errors}`);
  console.log(`${"═".repeat(50)}`);

  if (errors > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
