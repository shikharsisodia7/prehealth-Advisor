// Minimal type stub used in unit tests — no runtime API calls
export type PrereqItem = {
  name: string;
  details?: string | null;
  classification:
    | "required"
    | "recommended"
    | "preferred"
    | "informational"
    | "unclear"
    | "needs_review";
  labRequired?: boolean | null;
  courseCount?: number | null;
  semesterCredits?: number | null;
  quarterCredits?: number | null;
  otherConditions?: string | null;
};
export type ProgramSchool = {
  id: number;
  name: string;
  programName: string;
  professionSlug: string;
  city: string | null;
  state: string;
  degreeType: string | null;
  sourceUrl: string;
  lastVerified: string | null;
  verificationStatus: string;
  prereqCourses: PrereqItem[];
};

// Runtime value (not just a type) — report-error.ts uses these as enum members,
// mirroring the real generated ErrorReportInputIssueType exactly.
export const ErrorReportInputIssueType = {
  wrong_program_page: "wrong_program_page",
  wrong_prerequisite_courses: "wrong_prerequisite_courses",
  broken_official_link: "broken_official_link",
  missing_prerequisite_information: "missing_prerequisite_information",
  program_missing: "program_missing",
  incorrect_program_name_or_degree: "incorrect_program_name_or_degree",
  outdated_information: "outdated_information",
  other: "other",
} as const;
export type ErrorReportInputIssueType =
  (typeof ErrorReportInputIssueType)[keyof typeof ErrorReportInputIssueType];
