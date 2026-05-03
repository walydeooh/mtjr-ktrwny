import { Router, type IRouter } from "express";
import { db, storeSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { verifyToken } from "../lib/auth";

function isAuthed(req: { headers: { authorization?: string } }): boolean {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) return false;
  return !!verifyToken(h.slice(7));
}

const router: IRouter = Router();

function formatSettings(s: typeof storeSettingsTable.$inferSelect, includePrivate: boolean) {
  return {
    storeName: s.storeName,
    storeDescription: s.storeDescription || null,
    storeLogoUrl: s.storeLogoUrl || null,
    storeCurrency: s.storeCurrency,
    customDomain: s.customDomain || null,
    paylinkApiKey: includePrivate ? (s.paylinkApiKey ? "***" : null) : null,
    paylinkSecretKey: includePrivate ? (s.paylinkSecretKey ? "***" : null) : null,
    aiEnabled: s.aiEnabled,
    aiSystemPrompt: includePrivate ? (s.aiSystemPrompt || null) : null,
    // AI provider config is admin-only — don't expose to public storefront
    aiProvider: includePrivate ? (s.aiProvider || "openai") : null,
    aiModel: includePrivate ? (s.aiModel || null) : null,
    aiOpenaiApiKey: includePrivate ? (s.aiOpenaiApiKey ? "***" : null) : null,
    aiGeminiApiKey: includePrivate ? (s.aiGeminiApiKey ? "***" : null) : null,
    aiOpenaiConfigured: includePrivate ? !!s.aiOpenaiApiKey : false,
    aiGeminiConfigured: includePrivate ? !!s.aiGeminiApiKey : false,
    whatsappAutoReply: s.whatsappAutoReply,
    adminWhatsappPhone: s.adminWhatsappPhone || null,
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
    floatingCartEnabled: s.floatingCartEnabled,
    showCategoriesBar: s.showCategoriesBar,
    affiliateEnabled: s.affiliateEnabled,
    affiliateDefaultCommission: s.affiliateDefaultCommission || "10",
  };
}

router.get("/settings", async (req, res): Promise<void> => {
  const authed = isAuthed(req);
  const rows = await db.select().from(storeSettingsTable);
  if (rows.length === 0) {
    const [created] = await db.insert(storeSettingsTable).values({}).returning();
    res.json(formatSettings(created, authed));
    return;
  }
  res.json(formatSettings(rows[0], authed));
});

// Map API field name -> DB column property on the schema
const STRING_FIELD_MAP: Record<string, string> = {
  storeName: "storeName",
  storeDescription: "storeDescription",
  storeLogoUrl: "storeLogoUrl",
  storeCurrency: "storeCurrency",
  customDomain: "customDomain",
  aiSystemPrompt: "aiSystemPrompt",
  aiProvider: "aiProvider",
  aiModel: "aiModel",
  adminWhatsappPhone: "adminWhatsappPhone",
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
  affiliateDefaultCommission: "affiliateDefaultCommission",
};
const BOOL_FIELDS = [
  "aiEnabled",
  "whatsappAutoReply",
  "bankTransferEnabled",
  "floatingCartEnabled",
  "showCategoriesBar",
  "affiliateEnabled",
] as const;
const SECRET_FIELDS = ["paylinkApiKey", "paylinkSecretKey", "aiOpenaiApiKey", "aiGeminiApiKey"] as const;

router.patch("/settings", requireAuth, async (req, res): Promise<void> => {
  const body = (req.body || {}) as Record<string, unknown>;
  const updateData: Record<string, unknown> = {};

  for (const [apiKey, dbKey] of Object.entries(STRING_FIELD_MAP)) {
    if (body[apiKey] !== undefined) {
      const v = body[apiKey];
      let strVal = v === null || v === "" ? null : String(v);
      // Validate enum-like fields
      if (apiKey === "aiProvider" && strVal !== null && strVal !== "openai" && strVal !== "gemini") {
        res.status(400).json({ error: `aiProvider must be 'openai' or 'gemini', got: ${strVal}` });
        return;
      }
      // Bound length on free-form AI fields
      if ((apiKey === "aiModel" || apiKey === "aiSystemPrompt") && strVal && strVal.length > 4000) {
        strVal = strVal.slice(0, 4000);
      }
      updateData[dbKey] = strVal;
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
    if (rows.length > 0) { res.json(formatSettings(rows[0], true)); return; }
  }

  const rows = await db.select().from(storeSettingsTable);
  if (rows.length === 0) {
    const [created] = await db.insert(storeSettingsTable).values(updateData).returning();
    res.json(formatSettings(created, true));
    return;
  }
  const [updated] = await db.update(storeSettingsTable).set(updateData).where(eq(storeSettingsTable.id, rows[0].id)).returning();
  res.json(formatSettings(updated, true));
});

export default router;
