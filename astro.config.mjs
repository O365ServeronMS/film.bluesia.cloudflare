import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";

export default defineConfig({
  output: "server",
  site: "https://film.bluesia.net",
  session: {
    driver: "memory"
  },
  integrations: [react()],
  adapter: cloudflare({
    imageService: "passthrough",
    cloudflareModules: false,
    workerEntryPoint: {
      path: "src/worker.ts"
    },
    platformProxy: {
      enabled: false,
      persist: false
    }
  }),
  vite: {
    cacheDir: process.env.VITE_CACHE_DIR || ".vite-cache-build",
    resolve: {
      alias: {
        "@": new URL(".", import.meta.url).pathname,
        "react-dom/server": "react-dom/server.edge"
      }
    }
  }
});
