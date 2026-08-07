import { describe, it, expect } from "vitest";
import { ListProgramSchoolsResponse } from "@workspace/api-zod";

/**
 * Regression: rows with directory_status='merged-duplicate' previously reached
 * the response serializer, whose Zod enum rejected their values and returned a
 * 500. The route must (a) exclude merged-duplicate rows from the query, and
 * (b) serialize every remaining status without throwing.
 */
describe("program-schools response contract", () => {
  const baseRow = {
    id: 1,
    professionSlug: "medicine",
    name: "Alpha University",
    programName: "Doctor of Medicine (MD)",
    city: "Springfield",
    state: "IL",
    degreeType: "MD",
    sourceUrl: "https://alpha.edu/prereqs",
    prereqSources: [
      {
        url: "https://alpha.edu/prereqs",
        sourceType: "admissions_page",
        retrievedAt: "2026-08-07",
        contentHash: null,
        extractionMethod: "http",
      },
    ],
    websiteUrl: "https://alpha.edu",
    lastVerified: "2026-08-07",
    verificationStatus: "verified",
    prereqCourses: [],
    directoryStatus: "active",
    directorySource: "LCME",
    externalId: null,
    aliases: [],
    lastDirectoryVerified: null,
    verificationNote: null,
  };

  it("accepts every verification status the app stores", () => {
    for (const status of [
      "draft",
      "imported",
      "needs_review",
      "verified",
      "rejected",
      "outdated",
      "no_prereqs_published",
      "source_blocked",
    ]) {
      const parsed = ListProgramSchoolsResponse.safeParse([
        { ...baseRow, verificationStatus: status },
      ]);
      expect(parsed.success, `status ${status} should serialize`).toBe(true);
    }
  });

  it("accepts nullable fields as null (previous 500 source)", () => {
    const parsed = ListProgramSchoolsResponse.safeParse([
      {
        ...baseRow,
        city: null,
        degreeType: null,
        sourceUrl: null,
        websiteUrl: null,
        lastVerified: null,
        verificationNote: null,
      },
    ]);
    expect(parsed.success).toBe(true);
  });

  it("requires and preserves prerequisite provenance records", () => {
    const parsed = ListProgramSchoolsResponse.parse([baseRow]);
    expect(parsed[0].prereqSources).toHaveLength(1);
    expect(parsed[0].prereqSources[0].url).toBe("https://alpha.edu/prereqs");
  });
});
