import { pgTable, text, serial, timestamp, integer, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { foldersTable } from "./folders";

export const videosTable = pgTable("videos", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),

  // Primary URL (may be auto-refreshed)
  url: text("url").notNull(),

  // If set, this endpoint is called to get a fresh URL when url_expires_at is past
  refresh_url: text("refresh_url"),

  // When the current url expires (null = never expires / static)
  url_expires_at: timestamp("url_expires_at", { withTimezone: true }),

  // When the url was last refreshed via refresh_url
  url_refreshed_at: timestamp("url_refreshed_at", { withTimezone: true }),

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
