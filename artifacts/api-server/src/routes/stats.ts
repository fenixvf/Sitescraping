import { Router, type IRouter } from "express";
import { eq, count, sql, desc } from "drizzle-orm";
import { db, videosTable, accessLogsTable, syncLogsTable } from "@workspace/db";
import { requireApiKey } from "../middlewares/auth";
import { GetRecentActivityQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/stats/summary", requireApiKey, async (_req, res): Promise<void> => {
  const [totals] = await db
    .select({
      total: count(),
      active: sql<number>`count(*) filter (where status = 'active')`,
      broken: sql<number>`count(*) filter (where status = 'broken')`,
      unknown: sql<number>`count(*) filter (where status = 'unknown')`,
    })
    .from(videosTable);

  const [{ total_requests }] = await db
    .select({ total_requests: count() })
    .from(accessLogsTable);

  res.json({
    total: Number(totals.total),
    active: Number(totals.active),
    broken: Number(totals.broken),
    unknown: Number(totals.unknown),
    total_requests: Number(total_requests),
  });
});

router.get("/stats/by-type", requireApiKey, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      source_type: videosTable.source_type,
      count: count(),
    })
    .from(videosTable)
    .groupBy(videosTable.source_type);

  res.json(rows.map((r) => ({ source_type: r.source_type, count: Number(r.count) })));
});

router.get("/stats/recent-activity", requireApiKey, async (req, res): Promise<void> => {
  const parsed = GetRecentActivityQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 20) : 20;

  // Fetch recent accesses and sync events and merge them
  const recentAccesses = await db
    .select({
      id: accessLogsTable.id,
      event_type: sql<string>`'proxy_access'`,
      slug: videosTable.slug,
      title: videosTable.title,
      detail: sql<string | null>`null`,
      occurred_at: accessLogsTable.accessed_at,
    })
    .from(accessLogsTable)
    .innerJoin(videosTable, eq(accessLogsTable.video_id, videosTable.id))
    .orderBy(desc(accessLogsTable.accessed_at))
    .limit(limit);

  const recentSyncs = await db
    .select({
      id: syncLogsTable.id,
      event_type: syncLogsTable.event_type,
      slug: videosTable.slug,
      title: videosTable.title,
      detail: syncLogsTable.detail,
      occurred_at: syncLogsTable.occurred_at,
    })
    .from(syncLogsTable)
    .innerJoin(videosTable, eq(syncLogsTable.video_id, videosTable.id))
    .orderBy(desc(syncLogsTable.occurred_at))
    .limit(limit);

  const merged = [...recentAccesses, ...recentSyncs]
    .sort((a, b) => b.occurred_at.getTime() - a.occurred_at.getTime())
    .slice(0, limit)
    .map((e) => ({
      id: e.id,
      event_type: e.event_type,
      slug: e.slug,
      title: e.title,
      detail: e.detail ?? null,
      occurred_at: e.occurred_at.toISOString(),
    }));

  res.json(merged);
});

export default router;
