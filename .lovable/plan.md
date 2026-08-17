# Self-hosted VPS deployment (Docker + nginx)

Add deployment files only. No existing source file is modified.

## Important context

This app is TanStack Start with server-side rendering, server functions (Notes AI, user provisioning) and a public webhook route (`/api/public/hooks/backup-auto-approve`). A static-only nginx image cannot run those. So two options ship side by side.

## Option A — Node SSR behind nginx (recommended, default)

`Dockerfile`
- Stage 1 `builder`: `node:22-alpine`, install deps with the lockfile, copy source, `npm run build`.
- Stage 2 `runner`: `node:22-alpine`, copy the built server output, `NODE_ENV=production`, non-root user, expose `3000`, start the built Node server.

`nginx.conf`
- Reverse proxy `/` to the app container on port 3000, with `proxy_set_header` for Host, X-Forwarded-For/Proto and upgrade headers.
- Long-lived immutable cache for `/assets/`, gzip on, sane client_max_body_size for uploads.
- Commented HTTPS server block ready for certbot certs.

`docker-compose.yml`
- `app` service built from the Dockerfile, `env_file: .env`, restart unless-stopped.
- `nginx` service on `nginx:alpine`, ports 80/443, mounts `nginx.conf` and a certs volume, depends on `app`.

## Option B — Static SPA image (as literally requested)

`Dockerfile.spa`
- Stage 1: `node:22-alpine` build.
- Stage 2: `nginx:alpine` serving the client bundle from `/usr/share/nginx/html`.

`nginx.spa.conf`
- `try_files $uri $uri/ /index.html;` SPA fallback, asset caching, gzip, security headers.

Documented caveat: with this image, SSR, server functions and the webhook route are unavailable.

## Supporting files

- `.dockerignore` — excludes `node_modules`, `.git`, `dist`, `.env*`, logs, local caches.
- `DEPLOY.md` — VPS steps: clone, create `.env` with the backend URL and publishable key, `docker compose up -d --build`, certbot TLS, update/rollback, plus a short section on when Option B is acceptable.

## Verification

Build the production bundle in the sandbox to confirm the build command and output paths used by the Dockerfile are correct.
