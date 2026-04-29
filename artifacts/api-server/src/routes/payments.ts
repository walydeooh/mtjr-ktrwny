import { Router, type IRouter } from "express";
import { db, ordersTable, storeSettingsTable, productsTable, digitalCodesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { sendWhatsappMessage } from "../lib/whatsapp";

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

  if (transactionNo && settings?.paylinkApiKey && settings?.paylinkSecretKey) {
    try {
      const r = await fetch(`https://restapi.paylink.sa/api/getInvoice/${transactionNo}`, {
        headers: {
          apiId: settings.paylinkApiKey,
          apiPassword: settings.paylinkSecretKey,
        },
      });
      if (r.ok) {
        const data = await r.json() as { orderStatus?: string; orderNumber?: string; amount?: number };
        const statusOk = String(data.orderStatus || "").toLowerCase() === "paid";
        // Bind invoice to order: orderNumber must match our order.id
        const orderNumberOk = String(data.orderNumber || "") === String(orderId);
        // Amount must match within 1 halala tolerance
        const expectedAmount = parseFloat(order.totalAmount as unknown as string);
        const amountOk = typeof data.amount === "number" && Math.abs(data.amount - expectedAmount) < 0.01;
        paid = statusOk && orderNumberOk && amountOk;
        if (statusOk && !paid) {
          req.log.warn({ orderId, transactionNo, returnedOrderNumber: data.orderNumber, returnedAmount: data.amount, expectedAmount }, "Paylink invoice paid but order/amount mismatch");
        }
      }
    } catch (e) {
      req.log.warn({ err: e }, "Failed to verify Paylink invoice");
    }
  }

  if (paid) {
    await db.update(ordersTable).set({
      paymentStatus: "paid",
      status: "processing",
      paylinkTransactionNo: transactionNo,
    }).where(eq(ordersTable.id, orderId));

    // Deliver digital codes if any
    const items = (order.items as unknown as Array<{ productId: number; quantity: number }>) || [];
    for (const item of items) {
      const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
      if (product?.type === "digital") {
        const [code] = await db.select().from(digitalCodesTable).where(
          and(eq(digitalCodesTable.productId, item.productId), eq(digitalCodesTable.used, false))
        );
        if (code) {
          await db.update(digitalCodesTable).set({ used: true, usedAt: new Date() }).where(eq(digitalCodesTable.id, code.id));
          try {
            await sendWhatsappMessage(order.customerPhone, `شكراً لطلبك! كود المنتج "${product.name}":\n${code.code}`);
          } catch {}
        }
      }
    }

    try {
      await sendWhatsappMessage(order.customerPhone, `✅ تم تأكيد الدفع لطلبك #${order.id} بمبلغ ${order.totalAmount} ر.س.\nشكراً لثقتك بنا!`);
    } catch {}

    res.redirect(`${origin}/payment/success?orderId=${orderId}`);
    return;
  }

  res.redirect(`${origin}/payment/failed?orderId=${orderId}`);
});

router.get("/payments/:orderId/status", async (req, res): Promise<void> => {
  const orderId = parseInt(req.params["orderId"] || "0", 10);
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
