import { pgTable, text, serial, timestamp, numeric, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  imageUrl: text("image_url"),
  type: text("type").notNull().default("physical"),
  category: text("category"),
  categoryId: integer("category_id"),
  stock: integer("stock"),
  active: boolean("active").notNull().default(true),
  // Discount: percent | fixed | none
  discountType: text("discount_type").notNull().default("none"),
  discountValue: numeric("discount_value", { precision: 10, scale: 2 }).notNull().default("0"),
  // Usage instructions: any combination of text/media/url
  usageInstructionsText: text("usage_instructions_text"),
  usageInstructionsMediaUrl: text("usage_instructions_media_url"),
  usageInstructionsMediaType: text("usage_instructions_media_type"), // image | video
  usageInstructionsLinkUrl: text("usage_instructions_link_url"),
  // Source URL when this product was AI-imported from another store
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const digitalCodesTable = pgTable("digital_codes", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  code: text("code").notNull(),
  used: boolean("used").notNull().default(false),
  usedAt: timestamp("used_at", { withTimezone: true }),
  // For order-history display: which order consumed this code (so the
  // customer can see their codes on /my-orders).
  orderId: integer("order_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const timeSlotsTable = pgTable("time_slots", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  maxBookings: integer("max_bookings").notNull().default(1),
  currentBookings: integer("current_bookings").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDigitalCodeSchema = createInsertSchema(digitalCodesTable).omit({ id: true, createdAt: true });
export const insertTimeSlotSchema = createInsertSchema(timeSlotsTable).omit({ id: true, createdAt: true });

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
export type DigitalCode = typeof digitalCodesTable.$inferSelect;
export type TimeSlot = typeof timeSlotsTable.$inferSelect;
