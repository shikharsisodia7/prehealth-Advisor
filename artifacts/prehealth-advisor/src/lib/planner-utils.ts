/**
 * Pure utility functions for the Program Planner.
 * Extracted so they can be unit-tested without React/API dependencies.
 */

import type { PrereqItem } from "@workspace/api-client-react";

// ── Types mirrored from planner (no API import needed in tests) ──────────────

export interface ProgramSchoolLike {
  id: number;
  name: string;
  programName: string;
  professionSlug: string;
  city?: string | null;
  state: string;
  degreeType?: string | null;
  sourceUrl: string;
  lastVerified?: string | null;
  verificationStatus: string;
  prereqCourses: PrereqItem[];
}

// ── Export columns ────────────────────────────────────────────────────────────

export const EXPORT_HEADERS = [
  "Profession",
  "Degree Type",
  "School",
  "Program",
  "Required Prerequisite",
  "Requirement Details",
  "Course Count",
  "Semester Credits",
  "Quarter Credits",
  "Laboratory Required",
  "Other Required Conditions",
  "Official Source",
  "Last Verified",
] as const;

export interface ExportRow {
  profession: string;
  degreeType: string;
  school: string;
  program: string;
  prereqName: string;
  details: string;
  courseCount: string;
  semesterCredits: string;
  quarterCredits: string;
  labRequired: string;
  otherConditions: string;
  sourceUrl: string;
  lastVerified: string;
}

// ── Core export builder — one row per REQUIRED prerequisite ──────────────────

export function buildExportRows(
  school: ProgramSchoolLike,
  professionName: string,
): ExportRow[] {
  const requiredPrereqs = school.prereqCourses.filter(
    (p) => p.classification === "required",
  );
  if (requiredPrereqs.length === 0) return [];
  return requiredPrereqs.map((prereq) => ({
    profession: professionName,
    degreeType: school.degreeType ?? "",
    school: school.name,
    program: school.programName,
    prereqName: prereq.name,
    details: prereq.details ?? "",
    courseCount: prereq.courseCount != null ? String(prereq.courseCount) : "",
    semesterCredits:
      prereq.semesterCredits != null ? String(prereq.semesterCredits) : "",
    quarterCredits:
      prereq.quarterCredits != null ? String(prereq.quarterCredits) : "",
    labRequired:
      prereq.labRequired === true
        ? "Yes"
        : prereq.labRequired === false
          ? "No"
          : "",
    otherConditions: prereq.otherConditions ?? "",
    sourceUrl: school.sourceUrl,
    lastVerified: school.lastVerified ?? "",
  }));
}

// ── Row serializers ───────────────────────────────────────────────────────────

export function rowToTsv(row: ExportRow): string {
  return [
    row.profession,
    row.degreeType,
    row.school,
    row.program,
    row.prereqName,
    row.details,
    row.courseCount,
    row.semesterCredits,
    row.quarterCredits,
    row.labRequired,
    row.otherConditions,
    row.sourceUrl,
    row.lastVerified,
  ].join("\t");
}

export function rowToCsv(row: ExportRow): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [
    esc(row.profession),
    esc(row.degreeType),
    esc(row.school),
    esc(row.program),
    esc(row.prereqName),
    esc(row.details),
    esc(row.courseCount),
    esc(row.semesterCredits),
    esc(row.quarterCredits),
    esc(row.labRequired),
    esc(row.otherConditions),
    esc(row.sourceUrl),
    esc(row.lastVerified),
  ].join(",");
}

// ── Alphabetical sort helper ──────────────────────────────────────────────────

export function alphabetize<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
  );
}

// ── Required-only filter ──────────────────────────────────────────────────────

export function requiredPrereqs(prereqs: PrereqItem[]): PrereqItem[] {
  return prereqs.filter((p) => p.classification === "required");
}

// ── Nursing degree-type filter ────────────────────────────────────────────────

export function filterByNursingType<T extends { degreeType: string | null }>(
  schools: T[],
  type: "ABSN" | "MEPN",
): T[] {
  return schools.filter((s) => s.degreeType === type);
}
