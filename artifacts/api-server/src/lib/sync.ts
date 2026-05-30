import { db, videosTable, syncLogsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { logger } from "./logger";

const TIMEOUT_MS = Number(process.env.TIMEOUT_MS) || 8000;
const MAX_REDIRECTS = Number(process.env.MAX_REDIRECTS) || 5;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

async function fireWebhook(payload: object): Promise<void> {
  if (!WEBHOOK_URL) return;
  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    logger.warn({ err }, "Webhook delivery failed");
  }
}

async function checkUrl(url: string): Promise<{
  ok: boolean;
  status?: number;
  finalUrl?: string;
  contentType?: string;
  contentLength?: number;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });

    clearTimeout(timer);

    const finalUrl = res.url !== url ? res.url : undefined;
    const contentType = res.headers.get("content-type") ?? undefined;
    const cl = res.headers.get("content-length");
    const contentLength = cl ? parseInt(cl, 10) : undefined;

    return {
      ok: res.ok || res.status === 206,
      status: res.status,
      finalUrl,
      contentType,
      contentLength,
    };
  } catch {
    clearTimeout(timer);
    return { ok: false };
  }
}

export async function syncAllVideos(): Promise<{ total: number; synced: number; failed: number }> {
  const startedAt = new Date();
  logger.info("Starting sync run");

  const videos = await db
    .select()
    .from(videosTable)
    .where(or(eq(videosTable.status, "active"), eq(videosTable.status, "unknown")));

  let synced = 0;
  let failed = 0;

  for (const video of videos) {
    const result = await checkUrl(video.url);

    if (result.ok) {
      const updates: Partial<typeof videosTable.$inferInsert> = { status: "active" };
      if (result.finalUrl) updates.url = result.finalUrl;
      if (result.contentType) updates.mime_type = result.contentType;
      if (result.contentLength) updates.content_length = result.contentLength;

      await db.update(videosTable).set(updates).where(eq(videosTable.id, video.id));

      const eventType = result.finalUrl ? "sync_redirected" : "sync_ok";
      await db.insert(syncLogsTable).values({
        video_id: video.id,
        event_type: eventType,
        detail: result.finalUrl ? `Redirected to ${result.finalUrl}` : `HTTP ${result.status}`,
      });

      if (result.finalUrl) {
        await fireWebhook({
          event: "sync_redirected",
          id: video.id,
          slug: video.slug,
          url: result.finalUrl,
        });
      }

      synced++;
    } else {
      await db
        .update(videosTable)
        .set({ status: "broken" })
        .where(eq(videosTable.id, video.id));

      await db.insert(syncLogsTable).values({
        video_id: video.id,
        event_type: "sync_broken",
        detail: `HTTP ${result.status ?? "timeout/error"}`,
      });

      await fireWebhook({
        event: "sync_broken",
        id: video.id,
        slug: video.slug,
        url: video.url,
      });

      failed++;
    }
  }

  logger.info({ total: videos.length, synced, failed }, "Sync run complete");
  return { total: videos.length, synced, failed };
}

export function startSyncScheduler(): void {
  const interval = Number(process.env.SYNC_INTERVAL) || 900;
  logger.info({ interval }, "Starting sync scheduler");

  setInterval(async () => {
    try {
      await syncAllVideos();
    } catch (err) {
      logger.error({ err }, "Sync scheduler error");
    }
  }, interval * 1000);
}
