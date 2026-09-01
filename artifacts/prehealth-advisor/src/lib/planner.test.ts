/**
 * Unit tests for the Program Planner.
 * Run: pnpm --filter @workspace/prehealth-advisor test
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  buildExportRows,
  buildSelectionExportRows,
  buildProgramsSheetRow,
  buildPrereqsSheetRows,
  rowToCsv,
  rowToTsv,
  alphabetize,
  requiredPrereqs,
  filterByNursingType,
  filterSchools,
  matchesSchoolSearch,
  directoryDisplayState,
  selectionsAfterProfessionChange,
  sanitizeSpreadsheetValue,
  verificationStatusLabel,
  verificationStatusMessage,
  formatProgramForCopy,
  formatSelectionForCopy,
  displaySources,
  prereqSourceLabel,
  splitCourseNameForDisplay,
  requirementsDisplayKind,
  EXPORT_HEADERS,
  PROGRAMS_EXPORT_HEADERS,
  PREREQS_EXPORT_HEADERS,
  type ProgramSchoolLike,
} from "./planner-utils";
import type { PrereqItem } from "@workspace/api-client-react";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeSchool = (
  overrides: Partial<ProgramSchoolLike> & { prereqCourses: PrereqItem[] },
): ProgramSchoolLike => ({
  id: 1,
  name: "Test University",
  programName: "Doctor of Medicine (MD)",
  professionSlug: "medicine",
  city: "Testville",
  state: "CA",
  degreeType: null,
  sourceUrl: "https://example.edu/prereqs",
  lastVerified: "2026-07-23",
  verificationStatus: "verified",
  ...overrides,
});

// ── Required-only filtering ───────────────────────────────────────────────────

describe("requiredPrereqs", () => {
  it("returns only items classified as required", () => {
    const prereqs: PrereqItem[] = [
      { name: "Biology", classification: "required" },
      { name: "Statistics", classification: "recommended" },
      { name: "Writing", classification: "required" },
      { name: "Ethics", classification: "preferred" },
    ];
    const result = requiredPrereqs(prereqs);
    expect(result).toHaveLength(2);
    expect(result.every((p) => p.classification === "required")).toBe(true);
  });

  it("returns empty array when no required prereqs exist", () => {
    const prereqs: PrereqItem[] = [
      { name: "Statistics", classification: "recommended" },
    ];
    expect(requiredPrereqs(prereqs)).toHaveLength(0);
  });

  it("recommended courses do NOT appear in required results", () => {
    const prereqs: PrereqItem[] = [
      { name: "Biology", classification: "required" },
      { name: "Strongly Recommended Biochemistry", classification: "recommended" },
    ];
    const result = requiredPrereqs(prereqs);
    expect(result.some((p) => p.name.includes("Recommended"))).toBe(false);
  });
});

// ── Alphabetization ───────────────────────────────────────────────────────────

describe("alphabetize", () => {
  it("sorts schools alphabetically by name (case-insensitive)", () => {
    const schools = [
      { id: 1, name: "Marquette University" },
      { id: 2, name: "Arcadia University" },
      { id: 3, name: "emory University Division of Physical Therapy" },
    ];
    const result = alphabetize(schools);
    expect(result[0].name).toBe("Arcadia University");
    expect(result[1].name).toBe("emory University Division of Physical Therapy");
    expect(result[2].name).toBe("Marquette University");
  });

  it("does not mutate the original array", () => {
    const schools = [{ id: 2, name: "Zebra" }, { id: 1, name: "Alpha" }];
    const result = alphabetize(schools);
    expect(schools[0].name).toBe("Zebra"); // original unchanged
    expect(result[0].name).toBe("Alpha");
  });
});

// ── Nursing ABSN / MEPN filter ────────────────────────────────────────────────

describe("filterByNursingType", () => {
  const schools = [
    { id: 1, name: "Samuel Merritt University", degreeType: "ABSN" },
    { id: 2, name: "Vanderbilt University School of Nursing", degreeType: "MEPN" },
    { id: 3, name: "Some Traditional BSN School", degreeType: "BSN" },
    { id: 4, name: "No Degree Type School", degreeType: null },
  ];

  it("filters to ABSN programs only", () => {
    const result = filterByNursingType(schools, "ABSN");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Samuel Merritt University");
  });

  it("filters to MEPN programs only", () => {
    const result = filterByNursingType(schools, "MEPN");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Vanderbilt University School of Nursing");
  });

  it("excludes traditional BSN and null degreeType from nursing filter", () => {
    const absn = filterByNursingType(schools, "ABSN");
    const mepn = filterByNursingType(schools, "MEPN");
    const both = [...absn, ...mepn];
    expect(both.some((s) => s.degreeType === "BSN" || s.degreeType === null)).toBe(false);
  });
});

// ── CSV export — one row per requirement ──────────────────────────────────────

describe("buildExportRows", () => {
  it("produces one row per published requirement, labeled by requirement type", () => {
    const school = makeSchool({
      prereqCourses: [
        { name: "Biology", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Chemistry", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Statistics", classification: "recommended" },
        { name: "Minimum GPA 3.0", classification: "informational" },
      ],
    });
    const rows = buildExportRows(school, "Physical Therapy");
    // Every published requirement is exported; requirementType distinguishes them. Exporting
    // only "required" hid programs' official GPA/GRE/observation-hour requirements entirely.
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.prereqName)).toEqual([
      "Biology",
      "Chemistry",
      "Statistics",
      "Minimum GPA 3.0",
    ]);
    expect(rows.map((r) => r.requirementType)).toEqual([
      "required",
      "required",
      "recommended",
      "informational",
    ]);
  });

  it("populates all expected columns", () => {
    const school = makeSchool({
      name: "Example University",
      programName: "Doctor of Physical Therapy (DPT)",
      degreeType: null,
      state: "CA",
      sourceUrl: "https://example.edu/prereqs",
      lastVerified: "2026-07-23",
      prereqCourses: [
        {
          name: "Human Anatomy",
          details: "with lab; 4 semester hours",
          classification: "required",
          labRequired: true,
          semesterCredits: 4,
          otherConditions: "Must be completed within 5 years",
        },
      ],
    });
    const [row] = buildExportRows(school, "Physical Therapy");
    expect(row.school).toBe("Example University");
    expect(row.program).toBe("Doctor of Physical Therapy (DPT)");
    expect(row.prereqName).toBe("Human Anatomy");
    expect(row.details).toBe("with lab; 4 semester hours");
    expect(row.semesterCredits).toBe("4");
    expect(row.labRequired).toBe("Yes");
    expect(row.otherConditions).toBe("Must be completed within 5 years");
    expect(row.sourceUrl).toBe("https://example.edu/prereqs");
    expect(row.lastVerified).toBe("2026-07-23");
  });

  // Regression: University of South Alabama DPT stores 15 published requirements -- 9
  // required courses plus 6 non-course conditions (bachelor's degree, minimum GPA, GRE,
  // 50 observation hours, TOEFL/IELTS, interview). Filtering exports to "required" dropped
  // all 6, so the workbook and copy output silently understated what the program requires.
  it("exports non-course admissions conditions alongside required coursework", () => {
    const school = makeSchool({
      verificationStatus: "verified",
      prereqCourses: [
        { name: "College Physics with labs", classification: "required", labRequired: true },
        { name: "Statistics", classification: "required" },
        { name: "Minimum overall GPA 3.0", classification: "informational" },
        { name: "Minimum 50 observation hours verified through PTCAS", classification: "informational" },
        { name: "GRE Verbal, Quantitative and Analytic Writing required", classification: "unclear" },
      ],
    });
    const rows = buildExportRows(school, "Physical Therapy");
    expect(rows).toHaveLength(5);
    const names = rows.map((r) => r.prereqName);
    expect(names).toContain("Minimum overall GPA 3.0");
    expect(names).toContain("Minimum 50 observation hours verified through PTCAS");
    expect(names).toContain("GRE Verbal, Quantitative and Analytic Writing required");
  });

  it("exports a recommended-only program, labeled as recommended", () => {
    const school = makeSchool({
      prereqCourses: [{ name: "Biochem", classification: "recommended" }],
    });
    // A program whose only published requirement is recommended coursework still carries
    // information worth exporting; it is labeled by requirementType rather than dropped.
    const rows = buildExportRows(school, "Medicine");
    expect(rows).toHaveLength(1);
    expect(rows[0].prereqName).toBe("Biochem");
    expect(rows[0].requirementType).toBe("recommended");
  });

  it("returns empty array when school has no prereqs at all", () => {
    const school = makeSchool({ prereqCourses: [] });
    expect(buildExportRows(school, "Medicine")).toHaveLength(0);
  });
});

// ── CSV serialization ─────────────────────────────────────────────────────────

describe("rowToCsv", () => {
  it("wraps all fields in double-quotes", () => {
    const school = makeSchool({
      prereqCourses: [
        { name: "Biology", classification: "required", labRequired: true },
      ],
    });
    const [row] = buildExportRows(school, "Medicine");
    const csv = rowToCsv(row);
    const fields = csv.split('","');
    expect(fields.length).toBe(EXPORT_HEADERS.length);
    expect(csv.startsWith('"')).toBe(true);
  });

  it("escapes embedded double-quotes", () => {
    const school = makeSchool({
      name: 'University "Named" Test',
      prereqCourses: [{ name: "Biology", classification: "required" }],
    });
    const [row] = buildExportRows(school, "Medicine");
    const csv = rowToCsv(row);
    expect(csv).toContain('University ""Named"" Test');
  });
});

describe("rowToTsv", () => {
  it("produces tab-separated values with correct column count", () => {
    const school = makeSchool({
      prereqCourses: [
        { name: "Physics", classification: "required" },
      ],
    });
    const [row] = buildExportRows(school, "Medicine");
    const tsv = rowToTsv(row);
    const fields = tsv.split("\t");
    expect(fields.length).toBe(EXPORT_HEADERS.length);
  });
});

// ── Excel (.xlsx) generation — two-sheet workbook ─────────────────────────────

describe("xlsx export — two-sheet workbook", () => {
  it("workbook has Programs and Prerequisites sheets with correct content", async () => {
    const XLSX = await import("xlsx");

    const school1 = makeSchool({
      id: 1,
      name: "Alpha University",
      programName: "Doctor of Medicine (MD)",
      degreeType: "MD",
      city: "Springfield",
      state: "IL",
      verificationStatus: "verified",
      sourceUrl: "https://alpha.edu/prereqs",
      websiteUrl: "https://alpha.edu",
      lastVerified: "2026-07-23",
      prereqCourses: [
        { name: "Biology", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Chemistry", classification: "required", labRequired: true, semesterCredits: 8 },
      ],
    });

    const school2 = makeSchool({
      id: 2,
      name: "Beta College",
      programName: "Doctor of Medicine (MD)",
      degreeType: "MD",
      city: "Shelbyville",
      state: "IL",
      verificationStatus: "needs_review",
      sourceUrl: null,
      websiteUrl: "https://beta.edu",
      lastVerified: null,
      prereqCourses: [],
    });

    const professionName = "Medicine";
    const selection = [school1, school2];

    // Build Programs sheet data
    const programsData = [
      [...PROGRAMS_EXPORT_HEADERS] as string[],
      ...selection.map((s) => {
        const row = buildProgramsSheetRow(s, professionName);
        return [
          row.profession, row.institution, row.program, row.degreeType,
          row.city, row.state, row.verificationStatus, row.verificationNote,
          row.lastVerified, row.sourceUrl, row.websiteUrl,
        ].map(sanitizeSpreadsheetValue);
      }),
    ];

    // Build Prerequisites sheet data
    const prereqRows = selection.flatMap((s) => buildPrereqsSheetRows(s, professionName));
    const prereqsData = [
      [...PREREQS_EXPORT_HEADERS] as string[],
      ...prereqRows.map((row) =>
        [
          row.profession, row.institution, row.program, row.degreeType,
          row.city, row.state, row.prereqName, row.details, row.courseCount,
          row.semesterCredits, row.quarterCredits, row.labRequired,
          row.otherConditions, row.requirementType, row.verificationStatus,
          row.lastVerified, row.sourceUrl,
        ].map(sanitizeSpreadsheetValue),
      ),
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(programsData), "Programs");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(prereqsData), "Prerequisites");

    // Write to buffer and re-read to verify
    const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    // Magic bytes: PK\x03\x04 (zip format)
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
    expect(buf[2]).toBe(0x03);
    expect(buf[3]).toBe(0x04);

    // Re-read and assert sheet names
    const wbRead = XLSX.read(buf, { type: "buffer" });
    expect(wbRead.SheetNames).toEqual(["Programs", "Prerequisites"]);

    // Programs sheet assertions
    const programsSheet = wbRead.Sheets["Programs"];
    const programsRows = XLSX.utils.sheet_to_json<Record<string, string>>(programsSheet, { header: 1 }) as string[][];
    expect(programsRows[0]).toContain("Institution");
    expect(programsRows[0]).toContain("Verification Status");
    expect(programsRows[0]).toContain("Source URL");
    const programNames = programsRows.slice(1).map((r) => r[1]); // Institution column
    expect(programNames).toContain("Alpha University");
    expect(programNames).toContain("Beta College");

    // Prerequisites sheet assertions
    const prereqsSheet = wbRead.Sheets["Prerequisites"];
    const prereqsRows = XLSX.utils.sheet_to_json<Record<string, string>>(prereqsSheet, { header: 1 }) as string[][];
    expect(prereqsRows[0]).toContain("Prerequisite Name");
    expect(prereqsRows[0]).toContain("Verification Status");
    expect(prereqsRows[0]).toContain("Source URL");

    // Alpha University should have Biology and Chemistry rows
    const prereqInstitutions = prereqsRows.slice(1).map((r) => r[1]);
    expect(prereqInstitutions.filter((n) => n === "Alpha University")).toHaveLength(2);

    // Beta College should have a status row (needs_review)
    const betaRows = prereqsRows.slice(1).filter((r) => r[1] === "Beta College");
    expect(betaRows).toHaveLength(1);
    expect(betaRows[0][6]).toBe(""); // prereqName is empty for status row

    // Verification status labels
    const alphaRow = programsRows.find((r) => r[1] === "Alpha University");
    expect(alphaRow).toBeDefined();
    expect(alphaRow![6]).toBe("Verified");

    // Source URLs
    expect(alphaRow![9]).toBe("https://alpha.edu/prereqs");
  });

  it("generateXlsxBuffer returns a valid .xlsx zip magic bytes (PK\\x03\\x04)", async () => {
    // Import SheetJS the same way the planner does
    const XLSX = await import("xlsx");

    const school = makeSchool({
      name: "Test University",
      programName: "Doctor of Medicine (MD)",
      prereqCourses: [
        { name: "Biology", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Chemistry", classification: "required", labRequired: true, semesterCredits: 8 },
      ],
    });

    const rows = buildExportRows(school, "Medicine");
    const wsData = [
      [...EXPORT_HEADERS] as string[],
      ...rows.map((r) => [
        r.profession, r.degreeType, r.school, r.program, r.prereqName,
        r.details, r.courseCount, r.semesterCredits, r.quarterCredits,
        r.labRequired, r.otherConditions, r.sourceUrl, r.lastVerified,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Prerequisites");

    // Write to buffer (not file system) for verification
    const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    // .xlsx is a zip file — magic bytes are PK\x03\x04
    expect(buf[0]).toBe(0x50); // P
    expect(buf[1]).toBe(0x4b); // K
    expect(buf[2]).toBe(0x03);
    expect(buf[3]).toBe(0x04);
    // Should have at least 2 rows of data (header + 2 prereqs)
    expect(rows).toHaveLength(2);
  });
});

// ── Spec: directory vs. verification separation (Step 2) ─────────────────────

describe("Step 2 directory listing is independent of prerequisite verification", () => {
  const directory = [
    makeSchool({ id: 1, name: "Alpha University", verificationStatus: "verified", prereqCourses: [{ name: "Biology", classification: "required" }] }),
    makeSchool({ id: 2, name: "Beta College", verificationStatus: "draft", sourceUrl: null, prereqCourses: [] }),
    makeSchool({ id: 3, name: "Gamma Institute", verificationStatus: "needs_review", prereqCourses: [{ name: "Chemistry", classification: "required" }] }),
  ];

  it("a program with no prerequisite records still appears in Step 2", () => {
    const shown = filterSchools(directory, "", "");
    expect(shown.some((s) => s.name === "Beta College")).toBe(true);
  });

  it("a program with needs_review prerequisite status still appears in Step 2", () => {
    const shown = filterSchools(directory, "", "");
    expect(shown.some((s) => s.name === "Gamma Institute")).toBe(true);
  });
});

// ── Spec: Step 3 honesty about verification status ────────────────────────────

describe("Step 3 does not present unverified data as verified", () => {
  it("needs_review programs produce a status row, not verified requirement rows", () => {
    const school = makeSchool({
      verificationStatus: "needs_review",
      prereqCourses: [{ name: "Chemistry", classification: "required" }],
    });
    const rows = buildSelectionExportRows([school], "Medicine");
    expect(rows).toHaveLength(1);
    expect(rows[0].prereqName).toBe(""); // no requirement presented
    expect(rows[0].details).toContain("not yet collected");
  });

  it("needs_review with informational blocker note surfaces the specific blocker reason", () => {
    const blockerNote = "Page blocked by cookie consent overlay; no content accessible.";
    const school = makeSchool({
      verificationStatus: "needs_review",
      prereqCourses: [{
        name: "Prerequisite verification pending",
        classification: "informational",
        details: blockerNote,
      }],
    });
    const rows = buildSelectionExportRows([school], "Medicine");
    expect(rows).toHaveLength(1);
    expect(rows[0].prereqName).toBe(""); // no course name presented
    expect(rows[0].details).toContain(blockerNote);
  });

  it("needs_review export row includes source URL for manual verification", () => {
    const school = makeSchool({
      verificationStatus: "needs_review",
      sourceUrl: "https://example.edu/admissions",
      prereqCourses: [],
    });
    const rows = buildSelectionExportRows([school], "Medicine");
    expect(rows[0].sourceUrl).toBe("https://example.edu/admissions");
  });
});

// ── Spec: imported programs are treated as real data, not placeholders ─────────

describe("imported programs display real prerequisite data", () => {
  const importedSchool = makeSchool({
    verificationStatus: "imported",
    sourceUrl: "https://example.edu/prereqs",
    prereqCourses: [
      { name: "General Chemistry", classification: "required", labRequired: true },
      { name: "General Biology",   classification: "required" },
      { name: "Biochemistry",      classification: "recommended" },
    ],
  });

  it("imported programs produce real prereq rows in export, not placeholder rows", () => {
    const rows = buildSelectionExportRows([importedSchool], "Anesthesiologist Assistant");
    // Should get one row per real prereq (required + recommended)
    expect(rows.length).toBeGreaterThan(0);
    // Each row should have a prereq name, not a status placeholder
    const prereqNames = rows.map((r) => r.prereqName).filter(Boolean);
    expect(prereqNames).toContain("General Chemistry");
    expect(prereqNames).toContain("General Biology");
  });

  it("imported program export rows carry the official source URL", () => {
    const rows = buildSelectionExportRows([importedSchool], "Anesthesiologist Assistant");
    for (const row of rows) {
      expect(row.sourceUrl).toBe("https://example.edu/prereqs");
    }
  });

  it("imported programs do not produce a 'not yet collected' placeholder row", () => {
    const rows = buildSelectionExportRows([importedSchool], "Anesthesiologist Assistant");
    const hasPlaceholder = rows.some((r) => r.details?.includes("not yet collected") || r.details?.includes("not yet verified"));
    expect(hasPlaceholder).toBe(false);
  });
});

// ── Spec: imported (pending verification) data is shown, labeled truthfully ──

describe("imported status shows collected courses labeled as pending verification", () => {
  const imported = makeSchool({
    name: "Imported Tech",
    verificationStatus: "imported",
    prereqCourses: [
      { name: "Organic Chemistry", details: "2 semesters with lab", classification: "required" },
      { name: "Genetics", classification: "recommended" },
    ],
  });

  it("export rows include the collected courses (never presented as verified)", () => {
    const rows = buildSelectionExportRows([imported], "Pathologists' Assistant");
    // Required coursework first, then recommended -- each labeled by requirementType.
    expect(rows).toHaveLength(2);
    expect(rows[0].prereqName).toBe("Organic Chemistry");
    expect(rows[0].requirementType).toBe("required");
    expect(rows[1].prereqName).toBe("Genetics");
    expect(rows[1].requirementType).toBe("recommended");
  });

  it("copy output lists courses under an explicit pending-verification heading", () => {
    const text = formatProgramForCopy(imported, "Pathologists' Assistant");
    expect(text).toContain("pending verification");
    expect(text).toContain("Organic Chemistry");
    expect(text).toContain("Verification status: Pending verification");
  });

  it("imported program with no course data still gets a truthful status row", () => {
    const empty = makeSchool({ name: "Empty U", verificationStatus: "imported", prereqCourses: [] });
    const rows = buildSelectionExportRows([empty], "Medicine");
    expect(rows).toHaveLength(1);
    expect(rows[0].prereqName).toBe("");
  });
});

// ── Spec: real Excel workbook reopen — professor acceptance path ─────────────

describe("xlsx export — reopened workbook contains real program + prerequisite data", () => {
  it("verified, pending, and blocked programs all appear correctly in the reopened workbook", async () => {
    const XLSX = await import("xlsx");
    const emory = makeSchool({
      id: 10,
      name: "Emory University-Executive Park",
      programName: "Master of Medical Science in Anesthesiology",
      degreeType: null,
      city: "Atlanta",
      state: "GA",
      verificationStatus: "verified",
      sourceUrl: "https://med.emory.edu/departments/anesthesiology/education/masters/apply/prereq.html",
      lastVerified: "2026-08-07",
      prereqCourses: [
        { name: "Biochemistry", classification: "required", semesterCredits: 3 },
        { name: "Human Physiology", classification: "required", labRequired: true },
      ],
    });
    const duke = makeSchool({
      id: 11,
      name: "Duke University",
      programName: "Pathologists' Assistant Program",
      state: "NC",
      verificationStatus: "imported",
      sourceUrl: "https://pathology.duke.edu/education/pathologists-assistant-program/admissions-application",
      prereqCourses: [{ name: "General Biology", classification: "required", otherConditions: "grade C or better" }],
    });
    const blocked = makeSchool({
      id: 12,
      name: "Blocked College",
      programName: "PathA Program",
      state: "AB",
      verificationStatus: "source_blocked",
      sourceUrl: null,
      websiteUrl: "https://blocked.example",
      prereqCourses: [],
    });
    const selection = [emory, duke, blocked];
    const professionName = "Anesthesiologist Assistant";

    const programsData = [
      [...PROGRAMS_EXPORT_HEADERS] as string[],
      ...selection.map((s) => {
        const row = buildProgramsSheetRow(s, professionName);
        return [
          row.profession, row.institution, row.program, row.degreeType,
          row.city, row.state, row.verificationStatus, row.verificationNote,
          row.lastVerified, row.sourceUrl, row.websiteUrl,
        ].map(sanitizeSpreadsheetValue);
      }),
    ];
    const prereqRows = selection.flatMap((s) => buildPrereqsSheetRows(s, professionName));
    const prereqsData = [
      [...PREREQS_EXPORT_HEADERS] as string[],
      ...prereqRows.map((row) =>
        [
          row.profession, row.institution, row.program, row.degreeType,
          row.city, row.state, row.prereqName, row.details, row.courseCount,
          row.semesterCredits, row.quarterCredits, row.labRequired,
          row.otherConditions, row.requirementType, row.verificationStatus,
          row.lastVerified, row.sourceUrl,
        ].map(sanitizeSpreadsheetValue),
      ),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(programsData), "Programs");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(prereqsData), "Prerequisites");
    const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    // Reopen and inspect actual cells — not just file existence/size
    const read = XLSX.read(buf, { type: "buffer" });
    const prereqCells = XLSX.utils.sheet_to_json<string[]>(read.Sheets["Prerequisites"], { header: 1 }) as string[][];
    const body = prereqCells.slice(1);

    // Every selected program appears
    const institutions = new Set(body.map((r) => r[1]));
    expect(institutions).toEqual(new Set(["Emory University-Executive Park", "Duke University", "Blocked College"]));

    // Prerequisite cells are NOT empty for programs with data
    const emoryRows = body.filter((r) => r[1] === "Emory University-Executive Park");
    expect(emoryRows.map((r) => r[6])).toEqual(["Biochemistry", "Human Physiology"]);
    expect(emoryRows[0][9]).toBe("3"); // semester credits survive
    expect(emoryRows[1][11]).toBe("Yes"); // lab requirement survives

    // Prerequisites are not cross-assigned between programs
    const dukeRows = body.filter((r) => r[1] === "Duke University");
    expect(dukeRows.map((r) => r[6])).toEqual(["General Biology"]);
    expect(dukeRows[0][12]).toContain("grade C or better");

    // Source URLs survive the export
    expect(emoryRows[0][16]).toContain("med.emory.edu");
    expect(dukeRows[0][16]).toContain("pathology.duke.edu");

    // Blocked program gets a truthful status row, not fabricated courses
    const blockedRows = body.filter((r) => r[1] === "Blocked College");
    expect(blockedRows).toHaveLength(1);
    expect(blockedRows[0][6] ?? "").toBe(""); // no prereq name
    // Verification statuses represented accurately
    expect(emoryRows[0][14]).toBe("Verified");
    expect(blockedRows[0][14]).not.toBe("Verified");
  });
});

// ── Spec: all selected programs represented under mixed coverage ─────────────

describe("selection-wide results with mixed prerequisite coverage", () => {
  const selection = [
    makeSchool({ id: 1, name: "Verified U",  verificationStatus: "verified",  prereqCourses: [{ name: "Biology", classification: "required" }, { name: "Physics", classification: "required" }] }),
    makeSchool({ id: 2, name: "Imported U",  verificationStatus: "imported",  prereqCourses: [{ name: "Chemistry", classification: "required" }] }),
    makeSchool({ id: 3, name: "Draft College", verificationStatus: "draft",   sourceUrl: null, prereqCourses: [] }),
    makeSchool({ id: 4, name: "Review State", verificationStatus: "needs_review", prereqCourses: [] }),
  ];

  it("every selected program is represented in export rows", () => {
    const rows = buildSelectionExportRows(selection, "Physician Assistant");
    const schoolsInRows = new Set(rows.map((r) => r.school));
    expect(schoolsInRows).toEqual(new Set(["Verified U", "Imported U", "Draft College", "Review State"]));
  });

  it("imported and verified programs produce real prereq rows; draft and needs_review produce status rows", () => {
    const rows = buildSelectionExportRows(selection, "Physician Assistant");
    const draftRow = rows.find((r) => r.school === "Draft College");
    expect(draftRow).toBeDefined();
    expect(draftRow!.details).toContain("not yet collected");

    // Verified rows are real requirement rows
    expect(rows.filter((r) => r.school === "Verified U")).toHaveLength(2);

    // Imported rows are also real requirement rows
    const importedRows = rows.filter((r) => r.school === "Imported U");
    expect(importedRows).toHaveLength(1);
    expect(importedRows[0].prereqName).toBe("Chemistry");
  });
});

// ── Spec: profession change clears incompatible selections ───────────────────

describe("selectionsAfterProfessionChange", () => {
  it("clears selections when the profession changes", () => {
    const prev = new Set([1, 2, 3]);
    expect(selectionsAfterProfessionChange("medicine", "dental", prev).size).toBe(0);
  });
  it("keeps selections when the profession is unchanged", () => {
    const prev = new Set([1, 2, 3]);
    expect(selectionsAfterProfessionChange("medicine", "medicine", prev)).toBe(prev);
  });
});

// ── Spec: national-directory search by name and state ────────────────────────

describe("directory search", () => {
  const directory = [
    makeSchool({ id: 1, name: "Duke University", state: "NC", city: "Durham", prereqCourses: [] }),
    makeSchool({ id: 2, name: "Stanford University", state: "CA", city: "Stanford", prereqCourses: [] }),
    makeSchool({ id: 3, name: "Wake Forest University", state: "NC", city: "Winston-Salem", aliases: ["WFU"], prereqCourses: [] }),
  ];

  it("finds programs by school name", () => {
    const result = filterSchools(directory, "duke", "");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Duke University");
  });

  it("finds programs by state", () => {
    expect(filterSchools(directory, "NC", "")).toHaveLength(2);
    expect(filterSchools(directory, "", "NC")).toHaveLength(2);
  });

  it("finds programs by alias", () => {
    expect(matchesSchoolSearch(directory[2], "wfu")).toBe(true);
  });
});

// ── Spec: failure vs. empty vs. unpopulated states ────────────────────────────

describe("directoryDisplayState", () => {
  it("a query failure is an error state, never shown as 'no programs'", () => {
    expect(
      directoryDisplayState({ isLoading: false, isError: true, schoolCount: 0 }),
    ).toBe("error");
  });
  it("zero results without an error is 'unpopulated', a distinct state", () => {
    expect(
      directoryDisplayState({ isLoading: false, isError: false, schoolCount: 0 }),
    ).toBe("unpopulated");
  });
  it("loading is distinct from both", () => {
    expect(
      directoryDisplayState({ isLoading: true, isError: false, schoolCount: 0 }),
    ).toBe("loading");
  });
  it("programs available is 'ok'", () => {
    expect(
      directoryDisplayState({ isLoading: false, isError: false, schoolCount: 12 }),
    ).toBe("ok");
  });
});

// ── Spec: spreadsheet formula-injection safety ────────────────────────────────

describe("sanitizeSpreadsheetValue", () => {
  it("prefixes formula-leading characters", () => {
    for (const v of ["=SUM(A1)", "+1234", "-cmd", "@import", "\tx", "\rx"]) {
      expect(sanitizeSpreadsheetValue(v).startsWith("'")).toBe(true);
    }
  });

  it("leaves normal values untouched", () => {
    expect(sanitizeSpreadsheetValue("Biology with lab")).toBe("Biology with lab");
  });

  it("neutralizes formula payloads in .xlsx cell data too", async () => {
    const XLSX = await import("xlsx");
    const school = makeSchool({
      name: "=HYPERLINK(\"http://evil.test\",\"click\")",
      prereqCourses: [{ name: "+Biology", classification: "required" }],
    });
    const rows = buildSelectionExportRows([school], "Medicine");
    const wsData = [
      [...EXPORT_HEADERS] as string[],
      ...rows.map((r) =>
        [
          r.profession, r.degreeType, r.school, r.program, r.prereqName,
          r.details, r.courseCount, r.semesterCredits, r.quarterCredits,
          r.labRequired, r.otherConditions, r.sourceUrl, r.lastVerified,
        ].map(sanitizeSpreadsheetValue),
      ),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    // Cell C2 = school name; must be prefixed, stored as text not formula
    const cell = ws["C2"];
    expect(cell.v).toBe("'=HYPERLINK(\"http://evil.test\",\"click\")");
    expect(cell.f).toBeUndefined();
  });
});

// ── Spec: MD/DO filter is now STRICT — untyped records are excluded ───────────

describe("filterByDegreeTypes — strict mode (no null passthrough)", () => {
  it("active empty → returns [] (no data shown)", async () => {
    const { filterByDegreeTypes } = await import("./planner-utils");
    const md = makeSchool({ id: 1, degreeType: "MD", prereqCourses: [] });
    expect(filterByDegreeTypes([md], [])).toEqual([]);
  });

  it("excludes programs with null degreeType when a filter is active", async () => {
    const { filterByDegreeTypes } = await import("./planner-utils");
    const md = makeSchool({ id: 1, degreeType: "MD", prereqCourses: [] });
    const doProg = makeSchool({ id: 2, degreeType: "DO", prereqCourses: [] });
    const untyped = makeSchool({ id: 3, degreeType: null, prereqCourses: [] });
    const all = [md, doProg, untyped];

    // Both MD and DO selected — untyped excluded
    expect(filterByDegreeTypes(all, ["MD", "DO"]).map((s) => s.id)).toEqual([1, 2]);
    // MD only — only MD programs
    expect(filterByDegreeTypes(all, ["MD"]).map((s) => s.id)).toEqual([1]);
    // DO only — only DO programs
    expect(filterByDegreeTypes(all, ["DO"]).map((s) => s.id)).toEqual([2]);
  });

  it("excludes DDS and other non-MD/DO degree types", async () => {
    const { filterByDegreeTypes } = await import("./planner-utils");
    const dds = makeSchool({ id: 4, degreeType: "DDS", prereqCourses: [] });
    expect(filterByDegreeTypes([dds], ["MD", "DO"]).length).toBe(0);
  });

  it("untyped programs are excluded for any active filter", async () => {
    const { filterByDegreeTypes } = await import("./planner-utils");
    const untyped = makeSchool({ id: 1, degreeType: null, prereqCourses: [] });
    expect(filterByDegreeTypes([untyped], ["MD"])).toHaveLength(0);
    expect(filterByDegreeTypes([untyped], ["DO"])).toHaveLength(0);
    expect(filterByDegreeTypes([untyped], ["MD", "DO"])).toHaveLength(0);
  });
});

// ── Spec: verification status messages ────────────────────────────────────────

describe("verificationStatusLabel", () => {
  it("returns specific label for each known status", () => {
    expect(verificationStatusLabel("verified")).toBe("Verified");
    expect(verificationStatusLabel("no_prereqs_published")).toBe("No specific prerequisites published");
    expect(verificationStatusLabel("needs_review")).toBe("Needs review");
    expect(verificationStatusLabel("source_blocked")).toBe("Source blocked");
    expect(verificationStatusLabel("unavailable")).toBe("Source temporarily unavailable");
    expect(verificationStatusLabel("not_published")).toBe("Prerequisites not publicly published");
    expect(verificationStatusLabel("draft")).toBe("Not yet verified");
    expect(verificationStatusLabel("imported")).toBe("Pending verification");
    expect(verificationStatusLabel("rejected")).toBe("Could not be confirmed");
    expect(verificationStatusLabel("outdated")).toBe("Requires re-verification");
  });

  it("handles unknown status gracefully", () => {
    const label = verificationStatusLabel("some_future_status");
    expect(typeof label).toBe("string");
    expect(label.length).toBeGreaterThan(0);
  });
});

describe("verificationStatusMessage", () => {
  it("no_prereqs_published is a positive statement, not 'missing data'", () => {
    const msg = verificationStatusMessage("no_prereqs_published");
    expect(msg.toLowerCase()).toContain("no specific course prerequisites");
    // Must NOT suggest data is missing
    expect(msg.toLowerCase()).not.toContain("not yet verified");
    expect(msg.toLowerCase()).not.toContain("still being verified");
  });

  it("returns distinct messages for source_blocked, unavailable, not_published", () => {
    const blocked = verificationStatusMessage("source_blocked");
    const unavail = verificationStatusMessage("unavailable");
    const notPub = verificationStatusMessage("not_published");
    expect(blocked).not.toBe(unavail);
    expect(blocked).not.toBe(notPub);
    expect(unavail).not.toBe(notPub);
  });

  it("handles unknown status gracefully", () => {
    const msg = verificationStatusMessage("some_future_status");
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
  });
});

// ── Spec: copy output completeness ────────────────────────────────────────────

describe("formatProgramForCopy", () => {
  it("includes institution, program, degree type, city/state", () => {
    const school = makeSchool({
      name: "Alpha University",
      programName: "Doctor of Medicine (MD)",
      degreeType: "MD",
      city: "Springfield",
      state: "IL",
      prereqCourses: [],
    });
    const text = formatProgramForCopy(school, "Medicine");
    expect(text).toContain("Alpha University");
    expect(text).toContain("Doctor of Medicine (MD)");
    expect(text).toContain("MD");
    expect(text).toContain("Springfield");
    expect(text).toContain("IL");
  });

  it("includes each prerequisite with name, details, credits, lab", () => {
    const school = makeSchool({
      prereqCourses: [
        {
          name: "Biology",
          details: "with lab",
          classification: "required",
          labRequired: true,
          semesterCredits: 8,
          courseCount: 2,
        },
      ],
    });
    const text = formatProgramForCopy(school, "Medicine");
    expect(text).toContain("Biology");
    expect(text).toContain("with lab");
    expect(text).toContain("8 semester credits");
    expect(text).toContain("lab required");
    expect(text).toContain("2 course(s)");
  });

  it("includes verification status and source URL", () => {
    const school = makeSchool({
      verificationStatus: "needs_review",
      sourceUrl: "https://example.edu/prereqs",
      prereqCourses: [],
    });
    const text = formatProgramForCopy(school, "Medicine");
    expect(text).toContain("Needs review");
    expect(text).toContain("https://example.edu/prereqs");
  });

  it("includes verificationNote when present", () => {
    const school = makeSchool({
      verificationNote: "Source was updated Jan 2026",
      prereqCourses: [],
    });
    const text = formatProgramForCopy(school, "Medicine");
    expect(text).toContain("Source was updated Jan 2026");
  });

  it("includes last verified date", () => {
    const school = makeSchool({
      lastVerified: "2026-07-23",
      prereqCourses: [],
    });
    const text = formatProgramForCopy(school, "Medicine");
    expect(text).toContain("2026-07-23");
  });
});

describe("formatSelectionForCopy", () => {
  it("includes all selected programs separated by dividers", () => {
    const schools = [
      makeSchool({ id: 1, name: "Alpha U", prereqCourses: [] }),
      makeSchool({ id: 2, name: "Beta College", prereqCourses: [] }),
    ];
    const text = formatSelectionForCopy(schools, "Medicine");
    expect(text).toContain("Alpha U");
    expect(text).toContain("Beta College");
  });

  it("returns empty string for empty selection", () => {
    expect(formatSelectionForCopy([], "Medicine")).toBe("");
  });
});

// ── Spec: Programs sheet row fields ───────────────────────────────────────────

describe("buildProgramsSheetRow", () => {
  it("includes all required fields", () => {
    const school = makeSchool({
      name: "Test University",
      programName: "Doctor of Medicine (MD)",
      degreeType: "MD",
      city: "Springfield",
      state: "IL",
      verificationStatus: "verified",
      verificationNote: "Checked against LCME",
      sourceUrl: "https://test.edu/prereqs",
      websiteUrl: "https://test.edu",
      lastVerified: "2026-07-23",
      prereqCourses: [],
    });
    const row = buildProgramsSheetRow(school, "Medicine");
    expect(row.profession).toBe("Medicine");
    expect(row.institution).toBe("Test University");
    expect(row.program).toBe("Doctor of Medicine (MD)");
    expect(row.degreeType).toBe("MD");
    expect(row.city).toBe("Springfield");
    expect(row.state).toBe("IL");
    expect(row.verificationStatus).toBe("Verified");
    expect(row.verificationNote).toBe("Checked against LCME");
    expect(row.lastVerified).toBe("2026-07-23");
    expect(row.sourceUrl).toBe("https://test.edu/prereqs");
    expect(row.websiteUrl).toBe("https://test.edu");
  });
});

// ── Spec: Prerequisites sheet rows ────────────────────────────────────────────

describe("buildPrereqsSheetRows", () => {
  it("verified school with prereqs: one row per published requirement", () => {
    const school = makeSchool({
      verificationStatus: "verified",
      prereqCourses: [
        { name: "Biology", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Statistics", classification: "recommended" },
      ],
    });
    const rows = buildPrereqsSheetRows(school, "Medicine");
    expect(rows).toHaveLength(2);
    expect(rows[0].prereqName).toBe("Biology");
    expect(rows[0].labRequired).toBe("Yes");
    expect(rows[0].semesterCredits).toBe("8");
    expect(rows[0].requirementType).toBe("required");
    expect(rows[1].prereqName).toBe("Statistics");
    expect(rows[1].requirementType).toBe("recommended");
  });

  it("unverified school: one status row with empty prereqName", () => {
    const school = makeSchool({
      verificationStatus: "source_blocked",
      prereqCourses: [],
    });
    const rows = buildPrereqsSheetRows(school, "Medicine");
    expect(rows).toHaveLength(1);
    expect(rows[0].prereqName).toBe("");
    expect(rows[0].details.length).toBeGreaterThan(0);
    expect(rows[0].verificationStatus).toBe("Source blocked");
  });

  it("no_prereqs_published: status row with positive message", () => {
    const school = makeSchool({
      verificationStatus: "no_prereqs_published",
      prereqCourses: [],
    });
    const rows = buildPrereqsSheetRows(school, "Medicine");
    expect(rows).toHaveLength(1);
    expect(rows[0].verificationStatus).toBe("No specific prerequisites published");
  });

  it("South Alabama-sized list (15 required courses): every row is emitted, none dropped", () => {
    // Regression test: a prior build silently truncated large prerequisite
    // lists. University of South Alabama PT has 15 real prereqCourses rows —
    // this fixture mirrors that shape.
    const prereqCourses: PrereqItem[] = Array.from({ length: 15 }, (_, i) => ({
      name: `Course ${i + 1}`,
      classification: "required",
    }));
    const school = makeSchool({
      name: "University of South Alabama",
      programName: "Doctor of Physical Therapy (DPT)",
      professionSlug: "physical-therapy",
      prereqCourses,
    });
    const rows = buildPrereqsSheetRows(school, "Physical Therapy");
    expect(rows).toHaveLength(15);
    expect(rows[14].prereqName).toBe("Course 15");
    expect(requiredPrereqs(school.prereqCourses)).toHaveLength(15);
  });
});

// ── Prohibited language audit ─────────────────────────────────────────────────

describe("prohibited language absence", () => {
  const studentFacingFiles = [
    path.resolve(__dirname, "../pages/planner/index.tsx"),
    path.resolve(__dirname, "../components/layout/AppShell.tsx"),
    path.resolve(__dirname, "../pages/manual-search/index.tsx"),
  ];

  const prohibited = [
    "reach school",
    "match school",
    "safety school",
    "target school",
    "admission probability",
    "acceptance chance",
    "competitiveness score",
    "best schools for you",
    "recommended schools for you",
    "likely acceptance",
    "unlikely acceptance",
    "your path to care",
    "need guidance",
  ];

  for (const filePath of studentFacingFiles) {
    it(`${path.basename(path.dirname(filePath))}/${path.basename(filePath)} contains no prohibited language`, () => {
      const source = fs.readFileSync(filePath, "utf-8").toLowerCase();
      for (const phrase of prohibited) {
        expect(source).not.toContain(phrase.toLowerCase());
      }
    });
  }
});

// ── Spec: missing-prerequisite fallback classification ────────────────────────

describe("requirementsDisplayKind", () => {
  it("groups verified and imported as has_courses", () => {
    expect(requirementsDisplayKind("verified")).toBe("has_courses");
    expect(requirementsDisplayKind("imported")).toBe("has_courses");
  });

  it("keeps no_prereqs_published in its own bucket, never manual_review", () => {
    expect(requirementsDisplayKind("no_prereqs_published")).toBe("no_prereqs_published");
  });

  it("groups research-gap statuses as manual_review", () => {
    for (const status of [
      "needs_review",
      "source_blocked",
      "unavailable",
      "not_published",
      "outdated",
      "rejected",
      "draft",
    ]) {
      expect(requirementsDisplayKind(status)).toBe("manual_review");
    }
  });
});

// ── Spec: course title vs. institutional course code ──────────────────────────

describe("splitCourseNameForDisplay", () => {
  it("splits 'CODE - Title' into title and code", () => {
    expect(splitCourseNameForDisplay("STA 1380 - Elementary Statistics")).toEqual({
      title: "Elementary Statistics",
      code: "STA 1380",
    });
  });

  it("splits 'CODE: Title' into title and code", () => {
    expect(splitCourseNameForDisplay("CSD 204: Phonetics")).toEqual({
      title: "Phonetics",
      code: "CSD 204",
    });
  });

  it("splits 'Title (CODE)' into title and code", () => {
    expect(splitCourseNameForDisplay("Human Anatomy (BIOL 2215)")).toEqual({
      title: "Human Anatomy",
      code: "BIOL 2215",
    });
  });

  it("shows a bare course code as-is, never inventing a title", () => {
    expect(splitCourseNameForDisplay("BSC 2010C")).toEqual({
      title: null,
      code: "BSC 2010C",
    });
  });

  it("treats a plain subject name as a title with no code", () => {
    expect(splitCourseNameForDisplay("Human Anatomy")).toEqual({
      title: "Human Anatomy",
      code: null,
    });
  });
});

// ── Spec: multi-source provenance display ──────────────────────────────────────

describe("displaySources / prereqSourceLabel", () => {
  it("prefers the structured prereqSources list, deduplicated by URL", () => {
    const school = makeSchool({
      sourceUrl: "https://example.edu/legacy",
      prereqCourses: [],
      prereqSources: [
        { url: "https://example.edu/admissions", title: null, sourceType: "admissions_page" },
        { url: "https://example.edu/admissions", title: null, sourceType: "admissions_page" },
        { url: "https://example.edu/handbook.pdf", title: "2026 Handbook", sourceType: "handbook_pdf" },
      ],
    });
    const sources = displaySources(school);
    expect(sources).toHaveLength(2);
    expect(sources[0]).toEqual({ url: "https://example.edu/admissions", label: "Official admissions page" });
    expect(sources[1]).toEqual({ url: "https://example.edu/handbook.pdf", label: "2026 Handbook" });
  });

  it("falls back to sourceUrl when there is no structured source list", () => {
    const school = makeSchool({ sourceUrl: "https://example.edu/prereqs", prereqCourses: [] });
    expect(displaySources(school)).toEqual([
      { url: "https://example.edu/prereqs", label: "Official prerequisite source" },
    ]);
  });

  it("falls back to websiteUrl when neither sourceUrl nor prereqSources exist", () => {
    const school = makeSchool({ sourceUrl: null, websiteUrl: "https://example.edu", prereqCourses: [] });
    expect(displaySources(school)).toEqual([
      { url: "https://example.edu", label: "Official program website" },
    ]);
  });

  it("returns an empty list when no source is on file", () => {
    const school = makeSchool({ sourceUrl: null, websiteUrl: null, prereqCourses: [] });
    expect(displaySources(school)).toEqual([]);
  });

  it("labels an untitled source by its type, never a raw URL", () => {
    expect(prereqSourceLabel({ url: "https://x.edu/a", title: null, sourceType: "catalog" })).toBe(
      "Official course catalog",
    );
  });
});
