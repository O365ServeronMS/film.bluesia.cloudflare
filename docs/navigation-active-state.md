# Navigation Active State

Bottom navigation active state is based on the current pathname plus return context.

- Top-level category paths such as `/phim-le`, `/list/phim-le`, `/list/phim-bo`, `/list/tv-shows`, `/list/hoat-hinh`, and `/settings` resolve directly from pathname.
- Child pages under `/movie/...` and `/watch/...` should preserve their source page with a real `returnTo` query param containing the encoded source pathname and search.
- New links must never generate category context as hash fragments. Use `returnTo=<encoded path+search>` when linking into `/movie/...` or `/watch/...`.
- Hash fragments must not be used for server-rendered active state because they are browser-only and unavailable during Astro/server/static render.
- If no `returnTo` or legacy `from` query exists, movie detail and watch pages may infer the active tab from available movie metadata. Single movies map to `phim-le`; series, TV, and anime categories should keep their matching tabs.
- Bottom nav precedence is: `returnTo` search param, legacy `from` search param, pathname/category match, page-provided movie/category fallback, stored navigation context, then legacy hash fallback on the client.
- A small client fallback still reads legacy `from` fragments after load for old cached links. New generated links must use `returnTo`.
- This behavior is UI-only. Do not change Cloudflare, cache, KV, R2, video player, HLS, or deployment logic for nav active-state fixes.
