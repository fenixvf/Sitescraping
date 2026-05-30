import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, videosTable, accessLogsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { getCacheControl } from "../lib/slug";
import { isExpired, refreshVideoUrl } from "../lib/refresh";

const router: IRouter = Router();

const CORS_ORIGINS = process.env.CORS_ORIGINS ?? "*";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": CORS_ORIGINS,
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range",
  "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
};

/** Shared: resolve slug → video + auto-refresh if expired */
async function resolveVideo(slug: string) {
  const [video] = await db.select().from(videosTable).where(eq(videosTable.slug, slug));
  if (!video) return null;

  let targetUrl = video.url;
  if (video.refresh_url && isExpired(video.url_expires_at)) {
    try {
      targetUrl = await refreshVideoUrl({
        id: video.id,
        slug: video.slug,
        refresh_url: video.refresh_url,
      });
      logger.info({ slug }, "URL expired — refreshed");
    } catch (err) {
      logger.warn({ slug, err }, "URL refresh failed — using stale URL as fallback");
    }
  }
  return { video, targetUrl };
}

/** Shared: log access asynchronously */
function logAccess(videoId: number, req: Express.Request & { socket: { remoteAddress?: string }; headers: Record<string, string | string[] | undefined> }, bytes: number | null) {
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    null;
  const userAgent = (req.headers["user-agent"] as string | undefined) ?? null;
  db.insert(accessLogsTable)
    .values({ video_id: videoId, ip, user_agent: userAgent, bytes })
    .catch((err) => logger.error({ err }, "Failed to log proxy access"));
}

// ── CORS preflight ───────────────────────────────────────────────────────────

router.options(["/proxy/v/:slug", "/proxy/stream/:slug"], (_req, res) => {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  res.sendStatus(204);
});

// ── Redirect proxy (original behaviour) ─────────────────────────────────────

router.get("/proxy/v/:slug", async (req, res): Promise<void> => {
  const { slug } = req.params as { slug: string };
  const resolved = await resolveVideo(slug);

  if (!resolved) {
    res.status(404).json({ error: "Video not found", code: "NOT_FOUND" });
    return;
  }

  const { video, targetUrl } = resolved;

  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", getCacheControl(video.source_type));

  logAccess(video.id, req as any, null);
  req.log.info({ slug, target: targetUrl }, "Proxy redirect");
  res.redirect(302, targetUrl);
});

// ── Stream proxy (pipes content — avoids CORS on destination) ────────────────

router.get("/proxy/stream/:slug", async (req, res): Promise<void> => {
  const { slug } = req.params as { slug: string };
  const resolved = await resolveVideo(slug);

  if (!resolved) {
    res.status(404).json({ error: "Video not found", code: "NOT_FOUND" });
    return;
  }

  const { video, targetUrl } = resolved;

  // Forward Range header for seek support
  const rangeHeader = req.headers["range"];
  const upstreamHeaders: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (compatible; VidProxy/1.0)",
  };
  if (rangeHeader) upstreamHeaders["Range"] = rangeHeader;

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      headers: upstreamHeaders,
      signal: AbortSignal.timeout(15_000),
      // @ts-ignore — Node 18+ fetch supports redirect follow
      redirect: "follow",
    });
  } catch (err) {
    req.log.error({ slug, err }, "Stream fetch failed");
    res.status(502).json({ error: "Failed to fetch video from origin", code: "UPSTREAM_ERROR" });
    return;
  }

  if (!upstream.ok && upstream.status !== 206) {
    req.log.warn({ slug, status: upstream.status }, "Upstream returned non-OK status");
    res.status(upstream.status).json({ error: "Origin returned an error", code: "UPSTREAM_ERROR" });
    return;
  }

  // Forward useful headers
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", getCacheControl(video.source_type));

  const contentType = upstream.headers.get("content-type");
  if (contentType) res.setHeader("Content-Type", contentType);

  const contentLength = upstream.headers.get("content-length");
  if (contentLength) res.setHeader("Content-Length", contentLength);

  const contentRange = upstream.headers.get("content-range");
  if (contentRange) res.setHeader("Content-Range", contentRange);

  res.status(upstream.status);

  if (!upstream.body) {
    res.end();
    return;
  }

  // Pipe response body
  let bytesSent = 0;
  const reader = upstream.body.getReader();
  const pump = async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesSent += value.byteLength;
        if (!res.write(Buffer.from(value))) {
          // backpressure — wait for drain
          await new Promise<void>((resolve) => res.once("drain", resolve));
        }
      }
      res.end();
      logAccess(video.id, req as any, bytesSent || null);
      req.log.info({ slug, bytes: bytesSent }, "Stream complete");
    } catch (err) {
      req.log.warn({ slug, err }, "Stream aborted");
      reader.cancel().catch(() => {});
      res.destroy();
    }
  };

  req.on("close", () => {
    reader.cancel().catch(() => {});
  });

  pump();
});

export default router;
