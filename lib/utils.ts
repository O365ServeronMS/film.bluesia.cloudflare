import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function stripHtml(value?: string) {
  if (!value) return "";
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

type RatingSource = {
  imdbRating?: number;
  tmdbRating?: number;
  tmdb?: { vote_average?: number };
  imdb?: { rating?: number };
};

function normalizedRating(value?: number) {
  const rating = Number(value || 0);
  return Number.isFinite(rating) && rating > 0 ? rating : undefined;
}

function formatRating(value: number) {
  return value.toFixed(1).replace(".0", "");
}

export function getDisplayRating(movie: RatingSource) {
  const imdb = normalizedRating(movie.imdbRating) || normalizedRating(movie.imdb?.rating);
  const tmdb = normalizedRating(movie.tmdbRating) || normalizedRating(movie.tmdb?.vote_average);

  if (imdb) return { label: "IMDb", score: imdb, text: `IMDb ${formatRating(imdb)}` };
  if (tmdb) return { label: "TMDB", score: tmdb, text: `TMDB ${formatRating(tmdb)}` };
  return null;
}

export function ratingLabel(movie: RatingSource) {
  return getDisplayRating(movie)?.text || "";
}

export function normalizeEpisodeName(value?: string, index = 0) {
  const clean = (value || "").trim();
  if (!clean) return `Tập ${index + 1}`;
  return clean.toLowerCase().startsWith("tập") ? clean : `Tập ${clean}`;
}

export type ImageProfile =
  | "poster-mobile"
  | "poster-desktop"
  | "backdrop-mobile"
  | "backdrop-desktop"
  | "thumb-mobile"
  | "thumb-desktop";

export function proxiedImage(src?: string, profile: ImageProfile = "poster-mobile") {
  if (!src) return "";
  if (src.startsWith("/api/image")) return src;
  if (src.startsWith("/")) return src;
  const params = new URLSearchParams({ url: src });
  params.set("profile", profile);
  return `/api/image?${params.toString()}`;
}

export function proxiedImageSrcSet(src: string | undefined, profiles: { profile: ImageProfile; width: number }[]) {
  if (!src || src.startsWith("/") || src.startsWith("/api/image")) return undefined;
  return profiles.map(({ profile, width }) => `${proxiedImage(src, profile)} ${width}w`).join(", ");
}

export function proxiedImageCandidateSrcSet(src: string | undefined, candidates: { profile: ImageProfile; width: number }[]) {
  if (!src || src.startsWith("/") || src.startsWith("/api/image")) return undefined;
  return candidates.map(({ profile, width }) => `${proxiedImage(src, profile)} ${width}w`).join(", ");
}
