#!/bin/bash
# Waits until the keyless search engines answer again, then restarts the completion supervisor.
#
# Discovery for the remaining programs depends on web search. DuckDuckGo lite and Brave are
# rate-limited per IP and stay limited while they keep being queried, so running the worker
# through the block both wastes attempts (generation 10: 132 programs processed, 0 finalized)
# and keeps the limit refreshed. Standing down lets it clear.
#
# Resumes only on a result that is actually usable -- an HTTP 200 carrying .edu links -- rather
# than on a bare 200, because a throttled DuckDuckGo answers 202 with an empty body.
set -uo pipefail
cd "$(dirname "$0")"

# shellcheck disable=SC1091
. ./envload.sh

LOG=search-watch.log
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
Q='Emory University doctor of physical therapy prerequisite courses'

echo "$(date -Is) standing down; waiting for search engines to clear" >> "$LOG"

while true; do
  sleep 1800   # 30 minutes between probes -- probing hard is what keeps the limit alive

  body=$(curl -s -m 20 -A "$UA" \
    -H 'content-type: application/x-www-form-urlencoded' \
    --data-urlencode "q=$Q" \
    https://lite.duckduckgo.com/lite/ || echo "")
  edu=$(printf '%s' "$body" | grep -oE 'https?://[^"'"'"'<> )]+\.edu[^"'"'"'<> )]*' | sort -u | wc -l)

  if [ "$edu" -ge 3 ]; then
    echo "$(date -Is) search recovered ($edu .edu results) — restarting supervisor" >> "$LOG"
    COMPLETION_CONCURRENCY="${COMPLETION_CONCURRENCY:-4}" exec bash ./run-chain.sh >> chain.log 2>&1
  fi

  echo "$(date -Is) still limited ($edu .edu results)" >> "$LOG"
done
