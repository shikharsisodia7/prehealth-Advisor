#!/usr/bin/env bash
# Research the remaining tail one profession at a time so a failure in one does not stop the rest.
set -u
cd "$(dirname "$0")"
. ./envload.sh
for slug in occupational-therapy nursing physician-assistant dietetics pharmacy dental prosthetics-orthotics physical-therapy postbac; do
  echo "=== $slug $(date) ==="
  timeout 3000 pnpm exec tsx src/research-program.ts --slug "$slug" 2>&1 | grep -E "LIST|----|RESEARCHED"
done
echo "=== ALL DONE $(date) ==="
