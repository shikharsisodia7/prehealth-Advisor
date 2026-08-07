import { describe, it, expect } from "vitest";
import { mergeDraftRecord } from "./merge-utils.js";
import type { PrereqItem } from "@workspace/db";

const bio: PrereqItem = { name: "Biology", classification: "required" };
const chem: PrereqItem = { name: "Chemistry", classification: "required" };

describe("importer merge — official source URL regression", () => {
  it("keeps the incoming official source URL when merging into an existing row", () => {
    const result = mergeDraftRecord({
      existingPrereqs: [bio],
      existingSourceUrl: null,
      existingLastVerified: null,
      incomingPrereqs: [chem],
      incomingSourceUrl: "https://school.edu/prereqs",
      incomingLastVerified: "2026-08-07",
    });
    expect(result.sourceUrl).toBe("https://school.edu/prereqs");
    expect(result.lastVerified).toBe("2026-08-07");
    expect(result.prereqCourses.map((p) => p.name)).toEqual(["Biology", "Chemistry"]);
  });

  it("preserves the existing source URL when the incoming rows have none", () => {
    const result = mergeDraftRecord({
      existingPrereqs: [bio],
      existingSourceUrl: "https://directory.example/official",
      existingLastVerified: "2026-07-23",
      incomingPrereqs: [chem],
      incomingSourceUrl: null,
      incomingLastVerified: null,
    });
    // The exact bug: merge previously overwrote source_url with the empty
    // incoming value, dropping the official URL.
    expect(result.sourceUrl).toBe("https://directory.example/official");
    expect(result.lastVerified).toBe("2026-07-23");
  });

  it("never produces less source information than either input had", () => {
    const result = mergeDraftRecord({
      existingPrereqs: [],
      existingSourceUrl: "https://old.example",
      existingLastVerified: null,
      incomingPrereqs: [bio],
      incomingSourceUrl: "https://new.example",
      incomingLastVerified: null,
    });
    expect(result.sourceUrl).toBe("https://new.example");
  });

  it("deduplicates prerequisites by name without dropping existing rows", () => {
    const result = mergeDraftRecord({
      existingPrereqs: [bio, chem],
      existingSourceUrl: "https://school.edu",
      existingLastVerified: null,
      incomingPrereqs: [{ ...chem, details: "newer detail" }, { name: "Physics", classification: "required" }],
      incomingSourceUrl: null,
      incomingLastVerified: null,
    });
    expect(result.prereqCourses.map((p) => p.name)).toEqual(["Biology", "Chemistry", "Physics"]);
    // Existing row wins on duplicate names (non-destructive merge)
    expect(result.prereqCourses[1].details).toBeUndefined();
  });
});
