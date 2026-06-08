import type { MovieDetail } from "@/lib/types";

export const NAV_SOURCE_KEYS = ["home", "phim-le", "phim-bo", "tv-shows", "hoat-hinh"] as const;

export type NavSourceKey = typeof NAV_SOURCE_KEYS[number];

const SOURCE_KEY_SET = new Set<string>(NAV_SOURCE_KEYS);

function pathMatches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function normalizeNavPath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname || "/";
}

export function validNavSourceKey(value?: string | null) {
  const key = String(value || "").trim();
  return SOURCE_KEY_SET.has(key) ? key : "";
}

export function navSourceFromSearchParams(searchParams?: URLSearchParams | string | null) {
  if (!searchParams) return "";
  const params = typeof searchParams === "string" ? new URLSearchParams(searchParams.replace(/^\?/, "")) : searchParams;
  return validNavSourceKey(params.get("from"));
}

export function navSourceFromHash(hash?: string | null) {
  const clean = String(hash || "").replace(/^#/, "");
  if (!clean) return "";
  return validNavSourceKey(new URLSearchParams(clean).get("from"));
}

export function hrefWithNavSource(href: string, source?: string | null) {
  const key = validNavSourceKey(source);
  if (!key) return href;
  const url = new URL(href, "https://film.bluesia.net");
  url.searchParams.set("from", key);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function navSourceFromPath(pathname: string) {
  const path = normalizeNavPath(pathname);
  if (path === "/") return "home";
  if (pathMatches(path, "/phim-le") || pathMatches(path, "/list/phim-le")) return "phim-le";
  if (pathMatches(path, "/phim-bo") || pathMatches(path, "/list/phim-bo")) return "phim-bo";
  if (pathMatches(path, "/tv-show") || pathMatches(path, "/tv-shows") || pathMatches(path, "/list/tv-shows")) return "tv-shows";
  if (pathMatches(path, "/hoat-hinh") || pathMatches(path, "/list/hoat-hinh")) return "hoat-hinh";
  return "";
}

function isChildRoute(pathname: string) {
  const path = normalizeNavPath(pathname);
  return path.startsWith("/movie/") || path.startsWith("/watch/");
}

function normalizedLabels(movie?: Partial<MovieDetail> | null) {
  const values = [
    movie?.type,
    movie?.category,
    ...(movie?.categoryList || []).flatMap((item) => [item.slug, item.name])
  ];
  return values
    .filter(Boolean)
    .map((value) =>
      String(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
    )
    .join(" ");
}

export function inferNavSourceFromMovie(movie?: Partial<MovieDetail> | null) {
  const labels = normalizedLabels(movie);
  if (/(^|[\s_-])(hoat[\s_-]*hinh|anime|animation|cartoon)([\s_-]|$)/.test(labels)) return "hoat-hinh";
  if (/(^|[\s_-])(tv[\s_-]*shows?|shows?|tv[\s_-]*series)([\s_-]|$)/.test(labels)) return "tv-shows";
  if (/(^|[\s_-])(phim[\s_-]*bo|series|serial)([\s_-]|$)/.test(labels)) return "phim-bo";
  if (/(^|[\s_-])(phim[\s_-]*le|single|movie)([\s_-]|$)/.test(labels)) return "phim-le";

  const episodeTotal = String(movie?.episodeTotal || "").trim().toLowerCase();
  if (episodeTotal === "full" || episodeTotal === "1") return "phim-le";
  return "";
}

export function getActiveNavKey(
  pathname: string,
  searchParams?: URLSearchParams | string | null,
  movie?: Partial<MovieDetail> | null
) {
  const path = normalizeNavPath(pathname);
  if (path === "/") return "home";
  const pathSource = navSourceFromPath(path);
  if (pathSource) return pathSource;
  if (pathMatches(path, "/search")) return "search";
  if (pathMatches(path, "/settings")) return "settings";
  if (isChildRoute(path)) return navSourceFromSearchParams(searchParams) || inferNavSourceFromMovie(movie);
  return "";
}
