import { Router, type IRouter, type Request } from "express";
import { db, customersTable, customerOtpsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import {
  RequestCustomerOtpBody,
  VerifyCustomerOtpBody,
} from "@workspace/api-zod";
import { signCustomerToken, generateOtpCode, normalizePhone, verifyCustomerToken } from "../lib/customer-auth";
import { sendWhatsappMessage, getWhatsappStatus } from "../lib/whatsapp";

const router: IRouter = Router();
const OTP_TTL_SECONDS = 300; // 5 minutes
const REQUEST_COOLDOWN_MS = 60 * 1000; // 1 minute between OTP requests per phone
const MAX_VERIFY_ATTEMPTS = 5; // per phone, sliding 10-min window
const VERIFY_WINDOW_MS = 10 * 60 * 1000;

const lastRequestAt = new Map<string, number>();
const verifyAttempts = new Map<string, number[]>();

function recordVerifyAttempt(phone: string): number {
  const now = Date.now();
  const arr = (verifyAttempts.get(phone) || []).filter((t) => now - t < VERIFY_WINDOW_MS);
  arr.push(now);
  verifyAttempts.set(phone, arr);
  return arr.length;
}

function clearVerifyAttempts(phone: string): void {
  verifyAttempts.delete(phone);
}

function formatCustomer(c: typeof customersTable.$inferSelect) {
  return {
    ...c,
    totalSpent: parseFloat(c.totalSpent as unknown as string),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

router.post("/customer-auth/request-otp", async (req, res): Promise<void> => {
  const parsed = RequestCustomerOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const phone = normalizePhone(parsed.data.phone);

  const last = lastRequestAt.get(phone);
  if (last && Date.now() - last < REQUEST_COOLDOWN_MS) {
    const retryAfter = Math.ceil((REQUEST_COOLDOWN_MS - (Date.now() - last)) / 1000);
    res.status(429).json({ error: `يرجى الانتظار ${retryAfter} ثانية قبل طلب رمز جديد` });
    return;
  }

  // Verify WhatsApp is connected BEFORE generating/storing the OTP and before
  // setting the cooldown — so the user can retry immediately if delivery fails
  // and so we don't pretend success when nothing was sent.
  const status = getWhatsappStatus();
  if (!status.connected) {
    req.log.warn({ phone }, "OTP request rejected: WhatsApp not connected");
    res.status(503).json({
      error: "خدمة الواتساب غير متصلة حالياً. يرجى المحاولة بعد قليل أو التواصل مع المتجر.",
      reason: "whatsapp_disconnected",
    });
    return;
  }

  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);
  const message = `رمز التحقق الخاص بك في متجرنا: ${code}\n\nصالح لمدة 5 دقائق. لا تشارك هذا الرمز مع أحد.`;

  // Set cooldown BEFORE awaiting send so rapid double-clicks can't spam
  // WhatsApp while the first send is in flight. Cleared on failure so the
  // user can retry immediately if delivery actually fails.
  lastRequestAt.set(phone, Date.now());

  try {
    await sendWhatsappMessage(phone, message);
  } catch (e) {
    lastRequestAt.delete(phone);
    req.log.warn({ err: e, phone }, "Failed to send OTP via WhatsApp");
    res.status(503).json({
      error: "تعذّر إرسال رمز التحقق عبر الواتساب. تأكد من رقم الهاتف وحاول مرة أخرى.",
      reason: "whatsapp_send_failed",
    });
    return;
  }

  await db.insert(customerOtpsTable).values({
    phone,
    name: parsed.data.name,
    code,
    expiresAt,
  });
  req.log.info({ phone }, "OTP sent via WhatsApp");

  const devOtp = process.env.NODE_ENV === "production" ? undefined : code;
  if (devOtp) req.log.info({ phone, code }, "DEV OTP generated");
  res.json({ ok: true, expiresIn: OTP_TTL_SECONDS, devOtp });
});

router.post("/customer-auth/verify-otp", async (req, res): Promise<void> => {
  const parsed = VerifyCustomerOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const phone = normalizePhone(parsed.data.phone);

  const attempts = recordVerifyAttempt(phone);
  if (attempts > MAX_VERIFY_ATTEMPTS) {
    res.status(429).json({ error: "محاولات كثيرة جداً. حاول مرة أخرى لاحقاً" });
    return;
  }

  const [otp] = await db.select().from(customerOtpsTable).where(
    and(eq(customerOtpsTable.phone, phone), eq(customerOtpsTable.code, parsed.data.code), eq(customerOtpsTable.used, false))
  ).orderBy(desc(customerOtpsTable.createdAt)).limit(1);

  if (!otp) {
    res.status(401).json({ error: "رمز التحقق غير صحيح" });
    return;
  }

  if (otp.expiresAt < new Date()) {
    res.status(401).json({ error: "انتهت صلاحية رمز التحقق" });
    return;
  }

  await db.update(customerOtpsTable).set({ used: true }).where(eq(customerOtpsTable.id, otp.id));
  clearVerifyAttempts(phone);

  let [customer] = await db.select().from(customersTable).where(eq(customersTable.phone, phone));
  if (!customer) {
    [customer] = await db.insert(customersTable).values({
      name: otp.name || "عميل",
      phone,
      verified: true,
    }).returning();
  } else if (!customer.verified) {
    [customer] = await db.update(customersTable).set({ verified: true }).where(eq(customersTable.id, customer.id)).returning();
  }

  const token = signCustomerToken({ id: customer.id, phone: customer.phone });

  res.json({ token, customer: formatCustomer(customer) });
});

router.get("/customer-auth/me", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const payload = verifyCustomerToken(authHeader.slice(7));
  if (!payload) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, payload.id));
  if (!customer) {
    res.status(401).json({ error: "Customer not found" });
    return;
  }
  res.json(formatCustomer(customer));
});

export default router;
