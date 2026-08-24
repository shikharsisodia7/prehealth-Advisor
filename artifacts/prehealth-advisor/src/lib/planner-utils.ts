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
  verificationNote?: string | null;
  directoryStatus?: string;
  aliases?: string[];
  prereqCourses: PrereqItem[];
}

// ── Verification status vocabulary ───────────────────────────────────────────

/**
 * Returns a human-readable label for a verification status code.
 * Always handles unknown statuses gracefully.
 */
export function verificationStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    verified: "Verified",
    no_prereqs_published: "No specific prerequisites published",
    needs_review: "Needs review",
    source_blocked: "Source blocked",
    unavailable: "Source temporarily unavailable",
    not_published: "Prerequisites not publicly published",
    draft: "Not yet verified",
    imported: "Pending verification",
    rejected: "Could not be confirmed",
    outdated: "Requires re-verification",
  };
  return labels[status] ?? "Verification status unknown";
}

/**
 * Returns a longer descriptive message for use in the UI card.
 * Handles all known statuses and unknown ones gracefully.
 */
export function verificationStatusMessage(status: string): string {
  const messages: Record<string, string> = {
    verified:
      "Prerequisite information has been verified against the official program source.",
    no_prereqs_published:
      "The official program source states no specific course prerequisites are required for this program.",
    needs_review:
      "The official requirements page has been located, but the extracted information needs review. Verify directly with the program.",
    source_blocked:
      "The official source is protected by access controls and could not be retrieved. Check the program website directly.",
    unavailable:
      "The official prerequisite page was temporarily unavailable during verification. Check the program website directly.",
    not_published:
      "Official prerequisite information is not publicly published for this program. Contact the program directly.",
    draft:
      "This program has been identified, but prerequisite information has not yet been collected.",
    imported:
      "Prerequisite information has been collected and is awaiting verification against the official source.",
    rejected:
      "Prerequisite information could not be confirmed from the official source. Review the official program page or consult a health professions advisor.",
    outdated:
      "This information requires re-verification against the official source. Review the program page or consult a health professions advisor.",
  };
  return (
    messages[status] ??
    "Prerequisite information for this program is still being verified. Review the official program page or consult a health professions advisor."
  );
}

/** True when a status represents confirmed positive data (either verified prereqs or confirmed none required). */
export function isPositiveStatus(status: string): boolean {
  return status === "verified" || status === "no_prereqs_published";
}

/**
 * True when a program's collected prerequisite course list should be shown.
 * "imported" data was extracted from the official program source but has not
 * yet been human-verified — it is displayed with an explicit pending-
 * verification label rather than hidden (the planner never hides collected
 * information, and never presents unverified data as verified).
 */
export function showsCourseList(status: string): boolean {
  return status === "verified" || status === "imported";
}

// ── Export columns ────────────────────────────────────────────────────────────

/** Headers for the 'Programs' sheet in Excel export and for CSV/TSV fallback */
export const PROGRAMS_EXPORT_HEADERS = [
  "Profession",
  "Institution",
  "Program",
  "Degree Type",
  "City",
  "State",
  "Verification Status",
  "Verification Note",
  "Last Verified",
  "Source URL",
  "Website URL",
] as const;

/** Headers for the 'Prerequisites' sheet in Excel export */
export const PREREQS_EXPORT_HEADERS = [
  "Profession",
  "Institution",
  "Program",
  "Degree Type",
  "City",
  "State",
  "Prerequisite Name",
  "Details",
  "Course Count",
  "Semester Credits",
  "Quarter Credits",
  "Lab Required",
  "Other Conditions",
  "Requirement Type",
  "Verification Status",
  "Last Verified",
  "Source URL",
] as const;

/**
 * Legacy flat export headers — kept for CSV / TSV / copy output
 * (one row per prerequisite).
 */
export const EXPORT_HEADERS = [
  "Profession",
  "Degree Type",
  "School",
  "Program",
  "Requirement",
  "Requirement Type",
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
  /** required | recommended | preferred | informational | unclear */
  requirementType: string;
  details: string;
  courseCount: string;
  semesterCredits: string;
  quarterCredits: string;
  labRequired: string;
  otherConditions: string;
  sourceUrl: string;
  lastVerified: string;
}

/** Row for the Programs sheet */
export interface ProgramsSheetRow {
  profession: string;
  institution: string;
  program: string;
  degreeType: string;
  city: string;
  state: string;
  verificationStatus: string;
  verificationNote: string;
  lastVerified: string;
  sourceUrl: string;
  websiteUrl: string;
}

/** Row for the Prerequisites sheet */
export interface PrereqsSheetRow {
  profession: string;
  institution: string;
  program: string;
  degreeType: string;
  city: string;
  state: string;
  prereqName: string;
  details: string;
  courseCount: string;
  semesterCredits: string;
  quarterCredits: string;
  labRequired: string;
  otherConditions: string;
  requirementType: string;
  verificationStatus: string;
  lastVerified: string;
  sourceUrl: string;
}

// ── Core export builder — one row per REQUIRED prerequisite ──────────────────

export function buildExportRows(
  school: ProgramSchoolLike,
  professionName: string,
): ExportRow[] {
  // Mirrors the workbook: export every published requirement and let the requirementType
  // column distinguish required coursework from recommended courses and non-course
  // admissions conditions (GPA, GRE/MCAT, observation hours, interviews).
  const exportablePrereqs = [
    ...school.prereqCourses.filter((p) => p.classification === "required"),
    ...school.prereqCourses.filter(
      (p) => p.classification === "recommended" || p.classification === "preferred",
    ),
    ...otherRequirementItems(school.prereqCourses),
  ];
  if (exportablePrereqs.length === 0) return [];
  return exportablePrereqs.map((prereq) => ({
    profession: professionName,
    degreeType: school.degreeType ?? "",
    school: school.name,
    program: school.programName,
    prereqName: prereq.name,
    requirementType: prereq.classification ?? "",
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

// ── Programs sheet builder ────────────────────────────────────────────────────

export function buildProgramsSheetRow(
  school: ProgramSchoolLike,
  professionName: string,
): ProgramsSheetRow {
  return {
    profession: professionName,
    institution: school.name,
    program: school.programName,
    degreeType: school.degreeType ?? "",
    city: school.city ?? "",
    state: school.state,
    verificationStatus: verificationStatusLabel(school.verificationStatus),
    verificationNote: school.verificationNote ?? "",
    lastVerified: school.lastVerified ?? "",
    sourceUrl: school.sourceUrl ?? "",
    websiteUrl: school.websiteUrl ?? "",
  };
}

// ── Prerequisites sheet builder ───────────────────────────────────────────────

export function buildPrereqsSheetRows(
  school: ProgramSchoolLike,
  professionName: string,
): PrereqsSheetRow[] {
  const base = {
    profession: professionName,
    institution: school.name,
    program: school.programName,
    degreeType: school.degreeType ?? "",
    city: school.city ?? "",
    state: school.state,
    verificationStatus: verificationStatusLabel(school.verificationStatus),
    lastVerified: school.lastVerified ?? "",
    sourceUrl: school.sourceUrl ?? school.websiteUrl ?? "",
  };

  if (!showsCourseList(school.verificationStatus)) {
    // No prereq data to show — emit one status row
    return [
      {
        ...base,
        prereqName: "",
        details: verificationStatusMessage(school.verificationStatus),
        courseCount: "",
        semesterCredits: "",
        quarterCredits: "",
        labRequired: "",
        otherConditions: "",
        requirementType: "",
      },
    ];
  }

  // Export every published requirement, not just required coursework. The sheet carries a
  // "Requirement Type" column precisely so required / recommended / other conditions can be
  // told apart, and dropping the others meant a program's official GPA, GRE and observation
  // -hour requirements never reached the workbook at all.
  const exportablePrereqs = [
    ...school.prereqCourses.filter((p) => p.classification === "required"),
    ...school.prereqCourses.filter(
      (p) => p.classification === "recommended" || p.classification === "preferred",
    ),
    ...otherRequirementItems(school.prereqCourses),
  ];

  if (exportablePrereqs.length === 0) {
    return [
      {
        ...base,
        prereqName: "",
        details:
          school.verificationStatus === "imported"
            ? "No required prerequisites listed in the collected (pending verification) data"
            : "No required prerequisites listed in the current verified data",
        courseCount: "",
        semesterCredits: "",
        quarterCredits: "",
        labRequired: "",
        otherConditions: "",
        requirementType: "",
      },
    ];
  }

  return exportablePrereqs.map((prereq) => ({
    ...base,
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
    requirementType: prereq.classification,
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
    row.requirementType,
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
    esc(row.requirementType),
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

// ── Human-readable copy output ────────────────────────────────────────────────

/**
 * Formats a single program's data as a human-readable text block for clipboard
 * copy. Includes all required fields per requirement 3.
 */
export function formatProgramForCopy(
  school: ProgramSchoolLike,
  professionName: string,
): string {
  const lines: string[] = [];

  // Heading
  lines.push(`${school.name}`);
  lines.push(`Program: ${school.programName}`);
  if (school.degreeType) lines.push(`Degree type: ${school.degreeType}`);
  const location = [school.city, school.state].filter(Boolean).join(", ");
  if (location) lines.push(`Location: ${location}`);
  lines.push(`Profession: ${professionName}`);

  // Verification status
  lines.push(`Verification status: ${verificationStatusLabel(school.verificationStatus)}`);
  if (school.verificationNote) {
    lines.push(`Note: ${school.verificationNote}`);
  }

  // Prerequisites
  if (showsCourseList(school.verificationStatus)) {
    const required = school.prereqCourses.filter(
      (p) => p.classification === "required",
    );
    if (required.length > 0) {
      lines.push(
        school.verificationStatus === "imported"
          ? "Required prerequisites (collected from official source, pending verification):"
          : "Required prerequisites:",
      );
      for (const prereq of required) {
        let line = `  • ${prereq.name}`;
        if (prereq.details) line += `: ${prereq.details}`;
        const extras: string[] = [];
        if (prereq.courseCount != null)
          extras.push(`${prereq.courseCount} course(s)`);
        if (prereq.semesterCredits != null)
          extras.push(`${prereq.semesterCredits} semester credits`);
        if (prereq.quarterCredits != null)
          extras.push(`${prereq.quarterCredits} quarter credits`);
        if (prereq.labRequired === true) extras.push("lab required");
        if (prereq.labRequired === false) extras.push("no lab required");
        if (extras.length > 0) line += ` (${extras.join("; ")})`;
        if (prereq.otherConditions) line += ` [${prereq.otherConditions}]`;
        lines.push(line);
      }
    } else {
      lines.push(
        school.verificationStatus === "imported"
          ? "Required prerequisites: None listed in collected (pending verification) data"
          : "Required prerequisites: None listed in current verified data",
      );
    }

    // Recommended coursework and non-course admissions conditions (GPA, GRE/MCAT,
    // observation or patient-care hours, interviews, English-proficiency tests) are part of
    // what a program requires. Copy previously emitted only the required list, so a student
    // pasting their results lost them entirely.
    const recommended = school.prereqCourses.filter(
      (p) => p.classification === "recommended" || p.classification === "preferred",
    );
    if (recommended.length > 0) {
      lines.push("Recommended:");
      for (const prereq of recommended) {
        lines.push(`  • ${prereq.name}${prereq.details ? `: ${prereq.details}` : ""}`);
      }
    }
    const other = otherRequirementItems(school.prereqCourses);
    if (other.length > 0) {
      lines.push("Other admissions requirements:");
      for (const prereq of other) {
        lines.push(`  • ${prereq.name}${prereq.details ? `: ${prereq.details}` : ""}`);
      }
    }
  } else {
    lines.push(`Prerequisites: ${verificationStatusMessage(school.verificationStatus)}`);
  }

  // Source and date
  const url = school.sourceUrl ?? school.websiteUrl;
  if (url) lines.push(`Source: ${url}`);
  if (school.lastVerified) lines.push(`Last verified: ${school.lastVerified}`);

  return lines.join("\n");
}

/**
 * Formats multiple programs for clipboard copy, separated by dividers.
 */
export function formatSelectionForCopy(
  schools: ProgramSchoolLike[],
  professionName: string,
): string {
  if (schools.length === 0) return "";
  const divider = "─".repeat(60);
  return schools
    .map((s) => formatProgramForCopy(s, professionName))
    .join(`\n\n${divider}\n\n`);
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

/**
 * Requirement items that are neither required nor recommended coursework.
 *
 * Extraction records non-course admissions conditions -- minimum GPA, GRE/MCAT, observation
 * or patient-care hours, interviews, English-proficiency tests -- with classifications such
 * as "informational" or "unclear". They are genuine published requirements, so they belong
 * in the card and in exports rather than being silently dropped.
 */
export function otherRequirementItems(prereqs: PrereqItem[]): PrereqItem[] {
  return prereqs.filter(
    (p) =>
      p.classification !== "required" &&
      p.classification !== "recommended" &&
      p.classification !== "preferred",
  );
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
    // Show real prerequisite rows for verified and imported records
    const showPrereqs =
      school.verificationStatus === "verified" ||
      school.verificationStatus === "imported";
    const rows = showPrereqs ? buildExportRows(school, professionName) : [];
    if (rows.length > 0) return rows;

    // Fallback status row — include specific blocker note for needs_review
    const isNeedsReview = school.verificationStatus === "needs_review";
    const blockerNote =
      isNeedsReview &&
      school.prereqCourses.length > 0 &&
      school.prereqCourses[0].classification === "informational"
        ? school.prereqCourses[0].details
        : null;
    const statusNote = showPrereqs
      ? "No required prerequisites listed in the current data"
      : isNeedsReview && blockerNote
        ? `Prerequisite verification pending — ${blockerNote}`
        : "Prerequisite information not yet collected for this program";

    return [
      {
        profession: professionName,
        degreeType: school.degreeType ?? "",
        school: school.name,
        program: school.programName,
        prereqName: "",
        requirementType: "",
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

// ── Degree-type filter (e.g. MD/DO for medicine) ─────────────────────────────

/**
 * Filter programs by selected degree types.
 * - `active` empty → returns [] (nothing selected means show nothing —
 *   the UI never lets that state persist but must not show wrong data).
 * - Programs with a null/undefined degreeType are EXCLUDED when a degree-type
 *   filter is active — all 236 medicine rows are now typed MD or DO, so
 *   untyped records are excluded rather than promoted.
 */
export function filterByDegreeTypes<
  T extends { degreeType?: string | null },
>(
  schools: T[],
  active: string[],
): T[] {
  if (active.length === 0) return [];
  return schools.filter(
    (s) => s.degreeType != null && active.includes(s.degreeType),
  );
}
