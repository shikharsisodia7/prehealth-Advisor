#!/usr/bin/env bash
set -u
cd "$(dirname "$0")"
for p in "Prosthetics" "Pharmacy" "Occupational" "Speech" "Dietetics" "Postbac" "Nursing" "Physician Assistant"; do
  f="../qa/flow-$(echo "$p" | tr ' ' '-').log"
  timeout 260 pnpm exec tsx src/qa-flow.ts --profession "$p" > "$f" 2>&1
  n=$(grep -E "^PROGRAM_OPTIONS" "$f" | cut -d= -f2)
  s=$(grep -E "^SOURCE_LINKS" "$f" | cut -d= -f2)
  c=$(grep -E "^CLIPBOARD_LEN" "$f" | cut -d= -f2)
  x=$(grep -cE "^XLSX_SAVED" "$f")
  e=$(grep -E "^CONSOLE_ERRORS" "$f" | cut -d= -f2)
  printf "QA %-22s programs=%-5s sources=%-3s clipboard=%-6s xlsx=%s errors=%s\n" "$p" "$n" "$s" "$c" "$x" "$e"
done
echo "QA_DONE"
