# Decisions And Anti-Regression Rules

## 2026-06-13 Movie Image Normalization

- Movie image mapping belongs in the data layer, not in `MovieCard` or route templates. `lib/movie-images.ts` owns `normalizeMovieImage()`, `resolveMoviePoster()`, and `normalizePosterUrl()`, and `lib/ophim.ts` must normalize cards through that helper.
- OPhim/source movie payloads may expose image fields as `posterUrl`, `poster_url`, `poster`, `thumbUrl`, `thumb_url`, `thumb`, `thumbnail`, `image_url`, or `image`. Prefer poster fields, fall back to thumb fields, and only render `No image` when all usable image fields are absent.
- Relative image paths must be normalized through the existing OPhim image CDN base logic. Do not hardcode a new image domain or duplicate source-specific mapping inside UI components.
- Cache bump for this incident: metadata KV list/detail keys include `img-fields-v2` (`list:img-fields-v2:<hash>`, `detail:img-fields-v2:<slug>`), and HTML cache version is `Jun26-v2-img-fields` so home/list/movie HTML is regenerated with corrected poster data.

## 2026-06-09 Return-To Navigation Context

- Use full returnTo path+search for list → detail → watch navigation. Do not rely on from-only or hash fragments. Do not replace browser history during normal forward navigation.
- Generated movie detail links carry `returnTo` with the encoded current pathname and search, so paginated and filtered list state is preserved.
- Detail pages preserve the same `returnTo` in watch and episode links; watch pages preserve it in detail and same-watch episode links.
- Active bottom-nav context is derived from `returnTo` first, then legacy `from` parsing and movie metadata fallback.
- Same-watch episode changes may still replace the current watch URL to avoid polluting Back history with episode-to-episode entries; this is separate from normal list -> detail -> watch navigation.
- In-page back buttons must follow the page hierarchy. On `/watch` pages, back returns to `/movie/[slug]` first while preserving safe `returnTo`; on `/movie` pages, back may use safe `returnTo` to restore the original list/home page. Browser-native Back cannot restore a list page when a detail page is opened in a new tab because the new tab has no previous history entry. Do not create fake history entries for this.

## 2026-06-09 Adaptive Client-Side Prefetch

- Added adaptive client-side prefetch in `src/client/adaptivePrefetch.ts`, initialized globally from `src/layouts/BaseLayout.astro`.
- Navigation habit tracking is localStorage-only under `filmbluesia_nav_stats_v1`; this keeps behavior personal to each browser and avoids server-side tracking, Cloudflare KV writes, or external analytics.
- Route transitions are recorded as previous normalized route/category -> current normalized route/category counts. Dynamic detail/playback pages normalize to `/movie` and `/watch`; list pages remain distinguishable by `/list/[type]` plus safe category/country filters, excluding noisy pagination.
- Prediction thresholds are intentionally conservative: minimum transitions from the current route is `5`, and the best target must have probability at least `0.45`. Only the single best next route may be considered per page view.
- Safety limits keep storage small: at most `24` source routes, at most `8` target routes per source, and lowest-count entries are pruned first.
- Safe prefetch runs only after page load and during idle time with a `setTimeout` fallback. It skips when localStorage/sessionStorage is unavailable, when `navigator.connection.saveData` is true, or on `slow-2g`/`2g` connections.
- Prefetch is limited to one predicted route per page view, deduped within the browser session, and only warms safe list resources: category/list route HTML and the first-page `/api/ophim/list/[type]` API that already exists.
- Strict rule: never prefetch video/HLS/playback resources. The prefetch mapper never targets `/watch`, `/movie`, player/embed/playback paths, or `.m3u8`, `.ts`, `.m4s`, `.mp4` resources.
- Changed files: `src/client/adaptivePrefetch.ts`, `src/layouts/BaseLayout.astro`, `docs/DECISIONS.md`, and `AI_MEMORY.md`.
- Build/test result: `npm run build` passed on 2026-06-09. No lint/typecheck script exists in `package.json`; Astro build is the available verification.

## 2026-06-09 HLS Playback Strategy

- HLS playback is hls.js-first for MSE-capable browsers, with native HLS fallback for iOS/Safari or unsupported MSE cases, to keep desktop browser playback behavior consistent without breaking iOS native playback.
- `components/HlsVideo.tsx` must keep `hls.js` as a dynamic import inside the direct watch/player path; do not import it globally.
- Fatal hls.js errors recover by type: network errors call `startLoad()`, media errors call `recoverMediaError()`, and other fatal errors destroy hls.js before attempting native HLS fallback.

## Platform

- The app targets Astro server output with the Cloudflare adapter.
- Keep Worker/edge compatibility. Avoid Node-only APIs unless they are already supported by configured compatibility and tested by build/preview.
- Do not introduce filesystem runtime persistence; use Cloudflare KV/R2/Cache API or browser storage according to existing patterns.
- Preserve `src/worker.ts` as the custom Worker entrypoint that forwards Astro fetch and owns scheduled refresh behavior.
- Cloudflare bindings have separate roles: `IMAGE_CACHE` and `KV` are app data bindings and must remain unchanged unless explicitly requested.
- `ASSETS` is the static assets binding required by the Astro Worker fallback through `env.ASSETS.fetch()`.
- Do not confuse R2/KV bindings with `assets.binding`; missing `ASSETS` can cause `/_astro/*.css` or `/_astro/*.js` requests to fail with Worker Exception 1101.

## Caching

- HTML cache behavior lives in `src/middleware.ts`; metadata/image cache behavior lives mostly in `lib/cache.ts`, `lib/ophim.ts`, and `src/pages/api/image.ts`.
- Do not change unrelated cache keys, cache key prefixes, TTLs, `HTML_CACHE_VERSION`, or binding names unless explicitly requested.
- Movie HTML cache duration depends on `X-Film-Bluesia-Movie-Cache-Class` from the detail page.
- Search, watch, favorites, history, and settings should remain no-store/private HTML unless a task explicitly changes that.
- Image cache objects use fixed profiles and WebP output; do not add arbitrary width/quality cache variants without a cache design change.
- Refresh writes should preserve stable-hash deduplication and daily KV write-budget behavior.
- Current active image cache namespace is `cf-img-jun-2026`.
- Do not change image cache namespace/prefix without explicit owner approval.
- Do not delete old R2 cache prefixes during code changes; keep them for rollback unless explicitly requested.

## Data

- OPhim metadata normalization is centralized in `lib/ophim.ts`; prefer extending `normalizeCard()` and shared types instead of duplicating shape logic in UI.
- Shared movie/source types belong in `lib/types.ts`.
- Display-specific formatting belongs in `lib/utils.ts` or components, not in API route handlers.
- VSEmbed fallback construction belongs in `lib/vsembed.ts`.
- Need verification: no D1 binding is evident in `wrangler.jsonc`; do not assume active D1 storage without checking current config.

## UI

- The app is mobile-first with a constrained shell in `BaseLayout.astro` and fixed bottom nav in `BottomNav.tsx`.
- Preserve existing mobile layout unless the task says otherwise.
- Avoid broad UI refactors for small card/layout changes.
- Shared poster-card changes should usually happen in `components/MovieCard.tsx` so home, lists, search, favorites, and history stay consistent.
- Keep favorite/heart, Full/episode, and quality badge positions stable when changing poster overlay content unless the task explicitly changes them.
- Existing UI uses Tailwind classes and lucide-react icons; reuse those patterns.

## Navigation Hierarchy And Browser Back Behavior

- Category/List -> Detail -> Episode/Watch is the canonical hierarchy.
- Browser Back must move one hierarchy level up and must never loop Detail <-> Episode/Watch.
- Browser Back from a movie detail page must return to the exact previous category/tab page, including `/list/phim-le`, `/list/phim-bo`, `/list/tv-shows`, and `/list/hoat-hinh` states with query params.
- Detail pages must not auto-reopen Episode Selection/Watch on hydration, `pageshow`, `popstate`, or route restoration.
- Normal category-to-detail and detail-to-watch user navigation should remain normal anchors that preserve browser history; do not use `replaceState` in a way that destroys the previous category/list entry.
- Active bottom tab/category must be derived from URL/history and must not reset to `Trang chủ` by default during hydration or route restoration.
- In-page up/back controls from detail or watch may use `data-nav-back` with URL fallbacks so direct-opened detail/watch URLs still work.
- Navigation hierarchy decision: FilmBluesia uses the hierarchy List/Home tab -> `/movie/[slug]` -> `/watch/[slug]`. The `returnTo` query parameter stores the original list/home destination. It must not always be treated as the immediate back destination. On `/watch` pages, the in-page back button must return to `/movie/[slug]` first while preserving `returnTo`. On `/movie` pages, the in-page back button may use `returnTo` to return to the original list/home page. Do not use fake browser history or `history.replaceState` to force this behavior.
- Manual check when navigation code changes: open `Phim lẻ`, click a poster, click `Xem phim`, press browser Back to return to Detail, then press browser Back again and verify the URL and active bottom tab return to `Phim lẻ` without a Detail <-> Watch loop or home-tab flash. Repeat for `Trang chủ`, `Phim bộ`, `TV Show`, and `Hoạt hình` if the change touches route derivation.

## Episode Selection Must Not Pollute Browser History

- Episode changes inside Watch/Episode are same-level state changes, not new hierarchy levels.
- Selecting episodes must not push a new browser history entry per episode.
- Back from any selected episode must return to Detail.
- Use replace navigation or internal state for episode-to-episode changes.
- Do not use `history.go(-N)`, `setTimeout`, or stack-skipping hacks.
- Manual check when episode navigation changes: open a series detail, click `Xem phim`, select Episode 3, Episode 5, then Episode 6, press browser Back once, and verify the current page is Detail rather than Episode 5 or Episode 3. Press Back again and verify the original category/list page is restored.

## Bottom Nav Source Tab Must Persist Across Child Pages

- Navigation policy: category context for `/movie` and `/watch` pages should be carried by `returnTo=<encoded path+search>`, not hash fragments. Hash fragments are unavailable during Astro/server/static render. Bottom nav active state should use pathname plus `returnTo` and optional movie category fallback. Do not change Cloudflare/cache/video logic for nav active-state fixes.
- The legacy `from` and hash fallback exists only for old cached links after client load. New generated child links must use `returnTo`.

- Detail and Watch/Episode pages are child pages of the source tab/category.
- Opening Detail from a bottom-nav tab must keep that tab active on Detail and Watch.
- Active tab must not be derived only from the current pathname because `/movie/...` and `/watch/...` are child routes.
- Do not default detail/watch pages to `Trang chủ` when source context is unknown; unknown direct child URLs should have no forced source tab.
- Preserve source context through Detail -> Watch, Watch/Episode episode replacements, and browser Back navigation.
- Manual check when bottom-nav context changes: open `Trang chủ`, `Phim lẻ`, `Phim bộ`, `TV Show`, and `Hoạt hình`; from each, open Detail and then `Xem phim`, and verify the same source tab remains active on both child pages.

## Player

- Direct OPhim HLS playback uses `HlsVideo.tsx` with hls.js first on MSE-capable browsers and native HTML5 HLS fallback for iOS/Safari or unsupported MSE cases.
- M3U8/HLS chunking is delegated to upstream playlist segments; do not proxy, re-chunk, download, transcode, or store third-party video segments through the Cloudflare Worker.
- HLS performance tuning belongs in the client player: conservative default buffer, good-network aggressive buffer cap, retry settings, lazy loading, native HLS fallback, and fatal error recovery.
- Default HLS buffer target should remain 60 seconds. Aggressive mode may target 180 seconds with a 300-second max cap only on good connections; 5-minute buffering is not a universal default.
- Embed playback uses `IframePlayerFacade.tsx`; watch-page selection logic is in `src/pages/watch/[slug].astro`.
- Preserve mobile/embed fallback behavior unless the task targets player selection.

## Vidsrc Playback Must Remain Isolated From OPhim Player Changes

- OPhim playback may use hls.js plus native video fallback for direct m3u8 streams.
- Vidsrc playback/API/embed flow must not be modified unless explicitly requested.
- Do not remove dependencies used by Vidsrc.
- Do not route Vidsrc through the OPhim HLS player.
- Any future player optimization must check source/provider separation first.

## SEO And Public Files

- Core page metadata is in `BaseLayout.astro`; movie pages pass video metadata props.
- Robots and sitemap files live under `public/`.
- Need verification: sitemap update/generation process is not evident from inspected files.

## Verification

- Run `npm run build` after code or config changes when reasonable.
- There are currently no lint/test scripts in `package.json`.
- For cache/runtime changes, also review `docs/CLOUDFLARE_CACHE.md` for documentation drift.
- Do not fix unrelated worktree changes unless they directly block verification.
