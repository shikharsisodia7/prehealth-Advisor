#!/usr/bin/env bash
# Re-run every unfinished programme now that the browser can read sites which refuse plain HTTP.
set -u
cd "$(dirname "$0")"
. ./envload.sh
pnpm exec tsx src/list-unfinished-ids.ts 2>/dev/null | tail -1 > ../qa/unfinished-ids.txt
IDS=$(cat ../qa/unfinished-ids.txt)
COUNT=$(echo "$IDS" | tr ',' '\n' | grep -c .)
echo "=== re-running $COUNT unfinished programmes $(date) ==="
timeout 20000 pnpm exec tsx src/complete-prereqs.ts --ids "$IDS"
echo "=== DONE $(date) ==="
