import { Router, type IRouter, type Request } from "express";
import { db, ordersTable, digitalCodesTable, productsTable } from "@workspace/db";
import { eq, desc, inArray, and } from "drizzle-orm";
import { requireCustomer } from "../middlewares/customer-auth";

const router: IRouter = Router();

function formatOrder(o: typeof ordersTable.$inferSelect) {
  return {
    ...o,
    totalAmount: parseFloat(o.totalAmount as unknown as string),
    items: (o.items as unknown[]) || [],
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

router.get("/my-orders", requireCustomer, async (req, res): Promise<void> => {
  const customer = (req as Request & { customer: { id: number; phone: string } }).customer;

  const orders = await db.select().from(ordersTable)
    .where(eq(ordersTable.customerPhone, customer.phone))
    .orderBy(desc(ordersTable.createdAt));

  // Attach digital codes & usage instructions per paid order with digital products.
  const formatted = orders.map(formatOrder);
  const orderIds = formatted.filter((o) => o.paymentStatus === "paid").map((o) => o.id);
  if (orderIds.length === 0) {
    res.json(formatted);
    return;
  }

  // All used codes belonging to this customer's paid orders.
  const usedCodes = await db
    .select()
    .from(digitalCodesTable)
    .where(and(eq(digitalCodesTable.used, true), inArray(digitalCodesTable.orderId, orderIds)));

  // Fetch product usage instructions for any digital products in those orders.
  const productIds = Array.from(new Set(usedCodes.map((c) => c.productId)));
  const products = productIds.length
    ? await db.select().from(productsTable).where(inArray(productsTable.id, productIds))
    : [];
  const productMap = new Map(products.map((p) => [p.id, p]));

  const codesByOrder = new Map<number, Array<{ productId: number; productName: string; code: string; usageInstructionsText: string | null; usageInstructionsMediaUrl: string | null; usageInstructionsMediaType: string | null; usageInstructionsLinkUrl: string | null }>>();
  for (const c of usedCodes) {
    if (c.orderId == null) continue;
    const arr = codesByOrder.get(c.orderId) || [];
    const p = productMap.get(c.productId);
    arr.push({
      productId: c.productId,
      productName: p?.name || "",
      code: c.code,
      usageInstructionsText: p?.usageInstructionsText ?? null,
      usageInstructionsMediaUrl: p?.usageInstructionsMediaUrl ?? null,
      usageInstructionsMediaType: p?.usageInstructionsMediaType ?? null,
      usageInstructionsLinkUrl: p?.usageInstructionsLinkUrl ?? null,
    });
    codesByOrder.set(c.orderId, arr);
  }

  res.json(formatted.map((o) => ({ ...o, digitalCodes: codesByOrder.get(o.id) || [] })));
});

export default router;
