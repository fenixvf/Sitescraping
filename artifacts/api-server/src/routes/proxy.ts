import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, videosTable, accessLogsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { getCacheControl } from "../lib/slug";
import { isExpired, refreshVideoUrl } from "../lib/refresh";

const router: IRouter = Router();

const CORS_ORIGINS = process.env.CORS_ORIGINS ?? "*";

router.options("/proxy/v/:slug", (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGINS);
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Range");
  res.sendStatus(204);
});

router.get("/proxy/v/:slug", async (req, res): Promise<void> => {
  const { slug } = req.params as { slug: string };

  const [video] = await db
    .select()
    .from(videosTable)
    .where(eq(videosTable.slug, slug));

  if (!video) {
    res.status(404).json({ error: "Video not found", code: "NOT_FOUND" });
    return;
  }

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGINS);
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Range");
  res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", getCacheControl(video.source_type));

  // ── Auto-refresh expired URLs ─────────────────────────────────────────────
  let targetUrl = video.url;

  if (video.refresh_url && isExpired(video.url_expires_at)) {
    try {
      req.log.info({ slug }, "URL expired — refreshing");
      targetUrl = await refreshVideoUrl({
        id: video.id,
        slug: video.slug,
        refresh_url: video.refresh_url,
      });
    } catch (err) {
      // Log the failure but still try the old URL (may still work if just barely expired)
      req.log.warn({ slug, err }, "URL refresh failed — using stale URL as fallback");
      targetUrl = video.url;
    }
  }

  // Log access asynchronously — don't block the redirect
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    null;
  const userAgent = req.headers["user-agent"] ?? null;

  db.insert(accessLogsTable)
    .values({ video_id: video.id, ip, user_agent: userAgent, bytes: null })
    .catch((err) => logger.error({ err }, "Failed to log proxy access"));

  req.log.info({ slug, target: targetUrl }, "Proxy redirect");
  res.redirect(302, targetUrl);
});

export default router;
