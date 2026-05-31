import type {
  EpisodeServer,
  HomePayload,
  ListPayload,
  MovieCard,
  MovieDetail,
  SourceLabel,
  SourceListPayload,
  SourceMovie,
  SourceMoviePayload,
  SourceRating,
  SourceTaxonomyPayload
} from "@/lib/types";
import { buildSmartSpotlight, type SpotlightCandidate } from "@/lib/spotlight";
import { isCacheEntryFresh, listCacheTtlSeconds, logCacheEvent, readJsonCache, readJsonCacheEntry, searchCacheTtlSeconds, taxonomyCacheTtlSeconds, writeJsonCache } from "@/lib/cache";
import { buildVsembedServer } from "@/lib/vsembed";
import { normalizedEpisodeName, normalizedEpisodeSlug } from "@/lib/episodes";

export const IMAGE_CACHE_TTL_SECONDS = 1296000;
export const LIST_CACHE_TTL_SECONDS = 1800;
export const MOVIE_LONG_CACHE_TTL_SECONDS = 1296000;
export const MOVIE_SHORT_CACHE_TTL_SECONDS = 3600;
export const SEARCH_CACHE_TTL_SECONDS = 0;
export const OPHIM_REFRESH_MAX_MOVIES = 12;
export const OPHIM_REFRESH_DELAY_MS = 1250;

const BASE_URL = (process.env.OPHIM_BASE_URL || "https://ophim1.com").replace(/\/$/, "");
const CDN_FALLBACKS = [
  "https://img.ophim.live/uploads/movies",
  "https://img.ophim.cc/uploads/movies"
];

const listLabels: Record<string, string> = {
  "phim-le": "Phim lẻ",
  "phim-bo": "Phim bộ",
  "tv-shows": "TV Show",
  "hoat-hinh": "Hoạt hình",
  "phim-chieu-rap": "Chiếu rạp",
  "phim-moi-cap-nhat": "Mới cập nhật"
};

const countryLabels: Record<string, string> = {
  "au-my": "Âu Mỹ",
  "han-quoc": "Hàn Quốc"
};

const categoryLabels: Record<string, string> = {
  "phim-chieu-rap": "Phim chiếu rạp"
};

export function displayEpisodeServerName(serverName?: string) {
  const name = String(serverName || "").trim();
  return /^vietsub/i.test(name) ? "OPhim" : name || "Server";
}

function normalizeCountrySlug(country?: string) {
  const slug = String(country || "").trim().toLowerCase();
  return countryLabels[slug] ? slug : "";
}

function normalizeCategorySlug(category?: string) {
  const slug = String(category || "").trim().toLowerCase();
  return categoryLabels[slug] ? slug : "";
}

function jsonFetchOptions(revalidate: number) {
  return {
    next: { revalidate },
    headers: {
      "User-Agent": "film.bluesia.net/3.0.2",
      "Accept": "application/json"
    }
  } as RequestInit;
}

function jsonNoStoreFetchOptions() {
  return {
    cache: "no-store",
    headers: {
      "User-Agent": "film.bluesia.net/3.0.2",
      "Accept": "application/json"
    }
  } as RequestInit;
}

function jsonCachePolicy(path: string, fallbackSeconds = 600) {
  if (/\/v1\/api\/danh-sach\//.test(path) || /\/danh-sach\//.test(path) || /\/quoc-gia\//.test(path)) {
    return { namespace: "metadata-list", ttlSeconds: listCacheTtlSeconds() || LIST_CACHE_TTL_SECONDS };
  }
  if (/\/v1\/api\/tim-kiem/.test(path)) {
    return { namespace: "metadata-search", ttlSeconds: searchCacheTtlSeconds() };
  }
  if (/^\/phim\//.test(path)) {
    return { namespace: "metadata-detail", ttlSeconds: MOVIE_LONG_CACHE_TTL_SECONDS };
  }
  if (/^\/(the-loai|quoc-gia)$/.test(path)) {
    return { namespace: "metadata-taxonomy", ttlSeconds: taxonomyCacheTtlSeconds() };
  }
  return { namespace: "metadata-json", ttlSeconds: fallbackSeconds };
}

async function fetchJson<T>(path: string, revalidate = 600): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  const policy = jsonCachePolicy(path, revalidate);
  const cacheKey = `${url}`;
  const cached = await readJsonCache<T>(policy.namespace, cacheKey, policy.ttlSeconds);
  if (cached) return cached;

  try {
    const res = await fetch(url, jsonFetchOptions(policy.ttlSeconds));
    if (!res.ok) {
      throw new Error(`OPhim request failed ${res.status}: ${url}`);
    }

    const data = await res.json() as T;
    if (policy.ttlSeconds > 0) {
      await writeJsonCache(policy.namespace, cacheKey, data, url, policy.ttlSeconds);
    }
    return data;
  } catch (error) {
    throw error;
  }
}

function sourceEpisodeServers(payload?: SourceMoviePayload) {
  const episodesRaw = payload?.episodes || payload?.data?.episodes || [];
  return Array.isArray(episodesRaw) ? episodesRaw : [];
}

function sourceEpisodeHasPlayableLink(episode: { link_embed?: string; linkEmbed?: string; link_m3u8?: string; linkM3u8?: string }) {
  return Boolean(episode?.link_embed || episode?.linkEmbed || episode?.link_m3u8 || episode?.linkM3u8);
}

function sourceMoviePayloadHasPlayableLink(payload?: SourceMoviePayload) {
  return sourceEpisodeServers(payload).some((server) => {
    const serverData = server?.server_data || server?.serverData || [];
    return Array.isArray(serverData) && serverData.some(sourceEpisodeHasPlayableLink);
  });
}

function statusText(value?: string) {
  return String(value || "").trim().toLowerCase();
}

function sourceMoviePayloadIsStableFull(payload?: SourceMoviePayload) {
  const movieRaw = payload?.movie || payload?.data?.item || payload?.data?.movie || payload?.data || {};
  const status = statusText(movieRaw?.status);
  const episodeCurrent = statusText(movieRaw?.episode_current || movieRaw?.episodeCurrent);
  const isTrailerOrUpcoming = /trailer|upcoming|coming|sap|chua/.test(`${status} ${episodeCurrent}`);
  const isFullOrCompleted = /completed|complete|full|hoan tat/.test(`${status} ${episodeCurrent}`);
  return !isTrailerOrUpcoming && isFullOrCompleted && sourceMoviePayloadHasPlayableLink(payload);
}

export function movieDetailCachePolicy(movie: MovieDetail) {
  const status = statusText(movie.status);
  const episodeCurrent = statusText(movie.episodeCurrent);
  const isTrailerOrUpcoming = /trailer|upcoming|coming|sap|chua/.test(`${status} ${episodeCurrent}`);
  const isFullOrCompleted = /completed|complete|full|hoan tat/.test(`${status} ${episodeCurrent}`);
  const hasPlayableLink = movie.episodes.some((server) =>
    server.serverData.some((episode) => Boolean(episode.linkEmbed || episode.linkM3u8))
  );
  const stableFull = !isTrailerOrUpcoming && isFullOrCompleted && hasPlayableLink;
  return {
    cacheClass: stableFull ? "full" : "short",
    ttlSeconds: stableFull ? MOVIE_LONG_CACHE_TTL_SECONDS : MOVIE_SHORT_CACHE_TTL_SECONDS
  };
}

async function fetchMoviePayload(slug: string): Promise<SourceMoviePayload> {
  const path = `/phim/${encodeURIComponent(slug)}`;
  const url = `${BASE_URL}${path}`;
  const policy = jsonCachePolicy(path, MOVIE_SHORT_CACHE_TTL_SECONDS);
  const cachedEntry = await readJsonCacheEntry<SourceMoviePayload>(policy.namespace, url, MOVIE_LONG_CACHE_TTL_SECONDS, true);
  const cached = cachedEntry?.value;
  const cachedTtl = cached && sourceMoviePayloadIsStableFull(cached) ? MOVIE_LONG_CACHE_TTL_SECONDS : MOVIE_SHORT_CACHE_TTL_SECONDS;

  if (cached && cachedEntry && isCacheEntryFresh(cachedEntry.cachedAt, cachedTtl)) {
    logCacheEvent(cachedTtl === MOVIE_LONG_CACHE_TTL_SECONDS ? "KV_METADATA_LONG_TTL_FULL" : "KV_METADATA_SHORT_TTL_TRAILER", {
      namespace: policy.namespace,
      key: url,
      slug,
      ttlSeconds: cachedTtl
    });
    return cached;
  }

  try {
    const res = await fetch(url, cached ? jsonNoStoreFetchOptions() : jsonFetchOptions(policy.ttlSeconds));
    if (!res.ok) {
      throw new Error(`OPhim request failed ${res.status}: ${url}`);
    }

    const data = await res.json() as SourceMoviePayload;
    const freshTtl = sourceMoviePayloadIsStableFull(data) ? MOVIE_LONG_CACHE_TTL_SECONDS : MOVIE_SHORT_CACHE_TTL_SECONDS;
    await writeJsonCache(policy.namespace, url, data, url, freshTtl);
    logCacheEvent(sourceMoviePayloadIsStableFull(data) ? "KV_METADATA_LONG_TTL_FULL" : "KV_METADATA_SHORT_TTL_TRAILER", {
      namespace: policy.namespace,
      key: url,
      slug,
      ttlSeconds: freshTtl
    });
    return data;
  } catch (error) {
    throw error;
  }
}

function cdnMovieFolder(cdn?: string) {
  const base = (cdn || CDN_FALLBACKS[0]).replace(/\/$/, "");
  return /\/uploads\/movies$/i.test(base) ? base : `${base}/uploads/movies`;
}

function cleanImage(input?: string, cdn?: string) {
  if (!input) return "";
  const src = String(input).trim();
  if (!src) return "";

  if (src.startsWith("//")) {
    return cleanImage(`https:${src}`, cdn);
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

function pickName(raw: SourceMovie) {
  return raw?.name || raw?.title || raw?.origin_name || "Không rõ tên";
}

function sourceRating(value?: SourceRating | number | string) {
  return typeof value === "object" && value !== null ? value : {};
}

function labelText(value?: SourceLabel[] | string) {
  return Array.isArray(value) ? value.map((label) => label.name).filter(Boolean).join(", ") : value;
}

function detailLabels(value?: SourceLabel[] | string) {
  if (!Array.isArray(value)) return [];
  return value.filter((label): label is { id?: string; name: string; slug: string } => Boolean(label.name && label.slug));
}

const hiddenListSlugs = new Set(["khu-rung-than-bi"]);

function visibleListCards(items: MovieCard[]) {
  return items.filter((item) => item.slug && !hiddenListSlugs.has(item.slug));
}

export function normalizeCard(raw: SourceMovie, cdn?: string): MovieCard {
  const tmdb = sourceRating(raw?.tmdb || raw?.tmdb_rating || raw?.rating);
  const imdb = sourceRating(raw?.imdb);
  const categoryName = labelText(raw?.category);
  const countryName = labelText(raw?.country);

  return {
    name: pickName(raw),
    originName: raw?.origin_name || raw?.originName || raw?.original_name || undefined,
    slug: raw?.slug || raw?._id || raw?.id || "",
    poster: cleanImage(raw?.poster_url || raw?.poster || raw?.thumb_url || raw?.thumb || raw?.thumbnail, cdn),
    thumb: cleanImage(raw?.thumb_url || raw?.thumb || raw?.poster_url || raw?.poster || raw?.thumbnail, cdn),
    year: raw?.year || raw?.publish_year || undefined,
    quality: raw?.quality || raw?.video_quality || raw?.quality_name || undefined,
    lang: raw?.lang || raw?.language || undefined,
    type: raw?.type || raw?.type_slug || undefined,
    status: raw?.status || undefined,
    episodeCurrent: raw?.episode_current || raw?.episodeCurrent || undefined,
    time: raw?.time || raw?.duration || undefined,
    tmdb: {
      id: tmdb?.id || tmdb?.tmdb_id || raw?.tmdb_id || undefined,
      vote_average: Number(tmdb?.vote_average || tmdb?.rating || 0) || undefined,
      vote_count: Number(tmdb?.vote_count || 0) || undefined
    },
    imdb: {
      id: imdb?.id == null ? undefined : String(imdb.id),
      rating: Number(imdb?.rating || 0) || undefined
    },
    country: countryName,
    category: categoryName
  };
}

function getItems(payload: SourceListPayload) {
  const data = payload?.data || payload;
  const items = data?.items || payload?.items || data?.movies || [];
  const cdn = data?.APP_DOMAIN_CDN_IMAGE || payload?.APP_DOMAIN_CDN_IMAGE;
  return { items: Array.isArray(items) ? items : [], cdn, data };
}

export async function getList(type: string, page = 1, limit = 24, country?: string, category?: string): Promise<ListPayload> {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(64, Math.max(12, Number(limit) || 24));
  const countrySlug = normalizeCountrySlug(country);
  const categorySlug = type === "phim-le" ? normalizeCategorySlug(category) : "";
  const apiListType = type === "phim-le" && categorySlug === "phim-chieu-rap" ? "phim-chieu-rap" : type;

  const query = new URLSearchParams({
    page: String(safePage),
    limit: String(safeLimit),
    sort_field: "modified",
    sort_type: "desc"
  });

  if (countrySlug) {
    query.set("country", countrySlug);
  }

  let payload: SourceListPayload;

  if (apiListType === "phim-moi-cap-nhat") {
    try {
      payload = await fetchJson<SourceListPayload>(`/v1/api/danh-sach/phim-moi-cap-nhat?${query.toString()}`, 300);
    } catch {
      const legacyQuery = new URLSearchParams({ page: String(safePage) });
      if (countrySlug) legacyQuery.set("country", countrySlug);
      payload = await fetchJson<SourceListPayload>(`/danh-sach/phim-moi-cap-nhat?${legacyQuery.toString()}`, 300);
    }
  } else {
    payload = await fetchJson<SourceListPayload>(`/v1/api/danh-sach/${encodeURIComponent(apiListType)}?${query.toString()}`, 600);
  }

  const { items, cdn, data } = getItems(payload);
  const pagination = data?.params?.pagination || data?.pagination || payload?.pagination || {};
  const titleParts = [listLabels[type] || "Danh sách phim"];
  if (countrySlug) titleParts.push(countryLabels[countrySlug]);
  if (categorySlug) titleParts.push(categoryLabels[categorySlug]);

  return {
    title: titleParts.join(" - "),
    items: visibleListCards(items.map((item) => normalizeCard(item, cdn))),
    page: Number(pagination?.currentPage || safePage),
    totalPages: Number(pagination?.totalPages || pagination?.total_pages || 0) || undefined
  };
}

export async function searchMovies(keyword: string, page = 1, limit = 24): Promise<ListPayload> {
  const q = keyword.trim();
  if (!q) return { title: "Tìm kiếm", items: [], page };
  const payload = await fetchJson<SourceListPayload>(`/v1/api/tim-kiem?keyword=${encodeURIComponent(q)}&page=${page}&limit=${limit}`, 300);
  const { items, cdn, data } = getItems(payload);
  const pagination = data?.params?.pagination || {};
  return {
    title: `Tìm kiếm: ${q}`,
    items: items.map((item) => normalizeCard(item, cdn)).filter((item: MovieCard) => item.slug),
    page: Number(pagination?.currentPage || page),
    totalPages: Number(pagination?.totalPages || 0) || undefined
  };
}

export async function getHome(): Promise<HomePayload> {
  const [latest, single, series, animation, tv, cinema, singleAuMy, singleHanQuoc] = await Promise.allSettled([
    getList("phim-moi-cap-nhat", 1, 18),
    getList("phim-le", 1, 18),
    getList("phim-bo", 1, 12),
    getList("hoat-hinh", 1, 12),
    getList("tv-shows", 1, 12),
    getList("phim-chieu-rap", 1, 18),
    getList("phim-le", 1, 12, "au-my"),
    getList("phim-le", 1, 12, "han-quoc")
  ]);

  const value = (result: PromiseSettledResult<ListPayload>) => result.status === "fulfilled" ? result.value : { title: "", items: [], page: 1 };
  const latestValue = value(latest);
  const singleValue = value(single);
  const seriesValue = value(series);
  const animationValue = value(animation);
  const tvValue = value(tv);
  const cinemaValue = value(cinema);
  const singleAuMyValue = value(singleAuMy);
  const singleHanQuocValue = value(singleHanQuoc);

  const candidates: SpotlightCandidate[] = [
    ...latestValue.items.map((movie, order) => ({ movie, source: "latest", order })),
    ...cinemaValue.items.map((movie, order) => ({ movie, source: "cinema", order })),
    ...singleValue.items.map((movie, order) => ({ movie, source: "single", order })),
    ...seriesValue.items.map((movie, order) => ({ movie, source: "series", order })),
    ...tvValue.items.map((movie, order) => ({ movie, source: "tv", order })),
    ...animationValue.items.map((movie, order) => ({ movie, source: "animation", order })),
    ...singleAuMyValue.items.map((movie, order) => ({ movie, source: "single-au-my", order })),
    ...singleHanQuocValue.items.map((movie, order) => ({ movie, source: "single-han-quoc", order }))
  ];

  return {
    hero: buildSmartSpotlight(candidates, 24),
    sections: [
      { title: "Phim lẻ", href: "/list/phim-le", items: singleValue.items },
      { title: "Phim bộ", href: "/list/phim-bo", items: seriesValue.items },
      { title: "TV Show", href: "/list/tv-shows", items: tvValue.items },
      { title: "Hoạt hình", href: "/list/hoat-hinh", items: animationValue.items }
    ].filter((section) => section.items.length)
  };
}

export async function getMovie(slug: string): Promise<MovieDetail> {
  const payload = await fetchMoviePayload(slug);
  const movieRaw = payload?.movie || payload?.data?.item || payload?.data?.movie || payload?.data || {};
  const cdn = payload?.APP_DOMAIN_CDN_IMAGE || payload?.data?.APP_DOMAIN_CDN_IMAGE;
  const base = normalizeCard(movieRaw, cdn);
  const episodesRaw = sourceEpisodeServers(payload);
  const episodes: EpisodeServer[] = Array.isArray(episodesRaw) ? episodesRaw.map((server) => ({
    serverName: "OPhim",
    serverData: (server?.server_data || server?.serverData || []).map((ep, epIndex) => ({
      name: normalizedEpisodeName(ep, epIndex),
      slug: normalizedEpisodeSlug(ep, epIndex),
      filename: ep?.filename || undefined,
      linkEmbed: ep?.link_embed || ep?.linkEmbed || undefined,
      linkM3u8: ep?.link_m3u8 || ep?.linkM3u8 || undefined
    }))
  })).filter((server: EpisodeServer) => server.serverData.length) : [];

  const movie: MovieDetail = {
    ...base,
    content: movieRaw?.content || movieRaw?.description || undefined,
    actor: Array.isArray(movieRaw?.actor) ? movieRaw.actor.filter(Boolean) : [],
    director: Array.isArray(movieRaw?.director) ? movieRaw.director.filter(Boolean) : [],
    episodeTotal: movieRaw?.episode_total || movieRaw?.episodeTotal || undefined,
    categoryList: detailLabels(movieRaw?.category),
    countryList: detailLabels(movieRaw?.country),
    episodes
  };

  const vsembedServer = buildVsembedServer(movie);
  if (vsembedServer) {
    movie.episodes = [...movie.episodes, vsembedServer];
  }

  return movie;
}

export async function getCategories() {
  const payload = await fetchJson<SourceTaxonomyPayload>(`/the-loai`, 3600);
  return Array.isArray(payload) ? payload : payload?.data || [];
}

export async function getCountries() {
  const payload = await fetchJson<SourceTaxonomyPayload>(`/quoc-gia`, 3600);
  return Array.isArray(payload) ? payload : payload?.data || [];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function refreshLatestOphimMovies(options: { maxMovies?: number; delayMs?: number } = {}) {
  const maxMovies = Math.min(24, Math.max(1, Math.floor(options.maxMovies || OPHIM_REFRESH_MAX_MOVIES)));
  const delayMs = Math.min(5000, Math.max(250, Math.floor(options.delayMs || OPHIM_REFRESH_DELAY_MS)));
  const startedAt = Date.now();
  const result = {
    listItems: 0,
    detailAttempts: 0,
    detailOk: 0,
    detailFailed: 0,
    slugs: [] as string[],
    errors: [] as Array<{ slug: string; message: string }>
  };

  const latest = await getList("phim-moi-cap-nhat", 1, Math.max(18, maxMovies));
  const slugs = latest.items.map((movie) => movie.slug).filter(Boolean).slice(0, maxMovies);
  result.listItems = latest.items.length;
  result.slugs = slugs;

  for (const [index, slug] of slugs.entries()) {
    if (index > 0) await sleep(delayMs);
    result.detailAttempts += 1;
    try {
      await getMovie(slug);
      result.detailOk += 1;
    } catch (error) {
      result.detailFailed += 1;
      result.errors.push({
        slug,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  logCacheEvent("OPHIM_REFRESH_DONE", {
    listItems: result.listItems,
    detailAttempts: result.detailAttempts,
    detailOk: result.detailOk,
    detailFailed: result.detailFailed,
    durationMs: Date.now() - startedAt
  });

  return result;
}
