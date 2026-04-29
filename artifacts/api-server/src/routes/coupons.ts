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
  startsAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  applicableProductIds: z.array(z.coerce.number().int()).optional().default([]),
  excludedProductIds: z.array(z.coerce.number().int()).optional().default([]),
  active: z.boolean().optional().default(true),
});

function format(c: typeof couponsTable.$inferSelect) {
  return {
    ...c,
    discountValue: parseFloat(c.discountValue as unknown as string),
    minOrderAmount: parseFloat(c.minOrderAmount as unknown as string),
    startsAt: c.startsAt?.toISOString() ?? null,
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
      startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : null,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      applicableProductIds: parsed.data.applicableProductIds ?? [],
      excludedProductIds: parsed.data.excludedProductIds ?? [],
      active: parsed.data.active ?? true,
    }).returning();
    res.json(format(created!));
  } catch {
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
  if (parsed.data.startsAt !== undefined) update["startsAt"] = parsed.data.startsAt ? new Date(parsed.data.startsAt) : null;
  if (parsed.data.expiresAt !== undefined) update["expiresAt"] = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (parsed.data.applicableProductIds !== undefined) update["applicableProductIds"] = parsed.data.applicableProductIds;
  if (parsed.data.excludedProductIds !== undefined) update["excludedProductIds"] = parsed.data.excludedProductIds;
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

/**
 * Compute the discount for a given coupon against a set of cart items.
 * `items` may be omitted for the simple validation flow; in that case,
 * product-scope rules are skipped (full subtotal is eligible).
 *
 * Used both by the public /coupons/validate endpoint AND by the order
 * creation pipeline so that the same rules govern both the customer-facing
 * preview and the actual charge.
 */
export function computeCouponDiscount(
  coupon: typeof couponsTable.$inferSelect,
  subtotal: number,
  items?: Array<{ productId: number; totalPrice: number }>,
): { ok: true; discount: number } | { ok: false; error: string } {
  if (!coupon.active) return { ok: false, error: "كود غير صالح" };
  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) return { ok: false, error: "الكوبون لم يبدأ بعد" };
  if (coupon.expiresAt && coupon.expiresAt < now) return { ok: false, error: "انتهت صلاحية الكوبون" };
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return { ok: false, error: "تم استنفاد الكوبون" };
  const min = parseFloat(coupon.minOrderAmount as unknown as string);
  if (subtotal < min) return { ok: false, error: `الحد الأدنى للطلب ${min} ر.س` };

  // Determine the eligible subtotal based on product scoping.
  const applicable = (coupon.applicableProductIds as number[] | null) || [];
  const excluded = (coupon.excludedProductIds as number[] | null) || [];
  let eligibleSubtotal = subtotal;
  if (items && (applicable.length > 0 || excluded.length > 0)) {
    eligibleSubtotal = items.reduce((sum, it) => {
      if (excluded.includes(it.productId)) return sum;
      if (applicable.length > 0 && !applicable.includes(it.productId)) return sum;
      return sum + it.totalPrice;
    }, 0);
    if (eligibleSubtotal <= 0) return { ok: false, error: "الكوبون لا ينطبق على منتجات السلة" };
  }

  const v = parseFloat(coupon.discountValue as unknown as string);
  let discount = coupon.discountType === "percent" ? (eligibleSubtotal * v) / 100 : Math.min(v, eligibleSubtotal);
  if (discount > subtotal) discount = subtotal;
  return { ok: true, discount: Math.round(discount * 100) / 100 };
}

// Public: validate a coupon (used at checkout). `items` optional.
router.post("/coupons/validate", async (req, res): Promise<void> => {
  const body = z.object({
    code: z.string(),
    subtotal: z.coerce.number().nonnegative(),
    items: z.array(z.object({ productId: z.coerce.number().int(), totalPrice: z.coerce.number().nonnegative() })).optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "بيانات غير صحيحة" }); return; }
  const code = body.data.code.trim().toUpperCase();
  const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, code));
  if (!coupon) { res.status(404).json({ error: "كود غير صالح" }); return; }
  const r = computeCouponDiscount(coupon, body.data.subtotal, body.data.items);
  if (!r.ok) { res.status(400).json({ error: r.error }); return; }
  res.json({
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: parseFloat(coupon.discountValue as unknown as string),
    discountAmount: r.discount,
  });
});

export default router;
