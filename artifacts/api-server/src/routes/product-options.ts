import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, productsTable, productOptionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

function formatOption(o: typeof productOptionsTable.$inferSelect) {
  return {
    id: o.id,
    productId: o.productId,
    name: o.name,
    price: parseFloat(o.price as unknown as string),
    sortOrder: o.sortOrder,
    active: o.active,
  };
}

// PUBLIC — list ACTIVE options for a product (used on product page)
router.get("/products/:id/options", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id || "", 10);
  if (!id || isNaN(id)) { res.status(400).json({ error: "معرّف منتج غير صالح" }); return; }
  const rows = await db.select().from(productOptionsTable).where(
    and(eq(productOptionsTable.productId, id), eq(productOptionsTable.active, true))
  );
  rows.sort((a, b) => (a.sortOrder - b.sortOrder) || (a.id - b.id));
  res.json(rows.map(formatOption));
});

// ADMIN — list all (incl. inactive)
router.get("/admin/products/:id/options", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id || "", 10);
  if (!id || isNaN(id)) { res.status(400).json({ error: "معرّف منتج غير صالح" }); return; }
  const rows = await db.select().from(productOptionsTable).where(eq(productOptionsTable.productId, id));
  rows.sort((a, b) => (a.sortOrder - b.sortOrder) || (a.id - b.id));
  res.json(rows.map(formatOption));
});

const optionBody = z.object({
  name: z.string().min(1).max(200),
  price: z.coerce.number().min(0),
  sortOrder: z.coerce.number().int().optional(),
  active: z.boolean().optional(),
});

router.post("/admin/products/:id/options", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id || "", 10);
  if (!id || isNaN(id)) { res.status(400).json({ error: "معرّف منتج غير صالح" }); return; }
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!product) { res.status(404).json({ error: "المنتج غير موجود" }); return; }
  const parsed = optionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [created] = await db.insert(productOptionsTable).values({
    productId: id,
    name: parsed.data.name,
    price: String(parsed.data.price),
    sortOrder: parsed.data.sortOrder ?? 0,
    active: parsed.data.active ?? true,
  }).returning();
  res.status(201).json(formatOption(created));
});

router.patch("/admin/product-options/:optionId", requireAuth, async (req, res): Promise<void> => {
  const optionId = parseInt(req.params.optionId || "", 10);
  if (!optionId || isNaN(optionId)) { res.status(400).json({ error: "معرّف خيار غير صالح" }); return; }
  const parsed = optionBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const update: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.price !== undefined) update.price = String(parsed.data.price);
  const [updated] = await db.update(productOptionsTable).set(update).where(eq(productOptionsTable.id, optionId)).returning();
  if (!updated) { res.status(404).json({ error: "الخيار غير موجود" }); return; }
  res.json(formatOption(updated));
});

router.delete("/admin/product-options/:optionId", requireAuth, async (req, res): Promise<void> => {
  const optionId = parseInt(req.params.optionId || "", 10);
  if (!optionId || isNaN(optionId)) { res.status(400).json({ error: "معرّف خيار غير صالح" }); return; }
  await db.delete(productOptionsTable).where(eq(productOptionsTable.id, optionId));
  res.sendStatus(204);
});

export default router;
