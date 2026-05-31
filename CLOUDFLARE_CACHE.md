# Cloudflare cache bindings

This deployment uses Cloudflare-native cache storage only.

## Required bindings

- `IMAGE_CACHE`: R2 bucket for poster, backdrop, and thumbnail binaries.
- `KV`: KV namespace for OPhim JSON metadata. `MOVIE_METADATA` is also supported as a backward-compatible binding name.
- `CACHE_REFRESH_TOKEN`: secret used by `?refresh=1&token=...` to bypass HTML and metadata cache.
- `HTML_CACHE_VERSION`: version segment added to internal HTML cache keys. Bump this when a deployment should ignore previously cached HTML that may reference old hashed Astro assets.

The production KV namespace is configured in `wrangler.jsonc`:

```powershell
wrangler secret put CACHE_REFRESH_TOKEN
```

## TTL policy

- Images: `1296000` seconds.
- Home, list, taxonomy HTML and metadata: `3600` seconds.
- Movie detail HTML and metadata:
  - `1296000` seconds when the movie is completed/full and has a playable episode link.
  - `3600` seconds for trailers, upcoming movies, missing episode data, or no playable links.
- Search: no-store.

Favorites, watch history, and settings remain client-side localStorage state and are not included in cached HTML.

HTML cache keys include `HTML_CACHE_VERSION` internally. This prevents a cached page from an older deployment from loading after its hashed `/_astro/*` CSS or JS files have been replaced.

## Image cache profiles

The image proxy writes only fixed WebP profiles to R2. Width, quality, format, and legacy `w=`, `q=`, `width=`, or `quality=` params do not create arbitrary R2 objects.

R2 key format:

```text
cf-img-v3/{profile}/{hash-of-normalized-original-url}.webp
```

Allowed profiles:

- `poster-mobile`: 360px, quality 65
- `poster-desktop`: 560px, quality 75
- `backdrop-mobile`: 780px, quality 60
- `backdrop-desktop`: 1280px, quality 70
- `thumb-mobile`: 320px, quality 65
- `thumb-desktop`: 480px, quality 70

New image responses flow through edge cache, then R2, then OPhim origin. Failed, empty, or non-WebP optimized responses are not written to R2.
