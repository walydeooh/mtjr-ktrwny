import { Router, type IRouter } from "express";
import { db, ordersTable, customersTable, productsTable, digitalCodesTable, couponsTable, affiliatesTable, affiliateReferralsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import {
  CreateOrderBody,
  UpdateOrderBody,
  GetOrderParams,
  UpdateOrderParams,
  ListOrdersQueryParams,
  CreateOrderPaymentParams,
  VerifyPaymentBody,
} from "@workspace/api-zod";
import { sendWhatsappMessage } from "../lib/whatsapp";

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

router.get("/orders", async (req, res): Promise<void> => {
  const params = ListOrdersQueryParams.safeParse(req.query);
  const conditions = [];

  if (params.success) {
    if (params.data.status) {
      conditions.push(eq(ordersTable.status, params.data.status));
    }
    if (params.data.customerId) {
      conditions.push(eq(ordersTable.customerId, params.data.customerId));
    }
  }

  let orders;
  if (conditions.length > 0) {
    orders = await db.select().from(ordersTable).where(and(...conditions));
  } else {
    orders = await db.select().from(ordersTable);
  }

  res.json(orders.map(formatOrder));
});

router.post("/orders", async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let subtotal = 0;
  const orderItems = [];

  for (const item of parsed.data.items) {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
    if (!product) {
      res.status(400).json({ error: `المنتج ${item.productId} غير موجود` });
      return;
    }
    const unitPrice = parseFloat(product.price as unknown as string);
    const totalPrice = unitPrice * item.quantity;
    subtotal += totalPrice;
    orderItems.push({
      id: product.id,
      productId: product.id,
      productName: product.name,
      quantity: item.quantity,
      unitPrice,
      totalPrice,
    });
  }

  // Coupon application
  let discountAmount = 0;
  let couponCode: string | null = null;
  const extras = req.body as { couponCode?: string; affiliateCode?: string; paymentMethod?: string };
  if (extras.couponCode) {
    const code = String(extras.couponCode).trim().toUpperCase();
    const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, code));
    if (coupon && coupon.active) {
      const expired = coupon.expiresAt && coupon.expiresAt < new Date();
      const exhausted = coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses;
      const minOk = subtotal >= parseFloat(coupon.minOrderAmount as unknown as string);
      if (!expired && !exhausted && minOk) {
        const v = parseFloat(coupon.discountValue as unknown as string);
        discountAmount = coupon.discountType === "percent" ? (subtotal * v) / 100 : v;
        if (discountAmount > subtotal) discountAmount = subtotal;
        discountAmount = Math.round(discountAmount * 100) / 100;
        couponCode = code;
      }
    }
  }
  const totalAmount = Math.max(0, subtotal - discountAmount);

  // Affiliate code (just record on the order; commission credited on payment)
  let affiliateCode: string | null = null;
  if (extras.affiliateCode) {
    const aff = String(extras.affiliateCode).trim().toUpperCase();
    const [a] = await db.select().from(affiliatesTable).where(eq(affiliatesTable.code, aff));
    if (a && a.active) affiliateCode = aff;
  }

  let customerId: number | null = null;
  const existingCustomers = await db.select().from(customersTable).where(eq(customersTable.phone, parsed.data.customerPhone));
  if (existingCustomers.length > 0) {
    customerId = existingCustomers[0].id;
    await db.update(customersTable).set({
      totalOrders: existingCustomers[0].totalOrders + 1,
      totalSpent: String(parseFloat(existingCustomers[0].totalSpent as unknown as string) + totalAmount),
    }).where(eq(customersTable.id, customerId));
  } else {
    const [customer] = await db.insert(customersTable).values({
      name: parsed.data.customerName,
      phone: parsed.data.customerPhone,
      totalOrders: 1,
      totalSpent: String(totalAmount),
    }).returning();
    customerId = customer.id;
  }

  const [order] = await db.insert(ordersTable).values({
    customerId,
    customerName: parsed.data.customerName,
    customerPhone: parsed.data.customerPhone,
    items: orderItems as unknown as null,
    totalAmount: String(totalAmount),
    status: "pending",
    paymentStatus: "unpaid",
    paymentMethod: extras.paymentMethod === "bank_transfer" ? "bank_transfer" : null,
    couponCode,
    discountAmount: String(discountAmount),
    affiliateCode,
    notes: parsed.data.notes || null,
    source: parsed.data.source || "web",
  }).returning();

  // Coupon usage is incremented on successful payment, not at order creation,
  // to prevent unpaid orders from depleting coupon limits.

  res.status(201).json(formatOrder(order));
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }
  res.json(formatOrder(order));
});

router.patch("/orders/:id", async (req, res): Promise<void> => {
  const params = UpdateOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }

  const [updated] = await db.update(ordersTable).set(parsed.data).where(eq(ordersTable.id, params.data.id)).returning();

  if (parsed.data.paymentStatus === "paid" && order.paymentStatus !== "paid") {
    const items = (order.items as unknown as Array<{ productId: number; productName: string; quantity: number }>) || [];
    for (const item of items) {
      const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
      if (product?.type === "digital") {
        const [code] = await db.select().from(digitalCodesTable).where(
          and(eq(digitalCodesTable.productId, item.productId), eq(digitalCodesTable.used, false))
        );
        if (code) {
          await db.update(digitalCodesTable).set({ used: true, usedAt: new Date() }).where(eq(digitalCodesTable.id, code.id));
          try {
            await sendWhatsappMessage(order.customerPhone, `شكراً لطلبك! كود المنتج الخاص بك هو: ${code.code}`);
          } catch {
            req.log.warn("Could not send WhatsApp message for digital code");
          }
        }
      }
    }
    try {
      await sendWhatsappMessage(order.customerPhone, `تم تأكيد طلبك رقم #${order.id} بنجاح! شكراً لثقتك بنا.`);
    } catch {
      req.log.warn("Could not send WhatsApp confirmation");
    }
  }

  res.json(formatOrder(updated));
});

router.post("/orders/:id/payment", async (req, res): Promise<void> => {
  const params = CreateOrderPaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }

  const [settings] = await db.select().from(
    (await import("@workspace/db")).storeSettingsTable
  );

  const amount = parseFloat(order.totalAmount as unknown as string);
  const paymentId = `order_${order.id}_${Date.now()}`;
  const origin = process.env["REPLIT_DEV_DOMAIN"]
    ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
    : (process.env["REPLIT_DOMAINS"] ? `https://${process.env["REPLIT_DOMAINS"].split(",")[0]}` : "http://localhost");
  let paymentUrl = `${origin}/payment/success?orderId=${order.id}&mock=1`;
  let paylinkTransactionNo: string | null = null;

  if (settings?.paylinkApiKey && settings?.paylinkSecretKey) {
    try {
      const paylinkRes = await fetch("https://restapi.paylink.sa/api/addInvoice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apiId: settings.paylinkApiKey,
          apiPassword: settings.paylinkSecretKey,
        },
        body: JSON.stringify({
          amount,
          callBackUrl: `${origin}/api/payments/callback?orderId=${order.id}`,
          clientEmail: "customer@example.com",
          clientMobile: order.customerPhone,
          clientName: order.customerName,
          currency: "SAR",
          note: `طلب رقم ${order.id}`,
          orderNumber: String(order.id),
          products: [{ title: "طلب من المتجر", price: amount, qty: 1 }],
        }),
      });
      if (paylinkRes.ok) {
        const data = await paylinkRes.json() as { url?: string; paymentUrl?: string; transactionNo?: string; gatewayOrderRequestId?: string };
        const url = data.url || data.paymentUrl;
        if (url) paymentUrl = url;
        paylinkTransactionNo = data.transactionNo || data.gatewayOrderRequestId || null;
      } else {
        req.log.warn({ status: paylinkRes.status }, "Paylink API returned non-OK");
      }
    } catch (e) {
      req.log.warn({ err: e }, "Paylink API error, using mock payment link");
    }
  }

  await db.update(ordersTable).set({
    paymentId,
    paymentLink: paymentUrl,
    paymentMethod: "paylink",
    paylinkTransactionNo,
    paymentStatus: "pending",
    status: "payment_pending",
  }).where(eq(ordersTable.id, order.id));

  try {
    await sendWhatsappMessage(order.customerPhone, `رابط الدفع لطلبك رقم #${order.id}: ${paymentUrl}`);
  } catch {
    req.log.warn("Could not send payment link via WhatsApp");
  }

  res.json({ paymentId, paymentUrl, amount, orderId: order.id });
});

router.post("/orders/payment/verify", async (req, res): Promise<void> => {
  const parsed = VerifyPaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, parsed.data.orderId));
  if (!order) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }

  res.json({
    paid: order.paymentStatus === "paid",
    status: order.paymentStatus,
    orderId: order.id,
  });
});

export default router;
