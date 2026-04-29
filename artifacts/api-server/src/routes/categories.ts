import { Router, type IRouter } from "express";
import { db, categoriesTable, productsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const Body = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).optional(),
  imageUrl: z.string().url().nullable().optional(),
  sortOrder: z.coerce.number().int().optional().default(0),
  active: z.boolean().optional().default(true),
});

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\s/]+/g, "-")
    .replace(/[^a-z0-9\u0600-\u06FF\-]/g, "")
    .slice(0, 80) || `cat-${Date.now()}`;
}

function format(c: typeof categoriesTable.$inferSelect) {
  return { ...c, createdAt: c.createdAt.toISOString() };
}

// Public listing for storefront
router.get("/categories", async (_req, res) => {
  const rows = await db.select().from(categoriesTable).orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.id));
  res.json(rows.map(format));
});

router.post("/categories", requireAuth, async (req, res): Promise<void> => {
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const slug = parsed.data.slug ? slugify(parsed.data.slug) : slugify(parsed.data.name);
  try {
    const [created] = await db.insert(categoriesTable).values({
      name: parsed.data.name,
      slug,
      imageUrl: parsed.data.imageUrl ?? null,
      sortOrder: parsed.data.sortOrder ?? 0,
      active: parsed.data.active ?? true,
    }).returning();
    res.json(format(created!));
  } catch {
    res.status(400).json({ error: "اسم/معرّف التصنيف مكرر" });
  }
});

router.patch("/categories/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const parsed = Body.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update["name"] = parsed.data.name;
  if (parsed.data.slug !== undefined) update["slug"] = slugify(parsed.data.slug);
  if (parsed.data.imageUrl !== undefined) update["imageUrl"] = parsed.data.imageUrl;
  if (parsed.data.sortOrder !== undefined) update["sortOrder"] = parsed.data.sortOrder;
  if (parsed.data.active !== undefined) update["active"] = parsed.data.active;
  const [updated] = await db.update(categoriesTable).set(update).where(eq(categoriesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "غير موجود" }); return; }
  res.json(format(updated));
});

router.delete("/categories/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  // Detach any products from the deleted category
  await db.update(productsTable).set({ categoryId: null }).where(eq(productsTable.categoryId, id));
  await db.delete(categoriesTable).where(eq(categoriesTable.id, id));
  res.json({ ok: true });
});

export default router;
