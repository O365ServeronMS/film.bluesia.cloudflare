# Cloudflare cache bindings

This deployment uses Cloudflare-native cache storage only.

## Required bindings

- `IMAGE_CACHE`: R2 bucket for poster, backdrop, and thumbnail binaries.
- `KV`: KV namespace for OPhim JSON metadata. `MOVIE_METADATA` is also supported as a backward-compatible binding name.
- `ADMIN_REFRESH_TOKEN`: secret used by `POST /api/admin/refresh` for protected manual OPhim refreshes.
- `CACHE_REFRESH_TOKEN`: secret used by `?refresh=1&token=...` to bypass HTML and metadata cache.
- `HTML_CACHE_VERSION`: version segment added to internal HTML cache keys. Bump this when a deployment should ignore previously cached HTML that may reference old hashed Astro assets.
- `OPHIM_REFRESH_MAX_MOVIES`: maximum latest movies to detail-refresh per scheduled run. Defaults to `24`.
- `OPHIM_REFRESH_DELAY_MS`: delay between detail refresh requests. Defaults to `1500`.

The production KV namespace is configured in `wrangler.jsonc`:

```powershell
wrangler secret put ADMIN_REFRESH_TOKEN
wrangler secret put CACHE_REFRESH_TOKEN
```

## TTL policy

- Images: `1296000` seconds.
- Home and list HTML, API responses, and metadata: `1800` seconds with `1800` seconds stale-while-revalidate.
- Taxonomy metadata: `1800` seconds.
- Movie detail HTML and metadata:
  - `7776000` seconds when the movie is completed/full and has a playable episode link.
  - `86400` seconds for ongoing series, trailers, upcoming movies, missing episode data, or no playable links.
- Search: no-store.

Favorites, watch history, and settings remain client-side localStorage state and are not included in cached HTML.

HTML cache keys include `HTML_CACHE_VERSION` internally. This prevents a cached page from an older deployment from loading after its hashed `/_astro/*` CSS or JS files have been replaced.

## Scheduled OPhim refresh

`wrangler.jsonc` configures a Cloudflare Cron Trigger:

```json
"triggers": {
  "crons": ["0 */2 * * *"]
}
```

The custom Worker entrypoint in `src/worker.ts` preserves Astro's `fetch` handler and adds `scheduled()`. Each run respects KV freshness, checks page 1 of `phim-moi-cap-nhat`, then refreshes stale or missing detail metadata for up to `OPHIM_REFRESH_MAX_MOVIES` slugs sequentially with `OPHIM_REFRESH_DELAY_MS` between requests. Logs use `OPHIM_REFRESH_START`, `OPHIM_REFRESH_DONE`, `OPHIM_REFRESH_SUCCESS`, and `OPHIM_REFRESH_FAIL`, including `movies_scanned`, `movies_changed`, `kv_writes`, `kv_skipped_unchanged`, `daily_write_count`, `refresh_stopped_by_soft_limit`, `refresh_stopped_by_hard_limit`, `listItems`, `detailAttempts`, `detailOk`, `detailSkippedFresh`, `detailFailed`, and `durationMs`.

Refresh-scoped KV writes compare a stable SHA-256 hash before writing. Movie detail writes hash the normalized movie metadata while storing the cached source payload with the hash in the envelope and KV metadata. Unchanged payloads do not call `KV.put`.

Daily refresh write counts are stored at `kvstats:writes:YYYY-MM-DD`. The soft limit is 750 writes/day and skips non-critical refresh writes. The hard limit is 900 writes/day and stops scheduled/manual refresh writes for the day.

## Manual OPhim refresh

Protected manual refreshes use `POST /api/admin/refresh` with `x-refresh-token: <ADMIN_REFRESH_TOKEN>`. The token is read from Worker secrets and must not be committed.

Refresh latest titles while respecting cache TTL:

```powershell
curl -X POST https://film.bluesia.net/api/admin/refresh `
  -H "content-type: application/json" `
  -H "x-refresh-token: $ADMIN_REFRESH_TOKEN" `
  -d '{"mode":"latest","force":false}'
```

Force refresh one movie detail:

```powershell
curl -X POST https://film.bluesia.net/api/admin/refresh `
  -H "content-type: application/json" `
  -H "x-refresh-token: $ADMIN_REFRESH_TOKEN" `
  -d '{"mode":"movie","slug":"ten-phim","force":true}'
```

The endpoint allows only `POST`, returns `401` for missing or invalid tokens, and rate-limits authenticated requests to 5 per 10 minutes using KV when available.

## Image cache profiles

The image proxy writes only fixed profile keys to R2. It prefers Cloudflare-transformed WebP when available, but may store a small valid upstream JPEG, PNG, AVIF, or WebP response under the same fixed profile key when transform output is unavailable. Oversized untransformed origin responses are rejected and are not written to R2. Width, quality, format, and legacy `w=`, `q=`, `width=`, or `quality=` params do not create arbitrary R2 objects.

R2 key format:

```text
cf-img-jun-2026/{profile}/{hash-of-normalized-original-url}.webp
```

Allowed profiles:

- `poster-mobile`: 360px, quality 65
- `poster-desktop`: 560px, quality 75
- `backdrop-mobile`: 780px, quality 60
- `backdrop-desktop`: 1280px, quality 70
- `thumb-mobile`: 320px, quality 65
- `thumb-desktop`: 480px, quality 70

New image responses flow through edge cache, then R2, then OPhim origin. The internal edge cache key includes an image behavior version so old oversized edge objects are bypassed while existing small R2 WebP objects remain usable. Failed, empty, non-image, oversized cached origin, or oversized untransformed origin responses are not written to or served from R2.
