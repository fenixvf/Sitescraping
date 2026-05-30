const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

export function generateSlug(): string {
  let slug = "vid_";
  for (let i = 0; i < 6; i++) {
    slug += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return slug;
}

export function detectSourceType(url: string): "cdn" | "platform" | "storage" | "selfhosted" {
  const lower = url.toLowerCase();

  // Platform detection
  if (
    lower.includes("youtube.com") ||
    lower.includes("youtu.be") ||
    lower.includes("vimeo.com") ||
    lower.includes("dailymotion.com") ||
    lower.includes("twitch.tv")
  ) {
    return "platform";
  }

  // CDN detection
  if (
    lower.includes("bunny.net") ||
    lower.includes("b-cdn.net") ||
    lower.includes("cloudflare") ||
    lower.includes("cloudfront.net") ||
    lower.includes("fastly.net") ||
    lower.includes("stream.cloudflare.com")
  ) {
    return "cdn";
  }

  // S3 / Storage detection
  if (
    lower.includes("s3.amazonaws.com") ||
    lower.includes("s3-") ||
    lower.includes(".s3.") ||
    lower.includes("wasabisys.com") ||
    lower.includes("backblazeb2.com") ||
    lower.includes("storage.googleapis.com") ||
    lower.includes("blob.core.windows.net")
  ) {
    return "storage";
  }

  return "selfhosted";
}

export function getCacheControl(sourceType: string): string {
  switch (sourceType) {
    case "cdn":
      return "public, max-age=86400";
    case "platform":
      return "no-store";
    case "storage":
    case "selfhosted":
    default:
      return "public, max-age=3600";
  }
}
