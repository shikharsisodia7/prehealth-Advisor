#!/bin/bash
export DATABASE_URL="postgresql://neondb_owner:npg_liqbn4v7UCOS@ep-small-dream-au9wymwk-pooler.c-10.us-east-1.aws.neon.tech/prehealth_advisor?sslmode=require&channel_binding=require"
export OPENAI_API_KEY=$(grep "^OPENAI_API_KEY=" ../.env | cut -d= -f2-)
export FIRECRAWL_API_KEY="fc-d49ab63b500f4393b155e5bd0fdd7ee9"
export KEENABLE_API_KEY="36eb8a04-11ec-4e57-b906-f9766a3920eb"
export JINA_API_KEY=$(grep "^JINA_API_KEY=" ../.env | cut -d= -f2-)
export COMPLETION_CONCURRENCY=6

for round in $(seq 1 40); do
  echo "=== ROUND $round: retry-failures $(date) ===" >> chain.log
  timeout 2400 pnpm exec tsx ./src/complete-prereqs.ts -- --retry-failures >> chain.log 2>&1
  echo "=== ROUND $round: retry-failures exit=$? $(date) ===" >> chain.log

  echo "=== ROUND $round: all-unfinished $(date) ===" >> chain.log
  timeout 2400 pnpm exec tsx ./src/complete-prereqs.ts -- --all-unfinished >> chain.log 2>&1
  echo "=== ROUND $round: all-unfinished exit=$? $(date) ===" >> chain.log
done

echo "=== SUPERVISOR LOOP COMPLETE $(date) ===" >> chain.log
