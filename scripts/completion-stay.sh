#!/usr/bin/env bash
# Copy of /tmp/stay-forever.sh — durable 10-minute GitHub checkpoint loop.
# Run: bash scripts/completion-stay.sh
set -euo pipefail
cd "$(dirname "$0")/.."
exec bash /tmp/stay-forever.sh
