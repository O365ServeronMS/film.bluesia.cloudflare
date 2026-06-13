# AI Memory

## Repo Snapshot

- Astro server app with React islands and Tailwind CSS.
- Cloudflare adapter is configured in `astro.config.mjs` with `output: "server"` and custom Worker entrypoint `src/worker.ts`.
- Vite alias maps `@/*` to repo root and `react-dom/server` to `react-dom/server.edge`.
- TypeScript is strict, uses `moduleResolution: "bundler"`, and includes Astro, TS, and TSX files.

## Runtime And Deployment

- `wrangler.jsonc` points the Worker main to `dist/_worker.js/index.js` and assets to `./dist`.
- Cloudflare compatibility date is set in `wrangler.jsonc`; `nodejs_compat` is enabled.
- Cloudflare route targets the public site domain.
- Cron trigger runs every 2 hours and calls the Worker `scheduled()` handler.
- `src/worker.ts` preserves Astro `fetch` and adds scheduled OPhim refresh behavior.
- Current app data bindings are `IMAGE_CACHE` and `KV`; required static assets binding is `ASSETS`; active image cache prefix remains `cf-img-jun-2026`.
- Need verification: exact Cloudflare product mode in production, because the repo uses both Worker main/assets and Astro Cloudflare adapter terminology.

## Important Commands

- `npm run dev`: local Astro dev server.
- `npm run build`: Astro build.
- `npm run preview`: builds then runs `wrangler dev dist/_worker.js/index.js --assets dist`.
- `npm run deploy`: builds then deploys via Wrangler.
- No lint or test scripts are currently defined in `package.json`.

## Architecture

- `src/pages/` contains Astro route pages and API endpoints.
- `src/layouts/BaseLayout.astro` owns metadata, app shell, global poster-image fallback script, and bottom nav island.
- `components/` contains React islands and reusable UI components.
- `lib/ophim.ts` is the main OPhim metadata client/normalizer and cache policy coordinator.
- `lib/cache.ts` abstracts Cloudflare KV/R2/cache helpers, TTLs, write budgets, hashes, and cache stats.
- `lib/types.ts` defines shared movie, episode, payload, source, and API types.
- `lib/utils.ts` contains class merging, image proxy helpers, rating display helpers, and small text utilities.
- `src/styles/globals.css` carries global Tailwind/CSS behavior.

## Pages And User Flows

- `/` loads `getHome()` and renders `TopBar`, `HeroSlider`, and `SectionRow` grids.
- `/list/[type]` loads `getList()` for list categories such as `phim-le`, `phim-bo`, `tv-shows`, and `hoat-hinh`.
- `/search` calls `searchMovies()` and renders `MovieCard` results.
- `/movie/[slug]` loads details via `getMovie()`, computes cache class, renders poster/details/actions/episodes.
- `/watch/[slug]` selects episode/server, prefers HLS unless mobile/embed conditions choose iframe, and records history.
- `/favorites` and `/history` render client-side stored movies from localStorage through `StoredMovieGrid`.
- `/settings` describes cache/proxy settings for users.

## Components

- `MovieCard.tsx`: shared poster card for home rows, lists, search, favorites, and history.
- `SectionRow.tsx`: home grid sections that wrap `MovieCard`.
- `HeroSlider.tsx`: Smart Spotlight carousel, ranked by `lib/spotlight.ts` plus localStorage preferences.
- `TopBar.tsx`: sticky search/favorites/history/settings header.
- `BottomNav.tsx`: six-item mobile bottom nav with sessionStorage context for movie/watch routes.
- `SearchSuggest.tsx`: search input/suggestions.
- `LocalMovieActions.tsx`: favorites/history localStorage store and action buttons.
- `StoredMovieGrid.tsx`: localStorage-backed favorites/history grid.
- `HlsVideo.tsx`: HTML5 video player for OPhim direct m3u8 streams, with hls.js-first playback on MSE-capable browsers, native HLS fallback, conservative/adaptive buffer tuning, retry config, and fatal error recovery.
- `IframePlayerFacade.tsx`: click-to-load iframe player facade for embed playback.
- `WatchRecorder.tsx`: records watched movie history.

## Data And Cache Assumptions

- OPhim base URL defaults to `https://ophim1.com` unless `OPHIM_BASE_URL` is set.
- OPhim image CDN fallback roots are in `lib/ophim.ts` and `src/pages/api/image.ts`.
- List/home/taxonomy metadata TTL is 1800 seconds.
- Search metadata TTL is 0/no-store.
- Movie detail metadata has long/short TTL based on completed/full status and playable links.
- Image cache TTL is 15 days.
- HTML cache is handled in `src/middleware.ts` with Cache API and a `HTML_CACHE_VERSION` query segment in the internal cache key.
- Private HTML pages include favorites, history, settings, watch pages, and search.
- Movie pages set `X-Film-Bluesia-Movie-Cache-Class`; middleware converts that to long/short HTML TTLs.
- Cache refresh bypass uses `?refresh=1&token=...` and a secret-backed token check.
- `lib/cache.ts` uses `MOVIE_METADATA` if available, otherwise `KV`.
- R2 image storage uses binding name `IMAGE_CACHE`.
- KV write budget uses daily keys shaped like `kvstats:writes:YYYY-MM-DD`.
- Refresh writes compare stable hashes before writing.

## Storage And State

- Runtime metadata cache is Cloudflare KV-compatible storage.
- Runtime image cache is Cloudflare R2 plus edge Cache API. R2 bucket: `film-bluesia-cache` (binding: `IMAGE_CACHE`). Old prefix: `cf-img-v3` (kept for rollback). Active prefix: `cf-img-jun-2026`.
- HTML cache is Cloudflare Cache API.
- Favorites, history, navigation context, and HLS quality preference are browser storage only.
- Adaptive navigation prefetch is browser storage only: `src/client/adaptivePrefetch.ts` records local transition counts in `localStorage` under `filmbluesia_nav_stats_v1`, uses `sessionStorage` for last-route and per-session prefetch dedupe, and is initialized from `src/layouts/BaseLayout.astro`.
- Adaptive prefetch thresholds are minimum `5` transitions from the current normalized route and best-target probability `0.45`. It considers only one predicted route per page view, only after page load/idle time, and only prefetches safe category/list HTML plus first-page `/api/ophim/list/[type]` API resources.
- Adaptive prefetch must never target video, HLS, playback, player, embed, `/watch`, `/movie`, `.m3u8`, `.ts`, `.m4s`, or `.mp4` resources.
- No durable server filesystem storage should be introduced.

## OPhim Implementation Notes

- `normalizeCard()` maps source movie payloads to `MovieCard`.
- 2026-06-13 image incident: newly added movies rendered `No image` when source payloads used camelCase or alternate image fields. Keep image mapping in `lib/movie-images.ts` and support `posterUrl`, `poster_url`, `poster`, `thumbUrl`, `thumb_url`, `thumb`, `thumbnail`, `image_url`, and `image` before allowing an empty normalized poster/thumb.
- 2026-06-13 follow-up: production image proxy also showed `No image` when Cloudflare did not transform a valid upstream JPEG to WebP. `src/pages/api/image.ts` must accept valid `image/jpeg`, `image/png`, `image/avif`, and `image/webp` origin responses and serve/cache them with the actual content type.
- `movieDetailFromPayload()` builds `MovieDetail`, episode server data, labels, and optional VSEmbed fallback server.
- `getHome()` fetches latest, single, series, animation, TV, cinema, and filtered list sections, then builds Smart Spotlight candidates.
- `getList()` supports quick country/category filters for selected list types.
- `searchMovies()` uses the OPhim search API and does not store search results in metadata cache when TTL is 0.
- `displayEpisodeServerName()` maps server names beginning with `vietsub` to `OPhim`.

## Video Notes

- Watch pages can use either direct HLS (`HlsVideo`) or embed iframe (`IframePlayerFacade`).
- Mobile user agents default toward embed if an embed URL exists unless `player=hls` is requested.
- `VSEMBED_MOBILE_EMBED_HOST` can switch mobile embed host among an allowlist.
- `lib/vsembed.ts` constructs VSEmbed movie/episode URLs from TMDB/IMDb IDs when available.
- Video playback policy: M3U8/HLS chunking is delegated to upstream segments. Do not proxy or re-chunk video through Cloudflare Worker. Optimize only client-side HLS buffer, retry, lazy loading, native HLS fallback, and error recovery. Default buffer should remain conservative; 5-minute buffer is an upper cap for good-network aggressive mode, not the universal default.
- OPhim playback architecture after the hls.js-first player change: `lib/ophim.ts` maps OPhim `link_m3u8`/`linkM3u8` to `Episode.linkM3u8`; `src/pages/watch/[slug].astro` passes that m3u8 URL to `components/HlsVideo.tsx`; `HlsVideo.tsx` renders `<video controls playsInline preload="metadata">`, dynamically imports `hls.js`, uses hls.js when `Hls.isSupported()` is true, falls back to native HLS when `canPlayType("application/vnd.apple.mpegurl")` is available, recovers fatal network errors with `startLoad()`, recovers fatal media errors with `recoverMediaError()`, destroys hls.js before native fallback for other fatal errors, and destroys/detaches on cleanup.
- Current Vidsrc API/call structure observed from the repo: `lib/vsembed.ts` uses provider/server name `Vidsrc`, default embed base `https://vsembed.ru`, optional override `VSEMBED_EMBED_BASE_URL`, and identity query parameters that prefer `tmdb=...` before `imdb=tt...`.
- Vidsrc movie URLs are built in `buildVsembedMovieUrl()` as `/embed/movie?tmdb=...&autoplay=0` or `/embed/movie?imdb=...&autoplay=0`; TV URLs are built in `buildVsembedEpisodeUrl()` as `/embed/tv?tmdb=...&season=1&episode=...&autoplay=0&autonext=1` or the same with `imdb=...`.
- Vidsrc fallback integration: `lib/ophim.ts` calls `buildVsembedServer(movie)` and appends the returned server to `movie.episodes`; `src/pages/watch/[slug].astro` selects it through the existing `server` query index, reads `episode.linkEmbed`, rewrites only allowed Vidsrc/VSEmbed hosts for `mirror` or mobile host selection, and renders it through `components/IframePlayerFacade.tsx` as an iframe after click-to-load.
- Vidsrc uses iframe/embed playback, not a direct video source, and must not be routed through `HlsVideo.tsx`.

## Navigation Notes

- Canonical user hierarchy is Category/List -> Detail -> Episode/Watch.
- Category/list state is URL-addressable through `/list/[type]` plus query params; bottom active state is derived from pathname in `components/BottomNav.tsx`.
- Detail pages live at `/movie/[slug]`; watch pages live at `/watch/[slug]` with episode/server query state.
- Movie cards and the `Xem phim` button use normal anchors so browser history keeps the previous hierarchy entry.
- Category/List source context persists through Detail and Watch using `returnTo=<encoded path+search>` query params added by generated links and `src/layouts/BaseLayout.astro`; hash fragments and `from` params are browser-only legacy fallbacks.
- `returnTo` stores the original list/home destination, not always the immediate back destination. In-page back on `/watch/[slug]` must go to `/movie/[slug]` first while preserving `returnTo`; in-page back on `/movie/[slug]` may navigate to the safe `returnTo` list/home destination.
- Active bottom nav is resolved from explicit source context first, then route, then reliable stored fallback for non-child routes, otherwise none. Detail/watch pages must not clear the active tab simply because they are child routes.
- Detail -> Watch creates one history entry; episode-to-episode changes inside `src/pages/watch/[slug].astro` use replace navigation through `data-watch-episode-link`, so Back from Watch returns to Detail regardless of how many episodes were selected.
- `src/layouts/BaseLayout.astro` owns the same-origin `data-nav-back` handler for up-controls with URL fallbacks on direct-opened pages.
- Anti-regression rule: Browser Back must move Episode/Watch -> Detail -> previous Category/List without Detail <-> Watch loops and without resetting the active tab to `Trang chủ` unless home was the real previous page.

## SEO And Static Assets

- `BaseLayout.astro` sets canonical, Open Graph, Twitter, manifest, icons, and locale metadata.
- `public/robots.txt`, `public/sitemap.xml`, `public/sitemap-index.xml`, and `public/_headers` exist.
- `public/manifest.webmanifest` and icon assets exist.
- Need verification: sitemap generation/update workflow is not evident from inspected files.

## Known Constraints

- Avoid scanning generated folders: `node_modules`, `dist`, `.astro`, `.wrangler`, `.vite-cache-build`, `.verify-deps`.
- Keep code Cloudflare-compatible and Edge-friendly.
- Do not change cache key versioning or TTLs without an explicit cache task.
- Preserve the mobile-first app shell and bottom navigation behavior.
- Existing UI text appears Vietnamese; avoid changing copy unless requested.
- Need verification: some inspected Vietnamese strings display mojibake in terminal output; confirm source encoding/rendering before editing user-visible text broadly.
