import { Router, type IRouter } from "express";
import { db, ordersTable, customersTable, productsTable } from "@workspace/db";
import { eq, gte, sql } from "drizzle-orm";
import { getWhatsappStatus } from "../lib/whatsapp";
import { GetSalesStatsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/stats/overview", async (_req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const allOrders = await db.select().from(ordersTable);
  const allCustomers = await db.select({ id: customersTable.id }).from(customersTable);
  const allProducts = await db.select({ id: productsTable.id }).from(productsTable);
  const todayOrders = allOrders.filter(o => new Date(o.createdAt) >= today);
  const paidOrders = allOrders.filter(o => o.paymentStatus === "paid");
  const pendingOrders = allOrders.filter(o => ["pending", "payment_pending"].includes(o.status));

  const totalRevenue = paidOrders.reduce((sum, o) => sum + parseFloat(o.totalAmount as unknown as string), 0);
  const revenueToday = todayOrders.filter(o => o.paymentStatus === "paid")
    .reduce((sum, o) => sum + parseFloat(o.totalAmount as unknown as string), 0);

  res.json({
    totalRevenue,
    totalOrders: allOrders.length,
    totalCustomers: allCustomers.length,
    totalProducts: allProducts.length,
    pendingOrders: pendingOrders.length,
    revenueToday,
    ordersToday: todayOrders.length,
    whatsappConnected: getWhatsappStatus().connected,
  });
});

router.get("/stats/sales", async (req, res): Promise<void> => {
  const params = GetSalesStatsQueryParams.safeParse(req.query);
  const period = params.success ? params.data.period : "30d";
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;

  const since = new Date();
  since.setDate(since.getDate() - days);

  const orders = await db.select().from(ordersTable).where(gte(ordersTable.createdAt, since));

  const byDate: Record<string, { revenue: number; orders: number }> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    byDate[key] = { revenue: 0, orders: 0 };
  }

  for (const order of orders) {
    const key = order.createdAt.toISOString().split("T")[0];
    if (byDate[key] !== undefined) {
      byDate[key].orders += 1;
      if (order.paymentStatus === "paid") {
        byDate[key].revenue += parseFloat(order.totalAmount as unknown as string);
      }
    }
  }

  const result = Object.entries(byDate)
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  res.json(result);
});

router.get("/stats/top-products", async (_req, res): Promise<void> => {
  const paidOrders = await db.select().from(ordersTable).where(eq(ordersTable.paymentStatus, "paid"));

  const productStats: Record<number, { name: string; totalSold: number; revenue: number }> = {};
  for (const order of paidOrders) {
    const items = (order.items as unknown as Array<{ productId: number; productName: string; quantity: number; totalPrice: number }>) || [];
    for (const item of items) {
      if (!productStats[item.productId]) {
        productStats[item.productId] = { name: item.productName, totalSold: 0, revenue: 0 };
      }
      productStats[item.productId].totalSold += item.quantity;
      productStats[item.productId].revenue += item.totalPrice;
    }
  }

  const result = Object.entries(productStats)
    .map(([id, data]) => ({ id: parseInt(id), ...data }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  res.json(result);
});

export default router;
