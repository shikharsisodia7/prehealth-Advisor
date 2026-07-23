import { pgTable, serial, text, jsonb, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const programSchoolsTable = pgTable("program_schools", {
  id: serial("id").primaryKey(),
  professionSlug: text("profession_slug").notNull(),
  name: text("name").notNull(),
  state: text("state").notNull(), // 2-letter state code
  degreeType: text("degree_type"), // nullable; used for nursing: "ABSN" | "MEPN"
  sourceUrl: text("source_url").notNull(), // official admissions/prereq page URL
  lastVerified: date("last_verified"), // nullable date
  prereqCourses: jsonb("prereq_courses")
    .$type<string[]>()
    .notNull()
    .default([]),
});

export const insertProgramSchoolSchema = createInsertSchema(
  programSchoolsTable,
).omit({ id: true });
export type InsertProgramSchool = z.infer<typeof insertProgramSchoolSchema>;
export type ProgramSchool = typeof programSchoolsTable.$inferSelect;
