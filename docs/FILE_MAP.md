# File Map

## Root And Config

- `package.json`: scripts, dependencies, browser targets. Build command is `npm run build`.
- `astro.config.mjs`: Astro server output, Cloudflare adapter, React integration, Vite aliases/cache dir.
- `wrangler.jsonc`: Cloudflare Worker/assets entry, compatibility flags, route, cron, KV/R2 bindings, public vars. Controls Cloudflare bindings: `IMAGE_CACHE` is the R2 image cache binding, `KV` is the metadata KV binding, and `assets.binding = "ASSETS"` is required for static CSS/JS assets.
- `tsconfig.json`: strict TypeScript, JSX, path alias, generated-folder excludes.
- `postcss.config.mjs`: Tailwind/PostCSS setup.
- `docs/CLOUDFLARE_CACHE.md`: operational cache documentation and binding expectations.
- `docs/video-buffering-policy.md`: HLS playback buffering policy; documents client-side buffer/retry optimization and the rule against Worker-side video proxying or chunking.
- `docs/navigation-active-state.md`: bottom-nav active-state policy for pathname, `returnTo` query context, movie metadata fallback, and legacy hash fallback.

## Routes

- `src/pages/index.astro`: home page; `getHome()`, hero preload, `TopBar`, `HeroSlider`, `SectionRow`.
- `src/pages/list/[type].astro`: category/list pages; filters, pagination, `MovieCard` grid.
- `src/pages/search.astro`: search page; `SearchSuggest`, `searchMovies()`, `MovieCard` grid.
- `src/pages/movie/[slug].astro`: movie detail page; detail metadata, poster, rating, `Xem phim` detail-to-watch link, episode list links, `data-nav-back` detail up-control fallback to `/`.
- `src/pages/watch/[slug].astro`: watch page; episode/server selection, `data-watch-episode-link` episode selector, same-watch-page `location.replace` handler for episode-to-episode changes, OPhim HLS vs Vidsrc embed player selection, Vidsrc host/mirror/mobile embed URL adjustment, history recorder, `data-nav-back` watch up-control fallback to `/movie/[slug]`.
- `src/pages/favorites.astro`: local favorites page.
- `src/pages/history.astro`: local history page.
- `src/pages/settings.astro`: settings/info page.

## API Routes

- `src/pages/api/image.ts`: image proxy/optimizer; handles image cache prefix (`IMAGE_CACHE_PREFIX`) and key generation (`cacheKey`), proxying, and caching via Cloudflare Image Resizing, edge cache, and R2 (using helpers in `lib/cache.ts`).
- `src/pages/api/admin/refresh.ts`: protected manual OPhim refresh endpoint and KV rate/write-budget logic.
- `src/pages/api/cache/status.ts`: cache status/prune endpoint wrapper.
- `src/pages/api/ophim/home.ts`: home metadata API.
- `src/pages/api/ophim/list/[type].ts`: list metadata API.
- `src/pages/api/ophim/movie/[slug].ts`: movie metadata API.
- `src/pages/api/ophim/search.ts`: search metadata API.
- `src/pages/api/ophim/categories.ts`: category taxonomy API.
- `src/pages/api/ophim/countries.ts`: country taxonomy API.

## Worker, Middleware, Layout

- `src/worker.ts`: Cloudflare Worker exports; passes Astro fetch through and adds scheduled OPhim refresh.
- `src/middleware.ts`: HTML cache policies, Cache API read/write, refresh bypass, no-store rules.
- `src/layouts/BaseLayout.astro`: head metadata, app shell, poster fallback script, return context propagation for `/movie` and `/watch` links, same-origin `data-nav-back` browser-history handler, dev nav debug script, bottom nav island.
- `src/env.d.ts`: Cloudflare binding/runtime type declarations.
- `src/styles/globals.css`: global CSS/Tailwind styles.

## Components

- `components/MovieCard.tsx`: poster card UI and normal `/movie/[slug]` anchor links used by home/list/search/favorites/history.
- `components/SectionRow.tsx`: home row/grid wrapper around `MovieCard`.
- `components/HeroSlider.tsx`: Smart Spotlight carousel and local preference ranking.
- `components/TopBar.tsx`: sticky search and quick links.
- `components/BottomNav.tsx`: fixed mobile bottom navigation, active tab resolver, category/source context derivation from pathname and `returnTo`, optional movie fallback, and legacy hash fallback, with `popstate`/`hashchange`/`pageshow` route restoration sync.
- `components/SearchSuggest.tsx`: search box and suggestions.
- `components/LocalMovieActions.tsx`: favorites/history localStorage store and detail-page buttons.
- `components/StoredMovieGrid.tsx`: favorites/history `MovieCard` grid.
- `components/HlsVideo.tsx`: native HTML5 video player for OPhim direct HLS/m3u8 streams; uses native Safari/iOS HLS when supported and dynamically imports hls.js as the fallback.
- `components/IframePlayerFacade.tsx`: click-to-load iframe embed player facade used by Vidsrc embed URLs.
- `components/WatchRecorder.tsx`: local history recording on watch pages.

## Libraries

- `lib/ophim.ts`: OPhim client, metadata normalization, list/home/search/detail fetches, TTL policy, refresh jobs.
- `lib/cache.ts`: KV/R2/Cache API helpers, TTLs, binary/json caches, stable hashes, write budgets, cache stats.
- `lib/types.ts`: shared movie, episode, source payload, taxonomy, and API types.
- `lib/utils.ts`: class merging, text cleanup, rating display helpers, proxied image URL/srcset helpers.
- `lib/spotlight.ts`: Smart Spotlight scoring/merging logic.
- `lib/episodes.ts`: episode name/slug/watch-key helpers.
- `lib/runtime-env.ts`: runtime env and cache-bypass flag storage for Worker/Astro request scope.
- `lib/vsembed.ts`: Vidsrc/VSEmbed fallback URL and episode server construction; provider server name is `Vidsrc`.

## Playback Source Separation

- OPhim player path: `lib/ophim.ts` normalizes OPhim episode `link_m3u8`/`linkM3u8` into `Episode.linkM3u8`; `src/pages/watch/[slug].astro` renders `components/HlsVideo.tsx` for direct m3u8 when embed playback is not selected.
- Vidsrc source/provider selection: `lib/ophim.ts` calls `buildVsembedServer(movie)` and appends the returned `serverName: "Vidsrc"` server to `movie.episodes`; `src/pages/watch/[slug].astro` selects it through the existing `server` query index.
- Vidsrc API/embed URL construction: `lib/vsembed.ts` defaults to `https://vsembed.ru` or `VSEMBED_EMBED_BASE_URL`; movie embeds use `/embed/movie?tmdb=...&autoplay=0` or `/embed/movie?imdb=...&autoplay=0`; TV embeds use `/embed/tv?tmdb=...&season=1&episode=...&autoplay=0&autonext=1` or the same with `imdb=...`.
- Vidsrc route/watch integration: `src/pages/watch/[slug].astro` reads `episode.linkEmbed`, applies allowed host mirror/mobile rewrites for `vsembed.ru`, `vsembed.su`, `vidsrc-embed.ru`, `vidsrc-embed.su`, `vidsrcme.su`, and `vsrc.su`, then renders the embed branch.
- Vidsrc rendering: `components/IframePlayerFacade.tsx` renders the selected embed URL in an `<iframe>` after the user clicks the facade; Vidsrc is not routed through `components/HlsVideo.tsx`.

## Public Assets And SEO

- `public/robots.txt`: robots rules and sitemap links.
- `public/sitemap.xml`: sitemap.
- `public/sitemap-index.xml`: sitemap index.
- `public/_headers`: cache headers for robots/sitemap files.
- `public/manifest.webmanifest`: PWA manifest.
- `public/icon*.png`, `public/icon.svg`, `public/favicon.*`, `public/apple-touch-icon.png`: icons.

## Search Hints

- Movie cards / poster UI: `rg -n "MovieCard|poster|episodeCurrent|quality|Heart|Star" components src lib`.
- Rating badges: `rg -n "rating|IMDb|TMDB|getDisplayRating|getDisplayRatings|Star" components lib src`.
- Navigation: `rg -n "BottomNav|TopBar|nav|CONTEXT_KEY|data-nav-back|pageshow|popstate|hashchange|pathname|SearchSuggest" components src`.
- Category back/active-tab regressions: check `components/BottomNav.tsx`, `src/layouts/BaseLayout.astro`, `components/MovieCard.tsx`, `src/pages/list/[type].astro`, `src/pages/movie/[slug].astro`, and `src/pages/watch/[slug].astro` before scanning elsewhere.
- Detail/watch hierarchy loops: `rg -n "Xem phim|data-nav-back|/watch/|/movie/|history.back|popstate|pageshow" src components`.
- Episode selection history: `rg -n "data-watch-episode-link|location.replace|episodeWatchKey|findEpisodeByWatchKey|serverIndex|epKey" src/pages/watch src lib`.
- Source tab propagation: `rg -n "returnTo|validNavSource|currentReturnTo|data-watch-episode-link|activeKeyFromPath|contextKeyForPath" src/layouts components src/pages`.
- Video player / HLS: `rg -n "HlsVideo|hls.js|m3u8|IframePlayerFacade|vsembed|Vidsrc" components src lib`.
- Video buffering policy: `docs/video-buffering-policy.md` and the Player section in `docs/DECISIONS.md`.
- Cloudflare Worker/Pages logic: `rg -n "worker|scheduled|createExports|cloudflare|wrangler|adapter|caches.default" src lib astro.config.mjs wrangler.jsonc`.
- KV/R2/D1/cache logic: `rg -n "KV|MOVIE_METADATA|IMAGE_CACHE|R2|D1|cache|TTL|HTML_CACHE_VERSION|writeBudget" src lib docs/CLOUDFLARE_CACHE.md wrangler.jsonc`.
- SEO / robots / sitemap: `rg -n "canonical|og:|twitter|robots|sitemap|manifest|_headers" src public`.
- OPhim metadata shape: `rg -n "normalizeCard|SourceMovie|SourceRating|tmdb|imdb|episode" lib src`.
