import { pgTable, text, serial, timestamp, integer, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { foldersTable } from "./folders";

export const videosTable = pgTable("videos", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  fallback_url: text("fallback_url"),
  source_type: text("source_type").notNull().default("selfhosted"),
  status: text("status").notNull().default("unknown"),
  mime_type: text("mime_type"),
  content_length: bigint("content_length", { mode: "number" }),
  tags: text("tags").array().notNull().default([]),
  folder_id: integer("folder_id").references(() => foldersTable.id, { onDelete: "set null" }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVideoSchema = createInsertSchema(videosTable).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type Video = typeof videosTable.$inferSelect;
