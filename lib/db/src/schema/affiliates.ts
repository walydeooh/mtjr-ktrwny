import { pgTable, text, serial, timestamp, numeric, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";
import { customersTable } from "./customers";

// Approved affiliate marketers. Created either by admin directly OR by
// promoting an approved affiliate_application.
export const affiliatesTable = pgTable("affiliates", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customersTable.id),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  iban: text("iban"),
  ibanName: text("iban_name"),
  code: text("code").notNull().unique(),
  commissionPercent: numeric("commission_percent", { precision: 5, scale: 2 }).notNull().default("10"),
  // Minimum balance the affiliate must accumulate before a payout is allowed.
  minPayoutAmount: numeric("min_payout_amount", { precision: 10, scale: 2 }).notNull().default("100"),
  // Running counters: totalEarned grows on every paid order; balance is the
  // unpaid portion (totalEarned - totalPaid). totalPaid grows on payout.
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

// Customer-submitted application for the affiliate program. Admin reviews
// and either approves (which auto-creates the affiliate row) or rejects.
export const affiliateApplicationsTable = pgTable("affiliate_applications", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  iban: text("iban").notNull(),
  ibanName: text("iban_name").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  affiliateId: integer("affiliate_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Each row is a payout from the store to the affiliate (archived for the
// affiliate to see in their history).
export const affiliatePayoutsTable = pgTable("affiliate_payouts", {
  id: serial("id").primaryKey(),
  affiliateId: integer("affiliate_id").notNull().references(() => affiliatesTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAffiliateSchema = createInsertSchema(affiliatesTable).omit({ id: true, createdAt: true, totalEarned: true, totalPaid: true });
export const insertAffiliateApplicationSchema = createInsertSchema(affiliateApplicationsTable).omit({ id: true, createdAt: true, reviewedAt: true, affiliateId: true, status: true });
export const insertAffiliatePayoutSchema = createInsertSchema(affiliatePayoutsTable).omit({ id: true, createdAt: true });

export type InsertAffiliate = z.infer<typeof insertAffiliateSchema>;
export type InsertAffiliateApplication = z.infer<typeof insertAffiliateApplicationSchema>;
export type InsertAffiliatePayout = z.infer<typeof insertAffiliatePayoutSchema>;
export type Affiliate = typeof affiliatesTable.$inferSelect;
export type AffiliateReferral = typeof affiliateReferralsTable.$inferSelect;
export type AffiliateApplication = typeof affiliateApplicationsTable.$inferSelect;
export type AffiliatePayout = typeof affiliatePayoutsTable.$inferSelect;
