# Self-hosted VPS deployment

This app is a **TanStack Start** application: it has server-side rendering, server
functions (Notes AI assistant, user provisioning) and a public webhook route at
`/api/public/hooks/backup-auto-approve`. Two container setups are provided.

| File | What it gives you |
| --- | --- |
| `Dockerfile` + `nginx.conf` + `docker-compose.yml` | **Option A (recommended)** — Node SSR app behind an nginx reverse proxy. Everything works. |
| `Dockerfile.spa` + `nginx.spa.conf` | **Option B** — static SPA served by nginx with `try_files` fallback. No SSR, no server functions, no webhook. |

The build target for both is pinned by `vite.deploy.config.ts` (Nitro `node-server`
preset), which is a deployment-only config; the app's own `vite.config.ts` is untouched.

---

## Option A — Node SSR + nginx (recommended)

### 1. Prepare the VPS

```bash
# Docker + compose plugin
curl -fsSL https://get.docker.com | sh
```

### 2. Get the code and the environment file

```bash
git clone <your-repo> mechatro && cd mechatro
cp .env.example .env   # or create .env manually
```

`.env` must contain (values from your backend project):

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_SUPABASE_PROJECT_ID=<project-id>
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_PROJECT_ID=<project-id>
```

Add any server-side secrets your server functions need (e.g. `LOVABLE_API_KEY`)
to the same file — they are passed to the container at runtime via `env_file`.

> `VITE_*` values are compiled into the browser bundle at **build** time, so they
> are also passed as build args in `docker-compose.yml`. Rebuild after changing them.

### 3. Set the domain

Edit `nginx.conf` and replace `mechatro.example.com` in the HTTPS block with your
domain.

### 4. Run

```bash
docker compose up -d --build
docker compose logs -f app
```

The app listens on `3000` inside the network; nginx publishes `80`/`443`.

### 5. TLS with Let's Encrypt

```bash
mkdir -p certbot/www certbot/conf
docker run --rm \
  -v "$PWD/certbot/www:/var/www/certbot" \
  -v "$PWD/certbot/conf:/etc/letsencrypt" \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  -d your-domain.com --email you@example.com --agree-tos --no-eff-email
```

Then uncomment the HTTPS `server` block (and the HTTP→HTTPS redirect) in
`nginx.conf` and run `docker compose restart nginx`.

Renewal (cron, monthly):

```bash
docker run --rm -v "$PWD/certbot/www:/var/www/certbot" -v "$PWD/certbot/conf:/etc/letsencrypt" \
  certbot/certbot renew && docker compose restart nginx
```

### 6. Updating

```bash
git pull
docker compose up -d --build
```

Rollback: `git checkout <previous-commit> && docker compose up -d --build`.

### 7. Webhooks

Point external schedulers/webhooks at
`https://your-domain.com/api/public/hooks/backup-auto-approve`. This path is
proxied straight to the app, and the handler does its own caller verification.

---

## Option B — Static SPA image

Only choose this when you do **not** need SSR, the Notes AI assistant, the
provisioning server function, or the webhook route — for example a preview of the
UI on a machine that must run nginx alone.

```bash
docker build -f Dockerfile.spa \
  --build-arg VITE_SUPABASE_URL=... \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=... \
  --build-arg VITE_SUPABASE_PROJECT_ID=... \
  -t mechatro-spa .

docker run -d -p 80:80 --name mechatro-spa mechatro-spa
```

Because the framework does not emit an `index.html`, the build snapshots the
rendered shell once and serves it as the SPA entry document;
`try_files $uri $uri/ /index.html` then handles client-side routing on refresh
and deep links.

---

## Troubleshooting

- **502 from nginx** — the app container is not up: `docker compose logs app`.
- **Blank page / auth errors** — `VITE_*` build args were missing at build time;
  rebuild with `docker compose up -d --build`.
- **Uploads rejected** — raise `client_max_body_size` in `nginx.conf`.
- **Deep links 404 in Option B** — the SPA fallback is missing; confirm
  `nginx.spa.conf` was copied into the image.

## Environment variables (important)

The app needs the backend credentials in **two** forms:

| Name | Where it is used |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | inlined into the browser bundle **at build time** (pass as build args) |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID` | read by SSR + server functions **at runtime** (container env) |

Both sets now have **defaults baked into the `Dockerfile`**, so a plain
`docker compose up -d --build` (or a PaaS build with no env configured) works
out of the box. Set them explicitly only to point the deployment at a
different backend.

Symptom when the runtime ones are missing (older images / custom overrides):
`Something went wrong — Missing Supabase environment variable(s): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY`.

Copy `.env.example` to `.env` next to `docker-compose.yml` and fill in the
values (they are the same values shown in your Lovable project's `.env`).
On a PaaS (Coolify/Dokploy/etc.) add the same six variables in the app's
Environment Variables screen — the three `VITE_*` ones must also be marked as
**build** variables.
