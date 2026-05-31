import type { APIRoute } from "astro";
import { getHome } from "@/lib/ophim";

const LIST_API_CACHE_SECONDS = 1800;

export const GET: APIRoute = async () => {
  try {
    return Response.json(await getHome(), {
      headers: { "Cache-Control": `public, max-age=0, s-maxage=${LIST_API_CACHE_SECONDS}, stale-while-revalidate=${LIST_API_CACHE_SECONDS}` }
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, {
      status: 502,
      headers: { "Cache-Control": "no-store" }
    });
  }
};
