import type { MovieCard } from "@/lib/types";

const FOUND_TTL_SECONDS = 60 * 60 * 24 * 7;
const MISSING_TTL_SECONDS = 60 * 60 * 6;
const KV_PREFIX = "imdb:rating:";

type ImdbRatingSource = "imdb-dataset" | "none";

export type ImdbRatingResult = {
  imdbId: string | null;
  rating: number | null;
  votes: number | null;
  source: ImdbRatingSource;
  updatedAt?: string;
};

type MinimalKvNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number; metadata?: Record<string, string> }): Promise<void>;
};

type MinimalD1Statement = {
  bind(...values: unknown[]): MinimalD1Statement;
  first<T = unknown>(): Promise<T | null>;
};

type MinimalD1Database = {
  prepare(query: string): MinimalD1Statement;
};

export type ImdbRatingEnv = {
  KV?: MinimalKvNamespace;
  IMDB_DB?: MinimalD1Database;
};

type SourceMovieLike = Partial<MovieCard> & {
  imdb_id?: unknown;
  imdbId?: unknown;
  tmdb?: { imdb_id?: unknown };
  external_ids?: { imdb_id?: unknown };
};

function none(imdbId: string | null = null): ImdbRatingResult {
  return { imdbId, rating: null, votes: null, source: "none" };
}

function validImdbId(value: unknown) {
  const id = String(value || "").trim();
  return /^tt\d+$/.test(id) ? id : null;
}

function validRating(value: unknown) {
  const rating = Number(value);
  return Number.isFinite(rating) && rating > 0 ? rating : null;
}

function validVotes(value: unknown) {
  const votes = Number(value);
  return Number.isFinite(votes) && votes >= 0 ? Math.floor(votes) : null;
}

function cacheKey(imdbId: string) {
  return `${KV_PREFIX}${imdbId}`;
}

export function extractImdbId(movie: unknown): string | null {
  if (!movie || typeof movie !== "object") return null;
  const source = movie as SourceMovieLike;
  return validImdbId(source.imdb_id) ||
    validImdbId(source.imdbId) ||
    validImdbId(source.imdb?.id) ||
    validImdbId(source.tmdb?.imdb_id) ||
    validImdbId(source.external_ids?.imdb_id);
}

export async function getImdbRatingFromKV(env: ImdbRatingEnv | undefined, imdbId: string): Promise<ImdbRatingResult | null> {
  if (!env?.KV) return null;

  try {
    const raw = await env.KV.get(cacheKey(imdbId));
    if (!raw) return null;
    const cached = JSON.parse(raw) as ImdbRatingResult;
    if (cached?.source === "none") return none(cached.imdbId || imdbId);
    const rating = validRating(cached?.rating);
    if (!rating) return null;
    return {
      imdbId,
      rating,
      votes: validVotes(cached.votes),
      source: "imdb-dataset",
      updatedAt: cached.updatedAt
    };
  } catch (error) {
    console.log("[imdb] KV_READ_FAIL", { imdbId, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

async function writeImdbRatingToKV(env: ImdbRatingEnv | undefined, result: ImdbRatingResult) {
  if (!env?.KV || !result.imdbId) return;

  try {
    await env.KV.put(cacheKey(result.imdbId), JSON.stringify(result), {
      expirationTtl: result.source === "none" ? MISSING_TTL_SECONDS : FOUND_TTL_SECONDS,
      metadata: { source: result.source, updatedAt: result.updatedAt || "" }
    });
  } catch (error) {
    console.log("[imdb] KV_WRITE_FAIL", { imdbId: result.imdbId, error: error instanceof Error ? error.message : String(error) });
  }
}

export async function getImdbRatingFromD1(env: ImdbRatingEnv | undefined, imdbId: string): Promise<ImdbRatingResult | null> {
  if (!env?.IMDB_DB) return null;

  try {
    const row = await env.IMDB_DB
      .prepare("SELECT imdb_id, rating, votes, updated_at, source FROM imdb_ratings WHERE imdb_id = ?")
      .bind(imdbId)
      .first<{ imdb_id: string; rating: number; votes: number; updated_at: string }>();
    const rating = validRating(row?.rating);
    if (!row || !rating) return null;
    return {
      imdbId: row.imdb_id,
      rating,
      votes: validVotes(row.votes),
      source: "imdb-dataset",
      updatedAt: row.updated_at
    };
  } catch (error) {
    console.log("[imdb] D1_READ_FAIL", { imdbId, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export async function getImdbRating(env: ImdbRatingEnv | undefined, imdbId: string | null): Promise<ImdbRatingResult> {
  const validId = validImdbId(imdbId);
  if (!validId) return none();

  const cached = await getImdbRatingFromKV(env, validId);
  if (cached) return cached;

  const d1 = await getImdbRatingFromD1(env, validId);
  if (d1) {
    await writeImdbRatingToKV(env, d1);
    return d1;
  }

  const missing = none(validId);
  await writeImdbRatingToKV(env, missing);
  return missing;
}
