import type { APIRoute } from "astro";
import { imageCacheTtlSeconds, readBinaryCache, writeBinaryCache } from "@/lib/cache";

const FALLBACK_IMAGE_ROOTS = ["https://img.ophim.live", "https://img.ophim.cc"];
const IMAGE_STALE_WHILE_REVALIDATE_SECONDS = 86400;
const IMAGE_CACHE_PREFIX = "cf-img-jun-2026";

type ImageProfileName =
  | "poster-mobile"
  | "poster-desktop"
  | "backdrop-mobile"
  | "backdrop-desktop"
  | "thumb-mobile"
  | "thumb-desktop";

type ImageProfile = {
  name: ImageProfileName;
  type: "poster" | "backdrop" | "thumb";
  width: number;
  quality: number;
  maxOriginFallbackBytes: number;
};

const PROFILES: Record<ImageProfileName, ImageProfile> = {
  "poster-mobile": { name: "poster-mobile", type: "poster", width: 360, quality: 65, maxOriginFallbackBytes: 700_000 },
  "poster-desktop": { name: "poster-desktop", type: "poster", width: 560, quality: 75, maxOriginFallbackBytes: 1_200_000 },
  "backdrop-mobile": { name: "backdrop-mobile", type: "backdrop", width: 780, quality: 60, maxOriginFallbackBytes: 1_500_000 },
  "backdrop-desktop": { name: "backdrop-desktop", type: "backdrop", width: 1280, quality: 70, maxOriginFallbackBytes: 2_500_000 },
  "thumb-mobile": { name: "thumb-mobile", type: "thumb", width: 320, quality: 65, maxOriginFallbackBytes: 700_000 },
  "thumb-desktop": { name: "thumb-desktop", type: "thumb", width: 480, quality: 70, maxOriginFallbackBytes: 1_200_000 }
};

function cacheLog(message: string, details?: Record<string, unknown>) {
  console.log(`[cache] ${message}`, details || {});
}

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizedOriginalUrl(imageUrl: string) {
  const url = safeUrl(imageUrl);
  if (!url) return "";
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  url.searchParams.sort();
  return url.toString();
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function numberParam(...values: Array<string | null>) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function legacyType(value: string | null) {
  const type = String(value || "poster").trim().toLowerCase();
  return type === "backdrop" || type === "thumb" || type === "poster" ? type : "poster";
}

function imageProfile(url: URL): ImageProfile {
  const requested = String(url.searchParams.get("profile") || "").trim().toLowerCase();
  if (requested in PROFILES) return PROFILES[requested as ImageProfileName];

  const type = legacyType(url.searchParams.get("type"));
  const width = numberParam(url.searchParams.get("w"), url.searchParams.get("width"));
  if (type === "backdrop") return width >= 1000 ? PROFILES["backdrop-desktop"] : PROFILES["backdrop-mobile"];
  if (type === "thumb") return width >= 400 ? PROFILES["thumb-desktop"] : PROFILES["thumb-mobile"];
  return width >= 480 ? PROFILES["poster-desktop"] : PROFILES["poster-mobile"];
}

function imageCandidates(imageUrl: string) {
  const url = safeUrl(imageUrl);
  if (!url) return [];

  const candidates = [url.toString()];
  const fileName = url.pathname.split("/").filter(Boolean).pop();
  const isOphimImage = /(^|\.)ophim\./i.test(url.hostname) || url.hostname.startsWith("img.");

  if (isOphimImage && fileName) {
    const existingPath = url.pathname.startsWith("/uploads/movies/")
      ? url.pathname
      : `/uploads/movies/${fileName}`;
    candidates.push(`${url.origin}${existingPath}`);
    for (const root of FALLBACK_IMAGE_ROOTS) {
      candidates.push(`${root}${existingPath}`);
      candidates.push(`${root}/uploads/movies/${fileName}`);
    }
  }

  return unique(candidates);
}

async function cacheKey(profile: ImageProfile, normalizedUrl: string) {
  return `${IMAGE_CACHE_PREFIX}/${profile.name}/${await sha256(normalizedUrl)}.webp`;
}

function cacheControlHeader() {
  const ttl = imageCacheTtlSeconds();
  return `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=${IMAGE_STALE_WHILE_REVALIDATE_SECONDS}`;
}

function imageHeaders(options: {
  cacheStatus: "HIT" | "MISS" | "BYPASS" | "FALLBACK";
  sourceUrl?: string;
  profile?: ImageProfileName;
  etag?: string;
  contentType?: string;
  transformStatus?: "transformed" | "origin-fallback";
}) {
  const cacheControl = cacheControlHeader();
  const contentType = options.contentType || "image/webp";
  const imageFormat = contentType.split(";")[0]?.split("/")[1] || "";
  return {
    "Content-Type": contentType,
    "Cache-Control": cacheControl,
    "CDN-Cache-Control": cacheControl,
    "Cloudflare-CDN-Cache-Control": cacheControl,
    "X-Film-Bluesia-Net-Cache": options.cacheStatus,
    "X-Film-Bluesia-Net-Cache-Type": "image",
    "X-Film-Bluesia-Net-Image-Format": imageFormat,
    "X-Film-Bluesia-Net-Image-Profile": options.profile || "",
    "X-Film-Bluesia-Net-Image-Transform": options.transformStatus || (contentType === "image/webp" ? "transformed" : "origin-fallback"),
    "X-Film-Bluesia-Net-Image-Variant": "cloudflare-profile-v3",
    ...(options.etag ? { "ETag": `"${options.etag}"` } : {}),
    ...(options.sourceUrl ? { "X-Film-Bluesia-Net-Image-Source": options.sourceUrl } : {})
  };
}

function notModified(etag: string) {
  const cacheControl = cacheControlHeader();
  return new Response(null, {
    status: 304,
    headers: {
      "ETag": `"${etag}"`,
      "Cache-Control": cacheControl,
      "CDN-Cache-Control": cacheControl,
      "Cloudflare-CDN-Cache-Control": cacheControl
    }
  });
}

function edgeCacheRequest(requestUrl: URL, profile: ImageProfile, normalizedUrl: string) {
  const edgeUrl = new URL(requestUrl.origin + requestUrl.pathname);
  edgeUrl.searchParams.set("cache_version", `${IMAGE_CACHE_PREFIX}:reject-large-origin-v1`);
  edgeUrl.searchParams.set("profile", profile.name);
  edgeUrl.searchParams.set("url", normalizedUrl);
  return new Request(edgeUrl.toString(), { method: "GET" });
}

async function fetchOptimizedImage(url: string, profile: ImageProfile) {
  const init: RequestInit & { cf?: { image?: { width: number; quality: number; format: "webp" } } } = {
    headers: {
      "User-Agent": "Mozilla/5.0 (film.bluesia.net; Cloudflare image profile proxy)",
      "Accept": "image/webp,image/*,*/*",
      "Referer": process.env.OPHIM_BASE_URL || "https://ophim1.com/"
    },
    cache: "no-store",
    cf: {
      image: {
        width: profile.width,
        quality: profile.quality,
        format: "webp"
      }
    }
  };

  return fetch(url, init);
}

function placeholderResponse(imageUrl: string, status: number | string, transformStatus = "fallback") {
  cacheLog("IMAGE_FALLBACK_PLACEHOLDER", { imageUrl, status });
  return new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="540" viewBox="0 0 360 540"><rect width="360" height="540" fill="#18181b"/><text x="180" y="270" fill="#71717a" font-family="Arial,sans-serif" font-size="22" text-anchor="middle">No image</text></svg>`,
    {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "no-store",
        "X-Film-Bluesia-Net-Cache": "FALLBACK",
        "X-Film-Bluesia-Net-Cache-Type": "image",
        "X-Film-Bluesia-Net-Image-Transform": transformStatus
      }
    }
  );
}

async function putEdgeCache(request: Request, response: Response) {
  try {
    await caches.default.put(request, response.clone());
  } catch (error) {
    cacheLog("IMAGE_OPTIMIZE_FAIL", { reason: "edge-cache-write", error: error instanceof Error ? error.message : String(error) });
  }
}

function usableImageContentType(value: string) {
  const contentType = value.toLowerCase().split(";")[0].trim();
  return /^(image\/webp|image\/jpeg|image\/jpg|image\/png|image\/avif)$/.test(contentType) ? contentType : "";
}

function imageTransformStatus(contentType: string) {
  return contentType === "image/webp" ? "transformed" : "origin-fallback";
}

function originFallbackTooLarge(profile: ImageProfile, contentType: string, byteLength: number) {
  return imageTransformStatus(contentType) === "origin-fallback" && byteLength > profile.maxOriginFallbackBytes;
}

export const GET: APIRoute = async ({ request, url }) => {
  const rawUrl = url.searchParams.get("url") || "";
  const imageUrl = decodeURIComponent(rawUrl);
  const normalizedUrl = normalizedOriginalUrl(imageUrl);
  const profile = imageProfile(url);
  const candidates = imageCandidates(normalizedUrl);

  if (!normalizedUrl || !candidates.length) {
    return Response.json({ error: "Invalid image URL" }, { status: 400 });
  }

  const key = await cacheKey(profile, normalizedUrl);
  const edgeRequest = edgeCacheRequest(url, profile, normalizedUrl);
  const ifNoneMatch = request.headers.get("if-none-match") || "";

  const edgeHit = await caches.default.match(edgeRequest);
  if (edgeHit) {
    const hit = new Response(edgeHit.body, edgeHit);
    hit.headers.set("X-Film-Bluesia-Net-Cache", "EDGE_HIT");
    return hit;
  }

  const cached = await readBinaryCache("images", key, imageCacheTtlSeconds());
  if (cached) {
    const cachedContentType = usableImageContentType(cached.contentType) || cached.contentType;
    if (originFallbackTooLarge(profile, cachedContentType, cached.body.byteLength)) {
      cacheLog("IMAGE_R2_MISS", {
        key,
        reason: "rejected-large-cached-origin",
        contentType: cached.contentType,
        profile: profile.name,
        bytes: cached.body.byteLength,
        maxBytes: profile.maxOriginFallbackBytes
      });
    } else {
    if (cached.etag && ifNoneMatch.includes(cached.etag)) return notModified(cached.etag);
    const response = new Response(cached.body, {
      headers: imageHeaders({
        cacheStatus: "HIT",
        sourceUrl: cached.sourceUrl,
        profile: profile.name,
        etag: cached.etag,
        contentType: cachedContentType,
        transformStatus: imageTransformStatus(cachedContentType)
      })
    });
    await putEdgeCache(edgeRequest, response);
    return response;
    }
  }

  let lastStatus: number | string = 0;

  for (const candidate of candidates) {
    try {
      cacheLog("IMAGE_ORIGIN_FETCH", { sourceUrl: candidate, profile: profile.name, width: profile.width, quality: profile.quality });
      const upstream = await fetchOptimizedImage(candidate, profile);
      lastStatus = upstream.status;
      const contentType = usableImageContentType(upstream.headers.get("content-type") || "");
      if (!upstream.ok || !contentType) {
        cacheLog("IMAGE_OPTIMIZE_FAIL", { sourceUrl: candidate, status: upstream.status, contentType, profile: profile.name });
        continue;
      }

      const body = new Uint8Array(await upstream.arrayBuffer());
      if (!body.byteLength) {
        cacheLog("IMAGE_OPTIMIZE_FAIL", { sourceUrl: candidate, reason: "empty-body", profile: profile.name });
        continue;
      }
      if (originFallbackTooLarge(profile, contentType, body.byteLength)) {
        lastStatus = `rejected-large-origin:${body.byteLength}`;
        cacheLog("IMAGE_OPTIMIZE_FAIL", {
          sourceUrl: candidate,
          reason: "rejected-large-origin",
          contentType,
          profile: profile.name,
          bytes: body.byteLength,
          maxBytes: profile.maxOriginFallbackBytes
        });
        continue;
      }

      cacheLog("IMAGE_OPTIMIZE_OK", { sourceUrl: candidate, profile: profile.name, bytes: body.byteLength });
      const { etag, skipped } = await writeBinaryCache("images", key, body, contentType, candidate);
      if (ifNoneMatch && ifNoneMatch.includes(etag)) return notModified(etag);

      const response = new Response(body, {
        headers: imageHeaders({
          cacheStatus: skipped ? "BYPASS" : "MISS",
          sourceUrl: candidate,
          profile: profile.name,
          etag,
          contentType,
          transformStatus: imageTransformStatus(contentType)
        })
      });
      await putEdgeCache(edgeRequest, response);
      return response;
    } catch (error) {
      cacheLog("IMAGE_OPTIMIZE_FAIL", { sourceUrl: candidate, profile: profile.name, error: error instanceof Error ? error.message : String(error) });
      lastStatus = error instanceof Error ? error.message : String(error);
    }
  }

  return placeholderResponse(imageUrl, lastStatus || "unknown", String(lastStatus).startsWith("rejected-large-origin") ? "rejected-large-origin" : "fallback");
};
