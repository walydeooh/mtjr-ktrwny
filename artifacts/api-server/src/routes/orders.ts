import { Router, type IRouter } from "express";
import { db, ordersTable, customersTable, productsTable, digitalCodesTable, couponsTable, affiliatesTable, storeSettingsTable, subscriptionPlansTable, customerSubscriptionsTable } from "@workspace/db";
import { computeCouponDiscount } from "./coupons";
import { eq, and } from "drizzle-orm";
import {
  CreateOrderBody,
  UpdateOrderBody,
  GetOrderParams,
  UpdateOrderParams,
  ListOrdersQueryParams,
  CreateOrderPaymentParams,
  VerifyPaymentBody,
} from "@workspace/api-zod";
import { sendWhatsappMessage, notifyAdmin } from "../lib/whatsapp";

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
    let unitPrice = parseFloat(product.price as unknown as string);
    let planSnapshot: { planId: number; planName: string; durationDays: number } | null = null;
    // Subscription products MUST have a plan selected; price comes from the plan.
    if (product.type === "subscription") {
      const planIdRaw = (item as { planId?: number | string }).planId;
      const planId = typeof planIdRaw === "number" ? planIdRaw : parseInt(String(planIdRaw || ""), 10);
      if (!planId || isNaN(planId)) {
        res.status(400).json({ error: `يجب اختيار مدة الاشتراك للمنتج "${product.name}"` });
        return;
      }
      const [plan] = await db.select().from(subscriptionPlansTable).where(
        and(eq(subscriptionPlansTable.id, planId), eq(subscriptionPlansTable.productId, product.id))
      );
      if (!plan || !plan.active) {
        res.status(400).json({ error: `خطة الاشتراك المختارة غير متاحة للمنتج "${product.name}"` });
        return;
      }
      unitPrice = parseFloat(plan.price as unknown as string);
      planSnapshot = { planId: plan.id, planName: plan.name, durationDays: plan.durationDays };
    }
    const totalPrice = unitPrice * item.quantity;
    subtotal += totalPrice;
    orderItems.push({
      id: product.id,
      productId: product.id,
      productName: product.name,
      quantity: item.quantity,
      unitPrice,
      totalPrice,
      ...(planSnapshot ? { plan: planSnapshot } : {}),
    });
  }

  // Coupon application
  let discountAmount = 0;
  let couponCode: string | null = null;
  const extras = req.body as { couponCode?: string; affiliateCode?: string; paymentMethod?: string };
  if (extras.couponCode) {
    const code = String(extras.couponCode).trim().toUpperCase();
    const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, code));
    if (coupon) {
      const r = computeCouponDiscount(coupon, subtotal, orderItems);
      if (r.ok) {
        discountAmount = r.discount;
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

  // Best-effort: notify the store admin about every new order.
  try {
    const [settings] = await db.select().from(storeSettingsTable);
    const itemsSummary = orderItems.slice(0, 5).map((it) => `• ${it.productName} ×${it.quantity}`).join("\n");
    const more = orderItems.length > 5 ? `\n…و${orderItems.length - 5} منتجات أخرى` : "";
    const acceptUrl = `${getStoreOrigin()}/admin/orders`;
    const msg =
      `🛒 طلب جديد #${order.id}\n` +
      `العميل: ${order.customerName} — ${order.customerPhone}\n` +
      `${itemsSummary}${more}\n` +
      `المبلغ: ${order.totalAmount} ر.س\n` +
      `الدفع: ${order.paymentMethod || "لم يحدد"}\n` +
      `راجع الطلب: ${acceptUrl}`;
    void notifyAdmin(settings?.adminWhatsappPhone, msg);
  } catch (e) {
    req.log.warn({ err: (e as Error).message }, "admin new-order notification failed");
  }

  res.status(201).json(formatOrder(order));
});

function getStoreOrigin(): string {
  const domain = process.env["REPLIT_DEV_DOMAIN"];
  if (domain) return `https://${domain}`;
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) return `https://${domains.split(",")[0]}`;
  return "http://localhost";
}

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
    const items = (order.items as unknown as Array<{ productId: number; productName: string; quantity: number; plan?: { planId: number; planName: string; durationDays: number } }>) || [];
    for (const item of items) {
      const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
      // Subscription: create N customer-subscription records (one per quantity).
      // Idempotency: skip if any rows already exist for (orderId, productId) — protects
      // against duplicate fulfillment from re-applied PATCH/webhook retries.
      if (product?.type === "subscription" && item.plan && order.customerId) {
        const existing = await db.select().from(customerSubscriptionsTable).where(
          and(
            eq(customerSubscriptionsTable.orderId, order.id),
            eq(customerSubscriptionsTable.productId, item.productId),
          )
        );
        if (existing.length === 0) {
          for (let q = 0; q < item.quantity; q++) {
            const startedAt = new Date();
            const expiresAt = new Date(startedAt.getTime() + item.plan.durationDays * 24 * 60 * 60 * 1000);
            await db.insert(customerSubscriptionsTable).values({
              customerId: order.customerId,
              productId: item.productId,
              productName: item.productName,
              planId: item.plan.planId,
              planName: item.plan.planName,
              durationDays: item.plan.durationDays,
              orderId: order.id,
              startedAt,
              expiresAt,
              status: "active",
            });
          }
          try {
            await sendWhatsappMessage(order.customerPhone,
              `تم تفعيل اشتراكك في "${item.productName}" — ${item.plan.planName} (${item.plan.durationDays} يوم). يمكنك متابعة اشتراكاتك من حسابك.`);
          } catch {
            req.log.warn("Could not send subscription confirmation");
          }
        }
      }
      if (product?.type === "digital") {
        const [code] = await db.select().from(digitalCodesTable).where(
          and(eq(digitalCodesTable.productId, item.productId), eq(digitalCodesTable.used, false))
        );
        if (code) {
          await db.update(digitalCodesTable).set({ used: true, usedAt: new Date(), orderId: order.id }).where(eq(digitalCodesTable.id, code.id));
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

  // Require Paylink to be configured. We refuse to silently fall back to a
  // mock URL because customers will think they paid when they didn't.
  if (!settings?.paylinkApiKey || !settings?.paylinkSecretKey) {
    req.log.warn({ orderId: order.id }, "Paylink not configured, cannot create real invoice");
    res.status(503).json({
      error: "خدمة الدفع الإلكتروني غير مفعّلة حالياً. يرجى التواصل مع الإدارة أو استخدام التحويل البنكي.",
    });
    return;
  }

  let paymentUrl: string;
  let paylinkTransactionNo: string;
  try {
    const { createPaylinkInvoice } = await import("../lib/paylink");
    const invoice = await createPaylinkInvoice(
      { apiKey: settings.paylinkApiKey, secretKey: settings.paylinkSecretKey },
      {
        amount,
        orderId: order.id,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        callBackUrl: `${origin}/api/payments/callback?orderId=${order.id}`,
      },
    );
    paymentUrl = invoice.url;
    paylinkTransactionNo = invoice.transactionNo;
  } catch (e) {
    req.log.error({ err: (e as Error).message, orderId: order.id }, "Paylink invoice creation failed");
    res.status(502).json({
      error: "تعذّر إنشاء رابط الدفع، تحقق من إعدادات Paylink أو حاول لاحقاً.",
    });
    return;
  }

  await db.update(ordersTable).set({
    paymentId,
    paymentLink: paymentUrl,
    paymentMethod: "paylink",
    paylinkTransactionNo,
    paymentStatus: "pending",
    status: "payment_pending",
  }).where(eq(ordersTable.id, order.id));

  // Only push the payment link via WhatsApp for orders that originated in
  // WhatsApp itself (the customer is on WhatsApp and expects the link there).
  // Web orders already show the link in-page via the redirect; pushing it
  // again over WhatsApp duplicates the experience and causes confusion.
  if (order.source === "whatsapp") {
    try {
      await sendWhatsappMessage(order.customerPhone, `رابط الدفع لطلبك رقم #${order.id}: ${paymentUrl}`);
    } catch {
      req.log.warn("Could not send payment link via WhatsApp");
    }
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
