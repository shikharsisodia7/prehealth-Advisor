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
