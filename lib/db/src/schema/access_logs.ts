import { pgTable, serial, integer, text, timestamp, bigint } from "drizzle-orm/pg-core";
import { videosTable } from "./videos";

export const accessLogsTable = pgTable("access_logs", {
  id: serial("id").primaryKey(),
  video_id: integer("video_id").notNull().references(() => videosTable.id, { onDelete: "cascade" }),
  ip: text("ip"),
  user_agent: text("user_agent"),
  bytes: bigint("bytes", { mode: "number" }),
  accessed_at: timestamp("accessed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AccessLog = typeof accessLogsTable.$inferSelect;
