import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { videosTable } from "./videos";

export const syncLogsTable = pgTable("sync_logs", {
  id: serial("id").primaryKey(),
  video_id: integer("video_id").notNull().references(() => videosTable.id, { onDelete: "cascade" }),
  event_type: text("event_type").notNull(),
  detail: text("detail"),
  occurred_at: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SyncLog = typeof syncLogsTable.$inferSelect;
