import { eq } from "drizzle-orm";
import { db, videosTable } from "@workspace/db";
import { logger } from "./logger";

export interface RefreshResult {
  url: string;
  expiresAt: Date | null;
}

/**
 * Calls the video's refresh_url endpoint and parses the response.
 *
 * Supported response formats:
 *   JSON: { url: string, expires_in?: number (seconds), expires_at?: string (ISO) }
 *   Plain text: just the new URL
 */
export async function fetchFreshUrl(refreshUrl: string): Promise<RefreshResult> {
  const res = await fetch(refreshUrl, {
    headers: { Accept: "application/json, text/plain, */*" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Refresh endpoint returned HTTP ${res.status}`);
  }

  const body = await res.text();
  const trimmed = body.trim();

  // Try JSON first
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const json = JSON.parse(trimmed) as Record<string, unknown>;
      const url =
        (typeof json.url === "string" ? json.url : null) ??
        (typeof json.link === "string" ? json.link : null) ??
        (typeof json.stream_url === "string" ? json.stream_url : null) ??
        (typeof json.stream === "string" ? json.stream : null);

      if (!url) throw new Error("JSON response has no recognized URL field (url/link/stream_url/stream)");

      let expiresAt: Date | null = null;
      if (typeof json.expires_at === "string") {
        expiresAt = new Date(json.expires_at);
      } else if (typeof json.expires_in === "number") {
        expiresAt = new Date(Date.now() + json.expires_in * 1000);
      }

      return { url, expiresAt };
    } catch (err) {
      throw new Error(`Failed to parse JSON refresh response: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Plain URL
  try {
    new URL(trimmed);
  } catch {
    throw new Error(`Refresh response is neither valid JSON nor a valid URL`);
  }

  return { url: trimmed, expiresAt: null };
}

/**
 * Checks whether the given video's URL needs refreshing.
 */
export function isExpired(urlExpiresAt: Date | null | undefined): boolean {
  if (!urlExpiresAt) return false;
  return urlExpiresAt.getTime() <= Date.now();
}

/**
 * Refreshes a video's URL in-place: calls refresh_url, updates the DB, and returns the new URL.
 */
export async function refreshVideoUrl(video: {
  id: number;
  slug: string;
  refresh_url: string;
}): Promise<string> {
  const result = await fetchFreshUrl(video.refresh_url);

  await db
    .update(videosTable)
    .set({
      url: result.url,
      url_expires_at: result.expiresAt ?? null,
      url_refreshed_at: new Date(),
      status: "active",
    })
    .where(eq(videosTable.id, video.id));

  logger.info(
    { slug: video.slug, expiresAt: result.expiresAt?.toISOString() ?? "never" },
    "URL refreshed",
  );

  return result.url;
}
