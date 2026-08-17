// Deployment-only Vite config (self-hosted VPS / Docker).
// Identical to vite.config.ts, except the Nitro target is pinned to the
// Node server preset so the build produces a plain Node.js server we can run
// inside a container (instead of the Cloudflare Worker bundle).
//
// Used by the Dockerfile:  vite build --config vite.deploy.config.ts
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  nitro: {
    preset: "node-server",
    output: {
      dir: ".output",
    },
  },
});
