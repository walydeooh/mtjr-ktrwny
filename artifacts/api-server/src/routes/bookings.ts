import { Router, type IRouter } from "express";
import { db, bookingsTable, timeSlotsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateBookingBody,
  UpdateBookingParams,
  UpdateBookingBody,
  ListBookingsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatBooking(b: typeof bookingsTable.$inferSelect) {
  return {
    ...b,
    createdAt: b.createdAt.toISOString(),
  };
}

router.get("/bookings", async (req, res): Promise<void> => {
  const params = ListBookingsQueryParams.safeParse(req.query);
  const conditions = [];

  if (params.success) {
    if (params.data.date) conditions.push(eq(bookingsTable.date, params.data.date));
    if (params.data.productId) conditions.push(eq(bookingsTable.productId, params.data.productId));
    if (params.data.status) conditions.push(eq(bookingsTable.status, params.data.status));
  }

  let bookings;
  if (conditions.length > 0) {
    bookings = await db.select().from(bookingsTable).where(and(...conditions));
  } else {
    bookings = await db.select().from(bookingsTable);
  }

  res.json(bookings.map(formatBooking));
});

router.post("/bookings", async (req, res): Promise<void> => {
  const parsed = CreateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [slot] = await db.select().from(timeSlotsTable).where(eq(timeSlotsTable.id, parsed.data.slotId));
  if (!slot) {
    res.status(400).json({ error: "الموعد غير موجود" });
    return;
  }
  if (slot.currentBookings >= slot.maxBookings) {
    res.status(400).json({ error: "هذا الموعد محجوز بالكامل" });
    return;
  }

  const [product] = await db.select().from(
    (await import("@workspace/db")).productsTable
  ).where(eq((await import("@workspace/db")).productsTable.id, parsed.data.productId));

  const [booking] = await db.insert(bookingsTable).values({
    productId: parsed.data.productId,
    productName: product?.name || "منتج",
    customerName: parsed.data.customerName,
    customerPhone: parsed.data.customerPhone,
    slotId: parsed.data.slotId,
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    status: "confirmed",
    notes: parsed.data.notes || null,
  }).returning();

  await db.update(timeSlotsTable).set({
    currentBookings: slot.currentBookings + 1,
  }).where(eq(timeSlotsTable.id, slot.id));

  res.status(201).json(formatBooking(booking));
});

router.patch("/bookings/:id", async (req, res): Promise<void> => {
  const params = UpdateBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [booking] = await db.update(bookingsTable).set(parsed.data).where(eq(bookingsTable.id, params.data.id)).returning();
  if (!booking) {
    res.status(404).json({ error: "الحجز غير موجود" });
    return;
  }
  res.json(formatBooking(booking));
});

export default router;
