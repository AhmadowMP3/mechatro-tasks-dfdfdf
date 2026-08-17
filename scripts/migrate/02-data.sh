#!/usr/bin/env bash
# Copy every public-schema row from the current backend to the target Supabase.
# Source is read through the sandbox PG* env vars, target through TARGET_DB_URL.
#
# Usage: TARGET_DB_URL=postgresql://... bash scripts/migrate/02-data.sh
set -euo pipefail

: "${TARGET_DB_URL:?set TARGET_DB_URL}"
: "${PGHOST:?source database env not available}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TABLES="$ROOT/scripts/migrate/tables.txt"

# Triggers + FK checks off for the whole load, then back on.
psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -c "SET session_replication_role = replica;" >/dev/null

while read -r t; do
  [ -z "$t" ] && continue
  cols=$(psql -tAc "select string_agg(quote_ident(column_name), ',' order by ordinal_position)
                      from information_schema.columns
                     where table_schema='public' and table_name='$t'")
  if [ -z "$cols" ]; then echo "skip $t (not in source)"; continue; fi

  psql -c "COPY (SELECT $cols FROM public.\"$t\") TO STDOUT WITH (FORMAT csv)" \
    | psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -c \
        "BEGIN; SET session_replication_role = replica;
         TRUNCATE public.\"$t\" CASCADE;
         COPY public.\"$t\" ($cols) FROM STDIN WITH (FORMAT csv);
         COMMIT;" >/dev/null

  src=$(psql -tAc "select count(*) from public.\"$t\"")
  dst=$(psql "$TARGET_DB_URL" -tAc "select count(*) from public.\"$t\"")
  printf '%-28s src=%-8s dst=%-8s %s\n' "$t" "$src" "$dst" \
    "$([ "$src" = "$dst" ] && echo OK || echo MISMATCH)"
done < "$TABLES"

echo "data copy finished"
