import {
  pgTable,
  serial,
  text,
  real,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const prereqCoursesTable = pgTable("prereq_courses", {
  id: serial("id").primaryKey(),
  professionSlug: text("profession_slug").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull().default("General"),
  status: text("status").notNull().default("not_started"),
  grade: text("grade"),
  credits: real("credits"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertPrereqCourseSchema = createInsertSchema(
  prereqCoursesTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPrereqCourse = z.infer<typeof insertPrereqCourseSchema>;
export type PrereqCourse = typeof prereqCoursesTable.$inferSelect;
