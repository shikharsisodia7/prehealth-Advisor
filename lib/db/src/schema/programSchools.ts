import { pgTable, serial, text, jsonb, date } from "drizzle-orm/pg-core";
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

export type VerificationStatus =
  | "draft"
  | "imported"
  | "needs_review"
  | "verified"
  | "rejected"
  | "outdated";

export const programSchoolsTable = pgTable("program_schools", {
  id: serial("id").primaryKey(),
  professionSlug: text("profession_slug").notNull(),
  name: text("name").notNull(),
  programName: text("program_name").notNull().default(""),
  city: text("city"), // nullable
  state: text("state").notNull(),
  degreeType: text("degree_type"), // nullable; e.g. "ABSN" | "MEPN" for nursing
  sourceUrl: text("source_url").notNull(),
  lastVerified: date("last_verified"), // nullable date
  verificationStatus: text("verification_status")
    .$type<VerificationStatus>()
    .notNull()
    .default("draft"),
  prereqCourses: jsonb("prereq_courses")
    .$type<PrereqItem[]>()
    .notNull()
    .default([]),
});

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
      ])
      .optional(),
  },
).omit({ id: true });
export type InsertProgramSchool = z.infer<typeof insertProgramSchoolSchema>;
export type ProgramSchool = typeof programSchoolsTable.$inferSelect;
