# ---------------------------------------------------------------------------
# Option A (recommended): full app — SSR + server functions + API routes.
# Multi-stage: Node builds, Node runs. Put nginx in front (see nginx.conf).
# ---------------------------------------------------------------------------

# ---------- Stage 1: build ----------
# The project's real lockfile is bun.lock, and the Nitro node-server build
# only resolves correctly with bun's module layout, so build with bun.
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Install dependencies from the bun lockfile for reproducible builds
COPY package.json bun.lock* bunfig.toml* ./
RUN bun install --frozen-lockfile || bun install

# App sources
COPY . .

# VITE_* values are inlined into the client bundle at build time, so they must
# be present during `npm run build` (pass with --build-arg or an .env file).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID \
    NODE_ENV=production

# vite.deploy.config.ts pins the Nitro target to the Node server preset,
# producing a plain Node app in /app/.output
RUN npx vite build --config vite.deploy.config.ts

# ---------- Stage 2: runtime ----------
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# The Nitro node-server output is fully self-contained (deps are bundled)
COPY --from=builder /app/.output ./.output

# Run unprivileged
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
