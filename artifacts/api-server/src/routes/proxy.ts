import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, videosTable, accessLogsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { getCacheControl } from "../lib/slug";

const router: IRouter = Router();

const CORS_ORIGINS = process.env.CORS_ORIGINS ?? "*";

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

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  // Cache-Control by source type
  res.setHeader("Cache-Control", getCacheControl(video.source_type));

  // Accept-Ranges for streaming
  res.setHeader("Accept-Ranges", "bytes");

  // Log the access
  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? null;
  const userAgent = req.headers["user-agent"] ?? null;

  // Log asynchronously — don't block the redirect
  db.insert(accessLogsTable)
    .values({ video_id: video.id, ip, user_agent: userAgent, bytes: null })
    .catch((err) => logger.error({ err }, "Failed to log proxy access"));

  // Try origin URL, fall back if it's set
  const targetUrl = video.url;

  req.log.info({ slug, target: targetUrl }, "Proxy redirect");

  res.redirect(302, targetUrl);
});

export default router;
