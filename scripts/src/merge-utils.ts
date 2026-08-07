import type { PrereqItem } from "@workspace/db";

/**
 * Pure merge logic used by import-programs.ts when an imported/draft record
 * already exists for a school+profession.
 *
 * Regression context: an earlier version of the importer dropped the official
 * source URL when merging (it did not fall back to either side), which
 * stripped `source_url` from 44 programs. The rule is:
 *   - incoming rows win when they carry a source URL,
 *   - otherwise the existing record's source URL is preserved,
 *   - the merged record NEVER ends up with less source information than
 *     either input had.
 */
export interface MergeInput {
  existingPrereqs: PrereqItem[];
  existingSourceUrl: string | null;
  existingLastVerified: string | null;
  incomingPrereqs: PrereqItem[];
  incomingSourceUrl: string | null;
  incomingLastVerified: string | null;
}

export interface MergeResult {
  prereqCourses: PrereqItem[];
  sourceUrl: string | null;
  lastVerified: string | null;
}

export function mergeDraftRecord(input: MergeInput): MergeResult {
  const mergedPrereqs = [
    ...input.existingPrereqs,
    ...input.incomingPrereqs.filter(
      (p) => !input.existingPrereqs.some((e) => e.name === p.name),
    ),
  ];
  return {
    prereqCourses: mergedPrereqs,
    sourceUrl: input.incomingSourceUrl || input.existingSourceUrl || null,
    lastVerified: input.incomingLastVerified ?? input.existingLastVerified,
  };
}
