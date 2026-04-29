import { Router, type IRouter } from "express";
import { db, storeSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

function formatSettings(s: typeof storeSettingsTable.$inferSelect) {
  return {
    storeName: s.storeName,
    storeDescription: s.storeDescription || null,
    storeLogoUrl: s.storeLogoUrl || null,
    storeCurrency: s.storeCurrency,
    customDomain: s.customDomain || null,
    paylinkApiKey: s.paylinkApiKey ? "***" : null,
    paylinkSecretKey: s.paylinkSecretKey ? "***" : null,
    aiEnabled: s.aiEnabled,
    aiSystemPrompt: s.aiSystemPrompt || null,
    whatsappAutoReply: s.whatsappAutoReply,
    themePrimaryColor: s.themePrimaryColor || "#0ea5e9",
    themeSecondaryColor: s.themeSecondaryColor || "#0284c7",
    bannerImageUrl: s.bannerImageUrl || null,
    bannerTitle: s.bannerTitle || null,
    bannerSubtitle: s.bannerSubtitle || null,
    bannerCtaText: s.bannerCtaText || null,
    bannerCtaUrl: s.bannerCtaUrl || null,
    contactPhone: s.contactWhatsapp || null,
    contactEmail: s.contactEmail || null,
    contactAddress: s.contactAddress || null,
    socialInstagram: s.socialInstagram || null,
    socialTwitter: s.socialTwitter || null,
    socialTiktok: s.socialTiktok || null,
    socialSnapchat: s.socialSnapchat || null,
    bankTransferEnabled: s.bankTransferEnabled,
    bankName: s.bankName || null,
    bankAccountName: s.bankAccountName || null,
    bankAccountIban: s.bankIban || null,
    bankInstructions: s.bankAccountNumber || null,
  };
}

router.get("/settings", async (_req, res): Promise<void> => {
  const rows = await db.select().from(storeSettingsTable);
  if (rows.length === 0) {
    const [created] = await db.insert(storeSettingsTable).values({}).returning();
    res.json(formatSettings(created));
    return;
  }
  res.json(formatSettings(rows[0]));
});

// Map API field name -> DB column property on the schema
const STRING_FIELD_MAP: Record<string, string> = {
  storeName: "storeName",
  storeDescription: "storeDescription",
  storeLogoUrl: "storeLogoUrl",
  storeCurrency: "storeCurrency",
  customDomain: "customDomain",
  aiSystemPrompt: "aiSystemPrompt",
  themePrimaryColor: "themePrimaryColor",
  themeSecondaryColor: "themeSecondaryColor",
  bannerImageUrl: "bannerImageUrl",
  bannerTitle: "bannerTitle",
  bannerSubtitle: "bannerSubtitle",
  bannerCtaText: "bannerCtaText",
  bannerCtaUrl: "bannerCtaUrl",
  contactPhone: "contactWhatsapp",
  contactEmail: "contactEmail",
  contactAddress: "contactAddress",
  socialInstagram: "socialInstagram",
  socialTwitter: "socialTwitter",
  socialTiktok: "socialTiktok",
  socialSnapchat: "socialSnapchat",
  bankName: "bankName",
  bankAccountName: "bankAccountName",
  bankAccountIban: "bankIban",
  bankInstructions: "bankAccountNumber",
};
const BOOL_FIELDS = ["aiEnabled", "whatsappAutoReply", "bankTransferEnabled"] as const;
const SECRET_FIELDS = ["paylinkApiKey", "paylinkSecretKey"] as const;

router.patch("/settings", requireAuth, async (req, res): Promise<void> => {
  const body = (req.body || {}) as Record<string, unknown>;
  const updateData: Record<string, unknown> = {};

  for (const [apiKey, dbKey] of Object.entries(STRING_FIELD_MAP)) {
    if (body[apiKey] !== undefined) {
      const v = body[apiKey];
      updateData[dbKey] = v === null || v === "" ? null : String(v);
    }
  }
  for (const f of BOOL_FIELDS) {
    if (body[f] !== undefined) updateData[f] = Boolean(body[f]);
  }
  for (const f of SECRET_FIELDS) {
    if (body[f] !== undefined && body[f] !== "***" && body[f] !== null) {
      updateData[f] = String(body[f]);
    } else if (body[f] === null) {
      updateData[f] = null;
    }
  }

  if (Object.keys(updateData).length === 0) {
    const rows = await db.select().from(storeSettingsTable);
    if (rows.length > 0) { res.json(formatSettings(rows[0])); return; }
  }

  const rows = await db.select().from(storeSettingsTable);
  if (rows.length === 0) {
    const [created] = await db.insert(storeSettingsTable).values(updateData).returning();
    res.json(formatSettings(created));
    return;
  }
  const [updated] = await db.update(storeSettingsTable).set(updateData).where(eq(storeSettingsTable.id, rows[0].id)).returning();
  res.json(formatSettings(updated));
});

export default router;
