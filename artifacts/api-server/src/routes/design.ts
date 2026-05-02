import { Router, type IRouter } from "express";
import { db, homeSectionsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { z } from "zod";

const router: IRouter = Router();

const DEFAULT_SECTIONS = [
  { type: "hero_banner", title: "البانر الرئيسي", sortOrder: 0, active: true, config: {} },
  { type: "categories_bar", title: "شريط التصنيفات", sortOrder: 1, active: true, config: { showImages: true } },
  { type: "products_grid", title: "المنتجات المميزة", sortOrder: 2, active: true, config: { limit: 8, columns: 4 } },
];

router.get("/design/sections", async (_req, res): Promise<void> => {
  let sections = await db.select().from(homeSectionsTable).orderBy(asc(homeSectionsTable.sortOrder));
  if (sections.length === 0) {
    const inserted = await db.insert(homeSectionsTable).values(DEFAULT_SECTIONS).returning();
    sections = inserted.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  res.json(sections);
});

const SectionBody = z.object({
  type: z.string(),
  title: z.string(),
  sortOrder: z.number().optional(),
  active: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

router.post("/design/sections", requireAuth, async (req, res): Promise<void> => {
  const parsed = SectionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const maxOrder = await db.select({ sortOrder: homeSectionsTable.sortOrder })
    .from(homeSectionsTable)
    .orderBy(asc(homeSectionsTable.sortOrder));
  const nextOrder = maxOrder.length > 0 ? (maxOrder[maxOrder.length - 1]?.sortOrder ?? 0) + 1 : 0;
  const [section] = await db.insert(homeSectionsTable).values({
    type: parsed.data.type,
    title: parsed.data.title,
    sortOrder: parsed.data.sortOrder ?? nextOrder,
    active: parsed.data.active ?? true,
    config: (parsed.data.config ?? {}) as Record<string, unknown>,
  }).returning();
  res.status(201).json(section);
});

const UpdateBody = z.object({
  title: z.string().optional(),
  active: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

router.patch("/design/sections/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "id غير صالح" }); return; }
  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data: Partial<typeof homeSectionsTable.$inferInsert> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.active !== undefined) data.active = parsed.data.active;
  if (parsed.data.config !== undefined) data.config = parsed.data.config as Record<string, unknown>;
  const [section] = await db.update(homeSectionsTable).set(data).where(eq(homeSectionsTable.id, id)).returning();
  if (!section) { res.status(404).json({ error: "القطاع غير موجود" }); return; }
  res.json(section);
});

router.delete("/design/sections/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "id غير صالح" }); return; }
  await db.delete(homeSectionsTable).where(eq(homeSectionsTable.id, id));
  res.sendStatus(204);
});

const ReorderBody = z.array(z.object({ id: z.number(), sortOrder: z.number() }));

router.put("/design/sections/order", requireAuth, async (req, res): Promise<void> => {
  const parsed = ReorderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await Promise.all(
    parsed.data.map(({ id, sortOrder }) =>
      db.update(homeSectionsTable).set({ sortOrder }).where(eq(homeSectionsTable.id, id))
    )
  );
  res.json({ success: true });
});

export default router;
