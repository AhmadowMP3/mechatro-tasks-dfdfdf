#!/usr/bin/env bash
# Rebuild the full database structure on the target Supabase (self-hosted).
# Replays every migration in supabase/migrations in filename order.
#
# Usage: TARGET_DB_URL=postgresql://... bash scripts/migrate/01-schema.sh
set -euo pipefail

: "${TARGET_DB_URL:?set TARGET_DB_URL}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE SCHEMA IF NOT EXISTS private;
SQL

fail=0
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "== $(basename "$f")"
  if ! psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -q -f "$f" > /tmp/mig.out 2>&1; then
    echo "-- FAILED: $(basename "$f")"
    tail -20 /tmp/mig.out
    fail=$((fail + 1))
  fi
done

echo "done. failed migrations: $fail"
psql "$TARGET_DB_URL" -tAc \
  "select count(*) || ' tables in public' from information_schema.tables where table_schema='public' and table_type='BASE TABLE'"
