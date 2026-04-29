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
  // Admin notification phone — receives "new order" / "bank receipt" / "affiliate application" alerts.
  adminWhatsappPhone: text("admin_whatsapp_phone"),
  // Contact info
  contactWhatsapp: text("contact_whatsapp"),
  contactEmail: text("contact_email"),
  contactAddress: text("contact_address"),
  socialInstagram: text("social_instagram"),
  socialTwitter: text("social_twitter"),
  socialSnapchat: text("social_snapchat"),
  socialTiktok: text("social_tiktok"),
  // Theme / Design editor
  themePrimaryColor: text("theme_primary_color").notNull().default("#2563eb"),
  themeSecondaryColor: text("theme_secondary_color").notNull().default("#1e40af"),
  // Legacy single banner kept for backward compat; multi-banner lives in `banners` table.
  bannerImageUrl: text("banner_image_url"),
  bannerTitle: text("banner_title"),
  bannerSubtitle: text("banner_subtitle"),
  bannerCtaText: text("banner_cta_text"),
  bannerCtaUrl: text("banner_cta_url"),
  // UX toggles
  floatingCartEnabled: boolean("floating_cart_enabled").notNull().default(true),
  showCategoriesBar: boolean("show_categories_bar").notNull().default(true),
  // Bank transfer (legacy single-account fields kept for backward compat;
  // multi-bank lives in `bank_accounts` table)
  bankTransferEnabled: boolean("bank_transfer_enabled").notNull().default(false),
  bankName: text("bank_name"),
  bankAccountName: text("bank_account_name"),
  bankIban: text("bank_iban"),
  bankAccountNumber: text("bank_account_number"),
  // AI
  aiSystemPrompt: text("ai_system_prompt"),
  // Affiliate program
  affiliateEnabled: boolean("affiliate_enabled").notNull().default(true),
  affiliateDefaultCommission: text("affiliate_default_commission").default("10"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSettingsSchema = createInsertSchema(storeSettingsTable).omit({ id: true, updatedAt: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type StoreSettings = typeof storeSettingsTable.$inferSelect;
