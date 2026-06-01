import { createGunzip } from "node:zlib";
import { createReadStream, createWriteStream, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import readline from "node:readline";

const DATASET_URL = "https://datasets.imdbws.com/title.ratings.tsv.gz";
const D1_DATABASE_NAME = process.env.IMDB_D1_DATABASE_NAME || "film-bluesia-imdb";
const R2_BUCKET = process.env.IMDB_R2_BUCKET || "film-bluesia-cache";
const BATCH_SIZE = Number(process.env.IMDB_SYNC_BATCH_SIZE || 450);

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function rowSql(row, updatedAt) {
  return `(${sqlString(row.imdbId)}, ${row.rating}, ${row.votes}, ${sqlString(updatedAt)}, 'imdb-dataset')`;
}

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`IMDb dataset download failed: ${response.status}`);
  }

  const writer = createWriteStream(destination);
  await new Promise((resolve, reject) => {
    response.body.pipeTo(new WritableStream({
      write(chunk) {
        writer.write(Buffer.from(chunk));
      },
      close() {
        writer.end(resolve);
      },
      abort(error) {
        writer.destroy(error);
        reject(error);
      }
    })).catch(reject);
  });
}

function upsertBatch(batch, updatedAt, sqlFile) {
  if (!batch.length) return;
  const values = batch.map((row) => rowSql(row, updatedAt)).join(",\n");
  const sql = `INSERT INTO imdb_ratings (imdb_id, rating, votes, updated_at, source)
VALUES
${values}
ON CONFLICT(imdb_id) DO UPDATE SET
  rating = excluded.rating,
  votes = excluded.votes,
  updated_at = excluded.updated_at,
  source = excluded.source;`;
  writeFileSync(sqlFile, sql);
  run("npx", ["wrangler", "d1", "execute", D1_DATABASE_NAME, "--remote", "--file", sqlFile]);
}

async function syncRatings(gzipPath, workDir) {
  const updatedAt = new Date().toISOString();
  const sqlFile = join(workDir, "batch.sql");
  const input = createReadStream(gzipPath).pipe(createGunzip());
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let batch = [];
  let total = 0;

  for await (const line of lines) {
    if (!line || line.startsWith("tconst")) continue;
    const [imdbId, ratingRaw, votesRaw] = line.split("\t");
    if (!/^tt\d+$/.test(imdbId)) continue;
    const rating = Number(ratingRaw);
    const votes = Number(votesRaw);
    if (!Number.isFinite(rating) || !Number.isFinite(votes)) continue;

    batch.push({ imdbId, rating, votes: Math.floor(votes) });
    if (batch.length >= BATCH_SIZE) {
      upsertBatch(batch, updatedAt, sqlFile);
      total += batch.length;
      batch = [];
      console.log(`[imdb] synced ${total} rows`);
    }
  }

  if (batch.length) {
    upsertBatch(batch, updatedAt, sqlFile);
    total += batch.length;
  }

  const meta = JSON.stringify({ updatedAt, total });
  const metaSql = `INSERT INTO imdb_sync_meta (key, value, updated_at)
VALUES ('last_success', ${sqlString(meta)}, ${sqlString(updatedAt)})
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`;
  writeFileSync(sqlFile, metaSql);
  run("npx", ["wrangler", "d1", "execute", D1_DATABASE_NAME, "--remote", "--file", sqlFile]);
  run("npx", ["wrangler", "kv", "key", "put", "imdb:sync:last_success", meta, "--binding", "KV"]);
  run("npx", ["wrangler", "kv", "key", "put", "imdb:sync:status", "success", "--binding", "KV"]);

  const metaPath = join(workDir, "ratings-sync.json");
  writeFileSync(metaPath, JSON.stringify({ updatedAt, total, source: DATASET_URL }, null, 2));
  run("npx", ["wrangler", "r2", "object", "put", `${R2_BUCKET}/imdb/meta/ratings-sync.json`, "--file", metaPath]);
  return { updatedAt, total };
}

async function main() {
  const workDir = mkdtempSync(join(tmpdir(), "film-bluesia-imdb-"));
  const gzipPath = join(workDir, "title.ratings.tsv.gz");
  try {
    console.log("[imdb] downloading title.ratings.tsv.gz");
    await download(DATASET_URL, gzipPath);
    run("npx", ["wrangler", "r2", "object", "put", `${R2_BUCKET}/imdb/raw/title.ratings.tsv.gz`, "--file", gzipPath]);
    const result = await syncRatings(gzipPath, workDir);
    console.log("[imdb] sync complete", result);
  } catch (error) {
    run("npx", ["wrangler", "kv", "key", "put", "imdb:sync:status", `failed: ${error instanceof Error ? error.message : String(error)}`, "--binding", "KV"]);
    throw error;
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
