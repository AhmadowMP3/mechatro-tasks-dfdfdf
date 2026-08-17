#!/usr/bin/env bash
set -euo pipefail

# Deploy Edge Functions to the self-hosted Supabase (Coolify) box over SSH.
#
# Usage (from the project root, on your machine):
#   chmod +x scripts/deploy-edge-functions.sh
#   ./scripts/deploy-edge-functions.sh
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

log() { echo "[deploy] $*"; }

cd "$(dirname "$0")/.."

# 1) Push the function sources to the server.
log "Syncing supabase/functions -> $SSH_TARGET:$REMOTE_TMP/"
rsync -avz --delete --exclude 'main' supabase/functions/ "$SSH_TARGET:$REMOTE_TMP/"

# 2) Copy them into the functions container and restart it.
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
log "  curl -i -X OPTIONS https://supamecha.hub4tech.net/functions/v1/admin-users"
