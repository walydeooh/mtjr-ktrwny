import { pgTable, text, serial, integer, boolean, jsonb } from "drizzle-orm/pg-core";

export const homeSectionsTable = pgTable("home_sections", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  config: jsonb("config").notNull().default('{}'),
});

export type HomeSection = typeof homeSectionsTable.$inferSelect;
export type InsertHomeSection = typeof homeSectionsTable.$inferInsert;
