#!/usr/bin/env bash
set -euo pipefail

# Deploy Edge Functions to the self-hosted Supabase (Coolify) box over SSH.
#
# Usage (from the project root, on your machine):
#   chmod +x scripts/deploy-edge-functions.sh
#   GOOGLE_OAUTH_CLIENT_ID=xxx GOOGLE_OAUTH_CLIENT_SECRET=yyy ./scripts/deploy-edge-functions.sh
#
# Overridable env vars:
#   SSH_TARGET      deploy@179.198.193.155
#   REMOTE_TMP      /tmp/fn
#   FUNCTIONS_CONTAINER   name/id of the supabase functions container (auto-detected if empty)
#   REMOTE_FUNCTIONS_DIR  path inside the container (default /home/deno/functions)

SSH_TARGET="${SSH_TARGET:-deploy@179.198.193.155}"
REMOTE_TMP="${REMOTE_TMP:-/tmp/fn}"
FUNCTIONS_CONTAINER="${FUNCTIONS_CONTAINER:-}"
REMOTE_FUNCTIONS_DIR="${REMOTE_FUNCTIONS_DIR:-/home/deno/functions}"

# Secrets that should be written to a function-local .env file on the remote.
# These are read by backup-snapshot via loadLocalEnv() at startup.
ENV_KEYS=("GOOGLE_OAUTH_CLIENT_ID" "GOOGLE_OAUTH_CLIENT_SECRET")

log() { echo "[deploy] $*"; }

cd "$(dirname "$0")/.."

# 1) Push the function sources to the server.
log "Syncing supabase/functions -> $SSH_TARGET:$REMOTE_TMP/"
rsync -avz --delete --exclude 'main' supabase/functions/ "$SSH_TARGET:$REMOTE_TMP/"

# 2) Write function-local .env files for secrets that were provided locally.
# This lets self-hosted edge functions read project secrets without recreating
# the container. The .env file lives only on the server, never in git.
for key in "${ENV_KEYS[@]}"; do
  value="${!key:-}"
  if [ -z "$value" ]; then
    log "Note: $key is not set locally; skipping .env injection."
    continue
  fi
  log "Injecting $key into backup-snapshot .env"
  # Write into the remote tmp copy so it is copied into the container next.
  ssh "$SSH_TARGET" "mkdir -p $REMOTE_TMP/backup-snapshot && printf '%s=%s\n' '$key' '$(printf '%s' "$value" | sed "s/'/'\\''/g")' > $REMOTE_TMP/backup-snapshot/.env"
done

# 3) Copy them into the functions container and restart it.
log "Installing functions inside the container..."
ssh "$SSH_TARGET" FUNCTIONS_CONTAINER="$FUNCTIONS_CONTAINER" REMOTE_TMP="$REMOTE_TMP" \
  REMOTE_FUNCTIONS_DIR="$REMOTE_FUNCTIONS_DIR" 'bash -s' <<'REMOTE'
set -euo pipefail

container="${FUNCTIONS_CONTAINER:-}"
if [ -z "$container" ]; then
  container="$(docker ps --format '{{.Names}}' | grep -i -m1 -E 'functions|edge-runtime' || true)"
fi
if [ -z "$container" ]; then
  echo "ERROR: could not find the supabase functions container. Run 'docker ps' and set FUNCTIONS_CONTAINER."
  exit 1
fi
echo "[remote] container: $container"

for dir in "$REMOTE_TMP"/*/; do
  fn="$(basename "$dir")"
  echo "[remote] installing $fn"
  docker exec "$container" mkdir -p "$REMOTE_FUNCTIONS_DIR/$fn"
  docker cp "$dir." "$container:$REMOTE_FUNCTIONS_DIR/$fn"
done

echo "[remote] restarting $container"
docker restart "$container" >/dev/null
echo "[remote] done"
REMOTE

log "All functions deployed. Verify with:"
log "  curl -i -X OPTIONS https://supabase.mechatro-sy.com/functions/v1/admin-users"
