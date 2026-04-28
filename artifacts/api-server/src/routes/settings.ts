import { Router, type IRouter } from "express";
import { db, storeSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateSettingsBody } from "@workspace/api-zod";

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
    whatsappAutoReply: s.whatsappAutoReply,
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

router.patch("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Partial<typeof storeSettingsTable.$inferInsert> = {};
  if (parsed.data.storeName !== undefined) updateData.storeName = parsed.data.storeName;
  if (parsed.data.storeDescription !== undefined) updateData.storeDescription = parsed.data.storeDescription ?? undefined;
  if (parsed.data.storeLogoUrl !== undefined) updateData.storeLogoUrl = parsed.data.storeLogoUrl ?? undefined;
  if (parsed.data.storeCurrency !== undefined) updateData.storeCurrency = parsed.data.storeCurrency;
  if (parsed.data.customDomain !== undefined) updateData.customDomain = parsed.data.customDomain ?? undefined;
  if (parsed.data.aiEnabled !== undefined) updateData.aiEnabled = parsed.data.aiEnabled;
  if (parsed.data.whatsappAutoReply !== undefined) updateData.whatsappAutoReply = parsed.data.whatsappAutoReply;
  if (parsed.data.paylinkApiKey !== undefined && parsed.data.paylinkApiKey !== "***") {
    updateData.paylinkApiKey = parsed.data.paylinkApiKey ?? undefined;
  }
  if (parsed.data.paylinkSecretKey !== undefined && parsed.data.paylinkSecretKey !== "***") {
    updateData.paylinkSecretKey = parsed.data.paylinkSecretKey ?? undefined;
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
