/**
 * Single source of truth for the backend this app talks to.
 *
 * Everything (preview, dev server, SSR, server functions, production build)
 * reads from the self-hosted instance at https://supabase.mechatro-sy.com.
 * `vite.config.ts` injects these values into `import.meta.env.VITE_SUPABASE_*`
 * and `src/server.ts` mirrors them onto `process.env.SUPABASE_*`.
 */
export const SELF_HOSTED_SUPABASE_URL = "https://supabase.mechatro-sy.com";
export const SELF_HOSTED_SUPABASE_PUBLISHABLE_KEY =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc4Njk5Mjg0MCwiZXhwIjo0OTQyNjY2NDQwLCJyb2xlIjoiYW5vbiJ9.CI0oY_6wThWOBpkxwhBj80KrvGrI-dnAKADfhSedHOs";
export const SELF_HOSTED_SUPABASE_PROJECT_ID = "mechatro";
