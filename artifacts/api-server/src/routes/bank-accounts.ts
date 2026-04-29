import { Router, type IRouter } from "express";
import { db, bankAccountsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const Body = z.object({
  bankName: z.string().min(1),
  accountName: z.string().min(1),
  accountNumber: z.string().nullable().optional(),
  iban: z.string().min(8),
  logoUrl: z.string().url().nullable().optional(),
  sortOrder: z.coerce.number().int().optional().default(0),
  active: z.boolean().optional().default(true),
});

function format(b: typeof bankAccountsTable.$inferSelect) {
  return { ...b, createdAt: b.createdAt.toISOString() };
}

// Public for checkout/bank-transfer page (customers need IBAN to pay)
router.get("/bank-accounts", async (_req, res) => {
  const rows = await db.select().from(bankAccountsTable)
    .where(eq(bankAccountsTable.active, true))
    .orderBy(asc(bankAccountsTable.sortOrder), asc(bankAccountsTable.id));
  res.json(rows.map(format));
});

router.get("/admin/bank-accounts", requireAuth, async (_req, res) => {
  const rows = await db.select().from(bankAccountsTable).orderBy(asc(bankAccountsTable.sortOrder), asc(bankAccountsTable.id));
  res.json(rows.map(format));
});

router.post("/bank-accounts", requireAuth, async (req, res): Promise<void> => {
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [created] = await db.insert(bankAccountsTable).values({
    bankName: parsed.data.bankName,
    accountName: parsed.data.accountName,
    accountNumber: parsed.data.accountNumber ?? null,
    iban: parsed.data.iban,
    logoUrl: parsed.data.logoUrl ?? null,
    sortOrder: parsed.data.sortOrder ?? 0,
    active: parsed.data.active ?? true,
  }).returning();
  res.json(format(created!));
});

router.patch("/bank-accounts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const parsed = Body.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [updated] = await db.update(bankAccountsTable).set(parsed.data as Record<string, unknown>).where(eq(bankAccountsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "غير موجود" }); return; }
  res.json(format(updated));
});

router.delete("/bank-accounts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  await db.delete(bankAccountsTable).where(eq(bankAccountsTable.id, id));
  res.json({ ok: true });
});

export default router;
