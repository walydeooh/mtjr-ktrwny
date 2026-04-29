import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const whatsappCampaignsTable = pgTable("whatsapp_campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("draft"),
  totalRecipients: integer("total_recipients").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  // Random delay window between messages (in seconds) to look human.
  // Each message waits Math.random() * (max - min) + min seconds.
  delayMinSeconds: integer("delay_min_seconds").notNull().default(5),
  delayMaxSeconds: integer("delay_max_seconds").notNull().default(50),
  // Recipient list: optional explicit list of phone numbers. If empty/null,
  // the campaign sends to all stored customers.
  recipientPhones: text("recipient_phones"), // newline or comma separated
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCampaignSchema = createInsertSchema(whatsappCampaignsTable).omit({ id: true, createdAt: true, sentCount: true, failedCount: true, totalRecipients: true, startedAt: true, finishedAt: true, status: true });
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof whatsappCampaignsTable.$inferSelect;
