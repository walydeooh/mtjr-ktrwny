import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, productsTable, subscriptionPlansTable, customerSubscriptionsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireCustomer } from "../middlewares/customer-auth";

const router: IRouter = Router();

function formatPlan(p: typeof subscriptionPlansTable.$inferSelect) {
  return {
    id: p.id,
    productId: p.productId,
    name: p.name,
    durationDays: p.durationDays,
    price: parseFloat(p.price as unknown as string),
    sortOrder: p.sortOrder,
    active: p.active,
  };
}

function formatSubscription(s: typeof customerSubscriptionsTable.$inferSelect) {
  const now = Date.now();
  const expiresMs = new Date(s.expiresAt).getTime();
  const remainingMs = Math.max(0, expiresMs - now);
  const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
  // Auto-derive status if expired
  const status = s.status === "active" && expiresMs < now ? "expired" : s.status;
  return {
    id: s.id,
    productId: s.productId,
    productName: s.productName,
    planId: s.planId,
    planName: s.planName,
    durationDays: s.durationDays,
    orderId: s.orderId,
    startedAt: s.startedAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    status,
    remainingDays,
    isActive: status === "active" && remainingMs > 0,
  };
}

// PUBLIC — list plans for a product (used on product page + cart)
router.get("/products/:id/subscription-plans", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id || "", 10);
  if (!id || isNaN(id)) { res.status(400).json({ error: "معرّف منتج غير صالح" }); return; }
  const plans = await db.select().from(subscriptionPlansTable)
    .where(and(eq(subscriptionPlansTable.productId, id), eq(subscriptionPlansTable.active, true)));
  plans.sort((a, b) => (a.sortOrder - b.sortOrder) || (a.durationDays - b.durationDays));
  res.json(plans.map(formatPlan));
});

// ADMIN — list all (incl. inactive)
router.get("/admin/products/:id/subscription-plans", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id || "", 10);
  if (!id || isNaN(id)) { res.status(400).json({ error: "معرّف منتج غير صالح" }); return; }
  const plans = await db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.productId, id));
  plans.sort((a, b) => (a.sortOrder - b.sortOrder) || (a.durationDays - b.durationDays));
  res.json(plans.map(formatPlan));
});

const planBody = z.object({
  name: z.string().min(1).max(100),
  durationDays: z.coerce.number().int().min(1).max(36500),
  price: z.coerce.number().min(0),
  sortOrder: z.coerce.number().int().optional(),
  active: z.boolean().optional(),
});

router.post("/admin/products/:id/subscription-plans", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id || "", 10);
  if (!id || isNaN(id)) { res.status(400).json({ error: "معرّف منتج غير صالح" }); return; }
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!product) { res.status(404).json({ error: "المنتج غير موجود" }); return; }
  if (product.type !== "subscription") {
    res.status(400).json({ error: "لا يمكن إضافة خطط اشتراك لمنتج غير اشتراكي" });
    return;
  }
  const parsed = planBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [created] = await db.insert(subscriptionPlansTable).values({
    productId: id,
    name: parsed.data.name,
    durationDays: parsed.data.durationDays,
    price: String(parsed.data.price),
    sortOrder: parsed.data.sortOrder ?? 0,
    active: parsed.data.active ?? true,
  }).returning();
  res.status(201).json(formatPlan(created));
});

router.patch("/admin/subscription-plans/:planId", requireAuth, async (req, res): Promise<void> => {
  const planId = parseInt(req.params.planId || "", 10);
  if (!planId || isNaN(planId)) { res.status(400).json({ error: "معرّف خطة غير صالح" }); return; }
  const parsed = planBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const update: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.price !== undefined) update.price = String(parsed.data.price);
  const [updated] = await db.update(subscriptionPlansTable).set(update).where(eq(subscriptionPlansTable.id, planId)).returning();
  if (!updated) { res.status(404).json({ error: "الخطة غير موجودة" }); return; }
  res.json(formatPlan(updated));
});

router.delete("/admin/subscription-plans/:planId", requireAuth, async (req, res): Promise<void> => {
  const planId = parseInt(req.params.planId || "", 10);
  if (!planId || isNaN(planId)) { res.status(400).json({ error: "معرّف خطة غير صالح" }); return; }
  await db.delete(subscriptionPlansTable).where(eq(subscriptionPlansTable.id, planId));
  res.sendStatus(204);
});

// CUSTOMER — list my subscriptions
router.get("/my-subscriptions", requireCustomer, async (req, res): Promise<void> => {
  const customerId = (req as { customer?: { id: number } }).customer?.id;
  if (!customerId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const rows = await db.select().from(customerSubscriptionsTable)
    .where(eq(customerSubscriptionsTable.customerId, customerId))
    .orderBy(desc(customerSubscriptionsTable.startedAt));
  res.json(rows.map(formatSubscription));
});

export default router;
