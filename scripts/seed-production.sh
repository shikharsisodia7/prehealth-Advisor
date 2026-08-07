#!/usr/bin/env bash
# seed-production.sh — run on every production build to keep the DB in sync.
# All steps are idempotent (upsert / no-delete), so re-running is safe.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIRS_PATH="$REPO_ROOT/data/directories"
PREREQS_PATH="$REPO_ROOT/data/prereqs"

echo "=== [1/3] Seeding professions and hardcoded prereq data ==="
pnpm --filter @workspace/scripts run seed

echo ""
echo "=== [2/3] Importing program directories ==="
for json in "$DIRS_PATH"/*.json; do
  echo "  → $json"
  pnpm --filter @workspace/scripts exec tsx src/import-directory.ts "$json"
done

echo ""
echo "=== [3/3] Importing extracted prereq data ==="
for json in "$PREREQS_PATH"/*.json; do
  echo "  → $json"
  pnpm --filter @workspace/scripts exec tsx src/import-programs.ts "$json"
done

echo ""
echo "=== Production seed complete ==="
