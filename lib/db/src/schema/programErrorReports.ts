import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { programSchoolsTable } from "./programSchools";

/**
 * Pilot-testing error reports from the "Report an Error" workflow (Dr. McNelis's request:
 * a way for Health Professions Peer Advisors to flag a wrong program page, wrong
 * prerequisites, or a broken link, without generating email traffic during the pilot).
 *
 * Deliberately minimal. This table exists to let a developer triage reports with the
 * `list-error-reports` / `resolve-error-report` scripts, not to power a student-data admin
 * system: no grades, no APR, no selected target-school lists, no browsing history, and no
 * Clerk access token or session id — only the Clerk user id, kept for anti-abuse/duplicate
 * detection and never surfaced to any student-facing view.
 */
export type ErrorReportIssueType =
  | "wrong_program_page"
  | "wrong_prerequisite_courses"
  | "broken_official_link"
  | "missing_prerequisite_information"
  | "program_missing"
  | "incorrect_program_name_or_degree"
  | "outdated_information"
  | "other";

export type ErrorReportStatus = "open" | "resolved" | "dismissed";

export const programErrorReportsTable = pgTable(
  "program_error_reports",
  {
    id: serial("id").primaryKey(),
    // Nullable: the "Report an Error" entry point on the first page (not tied to any one
    // program result) has no program to reference yet.
    programId: integer("program_id").references(() => programSchoolsTable.id, { onDelete: "set null" }),
    profession: text("profession"),
    institution: text("institution"),
    programName: text("program_name"),
    programDegree: text("program_degree"),
    reportedSourceUrl: text("reported_source_url"),
    suggestedSourceUrl: text("suggested_source_url"),
    issueType: text("issue_type").$type<ErrorReportIssueType>().notNull(),
    description: text("description"),
    status: text("status").$type<ErrorReportStatus>().notNull().default("open"),
    // The Clerk user id of the signed-in reporter, for anti-abuse/duplicate tracking only.
    // Never a session token, never surfaced to any student-facing view.
    reporterUserId: text("reporter_user_id").notNull(),
    // Optional — the tester may choose to leave a way to follow up; never required.
    contactEmail: text("contact_email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note"),
  },
  (t) => [
    index("program_error_reports_status_idx").on(t.status),
    index("program_error_reports_program_id_idx").on(t.programId),
  ],
);

export const insertProgramErrorReportSchema = createInsertSchema(programErrorReportsTable, {
  issueType: z.enum([
    "wrong_program_page",
    "wrong_prerequisite_courses",
    "broken_official_link",
    "missing_prerequisite_information",
    "program_missing",
    "incorrect_program_name_or_degree",
    "outdated_information",
    "other",
  ]),
  status: z.enum(["open", "resolved", "dismissed"]).optional(),
}).omit({ id: true, createdAt: true });
export type InsertProgramErrorReport = z.infer<typeof insertProgramErrorReportSchema>;
export type ProgramErrorReport = typeof programErrorReportsTable.$inferSelect;
