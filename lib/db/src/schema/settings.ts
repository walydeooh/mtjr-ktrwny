import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const storeSettingsTable = pgTable("store_settings", {
  id: serial("id").primaryKey(),
  storeName: text("store_name").notNull().default("متجري"),
  storeDescription: text("store_description"),
  storeLogoUrl: text("store_logo_url"),
  storeCurrency: text("store_currency").notNull().default("SAR"),
  customDomain: text("custom_domain"),
  paylinkApiKey: text("paylink_api_key"),
  paylinkSecretKey: text("paylink_secret_key"),
  aiEnabled: boolean("ai_enabled").notNull().default(false),
  whatsappAutoReply: boolean("whatsapp_auto_reply").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSettingsSchema = createInsertSchema(storeSettingsTable).omit({ id: true, updatedAt: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type StoreSettings = typeof storeSettingsTable.$inferSelect;
