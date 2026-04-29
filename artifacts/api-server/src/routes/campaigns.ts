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
});

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
  const [created] = await db.insert(whatsappCampaignsTable).values({
    name: parsed.data.name,
    message: parsed.data.message,
    scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
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

  const customers = await db.select().from(customersTable);
  await db.update(whatsappCampaignsTable).set({
    status: "sending",
    startedAt: new Date(),
    totalRecipients: customers.length,
    sentCount: 0,
    failedCount: 0,
  }).where(eq(whatsappCampaignsTable.id, id));

  res.json({ ok: true, queued: customers.length });

  // Fire-and-forget background send
  void (async () => {
    let sent = 0;
    let failed = 0;
    for (const c of customers) {
      try {
        await sendWhatsappMessage(c.phone, campaign.message);
        sent++;
      } catch (e) {
        failed++;
        logger.warn({ err: e, customerId: c.id }, "campaign send failed");
      }
      // Throttle to avoid bans
      await new Promise((r) => setTimeout(r, 1500));
      if (sent % 5 === 0 || failed % 5 === 0) {
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
