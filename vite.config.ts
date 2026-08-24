// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import {
  SELF_HOSTED_SUPABASE_PROJECT_ID,
  SELF_HOSTED_SUPABASE_PUBLISHABLE_KEY,
  SELF_HOSTED_SUPABASE_URL,
} from "./src/lib/backend-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    // Pin every environment (preview included) to the self-hosted backend.
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(SELF_HOSTED_SUPABASE_URL),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(SELF_HOSTED_SUPABASE_PUBLISHABLE_KEY),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(SELF_HOSTED_SUPABASE_PUBLISHABLE_KEY),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(SELF_HOSTED_SUPABASE_PROJECT_ID),
    },
  },
});
