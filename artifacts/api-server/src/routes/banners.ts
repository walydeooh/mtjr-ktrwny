import { Router, type IRouter } from "express";
import { db, bannersTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const Body = z.object({
  title: z.string().nullable().optional(),
  subtitle: z.string().nullable().optional(),
  imageUrl: z.string().url(),
  shape: z.enum(["rectangle", "square", "circle"]).optional().default("rectangle"),
  linkType: z.enum(["url", "product", "category", "none"]).optional().default("none"),
  linkUrl: z.string().nullable().optional(),
  linkProductId: z.coerce.number().int().nullable().optional(),
  linkCategoryId: z.coerce.number().int().nullable().optional(),
  sortOrder: z.coerce.number().int().optional().default(0),
  active: z.boolean().optional().default(true),
});

function format(b: typeof bannersTable.$inferSelect) {
  return { ...b, createdAt: b.createdAt.toISOString() };
}

// Public for storefront
router.get("/banners", async (_req, res) => {
  const rows = await db.select().from(bannersTable).orderBy(asc(bannersTable.sortOrder), asc(bannersTable.id));
  res.json(rows.map(format));
});

router.post("/banners", requireAuth, async (req, res): Promise<void> => {
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [created] = await db.insert(bannersTable).values({
    title: parsed.data.title ?? null,
    subtitle: parsed.data.subtitle ?? null,
    imageUrl: parsed.data.imageUrl,
    shape: parsed.data.shape ?? "rectangle",
    linkType: parsed.data.linkType ?? "none",
    linkUrl: parsed.data.linkUrl ?? null,
    linkProductId: parsed.data.linkProductId ?? null,
    linkCategoryId: parsed.data.linkCategoryId ?? null,
    sortOrder: parsed.data.sortOrder ?? 0,
    active: parsed.data.active ?? true,
  }).returning();
  res.json(format(created!));
});

router.patch("/banners/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const parsed = Body.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [updated] = await db.update(bannersTable).set(parsed.data as Record<string, unknown>).where(eq(bannersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "غير موجود" }); return; }
  res.json(format(updated));
});

router.delete("/banners/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  await db.delete(bannersTable).where(eq(bannersTable.id, id));
  res.json({ ok: true });
});

export default router;
