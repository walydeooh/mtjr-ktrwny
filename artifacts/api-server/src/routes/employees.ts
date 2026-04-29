import { Router, type IRouter } from "express";
import { db, adminUsersTable } from "@workspace/db";
import { eq, ne } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";
import bcrypt from "bcryptjs";

const router: IRouter = Router();

const EmployeeBody = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).optional(),
  name: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  role: z.enum(["owner", "manager", "staff"]).optional().default("staff"),
  active: z.boolean().optional().default(true),
});

function format(u: typeof adminUsersTable.$inferSelect) {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    phone: u.phone,
    role: u.role,
    active: u.active,
    createdAt: u.createdAt.toISOString(),
  };
}

router.get("/employees", requireAuth, async (_req, res) => {
  const rows = await db.select().from(adminUsersTable);
  res.json(rows.map(format));
});

router.post("/employees", requireAuth, async (req, res): Promise<void> => {
  const parsed = EmployeeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!parsed.data.password) { res.status(400).json({ error: "كلمة المرور مطلوبة" }); return; }
  try {
    const hash = await bcrypt.hash(parsed.data.password, 10);
    const [created] = await db.insert(adminUsersTable).values({
      username: parsed.data.username.trim().toLowerCase(),
      password: hash,
      name: parsed.data.name ?? null,
      phone: parsed.data.phone ?? null,
      role: parsed.data.role ?? "staff",
      active: parsed.data.active ?? true,
    }).returning();
    res.json(format(created!));
  } catch {
    res.status(400).json({ error: "اسم المستخدم مكرر" });
  }
});

router.patch("/employees/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const parsed = EmployeeBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const update: Record<string, unknown> = {};
  if (parsed.data.username !== undefined) update["username"] = parsed.data.username.trim().toLowerCase();
  if (parsed.data.password) update["password"] = await bcrypt.hash(parsed.data.password, 10);
  if (parsed.data.name !== undefined) update["name"] = parsed.data.name;
  if (parsed.data.phone !== undefined) update["phone"] = parsed.data.phone;
  if (parsed.data.role !== undefined) update["role"] = parsed.data.role;
  if (parsed.data.active !== undefined) update["active"] = parsed.data.active;
  const [updated] = await db.update(adminUsersTable).set(update).where(eq(adminUsersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "غير موجود" }); return; }
  res.json(format(updated));
});

router.delete("/employees/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  // Prevent deleting the last owner
  const owners = await db.select().from(adminUsersTable).where(eq(adminUsersTable.role, "owner"));
  const target = owners.find((o) => o.id === id);
  if (target && owners.length <= 1) { res.status(400).json({ error: "لا يمكن حذف المالك الوحيد" }); return; }
  await db.delete(adminUsersTable).where(eq(adminUsersTable.id, id));
  res.json({ ok: true });
});

// Stats helper for sidebar count etc
router.get("/employees/_count", requireAuth, async (_req, res) => {
  const rows = await db.select().from(adminUsersTable).where(ne(adminUsersTable.id, 0));
  res.json({ count: rows.length });
});

export default router;
