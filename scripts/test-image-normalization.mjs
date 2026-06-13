import assert from "node:assert/strict";
import { normalizeMovieImage } from "../lib/movie-images.ts";

const cdn = "https://img.ophim.live/uploads/movies";

const cases = [
  {
    name: "poster_url",
    movie: { slug: "poster-url", name: "Poster URL", poster_url: "poster-url.jpg" }
  },
  {
    name: "thumb_url",
    movie: { slug: "thumb-url", name: "Thumb URL", thumb_url: "thumb-url.jpg" }
  },
  {
    name: "camelCase posterUrl/thumbUrl",
    movie: { slug: "camel", name: "Camel", posterUrl: "camel-poster.jpg", thumbUrl: "camel-thumb.jpg" }
  },
  {
    name: "relative image path",
    movie: { slug: "relative", name: "Relative", image_url: "/uploads/movies/relative.jpg" }
  }
];

for (const item of cases) {
  const image = normalizeMovieImage(item.movie, cdn);
  assert.ok(image.poster, `${item.name} should produce a poster URL`);
  assert.ok(image.thumb, `${item.name} should produce a thumb URL`);
  assert.match(image.poster, /^https?:\/\//, `${item.name} poster should be absolute`);
}

console.log(`image normalization: ${cases.length} cases passed`);
