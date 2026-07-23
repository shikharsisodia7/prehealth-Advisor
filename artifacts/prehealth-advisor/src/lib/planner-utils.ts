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
  sourceUrl: string | null;
  websiteUrl?: string | null;
  lastVerified?: string | null;
  verificationStatus: string;
  directoryStatus?: string;
  aliases?: string[];
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
    sourceUrl: school.sourceUrl ?? "",
    lastVerified: school.lastVerified ?? "",
  }));
}

// ── Row serializers ───────────────────────────────────────────────────────────

/**
 * Spreadsheet formula-injection guard: values beginning with =, +, -, @ (or
 * tab/CR) are prefixed with a single quote so Excel/Sheets treat them as text.
 */
export function sanitizeSpreadsheetValue(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

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
  ]
    .map(sanitizeSpreadsheetValue)
    .join("\t");
}

export function rowToCsv(row: ExportRow): string {
  const esc = (v: string) =>
    `"${sanitizeSpreadsheetValue(v).replace(/"/g, '""')}"`;
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

// ── Directory search (Step 2) ─────────────────────────────────────────────────

export interface SearchableSchool {
  name: string;
  programName: string;
  city?: string | null;
  state: string;
  aliases?: string[];
}

/** Search-as-you-type match on name, program, city, state, or alias. */
export function matchesSchoolSearch(school: SearchableSchool, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    school.name.toLowerCase().includes(q) ||
    school.programName.toLowerCase().includes(q) ||
    (school.city ?? "").toLowerCase().includes(q) ||
    school.state.toLowerCase().includes(q) ||
    (school.aliases ?? []).some((a) => a.toLowerCase().includes(q))
  );
}

/**
 * Step 2 directory filter. Deliberately does NOT filter by prerequisite
 * verification status — program existence and prerequisite verification are
 * independent concerns, so unverified/needs_review programs still appear.
 */
export function filterSchools<T extends SearchableSchool>(
  schools: T[],
  query: string,
  stateFilter: string,
): T[] {
  let list = schools;
  if (stateFilter) list = list.filter((s) => s.state === stateFilter);
  if (query.trim()) list = list.filter((s) => matchesSchoolSearch(s, query));
  return list;
}

// ── Empty-state semantics ─────────────────────────────────────────────────────

export type DirectoryDisplayState = "loading" | "error" | "unpopulated" | "ok";

/**
 * Distinguishes "query failed" from "directory has not been populated" from
 * "programs available". A failure must never be shown as "no programs".
 */
export function directoryDisplayState(args: {
  isLoading: boolean;
  isError: boolean;
  schoolCount: number;
}): DirectoryDisplayState {
  if (args.isLoading) return "loading";
  if (args.isError) return "error";
  if (args.schoolCount === 0) return "unpopulated";
  return "ok";
}

// ── Selection reconciliation ──────────────────────────────────────────────────

/** When the profession (or nursing type) changes, prior selections are incompatible and must be cleared. */
export function selectionsAfterProfessionChange(
  prevSlug: string,
  nextSlug: string,
  selectedIds: Set<number>,
): Set<number> {
  return prevSlug === nextSlug ? selectedIds : new Set<number>();
}

// ── Selection-wide export (no silent omissions) ───────────────────────────────

/**
 * Builds export rows for an entire selection. Every selected program is
 * represented: programs without verified required-prerequisite records get an
 * explicit status row instead of being silently omitted.
 */
export function buildSelectionExportRows(
  schools: ProgramSchoolLike[],
  professionName: string,
): ExportRow[] {
  return schools.flatMap((school) => {
    const rows =
      school.verificationStatus === "verified"
        ? buildExportRows(school, professionName)
        : [];
    if (rows.length > 0) return rows;
    const statusNote =
      school.verificationStatus === "verified"
        ? "No required prerequisites listed in the current verified data"
        : "Prerequisite information not yet verified for this program";
    return [
      {
        profession: professionName,
        degreeType: school.degreeType ?? "",
        school: school.name,
        program: school.programName,
        prereqName: "",
        details: statusNote,
        courseCount: "",
        semesterCredits: "",
        quarterCredits: "",
        labRequired: "",
        otherConditions: "",
        sourceUrl: school.sourceUrl ?? school.websiteUrl ?? "",
        lastVerified: school.lastVerified ?? "",
      },
    ];
  });
}

// ── Nursing degree-type filter ────────────────────────────────────────────────

export function filterByNursingType<T extends { degreeType: string | null }>(
  schools: T[],
  type: "ABSN" | "MEPN",
): T[] {
  return schools.filter((s) => s.degreeType === type);
}
