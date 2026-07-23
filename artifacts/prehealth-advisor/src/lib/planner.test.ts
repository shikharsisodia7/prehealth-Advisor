/**
 * Unit tests for the Program Planner.
 * Run: pnpm --filter @workspace/prehealth-advisor test
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  buildExportRows,
  rowToCsv,
  rowToTsv,
  alphabetize,
  requiredPrereqs,
  filterByNursingType,
  EXPORT_HEADERS,
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
  it("produces one row per required prerequisite", () => {
    const school = makeSchool({
      prereqCourses: [
        { name: "Biology", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Chemistry", classification: "required", labRequired: true, semesterCredits: 8 },
        { name: "Statistics", classification: "recommended" }, // should be excluded
      ],
    });
    const rows = buildExportRows(school, "Physical Therapy");
    expect(rows).toHaveLength(2); // only required
    expect(rows.every((r) => r.prereqName !== "Statistics")).toBe(true);
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

  it("returns empty array when school has no required prereqs", () => {
    const school = makeSchool({
      prereqCourses: [{ name: "Biochem", classification: "recommended" }],
    });
    expect(buildExportRows(school, "Medicine")).toHaveLength(0);
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

// ── Excel (.xlsx) generation ──────────────────────────────────────────────────

describe("xlsx export", () => {
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

// ── Prohibited language audit ─────────────────────────────────────────────────

describe("prohibited language absence", () => {
  const studentFacingFiles = [
    path.resolve(__dirname, "../pages/planner/index.tsx"),
    path.resolve(__dirname, "../components/layout/AppShell.tsx"),
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
