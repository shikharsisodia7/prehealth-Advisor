/**
 * Pure logic for the "Report an Error" pilot-testing workflow, extracted from
 * ReportErrorDialog.tsx so the validation rules are unit-testable without a
 * component-rendering harness (this project's test suite is Node-environment,
 * logic-only — see vitest.config.ts).
 */
import { z } from "zod";
import { ErrorReportInputIssueType } from "@workspace/api-client-react";

/** Selectable issue types and the labels shown to a tester, in display order. */
export const ISSUE_TYPES: Array<{ value: ErrorReportInputIssueType; label: string }> = [
  { value: ErrorReportInputIssueType.wrong_program_page, label: "Wrong program page" },
  { value: ErrorReportInputIssueType.wrong_prerequisite_courses, label: "Wrong prerequisite courses" },
  { value: ErrorReportInputIssueType.broken_official_link, label: "Broken official link" },
  { value: ErrorReportInputIssueType.missing_prerequisite_information, label: "Missing prerequisite information" },
  { value: ErrorReportInputIssueType.program_missing, label: "Program missing" },
  { value: ErrorReportInputIssueType.incorrect_program_name_or_degree, label: "Incorrect program name/degree" },
  { value: ErrorReportInputIssueType.outdated_information, label: "Outdated information" },
  { value: ErrorReportInputIssueType.other, label: "Other" },
];

/** A short explanation is required for these — the report is not actionable without one. */
export const DESCRIPTION_REQUIRED: ErrorReportInputIssueType[] = [
  ErrorReportInputIssueType.wrong_prerequisite_courses,
  ErrorReportInputIssueType.other,
];

export function isDescriptionRequired(issueType: ErrorReportInputIssueType | undefined): boolean {
  return issueType != null && DESCRIPTION_REQUIRED.includes(issueType);
}

export const reportFormSchema = z
  .object({
    issueType: z.nativeEnum(ErrorReportInputIssueType, { required_error: "Choose an issue type" }),
    description: z.string().max(2000, "Keep it under 2000 characters").optional(),
    suggestedSourceUrl: z
      .string()
      .max(2000)
      .refine((v) => !v || /^https?:\/\//i.test(v), "Must be a valid http(s) URL")
      .optional(),
    contactEmail: z
      .string()
      .max(320)
      .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Must be a valid email address")
      .optional(),
  })
  .refine((v) => !isDescriptionRequired(v.issueType) || !!v.description?.trim(), {
    message: "A short explanation is required for this issue type",
    path: ["description"],
  });

export type ReportFormValues = z.infer<typeof reportFormSchema>;

/** Program context to prefill when the report was opened from a specific program's card. */
export interface ReportErrorPrefill {
  programId: number;
  profession: string;
  institution: string;
  programName: string;
  programDegree?: string | null;
  reportedSourceUrl?: string | null;
  lastVerified?: string | null;
}

/**
 * Builds the API request body from the form values and (optional) program prefill.
 * `lastVerified` is shown to the tester for context but is not part of the request —
 * the server already has it via programId, and it is not part of the report schema.
 */
export function buildErrorReportPayload(values: ReportFormValues, prefill?: ReportErrorPrefill) {
  return {
    programId: prefill?.programId,
    profession: prefill?.profession,
    institution: prefill?.institution,
    programName: prefill?.programName,
    programDegree: prefill?.programDegree ?? undefined,
    reportedSourceUrl: prefill?.reportedSourceUrl ?? undefined,
    issueType: values.issueType,
    description: values.description?.trim() || undefined,
    suggestedSourceUrl: values.suggestedSourceUrl?.trim() || undefined,
    contactEmail: values.contactEmail?.trim() || undefined,
  };
}
