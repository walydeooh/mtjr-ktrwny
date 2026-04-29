import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Multiple banners on home with different shapes and link targets.
// shape: rectangle | square | circle
// linkType: url | product | category
export const bannersTable = pgTable("banners", {
  id: serial("id").primaryKey(),
  title: text("title"),
  subtitle: text("subtitle"),
  imageUrl: text("image_url").notNull(),
  shape: text("shape").notNull().default("rectangle"),
  linkType: text("link_type").notNull().default("url"),
  linkUrl: text("link_url"),
  linkProductId: integer("link_product_id"),
  linkCategoryId: integer("link_category_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBannerSchema = createInsertSchema(bannersTable).omit({ id: true, createdAt: true });
export type InsertBanner = z.infer<typeof insertBannerSchema>;
export type Banner = typeof bannersTable.$inferSelect;
