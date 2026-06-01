CREATE TABLE IF NOT EXISTS imdb_ratings (
  imdb_id TEXT PRIMARY KEY,
  rating REAL NOT NULL,
  votes INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'imdb-dataset'
);

CREATE INDEX IF NOT EXISTS idx_imdb_ratings_votes
ON imdb_ratings(votes);

CREATE TABLE IF NOT EXISTS imdb_sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
