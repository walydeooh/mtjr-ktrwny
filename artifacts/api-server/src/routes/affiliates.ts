import { Router, type IRouter } from "express";
import { db, affiliatesTable, affiliateReferralsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const AffiliateBody = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().min(8),
  email: z.string().email().nullable().optional(),
  code: z.string().min(2).max(30).optional(),
  commissionPercent: z.coerce.number().min(0).max(100).optional().default(10),
  active: z.boolean().optional().default(true),
});

function format(a: typeof affiliatesTable.$inferSelect) {
  return {
    ...a,
    commissionPercent: parseFloat(a.commissionPercent as unknown as string),
    totalEarned: parseFloat(a.totalEarned as unknown as string),
    totalPaid: parseFloat(a.totalPaid as unknown as string),
    createdAt: a.createdAt.toISOString(),
  };
}

function generateCode(name: string): string {
  const slug = name.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, "").slice(0, 6).toUpperCase() || "AFF";
  return slug + Math.random().toString(36).slice(2, 6).toUpperCase();
}

router.get("/affiliates", requireAuth, async (_req, res) => {
  const rows = await db.select().from(affiliatesTable).orderBy(desc(affiliatesTable.createdAt));
  res.json(rows.map(format));
});

router.post("/affiliates", requireAuth, async (req, res): Promise<void> => {
  const parsed = AffiliateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const code = (parsed.data.code || generateCode(parsed.data.name)).toUpperCase();
  try {
    const [created] = await db.insert(affiliatesTable).values({
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email ?? null,
      code,
      commissionPercent: String(parsed.data.commissionPercent ?? 10),
      active: parsed.data.active ?? true,
    }).returning();
    res.json(format(created!));
  } catch {
    res.status(400).json({ error: "كود المسوّق مكرر" });
  }
});

router.patch("/affiliates/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const parsed = AffiliateBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update["name"] = parsed.data.name;
  if (parsed.data.phone !== undefined) update["phone"] = parsed.data.phone;
  if (parsed.data.email !== undefined) update["email"] = parsed.data.email;
  if (parsed.data.code !== undefined) update["code"] = parsed.data.code.toUpperCase();
  if (parsed.data.commissionPercent !== undefined) update["commissionPercent"] = String(parsed.data.commissionPercent);
  if (parsed.data.active !== undefined) update["active"] = parsed.data.active;
  const [updated] = await db.update(affiliatesTable).set(update).where(eq(affiliatesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "غير موجود" }); return; }
  res.json(format(updated));
});

router.delete("/affiliates/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  await db.delete(affiliatesTable).where(eq(affiliatesTable.id, id));
  res.json({ ok: true });
});

router.get("/affiliates/:id/referrals", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const rows = await db.select().from(affiliateReferralsTable).where(eq(affiliateReferralsTable.affiliateId, id)).orderBy(desc(affiliateReferralsTable.createdAt));
  res.json(rows.map((r) => ({
    ...r,
    commissionAmount: parseFloat(r.commissionAmount as unknown as string),
    createdAt: r.createdAt.toISOString(),
  })));
});

router.post("/affiliates/:id/payout", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const body = z.object({ amount: z.coerce.number().positive() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "مبلغ غير صحيح" }); return; }
  const [aff] = await db.select().from(affiliatesTable).where(eq(affiliatesTable.id, id));
  if (!aff) { res.status(404).json({ error: "غير موجود" }); return; }
  const newPaid = parseFloat(aff.totalPaid as unknown as string) + body.data.amount;
  const [updated] = await db.update(affiliatesTable).set({ totalPaid: String(newPaid) }).where(eq(affiliatesTable.id, id)).returning();
  res.json(format(updated!));
});

// Public: validate affiliate code (used at checkout to associate)
router.get("/affiliates/by-code/:code", async (req, res): Promise<void> => {
  const code = (req.params["code"] || "").toUpperCase();
  const [aff] = await db.select().from(affiliatesTable).where(eq(affiliatesTable.code, code));
  if (!aff || !aff.active) { res.status(404).json({ error: "غير موجود" }); return; }
  res.json({ code: aff.code, name: aff.name });
});

export default router;
