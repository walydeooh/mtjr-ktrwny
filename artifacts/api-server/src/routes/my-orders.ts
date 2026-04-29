import { Router, type IRouter, type Request } from "express";
import { db, ordersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
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

  res.json(orders.map(formatOrder));
});

export default router;
