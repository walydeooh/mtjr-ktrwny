import { Router, type IRouter } from "express";
import { db, couponsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const CouponBody = z.object({
  code: z.string().min(2).max(50),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.coerce.number().positive(),
  minOrderAmount: z.coerce.number().nonnegative().optional().default(0),
  maxUses: z.coerce.number().int().positive().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  active: z.boolean().optional().default(true),
});

function format(c: typeof couponsTable.$inferSelect) {
  return {
    ...c,
    discountValue: parseFloat(c.discountValue as unknown as string),
    minOrderAmount: parseFloat(c.minOrderAmount as unknown as string),
    expiresAt: c.expiresAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

router.get("/coupons", requireAuth, async (_req, res) => {
  const rows = await db.select().from(couponsTable).orderBy(desc(couponsTable.createdAt));
  res.json(rows.map(format));
});

router.post("/coupons", requireAuth, async (req, res): Promise<void> => {
  const parsed = CouponBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const code = parsed.data.code.trim().toUpperCase();
  try {
    const [created] = await db.insert(couponsTable).values({
      code,
      discountType: parsed.data.discountType,
      discountValue: String(parsed.data.discountValue),
      minOrderAmount: String(parsed.data.minOrderAmount ?? 0),
      maxUses: parsed.data.maxUses ?? null,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      active: parsed.data.active ?? true,
    }).returning();
    res.json(format(created!));
  } catch (e: unknown) {
    res.status(400).json({ error: "كود الكوبون مكرر أو غير صالح" });
  }
});

router.patch("/coupons/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const parsed = CouponBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const update: Record<string, unknown> = {};
  if (parsed.data.code !== undefined) update["code"] = parsed.data.code.trim().toUpperCase();
  if (parsed.data.discountType !== undefined) update["discountType"] = parsed.data.discountType;
  if (parsed.data.discountValue !== undefined) update["discountValue"] = String(parsed.data.discountValue);
  if (parsed.data.minOrderAmount !== undefined) update["minOrderAmount"] = String(parsed.data.minOrderAmount);
  if (parsed.data.maxUses !== undefined) update["maxUses"] = parsed.data.maxUses;
  if (parsed.data.expiresAt !== undefined) update["expiresAt"] = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (parsed.data.active !== undefined) update["active"] = parsed.data.active;
  const [updated] = await db.update(couponsTable).set(update).where(eq(couponsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "غير موجود" }); return; }
  res.json(format(updated));
});

router.delete("/coupons/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  await db.delete(couponsTable).where(eq(couponsTable.id, id));
  res.json({ ok: true });
});

// Public: validate a coupon (used at checkout)
router.post("/coupons/validate", async (req, res): Promise<void> => {
  const body = z.object({ code: z.string(), subtotal: z.coerce.number().nonnegative() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "بيانات غير صحيحة" }); return; }
  const code = body.data.code.trim().toUpperCase();
  const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, code));
  if (!coupon || !coupon.active) { res.status(404).json({ error: "كود غير صالح" }); return; }
  if (coupon.expiresAt && coupon.expiresAt < new Date()) { res.status(400).json({ error: "انتهت صلاحية الكوبون" }); return; }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) { res.status(400).json({ error: "تم استنفاد الكوبون" }); return; }
  const min = parseFloat(coupon.minOrderAmount as unknown as string);
  if (body.data.subtotal < min) { res.status(400).json({ error: `الحد الأدنى للطلب ${min} ر.س` }); return; }
  const value = parseFloat(coupon.discountValue as unknown as string);
  let discount = coupon.discountType === "percent" ? (body.data.subtotal * value) / 100 : value;
  if (discount > body.data.subtotal) discount = body.data.subtotal;
  res.json({
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: value,
    discountAmount: Math.round(discount * 100) / 100,
  });
});

export default router;
