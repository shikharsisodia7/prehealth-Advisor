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

while true; do
  code=$(curl -s -o /tmp/ph-quota-body -w '%{http_code}' \
    -X POST https://api.openai.com/v1/chat/completions \
    -H "authorization: Bearer $OPENAI_API_KEY" \
    -H 'content-type: application/json' \
    --max-time 30 \
    -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"ok"}],"max_tokens":1}' || echo 000)

  if [ "$code" = "200" ]; then
    echo "$(date -Is) quota available (HTTP 200) — starting supervisor" >> "$LOG"
    COMPLETION_CONCURRENCY="${COMPLETION_CONCURRENCY:-16}" exec bash ./run-chain.sh >> chain.log 2>&1
  fi

  echo "$(date -Is) still limited (HTTP $code)" >> "$LOG"
  sleep 600
done
