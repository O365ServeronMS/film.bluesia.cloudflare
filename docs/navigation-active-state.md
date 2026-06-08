# Navigation Active State

Bottom navigation active state is based on the current pathname plus category context.

- Top-level category paths such as `/phim-le`, `/list/phim-le`, `/list/phim-bo`, `/list/tv-shows`, `/list/hoat-hinh`, and `/settings` resolve directly from pathname.
- Child pages under `/movie/...` and `/watch/...` should preserve their parent category with a real query param, for example `/movie/slug?from=phim-le` or `/watch/slug?ep=full&from=phim-le`.
- Hash fragments must not be used for server-rendered active state because they are browser-only and unavailable during Astro/server/static render.
- If no `from` query exists, movie detail and watch pages may infer the active tab from available movie metadata. Single movies map to `phim-le`; series, TV, and anime categories should keep their matching tabs.
- A small client fallback still reads legacy hash `from` fragments after load. New generated links must use the query param.
- This behavior is UI-only. Do not change Cloudflare, cache, KV, R2, video player, HLS, or deployment logic for nav active-state fixes.
