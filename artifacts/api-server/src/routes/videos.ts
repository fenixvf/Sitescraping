import { Router, type IRouter } from "express";
import { eq, and, sql, desc, count, isNull } from "drizzle-orm";
import { db, videosTable, accessLogsTable, syncLogsTable } from "@workspace/db";
import { requireApiKey } from "../middlewares/auth";
import { generateSlug, detectSourceType } from "../lib/slug";
import {
  ListVideosQueryParams,
  CreateVideoBody,
  GetVideoParams,
  UpdateVideoParams,
  UpdateVideoBody,
  DeleteVideoParams,
  GetVideoStatsParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function buildProxyUrl(slug: string): string {
  // The API server is mounted at /api by the Replit reverse-proxy,
  // so proxy routes must carry the /api prefix to be reachable from the browser.
  const base = process.env.BASE_URL ?? "/api";
  return `${base}/proxy/v/${slug}`;
}

router.get("/videos", requireApiKey, async (req, res): Promise<void> => {
  const parsed = ListVideosQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message, code: "VALIDATION_ERROR" });
    return;
  }

  const { page = 1, limit = 20, tag, status, source_type, folder_id } = parsed.data as typeof parsed.data & { folder_id?: number };

  const offset = (page - 1) * limit;

  const conditions: ReturnType<typeof eq>[] = [];
  if (status) conditions.push(eq(videosTable.status, status));
  if (source_type) conditions.push(eq(videosTable.source_type, source_type));
  if (folder_id !== undefined) {
    conditions.push(eq(videosTable.folder_id, folder_id));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  let query = db
    .select()
    .from(videosTable)
    .orderBy(desc(videosTable.created_at))
    .limit(limit)
    .offset(offset);

  let countQuery = db.select({ count: count() }).from(videosTable);

  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }

  const [videos, [{ count: total }]] = await Promise.all([query, countQuery]);

  const filtered = tag
    ? videos.filter((v) => v.tags.includes(tag))
    : videos;

  const result = filtered.map((v) => ({
    ...v,
    url: undefined,
    proxy_url: buildProxyUrl(v.slug),
  }));

  res.json({
    videos: result,
    total: Number(total),
    page,
    limit,
  });
});

router.post("/videos", requireApiKey, async (req, res): Promise<void> => {
  const parsed = CreateVideoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message, code: "VALIDATION_ERROR" });
    return;
  }

  const { url, title, tags = [], fallback_url, folder_id } = parsed.data as typeof parsed.data & { folder_id?: number | null };

  try {
    new URL(url);
  } catch {
    res.status(400).json({
      error: "Invalid URL format",
      code: "INVALID_URL",
      suggestion: "Provide a valid HTTP/HTTPS URL",
    });
    return;
  }

  const source_type = detectSourceType(url);

  let slug = generateSlug();
  let attempts = 0;
  while (attempts < 10) {
    const existing = await db
      .select({ id: videosTable.id })
      .from(videosTable)
      .where(eq(videosTable.slug, slug));
    if (existing.length === 0) break;
    slug = generateSlug();
    attempts++;
  }

  const autoTitle = title ?? new URL(url).hostname;

  const { mirror_urls } = parsed.data as typeof parsed.data & { mirror_urls?: string[] };

  const [video] = await db
    .insert(videosTable)
    .values({
      slug,
      title: autoTitle,
      url,
      source_type,
      status: "unknown",
      tags: tags ?? [],
      fallback_url: fallback_url ?? null,
      mirror_urls: mirror_urls ?? [],
      folder_id: folder_id ?? null,
    })
    .returning();

  res.status(201).json({
    ...video,
    url: undefined,
    proxy_url: buildProxyUrl(video.slug),
  });
});

router.get("/videos/:id", requireApiKey, async (req, res): Promise<void> => {
  const params = GetVideoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message, code: "VALIDATION_ERROR" });
    return;
  }

  const [video] = await db
    .select()
    .from(videosTable)
    .where(eq(videosTable.id, params.data.id));

  if (!video) {
    res.status(404).json({ error: "Video not found", code: "NOT_FOUND" });
    return;
  }

  res.json({ ...video, url: undefined, proxy_url: buildProxyUrl(video.slug) });
});

router.patch("/videos/:id", requireApiKey, async (req, res): Promise<void> => {
  const params = UpdateVideoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message, code: "VALIDATION_ERROR" });
    return;
  }

  const parsed = UpdateVideoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message, code: "VALIDATION_ERROR" });
    return;
  }

  const { swap_primary, ...updateFields } = parsed.data as typeof parsed.data & { swap_primary?: string };

  // If swap_primary is set, promote that mirror URL to primary and move old primary to mirrors
  let finalUpdate: Record<string, unknown> = { ...updateFields };
  if (swap_primary) {
    const [current] = await db.select().from(videosTable).where(eq(videosTable.id, params.data.id));
    if (!current) {
      res.status(404).json({ error: "Video not found", code: "NOT_FOUND" });
      return;
    }
    const currentMirrors: string[] = current.mirror_urls ?? [];
    if (!currentMirrors.includes(swap_primary)) {
      res.status(400).json({ error: "swap_primary URL not found in mirror_urls", code: "VALIDATION_ERROR" });
      return;
    }
    const newMirrors = currentMirrors.filter((u) => u !== swap_primary);
    newMirrors.push(current.url); // move old primary to mirrors
    finalUpdate = { ...finalUpdate, url: swap_primary, mirror_urls: newMirrors };
  }

  const [video] = await db
    .update(videosTable)
    .set(finalUpdate)
    .where(eq(videosTable.id, params.data.id))
    .returning();

  if (!video) {
    res.status(404).json({ error: "Video not found", code: "NOT_FOUND" });
    return;
  }

  res.json({ ...video, url: undefined, proxy_url: buildProxyUrl(video.slug) });
});

router.delete("/videos/:id", requireApiKey, async (req, res): Promise<void> => {
  const params = DeleteVideoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message, code: "VALIDATION_ERROR" });
    return;
  }

  const [video] = await db
    .delete(videosTable)
    .where(eq(videosTable.id, params.data.id))
    .returning();

  if (!video) {
    res.status(404).json({ error: "Video not found", code: "NOT_FOUND" });
    return;
  }

  res.sendStatus(204);
});

router.get("/videos/:id/stats", requireApiKey, async (req, res): Promise<void> => {
  const params = GetVideoStatsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message, code: "VALIDATION_ERROR" });
    return;
  }

  const [video] = await db
    .select()
    .from(videosTable)
    .where(eq(videosTable.id, params.data.id));

  if (!video) {
    res.status(404).json({ error: "Video not found", code: "NOT_FOUND" });
    return;
  }

  const [{ totalReq }] = await db
    .select({ totalReq: count() })
    .from(accessLogsTable)
    .where(eq(accessLogsTable.video_id, video.id));

  const [bytesResult] = await db
    .select({ total: sql<number>`coalesce(sum(bytes), 0)` })
    .from(accessLogsTable)
    .where(eq(accessLogsTable.video_id, video.id));

  const [lastAccess] = await db
    .select({ accessed_at: accessLogsTable.accessed_at })
    .from(accessLogsTable)
    .where(eq(accessLogsTable.video_id, video.id))
    .orderBy(desc(accessLogsTable.accessed_at))
    .limit(1);

  const recentAccesses = await db
    .select()
    .from(accessLogsTable)
    .where(eq(accessLogsTable.video_id, video.id))
    .orderBy(desc(accessLogsTable.accessed_at))
    .limit(20);

  res.json({
    id: video.id,
    slug: video.slug,
    title: video.title,
    total_requests: Number(totalReq),
    bytes_served: Number(bytesResult.total) || null,
    last_accessed: lastAccess?.accessed_at?.toISOString() ?? null,
    recent_accesses: recentAccesses.map((a) => ({
      id: a.id,
      ip: a.ip,
      user_agent: a.user_agent,
      bytes: a.bytes,
      accessed_at: a.accessed_at.toISOString(),
    })),
  });
});

export default router;
