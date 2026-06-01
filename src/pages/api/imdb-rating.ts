import type { APIRoute } from "astro";
import { getImdbRating } from "@/lib/imdb-rating";

const FOUND_CACHE = "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800";
const MISSING_CACHE = "public, max-age=3600, s-maxage=3600";

export const GET: APIRoute = async ({ locals, url }) => {
  const result = await getImdbRating(locals.runtime?.env, url.searchParams.get("id"));
  const found = Boolean(result.rating);

  return Response.json(result, {
    headers: {
      "Cache-Control": found ? FOUND_CACHE : MISSING_CACHE
    }
  });
};
