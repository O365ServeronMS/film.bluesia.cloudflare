import type { SourceMovie } from "./types";

const CDN_FALLBACKS = [
  "https://img.ophim.live/uploads/movies",
  "https://img.ophim.cc/uploads/movies"
];

function cdnMovieFolder(cdn?: string) {
  const base = (cdn || CDN_FALLBACKS[0]).replace(/\/$/, "");
  return /\/uploads\/movies$/i.test(base) ? base : `${base}/uploads/movies`;
}

export function normalizePosterUrl(value?: string, cdn?: string) {
  if (!value) return "";
  const src = String(value).trim();
  if (!src) return "";

  if (src.startsWith("//")) {
    return normalizePosterUrl(`https:${src}`, cdn);
  }

  if (/^https?:\/\//i.test(src)) {
    try {
      const url = new URL(src);
      const fileName = url.pathname.split("/").filter(Boolean).pop();
      const looksLikeOphimImage = /(^|\.)ophim\./i.test(url.hostname) || url.hostname.startsWith("img.");
      if (looksLikeOphimImage && fileName && !/\/uploads\/movies\//i.test(url.pathname)) {
        return `${url.origin}/uploads/movies/${fileName}`;
      }
    } catch {
      return src;
    }
    return src;
  }

  const withoutLeadingSlash = src.replace(/^\/+/, "");
  if (/^uploads\/movies\//i.test(withoutLeadingSlash)) {
    const base = (cdn || CDN_FALLBACKS[0]).replace(/\/uploads\/movies\/?$/i, "").replace(/\/$/, "");
    return `${base}/${withoutLeadingSlash}`;
  }

  return `${cdnMovieFolder(cdn)}/${withoutLeadingSlash}`;
}

function firstImageValue(...values: Array<string | undefined>) {
  for (const value of values) {
    const clean = String(value || "").trim();
    if (clean) return clean;
  }
  return "";
}

export function resolveMoviePoster(raw: SourceMovie, cdn?: string) {
  return normalizePosterUrl(firstImageValue(
    raw?.posterUrl,
    raw?.poster_url,
    raw?.poster,
    raw?.thumbUrl,
    raw?.thumb_url,
    raw?.thumb,
    raw?.thumbnail,
    raw?.image_url,
    raw?.image
  ), cdn);
}

function resolveMovieThumb(raw: SourceMovie, cdn?: string) {
  return normalizePosterUrl(firstImageValue(
    raw?.thumbUrl,
    raw?.thumb_url,
    raw?.thumb,
    raw?.thumbnail,
    raw?.posterUrl,
    raw?.poster_url,
    raw?.poster,
    raw?.image_url,
    raw?.image
  ), cdn);
}

export function normalizeMovieImage(raw: SourceMovie, cdn?: string) {
  return {
    poster: resolveMoviePoster(raw, cdn),
    thumb: resolveMovieThumb(raw, cdn)
  };
}
