import { Router, type IRouter, type Request } from "express";
import {
  db,
  affiliatesTable,
  affiliateReferralsTable,
  affiliateApplicationsTable,
  affiliatePayoutsTable,
  storeSettingsTable,
} from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";
import { verifyCustomerToken } from "../lib/customer-auth";
import { notifyAdmin } from "../lib/whatsapp";

const router: IRouter = Router();

const AffiliateBody = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().min(8),
  email: z.string().email().nullable().optional(),
  iban: z.string().nullable().optional(),
  ibanName: z.string().nullable().optional(),
  code: z.string().min(2).max(30).optional(),
  commissionPercent: z.coerce.number().min(0).max(100).optional().default(10),
  minPayoutAmount: z.coerce.number().min(0).optional().default(100),
  active: z.boolean().optional().default(true),
});

const ApplicationBody = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().min(8),
  email: z.string().email().nullable().optional(),
  iban: z.string().min(8),
  ibanName: z.string().min(2),
  notes: z.string().nullable().optional(),
});

function format(a: typeof affiliatesTable.$inferSelect) {
  const totalEarned = parseFloat(a.totalEarned as unknown as string);
  const totalPaid = parseFloat(a.totalPaid as unknown as string);
  return {
    ...a,
    commissionPercent: parseFloat(a.commissionPercent as unknown as string),
    minPayoutAmount: parseFloat(a.minPayoutAmount as unknown as string),
    totalEarned,
    totalPaid,
    balance: Math.round((totalEarned - totalPaid) * 100) / 100,
    createdAt: a.createdAt.toISOString(),
  };
}

function generateCode(name: string): string {
  const slug = name.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, "").slice(0, 6).toUpperCase() || "AFF";
  return slug + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function readCustomer(req: Request): { id: number; phone: string } | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  return verifyCustomerToken(auth.slice(7));
}

// ============ ADMIN: Affiliates CRUD ============
router.get("/affiliates", requireAuth, async (_req, res) => {
  const rows = await db.select().from(affiliatesTable).orderBy(desc(affiliatesTable.createdAt));
  res.json(rows.map(format));
});

router.post("/affiliates", requireAuth, async (req, res): Promise<void> => {
  const parsed = AffiliateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const code = (parsed.data.code || generateCode(parsed.data.name)).toUpperCase();
  try {
    const [created] = await db.insert(affiliatesTable).values({
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email ?? null,
      iban: parsed.data.iban ?? null,
      ibanName: parsed.data.ibanName ?? null,
      code,
      commissionPercent: String(parsed.data.commissionPercent ?? 10),
      minPayoutAmount: String(parsed.data.minPayoutAmount ?? 100),
      active: parsed.data.active ?? true,
    }).returning();
    res.json(format(created!));
  } catch {
    res.status(400).json({ error: "كود المسوّق مكرر" });
  }
});

router.patch("/affiliates/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const parsed = AffiliateBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update["name"] = parsed.data.name;
  if (parsed.data.phone !== undefined) update["phone"] = parsed.data.phone;
  if (parsed.data.email !== undefined) update["email"] = parsed.data.email;
  if (parsed.data.iban !== undefined) update["iban"] = parsed.data.iban;
  if (parsed.data.ibanName !== undefined) update["ibanName"] = parsed.data.ibanName;
  if (parsed.data.code !== undefined) update["code"] = parsed.data.code.toUpperCase();
  if (parsed.data.commissionPercent !== undefined) update["commissionPercent"] = String(parsed.data.commissionPercent);
  if (parsed.data.minPayoutAmount !== undefined) update["minPayoutAmount"] = String(parsed.data.minPayoutAmount);
  if (parsed.data.active !== undefined) update["active"] = parsed.data.active;
  const [updated] = await db.update(affiliatesTable).set(update).where(eq(affiliatesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "غير موجود" }); return; }
  res.json(format(updated));
});

router.delete("/affiliates/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  await db.delete(affiliatesTable).where(eq(affiliatesTable.id, id));
  res.json({ ok: true });
});

router.get("/affiliates/:id/referrals", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const rows = await db.select().from(affiliateReferralsTable).where(eq(affiliateReferralsTable.affiliateId, id)).orderBy(desc(affiliateReferralsTable.createdAt));
  res.json(rows.map((r) => ({
    ...r,
    commissionAmount: parseFloat(r.commissionAmount as unknown as string),
    createdAt: r.createdAt.toISOString(),
  })));
});

// ============ ADMIN: Payouts ============
router.get("/affiliates/:id/payouts", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const rows = await db.select().from(affiliatePayoutsTable).where(eq(affiliatePayoutsTable.affiliateId, id)).orderBy(desc(affiliatePayoutsTable.createdAt));
  res.json(rows.map((p) => ({
    ...p,
    amount: parseFloat(p.amount as unknown as string),
    createdAt: p.createdAt.toISOString(),
  })));
});

router.post("/affiliates/:id/payout", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const body = z.object({
    amount: z.coerce.number().positive(),
    notes: z.string().optional().nullable(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "مبلغ غير صحيح" }); return; }
  const [aff] = await db.select().from(affiliatesTable).where(eq(affiliatesTable.id, id));
  if (!aff) { res.status(404).json({ error: "غير موجود" }); return; }
  const balance = parseFloat(aff.totalEarned as unknown as string) - parseFloat(aff.totalPaid as unknown as string);
  if (body.data.amount > balance + 0.001) {
    res.status(400).json({ error: `المبلغ يتجاوز الرصيد المتاح (${balance.toFixed(2)})` });
    return;
  }
  await db.insert(affiliatePayoutsTable).values({
    affiliateId: id,
    amount: String(body.data.amount),
    notes: body.data.notes ?? null,
  });
  await db.update(affiliatesTable).set({
    totalPaid: sql`${affiliatesTable.totalPaid} + ${body.data.amount}`,
  }).where(eq(affiliatesTable.id, id));
  // Notify the affiliate
  void notifyAdmin(aff.phone, `💰 تم تحويل عمولتك بمبلغ ${body.data.amount.toFixed(2)} ر.س. شكراً لجهودك!`);
  const [updated] = await db.select().from(affiliatesTable).where(eq(affiliatesTable.id, id));
  res.json(format(updated!));
});

// ============ Public: validate affiliate code ============
router.get("/affiliates/by-code/:code", async (req, res): Promise<void> => {
  const code = (req.params["code"] || "").toUpperCase();
  const [aff] = await db.select().from(affiliatesTable).where(eq(affiliatesTable.code, code));
  if (!aff || !aff.active) { res.status(404).json({ error: "غير موجود" }); return; }
  res.json({ code: aff.code, name: aff.name });
});

// ============ Customer-facing: Affiliate Application ============
// Customer submits an application
router.post("/affiliate-applications", async (req, res): Promise<void> => {
  const parsed = ApplicationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const customer = readCustomer(req);
  const [created] = await db.insert(affiliateApplicationsTable).values({
    customerId: customer?.id ?? null,
    name: parsed.data.name,
    phone: parsed.data.phone,
    email: parsed.data.email ?? null,
    iban: parsed.data.iban,
    ibanName: parsed.data.ibanName,
    notes: parsed.data.notes ?? null,
  }).returning();
  // Notify admin
  const [settings] = await db.select().from(storeSettingsTable);
  void notifyAdmin(
    settings?.adminWhatsappPhone,
    `🆕 طلب انضمام لبرنامج المسوقين:\nالاسم: ${parsed.data.name}\nالجوال: ${parsed.data.phone}\nراجع الطلب من لوحة التحكم.`,
  );
  res.json({ id: created!.id, ok: true });
});

// Customer checks their pending application by phone (or current customer)
router.get("/affiliate-applications/me", async (req, res): Promise<void> => {
  const customer = readCustomer(req);
  if (!customer) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [app] = await db.select().from(affiliateApplicationsTable)
    .where(eq(affiliateApplicationsTable.customerId, customer.id))
    .orderBy(desc(affiliateApplicationsTable.createdAt))
    .limit(1);
  if (!app) { res.json(null); return; }
  res.json({ ...app, createdAt: app.createdAt.toISOString(), reviewedAt: app.reviewedAt?.toISOString() ?? null });
});

// Customer fetches their own affiliate dashboard (if approved)
router.get("/affiliate-applications/me/dashboard", async (req, res): Promise<void> => {
  const customer = readCustomer(req);
  if (!customer) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [aff] = await db.select().from(affiliatesTable).where(eq(affiliatesTable.customerId, customer.id));
  if (!aff) { res.json({ approved: false }); return; }
  const referrals = await db.select().from(affiliateReferralsTable)
    .where(eq(affiliateReferralsTable.affiliateId, aff.id))
    .orderBy(desc(affiliateReferralsTable.createdAt))
    .limit(50);
  const payouts = await db.select().from(affiliatePayoutsTable)
    .where(eq(affiliatePayoutsTable.affiliateId, aff.id))
    .orderBy(desc(affiliatePayoutsTable.createdAt))
    .limit(50);
  res.json({
    approved: true,
    affiliate: format(aff),
    referrals: referrals.map((r) => ({
      ...r,
      commissionAmount: parseFloat(r.commissionAmount as unknown as string),
      createdAt: r.createdAt.toISOString(),
    })),
    payouts: payouts.map((p) => ({
      ...p,
      amount: parseFloat(p.amount as unknown as string),
      createdAt: p.createdAt.toISOString(),
    })),
  });
});

// Admin: list applications
router.get("/admin/affiliate-applications", requireAuth, async (_req, res) => {
  const rows = await db.select().from(affiliateApplicationsTable).orderBy(desc(affiliateApplicationsTable.createdAt));
  res.json(rows.map((a) => ({ ...a, createdAt: a.createdAt.toISOString(), reviewedAt: a.reviewedAt?.toISOString() ?? null })));
});

// Admin: approve / reject
router.post("/admin/affiliate-applications/:id/decision", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const body = z.object({
    decision: z.enum(["approve", "reject"]).optional(),
    action: z.enum(["approve", "reject"]).optional(),
    commissionPercent: z.coerce.number().min(0).max(100).optional(),
    minPayoutAmount: z.coerce.number().min(0).optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [app] = await db.select().from(affiliateApplicationsTable).where(eq(affiliateApplicationsTable.id, id));
  if (!app) { res.status(404).json({ error: "غير موجود" }); return; }
  if (app.status !== "pending") { res.status(400).json({ error: "تم البتّ في هذا الطلب من قبل" }); return; }

  const decision = body.data.decision ?? body.data.action;
  if (!decision) { res.status(400).json({ error: "decision/action مطلوب" }); return; }
  if (decision === "reject") {
    await db.update(affiliateApplicationsTable).set({ status: "rejected", reviewedAt: new Date() }).where(eq(affiliateApplicationsTable.id, id));
    void notifyAdmin(app.phone, "نأسف لإبلاغك أن طلب الانضمام لبرنامج المسوّقين قد تم رفضه.");
    res.json({ ok: true });
    return;
  }

  // Approve: create affiliate
  const [settings] = await db.select().from(storeSettingsTable);
  const defaultPct = body.data.commissionPercent ?? parseFloat(settings?.affiliateDefaultCommission || "10");
  const code = generateCode(app.name);
  const [aff] = await db.insert(affiliatesTable).values({
    customerId: app.customerId,
    name: app.name,
    phone: app.phone,
    email: app.email,
    iban: app.iban,
    ibanName: app.ibanName,
    code,
    commissionPercent: String(defaultPct),
    minPayoutAmount: String(body.data.minPayoutAmount ?? 100),
    active: true,
  }).returning();
  await db.update(affiliateApplicationsTable).set({
    status: "approved",
    reviewedAt: new Date(),
    affiliateId: aff!.id,
  }).where(eq(affiliateApplicationsTable.id, id));
  void notifyAdmin(app.phone, `🎉 تم قبول طلبك للانضمام لبرنامج المسوّقين!\nكود التسويق الخاص بك: ${code}\nنسبة العمولة: ${defaultPct}%`);
  res.json({ ok: true, affiliate: format(aff!) });
});

export default router;
