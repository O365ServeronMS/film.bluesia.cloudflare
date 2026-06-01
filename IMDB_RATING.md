# IMDb Rating Lookup

This project does not scrape IMDb HTML pages and does not fetch `https://www.imdb.com/title/...` at runtime. IMDb ratings come from the official IMDb datasets, refreshed weekly into Cloudflare D1.

## Current Cloudflare Bindings

- R2: `IMAGE_CACHE` -> `film-bluesia-cache`
- KV: `KV` -> `film_bluesia_metadata`
- D1: `IMDB_DB` -> create this database before enabling production lookup.

The existing R2 image cache and KV metadata cache are reused. No new R2 bucket or KV namespace is required.

## Storage Layout

R2 keys under the existing `IMAGE_CACHE` bucket:

```txt
imdb/raw/title.ratings.tsv.gz
imdb/meta/ratings-sync.json
```

KV keys in the existing `KV` namespace:

```txt
imdb:rating:{imdbId}
imdb:sync:last_success
imdb:sync:status
```

D1 tables are created by `migrations/0001_imdb_ratings.sql`.

## Runtime Lookup

The movie detail page extracts an IMDb ID from fields such as `movie.imdb.id`, then looks up:

1. KV hot cache: `imdb:rating:{ttid}`
2. D1 table: `imdb_ratings`
3. Existing movie metadata IMDb rating as display fallback while D1 is not seeded

Normal user requests never download or parse the IMDb dataset.

## D1 Setup

Create the database:

```bash
npx wrangler d1 create film-bluesia-imdb
```

Add the returned `database_id` to `wrangler.jsonc`:

```jsonc
"d1_databases": [
  {
    "binding": "IMDB_DB",
    "database_name": "film-bluesia-imdb",
    "database_id": "<database_id>"
  }
]
```

Apply migrations:

```bash
npx wrangler d1 migrations apply film-bluesia-imdb --remote
```

## Manual Sync

```bash
npm run imdb:sync
```

The sync downloads `https://datasets.imdbws.com/title.ratings.tsv.gz`, stores a raw backup in R2, stream-parses it, and batch-upserts ratings into D1.

## Weekly Sync

The GitHub Actions workflow `.github/workflows/imdb-ratings-sync.yml` runs every Monday at 03:00 UTC. It needs:

- `CLOUDFLARE_API_TOKEN` secret
- `CLOUDFLARE_ACCOUNT_ID` secret
- Optional `IMDB_D1_DATABASE_NAME` repository variable, defaulting to `film-bluesia-imdb`

IMDb publishes datasets daily, but this project refreshes weekly by design.

## API

```txt
/api/imdb-rating?id=tt0111161
```

Found response:

```json
{
  "imdbId": "tt0111161",
  "rating": 9.3,
  "votes": 2980000,
  "source": "imdb-dataset",
  "updatedAt": "2026-06-01T00:00:00.000Z"
}
```

Missing response:

```json
{
  "imdbId": "tt0111161",
  "rating": null,
  "votes": null,
  "source": "none"
}
```

## Troubleshooting

- Missing IMDb ID: OPhim data may not include a `tt...` ID.
- D1 binding missing: add `IMDB_DB` in `wrangler.jsonc` after creating the D1 database.
- R2 binding missing: keep `IMAGE_CACHE` bound to `film-bluesia-cache`.
- KV binding missing: keep `KV` bound to `film_bluesia_metadata`.
- Rating not displayed: no valid `tt...` ID exists, D1 is not seeded, or the existing movie metadata also has no IMDb rating.
- Direct IMDb HTML scraping is intentionally not implemented.
- OMDb fallback is intentionally not implemented for this deployment.
