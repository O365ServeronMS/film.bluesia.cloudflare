# Agent Guide

## Project Purpose

- FilmBluesia is an Astro + React movie streaming/catalog app for `film.bluesia.net`.
- It fetches OPhim metadata, renders movie lists/details/watch pages, proxies images, and runs on Cloudflare through the Astro Cloudflare adapter.
- Runtime storage is Cloudflare-native: Cache API, KV-compatible metadata storage, R2 image storage, and browser `localStorage` for user state.

## Runtime Assumptions

- Build target is server output for Cloudflare Workers/Pages.
- Keep Cloudflare compatibility: avoid Node-only runtime APIs unless already supported by the configured adapter/compat flags.
- Do not add filesystem runtime persistence; Cloudflare runtime does not provide durable local files.
- Public site URL and cache versioning are configured in `astro.config.mjs`, `src/middleware.ts`, and `wrangler.jsonc`.
- Video playback policy: M3U8/HLS chunking is delegated to upstream segments. Do not proxy or re-chunk video through Cloudflare Worker. Optimize only client-side HLS buffer, retry, lazy loading, native HLS fallback, and error recovery. Default buffer should remain conservative; 5-minute buffer is an upper cap for good-network aggressive mode, not the universal default.

## Token-Saving Workflow

- Use `rg` first. Prefer `rg -n "term" src components lib` and `rg --files` over broad file reads.
- Read only high-signal files relevant to the task. Avoid `node_modules`, `dist`, `.astro`, `.wrangler`, `.vite-cache-build`, and generated/cache folders.
- Start with `package.json`, `astro.config.mjs`, `wrangler.jsonc`, `tsconfig.json`, then targeted files under `src/`, `components/`, and `lib/`.
- Check `docs/FILE_MAP.md` before scanning for common UI, cache, player, and routing tasks.

## Editing Rules

- Keep edits narrow and consistent with existing Astro/React/Tailwind patterns.
- Avoid broad UI refactors for small card, layout, cache, or metadata changes.
- Reuse existing helpers in `lib/` before adding new abstractions.
- Preserve mobile-first layout and the `max-w-[720px]` app shell unless the task explicitly changes it.
- Do not change unrelated cache keys, cache TTLs, binding names, or cache version strings unless explicitly requested.
- Do not commit secrets, account IDs, tokens, or private deployment details.

## Verification Rules

- Run `npm run build` when code changes are made and it is reasonable.
- `package.json` currently has no lint or test scripts. Run them only if added later.
- For UI changes, verify shared components first: `MovieCard`, `SectionRow`, list/search/home usage, and mobile layout classes.
- For Cloudflare/cache changes, inspect `src/middleware.ts`, `lib/cache.ts`, `lib/ophim.ts`, `src/worker.ts`, and `CLOUDFLARE_CACHE.md`.

## Response Format

- Report changed files and one-line purpose for each.
- Report verification commands and results.
- Mention any remaining `Need verification` items or skipped checks.
