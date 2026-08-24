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

# all-unfinished runs first and twice as often as retry-failures.
#
# all-unfinished already covers every eligible record, including ones that failed under an
# older pipeline generation. retry-failures only re-grinds programs that already failed under
# the CURRENT generation -- the hardest subset -- so alternating one-for-one spent about half
# the machine's time on the least likely records while records never yet attempted under the
# current pipeline waited behind them. At the time of this change 331 of 514 unfinished
# programs had still never been processed under the current generation.
for round in $(seq 1 500); do
  echo "=== ROUND $round: all-unfinished $(date) ===" >> chain.log
  timeout 5400 pnpm exec tsx ./src/complete-prereqs.ts -- --all-unfinished >> chain.log 2>&1 || true
  echo "=== ROUND $round: all-unfinished exit=$? $(date) ===" >> chain.log

  echo "=== ROUND $round: all-unfinished (2nd) $(date) ===" >> chain.log
  timeout 5400 pnpm exec tsx ./src/complete-prereqs.ts -- --all-unfinished >> chain.log 2>&1 || true
  echo "=== ROUND $round: all-unfinished (2nd) exit=$? $(date) ===" >> chain.log

  echo "=== ROUND $round: retry-failures $(date) ===" >> chain.log
  timeout 5400 pnpm exec tsx ./src/complete-prereqs.ts -- --retry-failures >> chain.log 2>&1 || true
  echo "=== ROUND $round: retry-failures exit=$? $(date) ===" >> chain.log
done

echo "=== SUPERVISOR LOOP COMPLETE $(date) ===" >> chain.log
