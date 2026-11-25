#!/usr/bin/env bash
# Starts a throwaway local PostgreSQL 16 with minimal Supabase stand-ins (roles, storage.buckets, cron, vault, pg_net),
# applies every migration in order and runs the SQL access-control tests. Synthetic data only. Never points at production.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN=/usr/lib/postgresql/16/bin
DIR=$(mktemp -d /tmp/h2h-pg.XXXX); chown postgres "$DIR"
su postgres -c "$PGBIN/initdb -D $DIR/data -A trust -U postgres >/dev/null"
su postgres -c "$PGBIN/pg_ctl -D $DIR/data -o '-p 55432 -k $DIR' -l $DIR/log start >/dev/null"
trap 'su postgres -c "$PGBIN/pg_ctl -D $DIR/data stop -m fast >/dev/null"; rm -rf "$DIR"' EXIT
export PGOPTIONS="-c client_min_messages=notice"; P="psql -h $DIR -p 55432 -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "create database h2h"
$P -d h2h -f "$ROOT/supabase/tests/stubs.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do echo "apply $(basename "$f")"; sed -E "/create extension if not exists pg_(net|cron)/d" "$f" > "$DIR/m.sql"; $P -d h2h -f "$DIR/m.sql"; done
echo "apply again (idempotency of the 1.3.0 migration)"; $P -d h2h -f "$ROOT/supabase/migrations/20261125120000_v130_enrollment_completion.sql"
chmod 644 "$DIR"/m.sql; $P -d h2h -o /dev/null -f "$ROOT/supabase/tests/access-control.sql"; echo "ALL ACCESS-CONTROL TESTS PASSED"
