import { Router, type IRouter } from "express";
import { db, ordersTable, storeSettingsTable, productsTable, digitalCodesTable, affiliatesTable, affiliateReferralsTable, couponsTable } from "@workspace/db";
import { eq, and, sql, isNull, or } from "drizzle-orm";
import { sendWhatsappMessage, notifyAdmin } from "../lib/whatsapp";
import { getPaylinkInvoice } from "../lib/paylink";
import { requireAuth } from "../middlewares/auth";

async function creditAffiliate(orderId: number, code: string, totalAmount: number, log: { warn: (o: unknown, m?: string) => void }) {
  try {
    // Idempotency: skip if a referral already exists for this order.
    const [existing] = await db.select().from(affiliateReferralsTable).where(eq(affiliateReferralsTable.orderId, orderId));
    if (existing) return;
    const [aff] = await db.select().from(affiliatesTable).where(eq(affiliatesTable.code, code));
    if (!aff || !aff.active) return;
    const pct = parseFloat(aff.commissionPercent as unknown as string);
    const commission = Math.round((totalAmount * pct) / 100 * 100) / 100;
    await db.insert(affiliateReferralsTable).values({
      affiliateId: aff.id,
      orderId,
      commissionAmount: String(commission),
      status: "pending",
    });
    await db.update(affiliatesTable).set({
      totalEarned: sql`${affiliatesTable.totalEarned} + ${commission}`,
    }).where(eq(affiliatesTable.id, aff.id));
  } catch (e) {
    log.warn({ err: e, orderId, code }, "Failed to credit affiliate");
  }
}

async function consumeCoupon(code: string | null) {
  if (!code) return;
  // Atomic increment with max-use enforcement.
  await db.update(couponsTable).set({
    usedCount: sql`${couponsTable.usedCount} + 1`,
  }).where(and(
    eq(couponsTable.code, code),
    or(isNull(couponsTable.maxUses), sql`${couponsTable.usedCount} < ${couponsTable.maxUses}`),
  ));
}

const router: IRouter = Router();

function getStoreOrigin(): string {
  const domain = process.env["REPLIT_DEV_DOMAIN"];
  if (domain) return `https://${domain}`;
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) return `https://${domains.split(",")[0]}`;
  return "http://localhost";
}

router.get("/payments/callback", async (req, res): Promise<void> => {
  const orderIdRaw = req.query["orderId"] as string | undefined;
  const transactionNo = req.query["transactionNo"] as string | undefined;
  const orderId = orderIdRaw ? parseInt(orderIdRaw, 10) : 0;

  const origin = getStoreOrigin();

  if (!orderId) {
    res.redirect(`${origin}/payment/failed`);
    return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) {
    res.redirect(`${origin}/payment/failed?orderId=${orderId}`);
    return;
  }

  // Idempotency: if order is already paid, just redirect to success without re-fulfilling.
  if (order.paymentStatus === "paid") {
    res.redirect(`${origin}/payment/success?orderId=${orderId}`);
    return;
  }

  let paid = false;
  const [settings] = await db.select().from(storeSettingsTable);

  // Bind invoice ↔ order via transactionNo. We stored Paylink's transactionNo
  // when creating the invoice; if a callback arrives with a different one,
  // someone is trying to attach a stranger's paid invoice to this order.
  const storedTxNo = order.paylinkTransactionNo || "";
  const verifyTxNo = transactionNo || storedTxNo;

  if (transactionNo && storedTxNo && transactionNo !== storedTxNo) {
    req.log.warn(
      { orderId, callbackTxNo: transactionNo, storedTxNo },
      "Paylink callback transactionNo doesn't match order — rejecting",
    );
  } else if (verifyTxNo && settings?.paylinkApiKey && settings?.paylinkSecretKey) {
    const data = await getPaylinkInvoice(
      { apiKey: settings.paylinkApiKey, secretKey: settings.paylinkSecretKey },
      verifyTxNo,
    );
    if (data) {
      const statusOk = data.orderStatus.toLowerCase() === "paid";
      // Amount check defends against partial-payment fraud and tampered URLs.
      // We don't check orderNumber because Paylink's getInvoice often returns
      // an empty orderNumber even when we sent one in addInvoice — the
      // transactionNo binding above is the actual order↔invoice link.
      const expectedAmount = parseFloat(order.totalAmount as unknown as string);
      const amountOk = Math.abs(data.amount - expectedAmount) < 0.01;
      paid = statusOk && amountOk;
      if (statusOk && !amountOk) {
        req.log.warn(
          { orderId, transactionNo: verifyTxNo, returnedAmount: data.amount, expectedAmount },
          "Paylink invoice paid but amount mismatch",
        );
      } else if (!statusOk) {
        req.log.info(
          { orderId, transactionNo: verifyTxNo, orderStatus: data.orderStatus },
          "Paylink invoice not paid yet",
        );
      }
    }
  }

  if (paid) {
    // Atomic state transition: only this row update will succeed for the
    // first concurrent callback. Subsequent duplicates get an empty result
    // and skip all fulfillment side effects (digital code delivery, coupon
    // consumption, affiliate credit, customer notification).
    const updated = await db.update(ordersTable).set({
      paymentStatus: "paid",
      status: "processing",
      paylinkTransactionNo: verifyTxNo,
    }).where(and(
      eq(ordersTable.id, orderId),
      sql`${ordersTable.paymentStatus} != 'paid'`,
    )).returning({ id: ordersTable.id });

    if (updated.length === 0) {
      // Already paid by a concurrent callback — just redirect to success.
      req.log.info({ orderId }, "Duplicate paid callback ignored");
      res.redirect(`${origin}/payment/success?orderId=${orderId}`);
      return;
    }

    // Deliver digital codes if any
    const items = (order.items as unknown as Array<{ productId: number; quantity: number }>) || [];
    for (const item of items) {
      const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
      if (product?.type === "digital") {
        const [code] = await db.select().from(digitalCodesTable).where(
          and(eq(digitalCodesTable.productId, item.productId), eq(digitalCodesTable.used, false))
        );
        if (code) {
          await db.update(digitalCodesTable).set({ used: true, usedAt: new Date(), orderId: order.id }).where(eq(digitalCodesTable.id, code.id));
          try {
            await sendWhatsappMessage(order.customerPhone, `شكراً لطلبك! كود المنتج "${product.name}":\n${code.code}`);
          } catch {}
        }
      }
    }

    try {
      await sendWhatsappMessage(order.customerPhone, `✅ تم تأكيد الدفع لطلبك #${order.id} بمبلغ ${order.totalAmount} ر.س.\nشكراً لثقتك بنا!`);
    } catch {}

    await consumeCoupon(order.couponCode);

    if (order.affiliateCode) {
      await creditAffiliate(order.id, order.affiliateCode, parseFloat(order.totalAmount as unknown as string), req.log);
    }

    res.redirect(`${origin}/payment/success?orderId=${orderId}`);
    return;
  }

  res.redirect(`${origin}/payment/failed?orderId=${orderId}`);
});

// Submit a bank-transfer receipt for an order. Either:
//   - The authenticated customer (via customer_token header) who owns the order, OR
//   - An admin (via Bearer admin token).
// Rejects all other callers to prevent IDOR (anonymous tampering with arbitrary order IDs).
router.post("/payments/:orderId/bank-transfer", async (req, res): Promise<void> => {
  const orderId = parseInt(String(req.params["orderId"] ?? "0"), 10);
  const receiptUrl = (req.body as { receiptUrl?: string })?.receiptUrl;
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) { res.status(404).json({ error: "الطلب غير موجود" }); return; }

  // --- Authorization: must be admin OR the customer who placed this order ---
  // Admin and customer tokens both arrive via Authorization: Bearer; try each in turn.
  const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  let authorized = false;
  if (bearer) {
    const { verifyToken } = await import("../lib/auth");
    if (verifyToken(bearer)?.id) authorized = true;
    if (!authorized) {
      const { verifyCustomerToken } = await import("../lib/customer-auth");
      const cust = verifyCustomerToken(bearer);
      if (cust?.phone && cust.phone === order.customerPhone) authorized = true;
    }
  }
  if (!authorized) { res.status(401).json({ error: "غير مصرح" }); return; }

  // Don't allow modification of an already-paid order or one that is already verified
  if (order.paymentStatus === "paid") { res.status(409).json({ error: "الطلب مدفوع بالفعل" }); return; }
  await db.update(ordersTable).set({
    paymentMethod: "bank_transfer",
    bankReceiptUrl: receiptUrl ?? null,
    paymentStatus: "pending",
    status: "payment_pending",
  }).where(and(eq(ordersTable.id, orderId), sql`${ordersTable.paymentStatus} != 'paid'`));
  try {
    await sendWhatsappMessage(order.customerPhone, `📤 استلمنا إشعار التحويل البنكي لطلبك #${order.id}. سيتم تأكيده خلال 24 ساعة.`);
  } catch {}

  // Notify admin with a quick-confirm link
  try {
    const [settings] = await db.select().from(storeSettingsTable);
    const acceptUrl = `${getStoreOrigin()}/admin/orders/${order.id}?action=confirm-bank`;
    const msg =
      `🏦 إشعار تحويل بنكي جديد لطلب #${order.id}\n` +
      `العميل: ${order.customerName} — ${order.customerPhone}\n` +
      `المبلغ: ${order.totalAmount} ر.س\n` +
      (receiptUrl ? `الإيصال: ${receiptUrl}\n` : "") +
      `راجع وأكّد الطلب: ${acceptUrl}`;
    void notifyAdmin(settings?.adminWhatsappPhone, msg);
  } catch (e) {
    req.log.warn({ err: (e as Error).message }, "admin bank-receipt notification failed");
  }

  res.json({ ok: true });
});

// Admin: confirm bank transfer payment
router.post("/payments/:orderId/confirm-bank", requireAuth, async (req, res): Promise<void> => {
  const orderId = parseInt(String(req.params["orderId"] ?? "0"), 10);
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) { res.status(404).json({ error: "الطلب غير موجود" }); return; }
  if (order.paymentStatus === "paid") { res.json({ ok: true, alreadyPaid: true }); return; }

  await db.update(ordersTable).set({
    paymentStatus: "paid",
    status: "processing",
  }).where(eq(ordersTable.id, orderId));

  // Deliver digital codes
  const items = (order.items as unknown as Array<{ productId: number }>) || [];
  for (const item of items) {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
    if (product?.type === "digital") {
      const [code] = await db.select().from(digitalCodesTable).where(
        and(eq(digitalCodesTable.productId, item.productId), eq(digitalCodesTable.used, false))
      );
      if (code) {
        await db.update(digitalCodesTable).set({ used: true, usedAt: new Date(), orderId: order.id }).where(eq(digitalCodesTable.id, code.id));
        try {
          await sendWhatsappMessage(order.customerPhone, `شكراً لطلبك! كود المنتج "${product.name}":\n${code.code}`);
        } catch {}
      }
    }
  }

  try {
    await sendWhatsappMessage(order.customerPhone, `✅ تم تأكيد التحويل البنكي لطلبك #${order.id}. شكراً لثقتك بنا!`);
  } catch {}

  await consumeCoupon(order.couponCode);

  if (order.affiliateCode) {
    await creditAffiliate(order.id, order.affiliateCode, parseFloat(order.totalAmount as unknown as string), req.log);
  }

  res.json({ ok: true });
});

router.get("/payments/:orderId/status", async (req, res): Promise<void> => {
  const orderId = parseInt(String(req.params["orderId"] ?? "0"), 10);
  if (!orderId) {
    res.status(400).json({ error: "Invalid orderId" });
    return;
  }
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }
  res.json({
    orderId: order.id,
    status: order.status,
    paymentStatus: order.paymentStatus,
    totalAmount: parseFloat(order.totalAmount as unknown as string),
  });
});

export default router;
