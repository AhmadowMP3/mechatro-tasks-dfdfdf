#!/usr/bin/env bash
set -euo pipefail

# Deploy all Edge Functions to the self-hosted Supabase instance.
# Run this script from the project root on the VPS (or anywhere with network access to the Supabase functions API).
#
# Usage:
#   chmod +x scripts/deploy-edge-functions.sh
#   ./scripts/deploy-edge-functions.sh
#
# It tries the Supabase CLI first, then falls back to a direct curl deploy.

PROJECT_REF="${SUPABASE_PROJECT_REF:-supamecha}"
SUPABASE_URL="${SUPABASE_URL:-https://supamecha.hub4tech.net}"
SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

FUNCTIONS=(
  admin-invites
  admin-users
  backup-snapshot
  claim-device-slot
  redeem-invite
  share-access
)

log() { echo "[deploy] $*"; }

deploy_with_cli() {
  if ! command -v supabase &>/dev/null; then
    return 1
  fi

  log "Supabase CLI found. Deploying via CLI..."
  for fn in "${FUNCTIONS[@]}"; do
    log "Deploying $fn..."
    supabase functions deploy "$fn" --project-ref "$PROJECT_REF"
  done
  return 0
}

bundle_function() {
  local fn="$1"
  local tmpdir="$(mktemp -d)"
  local out="$tmpdir/$fn.tar.gz"

  # Edge functions on self-hosted Supabase accept the function directory as a tarball.
  tar -czf "$out" -C "supabase/functions" "$fn"
  echo "$out"
}

deploy_with_curl() {
  if [ -z "$SERVICE_ROLE_KEY" ]; then
    echo "ERROR: SUPABASE_SERVICE_ROLE_KEY is not set."
    echo "Set it with: export SUPABASE_SERVICE_ROLE_KEY='<your-service-role-key>'"
    return 1
  fi

  log "Deploying via direct API calls to $SUPABASE_URL..."
  for fn in "${FUNCTIONS[@]}"; do
    log "Bundling and deploying $fn..."
    bundle="$(bundle_function "$fn")"

    # Management API endpoint for self-hosted Supabase
    url="$SUPABASE_URL/v1/projects/$PROJECT_REF/functions/deploy"

    http_code=$(curl -s -o /tmp/deploy-$fn.out -w "%{http_code}" \
      -X POST "$url" \
      -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
      -F "file=@$bundle" \
      -F "slug=$fn" \
      -F "version=1")

    rm -f "$bundle"

    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
      log "$fn deployed successfully (HTTP $http_code)"
    else
      log "FAILED to deploy $fn (HTTP $http_code)"
      cat /tmp/deploy-$fn.out
      return 1
    fi
  done
}

main() {
  cd "$(dirname "$0")/.."

  if deploy_with_cli; then
    log "All functions deployed via Supabase CLI."
    exit 0
  fi

  log "Supabase CLI not available or deploy failed. Trying direct API..."
  deploy_with_curl
  log "Done."
}

main "$@"
