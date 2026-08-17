#!/usr/bin/env bash
# Durable cloud companion for the final completion pass.
# - Does NOT start complete:prereqs while a local worker is actively checkpointing
#   (avoids racing completion-state.json / DB queue).
# - Every ~10 minutes: fetch local checkpoint, refresh coverage from production API,
#   commit+push non-empty progress.
# - If DATABASE_URL + OPENAI_API_KEY appear AND local checkpoint goes stale (>20 min),
#   take over as the single complete:prereqs worker.
set -euo pipefail
cd /workspace
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
LOG=/tmp/completion-companion.log
LOCK=/tmp/completion-companion.lock
mkdir -p "$(dirname "$LOG")"

exec 9>"$LOCK"
if ! flock -n 9; then
  echo "companion already running" | tee -a "$LOG"
  exit 0
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] companion start on $BRANCH" | tee -a "$LOG"

has_secrets() {
  python3 - <<'PY'
import os, sys
sys.exit(0 if os.environ.get("DATABASE_URL") and os.environ.get("OPENAI_API_KEY") else 1)
PY
}

local_checkpoint_age_sec() {
  git fetch origin cursor/prereq-completion-checkpoint --quiet 2>/dev/null || true
  local ts
  ts="$(git log -1 --format=%ct origin/cursor/prereq-completion-checkpoint 2>/dev/null || echo 0)"
  echo $(( $(date +%s) - ts ))
}

refresh_and_push() {
  git fetch origin --prune --quiet || true
  # Prefer merging newer completion-state from the local worker branch when present.
  if git rev-parse origin/cursor/prereq-completion-checkpoint >/dev/null 2>&1; then
    git checkout --theirs data/completion-state.json 2>/dev/null || true
    git show origin/cursor/prereq-completion-checkpoint:data/completion-state.json > data/completion-state.json 2>/dev/null || true
  fi
  pnpm --filter @workspace/scripts exec tsx src/coverage-from-production.ts | tee -a "$LOG"
  if git diff --quiet -- data/coverage-report.json data/coverage-report.md data/completion-state.json; then
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] no coverage/state changes" | tee -a "$LOG"
    return 0
  fi
  git add data/coverage-report.json data/coverage-report.md data/completion-state.json
  if git diff --cached --quiet; then
    return 0
  fi
  # refuse secret-looking staged content
  if git diff --cached | grep -Eiq 'DATABASE_URL=|OPENAI_API_KEY=|postgres(ql)?://[^[:space:]]+|sk-[A-Za-z0-9]{20,}'; then
    echo "refusing commit: secret-like pattern in staged diff" | tee -a "$LOG"
    git reset HEAD -- data/coverage-report.json data/coverage-report.md data/completion-state.json || true
    return 1
  fi
  local unfinished
  unfinished="$(python3 - <<'PY'
import json
d=json.load(open('data/coverage-report.json'))
print(sum(p.get('prereqUnfinishedCount',0) for p in d.get('professions',[])))
PY
)"
  git commit -m "Checkpoint live coverage (unfinished=${unfinished})." || true
  git push -u origin "$BRANCH" | tee -a "$LOG"
}

maybe_take_over_worker() {
  if ! has_secrets; then
    return 0
  fi
  local age
  age="$(local_checkpoint_age_sec)"
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] secrets present; local checkpoint age=${age}s" | tee -a "$LOG"
  if (( age < 1200 )); then
    echo "local worker still fresh; not racing DB queue" | tee -a "$LOG"
    return 0
  fi
  if pgrep -f 'complete-prereqs.ts' >/dev/null 2>&1; then
    echo "complete:prereqs already running locally on this VM" | tee -a "$LOG"
    return 0
  fi
  echo "Taking over complete:prereqs as durable cloud worker" | tee -a "$LOG"
  # Pull latest checkpoint state first
  git show origin/cursor/prereq-completion-checkpoint:data/completion-state.json > data/completion-state.json 2>/dev/null || true
  nohup pnpm --filter @workspace/scripts run complete:prereqs -- --all-unfinished >>/tmp/complete-prereqs.log 2>&1 &
  echo $! >/tmp/complete-prereqs.pid
}

# Initial pass
refresh_and_push || true
maybe_take_over_worker || true

while true; do
  sleep 600
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] companion tick" | tee -a "$LOG"
  refresh_and_push || true
  maybe_take_over_worker || true
  # Stop quietly if unfinished hits 0 (final report still written by agent)
  unfinished="$(python3 - <<'PY'
import json
try:
 d=json.load(open('data/coverage-report.json'))
 print(sum(p.get('prereqUnfinishedCount',0) for p in d.get('professions',[])))
except Exception:
 print(9999)
PY
)"
  echo "unfinished=$unfinished" | tee -a "$LOG"
done
