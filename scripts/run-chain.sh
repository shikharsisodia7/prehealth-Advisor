#!/bin/bash
# Self-recovering completion supervisor.
# Loads secrets from repo-root .env only — never hardcode credentials here.
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
ENV_FILE="$ROOT/.env"

if [[ -f "$ENV_FILE" ]]; then
  # Export KEY=VALUE lines; strip optional quotes; ignore comments/blank.
  set -a
  # shellcheck disable=SC1090
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    [[ -z "$line" || "$line" == \#* ]] && continue
    [[ "$line" != *=* ]] && continue
    key="${line%%=*}"
    val="${line#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    val="${val#"${val%%[![:space:]]*}"}"
    val="${val%"${val##*[![:space:]]}"}"
    if [[ "${val}" == \"*\" && "${val}" == *\" ]]; then val="${val:1:${#val}-2}"; fi
    if [[ "${val}" == \'*\' && "${val}" == *\' ]]; then val="${val:1:${#val}-2}"; fi
    export "$key=$val"
  done < "$ENV_FILE"
  set +a
fi

: "${DATABASE_URL:?DATABASE_URL missing from environment/.env}"
: "${OPENAI_API_KEY:?OPENAI_API_KEY missing from environment/.env}"
export COMPLETION_CONCURRENCY="${COMPLETION_CONCURRENCY:-6}"

for round in $(seq 1 500); do
  echo "=== ROUND $round: retry-failures $(date) ===" >> chain.log
  timeout 2400 pnpm exec tsx ./src/complete-prereqs.ts -- --retry-failures >> chain.log 2>&1 || true
  echo "=== ROUND $round: retry-failures exit=$? $(date) ===" >> chain.log

  echo "=== ROUND $round: all-unfinished $(date) ===" >> chain.log
  timeout 2400 pnpm exec tsx ./src/complete-prereqs.ts -- --all-unfinished >> chain.log 2>&1 || true
  echo "=== ROUND $round: all-unfinished exit=$? $(date) ===" >> chain.log
done

echo "=== SUPERVISOR LOOP COMPLETE $(date) ===" >> chain.log
