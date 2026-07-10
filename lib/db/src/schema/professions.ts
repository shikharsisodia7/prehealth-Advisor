import { pgTable, serial, text, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type ProfessionResource = {
  label: string;
  kind: "directory" | "prerequisites";
  note?: string | null;
  url?: string | null;
};

export const professionsTable = pgTable("professions", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  tagline: text("tagline").notNull(),
  description: text("description").notNull(),
  degree: text("degree").notNull(),
  typicalTimeline: text("typical_timeline"),
  resources: jsonb("resources").$type<ProfessionResource[]>().notNull().default([]),
});

export const insertProfessionSchema = createInsertSchema(professionsTable).omit({
  id: true,
});
export type InsertProfession = z.infer<typeof insertProfessionSchema>;
export type Profession = typeof professionsTable.$inferSelect;
