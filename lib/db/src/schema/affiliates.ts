import { pgTable, text, serial, timestamp, numeric, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";

export const affiliatesTable = pgTable("affiliates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  code: text("code").notNull().unique(),
  commissionPercent: numeric("commission_percent", { precision: 5, scale: 2 }).notNull().default("10"),
  totalEarned: numeric("total_earned", { precision: 10, scale: 2 }).notNull().default("0"),
  totalPaid: numeric("total_paid", { precision: 10, scale: 2 }).notNull().default("0"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const affiliateReferralsTable = pgTable("affiliate_referrals", {
  id: serial("id").primaryKey(),
  affiliateId: integer("affiliate_id").notNull().references(() => affiliatesTable.id, { onDelete: "cascade" }),
  orderId: integer("order_id").notNull().unique().references(() => ordersTable.id, { onDelete: "cascade" }),
  commissionAmount: numeric("commission_amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAffiliateSchema = createInsertSchema(affiliatesTable).omit({ id: true, createdAt: true, totalEarned: true, totalPaid: true });
export type InsertAffiliate = z.infer<typeof insertAffiliateSchema>;
export type Affiliate = typeof affiliatesTable.$inferSelect;
export type AffiliateReferral = typeof affiliateReferralsTable.$inferSelect;
