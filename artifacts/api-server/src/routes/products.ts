import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, productsTable, digitalCodesTable, timeSlotsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  CreateProductBody,
  UpdateProductBody,
  GetProductParams,
  UpdateProductParams,
  DeleteProductParams,
  ListProductCodesParams,
  AddProductCodeParams,
  AddProductCodeBody,
  GetProductAvailabilityParams,
  GetProductAvailabilityQueryParams,
  AddAvailabilitySlotParams,
  AddAvailabilitySlotBody,
  ListProductsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatProduct(p: typeof productsTable.$inferSelect) {
  return {
    ...p,
    price: parseFloat(p.price as unknown as string),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

router.get("/products", async (req, res): Promise<void> => {
  const params = ListProductsQueryParams.safeParse(req.query);
  let query = db.select().from(productsTable);
  const conditions = [];

  if (params.success) {
    if (params.data.type) {
      conditions.push(eq(productsTable.type, params.data.type));
    }
    if (params.data.active !== undefined) {
      conditions.push(eq(productsTable.active, params.data.active === "true"));
    }
  }

  let products;
  if (conditions.length > 0) {
    products = await db.select().from(productsTable).where(and(...conditions));
  } else {
    products = await db.select().from(productsTable);
  }

  res.json(products.map(formatProduct));
});

router.post("/products", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const insertData: Record<string, unknown> = {
    ...parsed.data,
    price: String(parsed.data.price),
    active: parsed.data.active !== undefined ? parsed.data.active : true,
  };
  // Strip null values that would violate NOT NULL constraints (use defaults).
  for (const k of ["discountType", "discountValue"]) {
    if (insertData[k] === null) delete insertData[k];
  }
  const [product] = await db.insert(productsTable).values(insertData as never).returning();
  res.status(201).json(formatProduct(product));
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, params.data.id));
  if (!product) {
    res.status(404).json({ error: "المنتج غير موجود" });
    return;
  }
  res.json(formatProduct(product));
});

router.patch("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.price !== undefined) updateData.price = String(parsed.data.price);
  // Strip null for NOT NULL columns.
  for (const k of ["discountType", "discountValue"]) {
    if (updateData[k] === null) delete updateData[k];
  }
  const [product] = await db.update(productsTable).set(updateData as never).where(eq(productsTable.id, params.data.id)).returning();
  if (!product) {
    res.status(404).json({ error: "المنتج غير موجود" });
    return;
  }
  res.json(formatProduct(product));
});

router.delete("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(productsTable).where(eq(productsTable.id, params.data.id));
  res.sendStatus(204);
});

router.get("/products/:id/codes", requireAuth, async (req, res): Promise<void> => {
  const params = ListProductCodesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const codes = await db.select().from(digitalCodesTable).where(eq(digitalCodesTable.productId, params.data.id));
  res.json(codes.map(c => ({
    ...c,
    usedAt: c.usedAt?.toISOString() || null,
    createdAt: c.createdAt.toISOString(),
  })));
});

router.post("/products/:id/codes", requireAuth, async (req, res): Promise<void> => {
  const params = AddProductCodeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = AddProductCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [code] = await db.insert(digitalCodesTable).values({
    productId: params.data.id,
    code: parsed.data.code,
  }).returning();
  if (!code) { res.status(500).json({ error: "تعذّر إضافة الكود" }); return; }
  res.status(201).json({
    ...code,
    usedAt: code.usedAt?.toISOString() || null,
    createdAt: code.createdAt.toISOString(),
  });
});

// Bulk add: accepts an array of code strings, trims and de-duplicates them
// (both within the request AND against existing codes for the same product),
// then inserts in a single round-trip. Returns counts so the UI can report.
router.post("/products/:id/codes/bulk", requireAuth, async (req, res): Promise<void> => {
  const idRaw = req.params.id;
  const productId = parseInt(typeof idRaw === "string" ? idRaw : "", 10);
  if (!productId || isNaN(productId)) {
    res.status(400).json({ error: "معرّف منتج غير صالح" });
    return;
  }
  const body = z.object({ codes: z.array(z.string()) }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  // Confirm the product exists and is digital — adding codes to a physical
  // or booking product is meaningless and likely a UI bug.
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId)).limit(1);
  if (!product) { res.status(404).json({ error: "المنتج غير موجود" }); return; }
  if (product.type !== "digital") {
    res.status(400).json({ error: "لا يمكن إضافة أكواد لمنتج غير رقمي" });
    return;
  }
  // Trim and de-duplicate within the request.
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const raw of body.data.codes) {
    const c = raw.trim();
    if (!c || seen.has(c)) continue;
    seen.add(c);
    cleaned.push(c);
  }
  // Filter against codes that already exist for this product, so re-pasting
  // the same list is a no-op instead of creating duplicates.
  let toInsert = cleaned;
  if (cleaned.length > 0) {
    const existing = await db
      .select({ code: digitalCodesTable.code })
      .from(digitalCodesTable)
      .where(eq(digitalCodesTable.productId, productId));
    const existingSet = new Set(existing.map(e => e.code));
    toInsert = cleaned.filter(c => !existingSet.has(c));
  }
  const skipped = body.data.codes.length - toInsert.length;
  if (toInsert.length === 0) {
    res.status(201).json({ added: 0, skipped, codes: [] });
    return;
  }
  const inserted = await db.insert(digitalCodesTable)
    .values(toInsert.map(code => ({ productId, code })))
    .returning();
  res.status(201).json({
    added: inserted.length,
    skipped,
    codes: inserted.map(c => ({
      ...c,
      usedAt: c.usedAt?.toISOString() || null,
      createdAt: c.createdAt.toISOString(),
    })),
  });
});

router.get("/products/:id/availability", async (req, res): Promise<void> => {
  const params = GetProductAvailabilityParams.safeParse(req.params);
  const query = GetProductAvailabilityQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  let slots;
  if (query.success && query.data.date) {
    slots = await db.select().from(timeSlotsTable).where(
      and(eq(timeSlotsTable.productId, params.data.id), eq(timeSlotsTable.date, query.data.date))
    );
  } else {
    slots = await db.select().from(timeSlotsTable).where(eq(timeSlotsTable.productId, params.data.id));
  }

  res.json(slots.map(s => ({
    ...s,
    available: s.currentBookings < s.maxBookings,
  })));
});

router.post("/products/:id/availability", requireAuth, async (req, res): Promise<void> => {
  const params = AddAvailabilitySlotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = AddAvailabilitySlotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [slot] = await db.insert(timeSlotsTable).values({
    productId: params.data.id,
    ...parsed.data,
  }).returning();
  res.status(201).json({
    ...slot,
    available: slot.currentBookings < slot.maxBookings,
  });
});

export default router;
