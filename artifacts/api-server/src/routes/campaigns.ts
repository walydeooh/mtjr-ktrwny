import { Router, type IRouter } from "express";
import { db, whatsappCampaignsTable, customersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";
import { sendWhatsappMessage, getWhatsappStatus } from "../lib/whatsapp";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const CampaignBody = z.object({
  name: z.string().min(2),
  message: z.string().min(2),
  scheduledAt: z.string().datetime().nullable().optional(),
  delayMinSeconds: z.coerce.number().int().min(1).max(600).optional().default(5),
  delayMaxSeconds: z.coerce.number().int().min(1).max(600).optional().default(50),
  recipientPhones: z.string().nullable().optional(),
});

function parseRecipientPhones(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function format(c: typeof whatsappCampaignsTable.$inferSelect) {
  return {
    ...c,
    scheduledAt: c.scheduledAt?.toISOString() ?? null,
    startedAt: c.startedAt?.toISOString() ?? null,
    finishedAt: c.finishedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

router.get("/campaigns", requireAuth, async (_req, res) => {
  const rows = await db.select().from(whatsappCampaignsTable).orderBy(desc(whatsappCampaignsTable.createdAt));
  res.json(rows.map(format));
});

router.post("/campaigns", requireAuth, async (req, res): Promise<void> => {
  const parsed = CampaignBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const min = Math.min(parsed.data.delayMinSeconds ?? 5, parsed.data.delayMaxSeconds ?? 50);
  const max = Math.max(parsed.data.delayMinSeconds ?? 5, parsed.data.delayMaxSeconds ?? 50);
  const [created] = await db.insert(whatsappCampaignsTable).values({
    name: parsed.data.name,
    message: parsed.data.message,
    scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
    delayMinSeconds: min,
    delayMaxSeconds: max,
    recipientPhones: parsed.data.recipientPhones ?? null,
    status: "draft",
  }).returning();
  res.json(format(created!));
});

router.delete("/campaigns/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  await db.delete(whatsappCampaignsTable).where(eq(whatsappCampaignsTable.id, id));
  res.json({ ok: true });
});

router.post("/campaigns/:id/send", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const [campaign] = await db.select().from(whatsappCampaignsTable).where(eq(whatsappCampaignsTable.id, id));
  if (!campaign) { res.status(404).json({ error: "غير موجودة" }); return; }
  if (campaign.status === "sending" || campaign.status === "sent") { res.status(400).json({ error: "تم إرسال الحملة بالفعل" }); return; }

  const status = getWhatsappStatus();
  if (!status.connected) { res.status(400).json({ error: "واتساب غير متصل" }); return; }

  // Determine recipients: explicit list wins, else fall back to all customers.
  const explicit = parseRecipientPhones(campaign.recipientPhones);
  const phones: string[] = explicit.length > 0
    ? explicit
    : (await db.select().from(customersTable)).map((c) => c.phone);

  await db.update(whatsappCampaignsTable).set({
    status: "sending",
    startedAt: new Date(),
    totalRecipients: phones.length,
    sentCount: 0,
    failedCount: 0,
  }).where(eq(whatsappCampaignsTable.id, id));

  res.json({ ok: true, queued: phones.length });

  const minMs = Math.max(1, campaign.delayMinSeconds) * 1000;
  const maxMs = Math.max(minMs, campaign.delayMaxSeconds * 1000);

  // Fire-and-forget background send with random human-like jitter.
  void (async () => {
    let sent = 0;
    let failed = 0;
    for (const phone of phones) {
      try {
        await sendWhatsappMessage(phone, campaign.message);
        sent++;
      } catch (e) {
        failed++;
        logger.warn({ err: e, phone }, "campaign send failed");
      }
      const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
      await new Promise((r) => setTimeout(r, delay));
      if ((sent + failed) % 5 === 0) {
        await db.update(whatsappCampaignsTable).set({ sentCount: sent, failedCount: failed }).where(eq(whatsappCampaignsTable.id, id));
      }
    }
    await db.update(whatsappCampaignsTable).set({
      sentCount: sent,
      failedCount: failed,
      status: "sent",
      finishedAt: new Date(),
    }).where(eq(whatsappCampaignsTable.id, id));
    logger.info({ id, sent, failed }, "campaign finished");
  })();
});

export default router;
