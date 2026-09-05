import { describe, it, expect } from "vitest";
import { ErrorReportInputIssueType } from "@workspace/api-client-react";
import {
  ISSUE_TYPES,
  DESCRIPTION_REQUIRED,
  isDescriptionRequired,
  reportFormSchema,
  buildErrorReportPayload,
} from "./report-error";

describe("ISSUE_TYPES", () => {
  it("lists every issue type Dr. McNelis asked for, in a fixed order", () => {
    expect(ISSUE_TYPES.map((t) => t.value)).toEqual([
      "wrong_program_page",
      "wrong_prerequisite_courses",
      "broken_official_link",
      "missing_prerequisite_information",
      "program_missing",
      "incorrect_program_name_or_degree",
      "outdated_information",
      "other",
    ]);
  });
});

describe("isDescriptionRequired", () => {
  it("requires a description for wrong_prerequisite_courses and other", () => {
    expect(isDescriptionRequired(ErrorReportInputIssueType.wrong_prerequisite_courses)).toBe(true);
    expect(isDescriptionRequired(ErrorReportInputIssueType.other)).toBe(true);
  });

  it("does not require a description for the remaining issue types", () => {
    for (const t of ISSUE_TYPES.map((i) => i.value)) {
      if (DESCRIPTION_REQUIRED.includes(t)) continue;
      expect(isDescriptionRequired(t)).toBe(false);
    }
  });

  it("does not require a description when no issue type is chosen yet", () => {
    expect(isDescriptionRequired(undefined)).toBe(false);
  });
});

describe("reportFormSchema", () => {
  it("accepts a minimal valid report", () => {
    const parsed = reportFormSchema.safeParse({ issueType: ErrorReportInputIssueType.wrong_program_page });
    expect(parsed.success).toBe(true);
  });

  it("rejects a missing issue type", () => {
    expect(reportFormSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an invalid issue type", () => {
    expect(reportFormSchema.safeParse({ issueType: "not_a_real_type" }).success).toBe(false);
  });

  it("rejects 'other' without a description", () => {
    const parsed = reportFormSchema.safeParse({ issueType: ErrorReportInputIssueType.other });
    expect(parsed.success).toBe(false);
  });

  it("rejects 'other' with a blank/whitespace-only description", () => {
    const parsed = reportFormSchema.safeParse({
      issueType: ErrorReportInputIssueType.other,
      description: "   ",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts 'other' with a real description", () => {
    const parsed = reportFormSchema.safeParse({
      issueType: ErrorReportInputIssueType.other,
      description: "Something specific is wrong here.",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects 'wrong_prerequisite_courses' without a description", () => {
    expect(
      reportFormSchema.safeParse({ issueType: ErrorReportInputIssueType.wrong_prerequisite_courses }).success,
    ).toBe(false);
  });

  it("rejects an overlong description", () => {
    const parsed = reportFormSchema.safeParse({
      issueType: ErrorReportInputIssueType.other,
      description: "x".repeat(2001),
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an invalid suggestedSourceUrl", () => {
    const parsed = reportFormSchema.safeParse({
      issueType: ErrorReportInputIssueType.wrong_program_page,
      suggestedSourceUrl: "not-a-url",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a valid http(s) suggestedSourceUrl", () => {
    const parsed = reportFormSchema.safeParse({
      issueType: ErrorReportInputIssueType.wrong_program_page,
      suggestedSourceUrl: "https://medicine.ouhsc.edu/prospective-students/degree-programs/doctor-of-medicine-md",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an invalid contactEmail", () => {
    const parsed = reportFormSchema.safeParse({
      issueType: ErrorReportInputIssueType.wrong_program_page,
      contactEmail: "not-an-email",
    });
    expect(parsed.success).toBe(false);
  });

  it("treats contactEmail as optional", () => {
    const parsed = reportFormSchema.safeParse({ issueType: ErrorReportInputIssueType.wrong_program_page });
    expect(parsed.success).toBe(true);
  });
});

describe("buildErrorReportPayload", () => {
  it("includes program prefill fields when present", () => {
    const payload = buildErrorReportPayload(
      { issueType: ErrorReportInputIssueType.wrong_program_page, description: "", suggestedSourceUrl: "", contactEmail: "" },
      {
        programId: 547,
        profession: "medicine",
        institution: "University of Oklahoma College of Medicine",
        programName: "Doctor of Medicine (MD)",
        programDegree: "MD",
        reportedSourceUrl: "https://medicine.ouhsc.edu/.../physician-associate-program-information/...",
        lastVerified: "2026-08-22",
      },
    );
    expect(payload.programId).toBe(547);
    expect(payload.institution).toBe("University of Oklahoma College of Medicine");
    expect(payload.issueType).toBe("wrong_program_page");
  });

  it("omits program fields for the general first-page report (no prefill)", () => {
    const payload = buildErrorReportPayload({
      issueType: ErrorReportInputIssueType.program_missing,
      description: "",
      suggestedSourceUrl: "",
      contactEmail: "",
    });
    expect(payload.programId).toBeUndefined();
    expect(payload.institution).toBeUndefined();
  });

  it("trims and drops empty optional strings to undefined", () => {
    const payload = buildErrorReportPayload({
      issueType: ErrorReportInputIssueType.other,
      description: "  a real note  ",
      suggestedSourceUrl: "   ",
      contactEmail: "  ",
    });
    expect(payload.description).toBe("a real note");
    expect(payload.suggestedSourceUrl).toBeUndefined();
    expect(payload.contactEmail).toBeUndefined();
  });

  it("never sends lastVerified — the server already has it via programId", () => {
    const payload: any = buildErrorReportPayload(
      { issueType: ErrorReportInputIssueType.wrong_program_page, description: "", suggestedSourceUrl: "", contactEmail: "" },
      {
        programId: 1,
        profession: "medicine",
        institution: "X",
        programName: "Y",
        lastVerified: "2026-01-01",
      },
    );
    expect(payload.lastVerified).toBeUndefined();
  });
});
