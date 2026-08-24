#!/bin/bash
# Waits for OpenAI request quota to come back, then starts the completion supervisor.
#
# The account exhausted gpt-4o-mini's per-day request cap (RPD 10000). Extraction cannot make
# progress until that resets or the account's tier is raised, and running the supervisor into
# the wall only burns retry budget and marks programs failed. This polls cheaply (one tiny
# request every 10 minutes, ~144/day against a 10000/day cap) and hands off to run-chain.sh
# the moment a call succeeds, so completion resumes without anyone having to be present.
set -uo pipefail
cd "$(dirname "$0")"

# shellcheck disable=SC1091
. ./envload.sh

LOG=quota-watch.log
echo "$(date -Is) waiting for OpenAI request quota" >> "$LOG"

probe() {
  curl -s -o /dev/null -w '%{http_code}' \
    -X POST https://api.openai.com/v1/chat/completions \
    -H "authorization: Bearer $OPENAI_API_KEY" \
    -H 'content-type: application/json' \
    --max-time 30 \
    -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"ok"}],"max_tokens":1}' || echo 000
}

while true; do
  # Require SUSTAINED availability, not a single success. A rolling daily cap hands back the
  # occasional token even while exhausted -- one lucky 200 previously restarted the supervisor
  # into a wall where it burned each program's retry budget and recorded failures. Three
  # successes in a row, spaced out, means real capacity has returned.
  ok=0
  for _ in 1 2 3; do
    [ "$(probe)" = "200" ] && ok=$((ok + 1)) || break
    sleep 20
  done

  if [ "$ok" -eq 3 ]; then
    echo "$(date -Is) sustained quota confirmed (3/3) — starting supervisor" >> "$LOG"
    COMPLETION_CONCURRENCY="${COMPLETION_CONCURRENCY:-16}" exec bash ./run-chain.sh >> chain.log 2>&1
  fi

  echo "$(date -Is) still rate-limited ($ok/3 probes succeeded)" >> "$LOG"
  sleep 600
done
