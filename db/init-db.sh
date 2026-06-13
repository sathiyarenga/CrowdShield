#!/bin/bash
###############################################################################
# init-db.sh — Runs numbered migration files then seed scripts in order.
# Mounted into /docker-entrypoint-initdb.d/ so PostgreSQL executes it on
# first container start (database creation).
###############################################################################
set -euo pipefail

MIGRATIONS_DIR="/docker-entrypoint-initdb.d/migrations"
SEED_DIR="/docker-entrypoint-initdb.d/seed"

echo "=== CrowdShield DB Init: Running migrations ==="
for f in $(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
  echo "  -> Applying $(basename "$f") ..."
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
done

echo "=== CrowdShield DB Init: Running seed scripts ==="
for f in $(ls "$SEED_DIR"/*.sql 2>/dev/null | sort); do
  echo "  -> Seeding $(basename "$f") ..."
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
done

echo "=== CrowdShield DB Init: Complete ==="
