# Decisions And Anti-Regression Rules

## Platform

- The app targets Astro server output with the Cloudflare adapter.
- Keep Worker/edge compatibility. Avoid Node-only APIs unless they are already supported by configured compatibility and tested by build/preview.
- Do not introduce filesystem runtime persistence; use Cloudflare KV/R2/Cache API or browser storage according to existing patterns.
- Preserve `src/worker.ts` as the custom Worker entrypoint that forwards Astro fetch and owns scheduled refresh behavior.

## Caching

- HTML cache behavior lives in `src/middleware.ts`; metadata/image cache behavior lives mostly in `lib/cache.ts`, `lib/ophim.ts`, and `src/pages/api/image.ts`.
- Do not change unrelated cache keys, cache key prefixes, TTLs, `HTML_CACHE_VERSION`, or binding names unless explicitly requested.
- Movie HTML cache duration depends on `X-Film-Bluesia-Movie-Cache-Class` from the detail page.
- Search, watch, favorites, history, and settings should remain no-store/private HTML unless a task explicitly changes that.
- Image cache objects use fixed profiles and WebP output; do not add arbitrary width/quality cache variants without a cache design change.
- Refresh writes should preserve stable-hash deduplication and daily KV write-budget behavior.

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
- Browser Back from a movie detail page must return to the exact previous category/tab page, including `/list/phim-le`, `/list/phim-bo`, `/list/tv-shows`, and `/list/hoat-hinh` states.
- Detail pages must not auto-reopen Episode Selection/Watch on hydration, `pageshow`, `popstate`, or route restoration.
- Normal category-to-detail and detail-to-watch user navigation should remain normal anchors that preserve browser history; do not use `replaceState` in a way that destroys the previous category/list entry.
- Active bottom tab/category must be derived from URL/history and must not reset to `Trang chủ` by default during hydration or route restoration.
- In-page up/back controls from detail or watch may use `data-nav-back` with URL fallbacks so direct-opened detail/watch URLs still work.
- Manual check when navigation code changes: open `Phim lẻ`, click a poster, click `Xem phim`, press browser Back to return to Detail, then press browser Back again and verify the URL and active bottom tab return to `Phim lẻ` without a Detail <-> Watch loop or home-tab flash. Repeat for `Trang chủ`, `Phim bộ`, `TV Show`, and `Hoạt hình` if the change touches route derivation.

## Episode Selection Must Not Pollute Browser History

- Episode changes inside Watch/Episode are same-level state changes, not new hierarchy levels.
- Selecting episodes must not push a new browser history entry per episode.
- Back from any selected episode must return to Detail.
- Use replace navigation or internal state for episode-to-episode changes.
- Do not use `history.go(-N)`, `setTimeout`, or stack-skipping hacks.
- Manual check when episode navigation changes: open a series detail, click `Xem phim`, select Episode 3, Episode 5, then Episode 6, press browser Back once, and verify the current page is Detail rather than Episode 5 or Episode 3. Press Back again and verify the original category/list page is restored.

## Player

- Direct HLS playback uses `HlsVideo.tsx` with dynamic imports for Artplayer and hls.js.
- Embed playback uses `IframePlayerFacade.tsx`; watch-page selection logic is in `src/pages/watch/[slug].astro`.
- Preserve mobile/embed fallback behavior unless the task targets player selection.

## SEO And Public Files

- Core page metadata is in `BaseLayout.astro`; movie pages pass video metadata props.
- Robots and sitemap files live under `public/`.
- Need verification: sitemap update/generation process is not evident from inspected files.

## Verification

- Run `npm run build` after code or config changes when reasonable.
- There are currently no lint/test scripts in `package.json`.
- For cache/runtime changes, also review `CLOUDFLARE_CACHE.md` for documentation drift.
- Do not fix unrelated worktree changes unless they directly block verification.
