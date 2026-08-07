import { pgTable, serial, text, jsonb, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Structured prerequisite item — stored in jsonb.
// All optional fields accept null so jsonb round-trips (JSON null ≠ undefined)
// and callers don't have to coerce before inserting.
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

// Provenance for prerequisite/admissions source documents. `sourceUrl` remains
// the primary compatibility URL, while this array preserves every official
// document used to form a program-level record (for example, an admissions
// page plus a handbook PDF).
export type PrereqSource = {
  url: string;
  title?: string | null;
  sourceType:
    | "admissions_page"
    | "program_page"
    | "catalog"
    | "handbook_pdf"
    | "centralized_service"
    | "accreditor"
    | "other_official";
  retrievedAt: string;
  contentHash?: string | null;
  extractionMethod?: "http" | "browser" | "pdf_text" | "manual_review" | null;
};

export type VerificationStatus =
  | "draft"
  | "imported"
  | "needs_review"
  | "verified"
  | "rejected"
  | "outdated"
  | "no_prereqs_published"
  | "source_blocked"
  | "unavailable"
  | "not_published";

// Directory status — whether this professional program is an active,
// legitimate entry in the national program directory. This is SEPARATE from
// prerequisite verification (verificationStatus): a program can be an active
// directory entry while its prerequisite research has not started yet.
export type DirectoryStatus = "active" | "inactive" | "needs_review";

export const programSchoolsTable = pgTable(
  "program_schools",
  {
    id: serial("id").primaryKey(),
    professionSlug: text("profession_slug").notNull(),
    name: text("name").notNull(),
    programName: text("program_name").notNull().default(""),
    city: text("city"), // nullable
    state: text("state").notNull(),
    degreeType: text("degree_type"), // nullable; e.g. "ABSN" | "MEPN" for nursing, "MD" | "DO" for medicine
    // Prerequisite source page (official admissions/prereq page). Nullable —
    // a directory-confirmed program may not have a prereq source collected yet.
    sourceUrl: text("source_url"),
    // Official program/institution website from the directory source.
    websiteUrl: text("website_url"),
    lastVerified: date("last_verified"), // nullable — prereq last-verified date
    // Prerequisite verification status (NOT directory status):
    //   draft         → prereq info not collected yet
    //   imported      → collected/extracted, awaiting review
    //   needs_review  → flagged for review
    //   verified      → checked against official source
    //   rejected      → could not be confirmed
    //   outdated      → stale; requires re-verification
    verificationStatus: text("verification_status")
      .$type<VerificationStatus>()
      .notNull()
      .default("draft"),
    prereqCourses: jsonb("prereq_courses")
      .$type<PrereqItem[]>()
      .notNull()
      .default([]),
    // All official documents used during prerequisite collection. This keeps
    // source provenance durable without requiring a scrape during page loads.
    prereqSources: jsonb("prereq_sources")
      .$type<PrereqSource[]>()
      .notNull()
      .default([]),
    // ── Directory fields (program existence, independent of prereqs) ──────
    directoryStatus: text("directory_status")
      .$type<DirectoryStatus>()
      .notNull()
      .default("active"),
    directorySource: text("directory_source"), // e.g. "LCME", "ARC-PA", "manual"
    externalId: text("external_id"), // stable ID from the directory source, when available
    aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
    lastDirectoryVerified: date("last_directory_verified"), // nullable
    verificationNote: text("verification_note"), // nullable — human-readable note about verification status
  },
  (t) => [
    index("program_schools_profession_idx").on(t.professionSlug),
    index("program_schools_profession_degree_idx").on(
      t.professionSlug,
      t.degreeType,
    ),
    index("program_schools_state_idx").on(t.state),
    index("program_schools_name_idx").on(t.name),
    index("program_schools_directory_status_idx").on(t.directoryStatus),
  ],
);

// ── Directory sources — coverage/reconciliation metadata per profession ──────
// One row per (professionSlug, degreeType?) authoritative source. Used to make
// nationwide directory completeness measurable rather than anecdotal.
export const directorySourcesTable = pgTable("directory_sources", {
  id: serial("id").primaryKey(),
  professionSlug: text("profession_slug").notNull(),
  degreeType: text("degree_type"), // nullable — e.g. MD vs DO, ABSN vs MEPN
  sourceName: text("source_name").notNull(), // e.g. "LCME Accredited MD Programs"
  sourceUrl: text("source_url").notNull(),
  retrievedAt: date("retrieved_at"), // when the source was last synchronized
  sourceProgramCount: text("source_program_count"), // count reported by source, as text ("158" or "unknown")
  coverageStatus: text("coverage_status")
    .$type<"complete" | "incomplete" | "blocked" | "unreconciled">()
    .notNull()
    .default("unreconciled"),
  notes: text("notes"),
});

export const insertDirectorySourceSchema = createInsertSchema(
  directorySourcesTable,
  {
    coverageStatus: z
      .enum(["complete", "incomplete", "blocked", "unreconciled"])
      .optional(),
  },
).omit({ id: true });
export type InsertDirectorySource = z.infer<typeof insertDirectorySourceSchema>;
export type DirectorySource = typeof directorySourcesTable.$inferSelect;

export const insertProgramSchoolSchema = createInsertSchema(
  programSchoolsTable,
  {
    // Narrow the drizzle-zod-widened `string` back to the VerificationStatus
    // union so InsertProgramSchool.verificationStatus stays assignable to
    // Drizzle's native insert type.
    verificationStatus: z
      .enum([
        "draft",
        "imported",
        "needs_review",
        "verified",
        "rejected",
        "outdated",
        "no_prereqs_published",
        "source_blocked",
        "unavailable",
        "not_published",
      ])
      .optional(),
    directoryStatus: z.enum(["active", "inactive", "needs_review"]).optional(),
  },
).omit({ id: true });
export type InsertProgramSchool = z.infer<typeof insertProgramSchoolSchema>;
export type ProgramSchool = typeof programSchoolsTable.$inferSelect;
