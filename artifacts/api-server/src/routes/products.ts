import { Router, type IRouter } from "express";
import { db, productsTable, digitalCodesTable, timeSlotsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
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

router.post("/products", async (req, res): Promise<void> => {
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

router.patch("/products/:id", async (req, res): Promise<void> => {
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

router.delete("/products/:id", async (req, res): Promise<void> => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(productsTable).where(eq(productsTable.id, params.data.id));
  res.sendStatus(204);
});

router.get("/products/:id/codes", async (req, res): Promise<void> => {
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

router.post("/products/:id/codes", async (req, res): Promise<void> => {
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
  res.status(201).json({
    ...code,
    usedAt: code.usedAt?.toISOString() || null,
    createdAt: code.createdAt.toISOString(),
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

router.post("/products/:id/availability", async (req, res): Promise<void> => {
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
