/**
 * import-directory.ts
 * -------------------
 * Idempotent import of NATIONWIDE PROGRAM DIRECTORY entries (program
 * existence) from a JSON file produced from an authoritative accreditor
 * source (LCME, AACOM, ARC-PA, CAPTE, ACPE, ASCO, AVMA, CODA, …).
 *
 * This is intentionally separate from prerequisite imports:
 *   - It NEVER touches prereqCourses, verificationStatus, sourceUrl, or
 *     lastVerified on existing rows.
 *   - It NEVER deletes rows. Entries missing from a re-import are only
 *     reported, never auto-removed (spec: no auto-delete on sync).
 *   - Re-running with the same file is a no-op apart from field refreshes.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts exec tsx src/import-directory.ts data/directories/medicine-md.json
 *
 * File format:
 * {
 *   "professionSlug": "medicine",
 *   "degreeType": "MD" | null,
 *   "source": { "name": "LCME Accredited MD Programs", "url": "https://…",
 *                "retrievedAt": "YYYY-MM-DD", "sourceProgramCount": 158 },
 *   "programs": [
 *     { "name": "Institution name", "programName": "Doctor of Medicine",
 *       "city": "…", "state": "CA", "websiteUrl": "https://…",
 *       "aliases": ["UCSF"], "externalId": "…" }
 *   ]
 * }
 *
 * Matching (to avoid duplicating existing prereq-verified rows):
 *   normalized(name) + professionSlug (+ degreeType when both sides have one).
 *   Normalization lowercases, strips punctuation and common suffixes like
 *   "school of medicine". Existing row aliases are also checked.
 */

import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import {
  db,
  programSchoolsTable,
  directorySourcesTable,
} from "@workspace/db";

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(
      /\b(school of medicine|college of medicine|school of osteopathic medicine|college of osteopathic medicine|school of dentistry|college of dentistry|school of dental medicine|college of dental medicine|school of pharmacy|college of pharmacy|school of veterinary medicine|college of veterinary medicine|school of optometry|college of optometry|school of nursing|college of nursing|the)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

interface DirectoryProgram {
  name: string;
  programName: string;
  city?: string | null;
  state: string;
  websiteUrl?: string | null;
  aliases?: string[];
  externalId?: string | null;
}

interface DirectoryFile {
  professionSlug: string;
  degreeType?: string | null;
  source: {
    name: string;
    url: string;
    retrievedAt: string;
    sourceProgramCount?: number | null;
    coverageStatus?: "complete" | "incomplete" | "blocked" | "unreconciled";
    notes?: string;
  };
  programs: DirectoryProgram[];
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: tsx import-directory.ts <file.json>");
    process.exit(1);
  }
  const absPath = path.resolve(filePath);
  const data: DirectoryFile = JSON.parse(fs.readFileSync(absPath, "utf-8"));

  const { professionSlug, degreeType, source, programs } = data;
  if (!professionSlug || !source?.name || !source?.url || !Array.isArray(programs)) {
    console.error("Invalid directory file: professionSlug, source{name,url}, programs[] required.");
    process.exit(1);
  }
  const bad = programs.filter((p) => !p.name || !p.state || !p.programName);
  if (bad.length > 0) {
    console.error(`Rejected: ${bad.length} program(s) missing name/state/programName:`);
    for (const b of bad.slice(0, 10)) console.error("  ", JSON.stringify(b));
    process.exit(1);
  }

  console.log(
    `Importing directory: ${professionSlug}${degreeType ? ` (${degreeType})` : ""} — ${programs.length} programs from "${source.name}"`,
  );

  // Load existing rows for this profession
  const existing = await db
    .select()
    .from(programSchoolsTable)
    .where(eq(programSchoolsTable.professionSlug, professionSlug));

  const ambiguous: string[] = [];

  function findMatch(p: DirectoryProgram) {
    // Strongest identity first: externalId.
    if (p.externalId) {
      const byId = existing.filter(
        (r) => r.externalId && r.externalId === p.externalId,
      );
      if (byId.length === 1) return byId[0];
      if (byId.length > 1) {
        ambiguous.push(`externalId=${p.externalId} ("${p.name}")`);
        return undefined;
      }
    }
    const n = normalizeName(p.name);
    const candidates = existing.filter((r) => {
      if (degreeType && r.degreeType && r.degreeType !== degreeType) return false;
      const nameMatch =
        normalizeName(r.name) === n ||
        (r.aliases ?? []).some((a) => normalizeName(a) === n) ||
        (p.aliases ?? []).some((a) => normalizeName(a) === normalizeName(r.name));
      if (!nameMatch) return false;
      // A name-based match must also agree on state when both sides have one
      // (avoids merging distinct same-name campuses in different states).
      if (p.state && r.state && p.state.toUpperCase() !== r.state.toUpperCase()) {
        return false;
      }
      return true;
    });
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      // Ambiguous — do not auto-merge; flag for manual review and insert
      // nothing (skip) so no record is corrupted.
      ambiguous.push(`"${p.name}" (${p.state}) matched ${candidates.length} existing rows`);
      return null; // sentinel: skip entirely
    }
    return undefined;
  }

  let inserted = 0;
  let updated = 0;
  const matchedIds = new Set<number>();

  let skipped = 0;

  for (const p of programs) {
    const match = findMatch(p);
    if (match === null) {
      skipped++;
      continue; // ambiguous — flagged above, neither updated nor inserted
    }
    if (match) {
      matchedIds.add(match.id);
      // Refresh directory fields ONLY — prereq fields are untouched.
      await db
        .update(programSchoolsTable)
        .set({
          city: match.city ?? p.city ?? null,
          websiteUrl: p.websiteUrl ?? match.websiteUrl,
          directoryStatus: "active",
          directorySource: source.name,
          externalId: p.externalId ?? match.externalId,
          aliases: Array.from(
            new Set([...(match.aliases ?? []), ...(p.aliases ?? [])]),
          ),
          lastDirectoryVerified: source.retrievedAt,
          // backfill degreeType if the existing row lacks one
          ...(degreeType && !match.degreeType ? { degreeType } : {}),
        })
        .where(eq(programSchoolsTable.id, match.id));
      updated++;
    } else {
      await db.insert(programSchoolsTable).values({
        professionSlug,
        name: p.name,
        programName: p.programName,
        city: p.city ?? null,
        state: p.state.toUpperCase(),
        degreeType: degreeType ?? null,
        sourceUrl: null, // prereq source not collected yet
        websiteUrl: p.websiteUrl ?? null,
        verificationStatus: "draft", // prereqs not researched yet
        prereqCourses: [],
        directoryStatus: "active",
        directorySource: source.name,
        externalId: p.externalId ?? null,
        aliases: p.aliases ?? [],
        lastDirectoryVerified: source.retrievedAt,
      });
      inserted++;
    }
  }

  // Report (never delete) rows of this profession/degreeType that were not in
  // the source file.
  const unmatched = existing.filter(
    (r) =>
      !matchedIds.has(r.id) &&
      (!degreeType || !r.degreeType || r.degreeType === degreeType),
  );
  if (unmatched.length > 0) {
    console.log(
      `  ⚠ ${unmatched.length} existing row(s) not present in this source (NOT deleted — review manually):`,
    );
    for (const r of unmatched)
      console.log(`    id=${r.id} "${r.name}" (${r.degreeType ?? "no degreeType"})`);
  }

  // Upsert directory_sources row (keyed on professionSlug + source name)
  const srcRows = await db
    .select()
    .from(directorySourcesTable)
    .where(eq(directorySourcesTable.professionSlug, professionSlug));
  const srcMatch = srcRows.find((s) => s.sourceName === source.name);
  const srcValues = {
    professionSlug,
    degreeType: degreeType ?? null,
    sourceName: source.name,
    sourceUrl: source.url,
    retrievedAt: source.retrievedAt,
    sourceProgramCount:
      source.sourceProgramCount != null ? String(source.sourceProgramCount) : "unknown",
    coverageStatus: source.coverageStatus ?? "unreconciled",
    notes: source.notes ?? null,
  } as const;
  if (srcMatch) {
    await db
      .update(directorySourcesTable)
      .set(srcValues)
      .where(eq(directorySourcesTable.id, srcMatch.id));
  } else {
    await db.insert(directorySourcesTable).values(srcValues);
  }

  if (ambiguous.length > 0) {
    console.log(`  ⚠ ${ambiguous.length} ambiguous entr(ies) skipped — resolve manually:`);
    for (const a of ambiguous) console.log(`    ${a}`);
  }
  console.log(
    `Done: ${inserted} inserted, ${updated} matched/updated, ${skipped} skipped (ambiguous), 0 deleted.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
