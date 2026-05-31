import type { APIRoute } from "astro";
import { getList } from "@/lib/ophim";

const LIST_API_CACHE_SECONDS = 1800;

export const GET: APIRoute = async ({ params, url }) => {
  try {
    const page = Number(url.searchParams.get("page") || "1");
    const limit = Number(url.searchParams.get("limit") || "24");
    const country = url.searchParams.get("country") || undefined;
    const category = url.searchParams.get("category") || undefined;
    return Response.json(await getList(params.type || "phim-le", page, limit, country, category), {
      headers: { "Cache-Control": `public, max-age=0, s-maxage=${LIST_API_CACHE_SECONDS}, stale-while-revalidate=${LIST_API_CACHE_SECONDS}` }
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, {
      status: 502,
      headers: { "Cache-Control": "no-store" }
    });
  }
};
