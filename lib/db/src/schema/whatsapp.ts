import { pgTable, text, serial, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const autoRepliesTable = pgTable("auto_replies", {
  id: serial("id").primaryKey(),
  trigger: text("trigger").notNull(),
  response: text("response").notNull(),
  isAi: boolean("is_ai").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAutoReplySchema = createInsertSchema(autoRepliesTable).omit({ id: true, createdAt: true });
export type InsertAutoReply = z.infer<typeof insertAutoReplySchema>;
export type AutoReply = typeof autoRepliesTable.$inferSelect;

// Persistent storage for Baileys auth state. One row per "file" — matches
// the multi-file auth state layout used by Baileys upstream so writes stay
// small and concurrent updates to different keys don't trample each other.
export const whatsappAuthFilesTable = pgTable("whatsapp_auth_files", {
  fileName: text("file_name").primaryKey(),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
