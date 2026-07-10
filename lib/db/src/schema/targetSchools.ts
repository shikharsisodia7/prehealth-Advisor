import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const targetSchoolsTable = pgTable("target_schools", {
  id: serial("id").primaryKey(),
  schoolName: text("school_name").notNull(),
  programName: text("program_name").notNull(),
  professionSlug: text("profession_slug").notNull(),
  state: text("state"),
  inState: boolean("in_state").notNull().default(false),
  status: text("status").notNull().default("researching"),
  priority: text("priority").notNull().default("target"),
  deadline: timestamp("deadline", { withTimezone: true }),
  appPortal: text("app_portal"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertTargetSchoolSchema = createInsertSchema(
  targetSchoolsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTargetSchool = z.infer<typeof insertTargetSchoolSchema>;
export type TargetSchool = typeof targetSchoolsTable.$inferSelect;
