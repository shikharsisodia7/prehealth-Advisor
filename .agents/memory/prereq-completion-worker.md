---
name: Prerequisite completion worker
description: How complete:prereqs loads secrets, uses Firecrawl, and survives 402
---

The bulk worker is `pnpm --filter @workspace/scripts run complete:prereqs -- --all-unfinished` (then `--retry-failures`).

**Secrets:** repo-root `.env` (gitignored). Names only in `.env.example`. The worker now loads `.env` itself if the shell did not export keys. Never put API keys in git, Cursor environment.json, or prompts.

Required: `DATABASE_URL` (Neon `prehealth_advisor`), `OPENAI_API_KEY`.
Optional: `FIRECRAWL_API_KEY` (PDFs, 403, JS shells, search), `COMPLETION_MODEL`, `COMPLETION_CONCURRENCY`.

**Firecrawl:** if the key is present, use it. HTTP 401/402 disables Firecrawl for the rest of that process and continues over HTTP / Wikidata / DuckDuckGo / Bing. A 402 account (remaining credits −1) does not speed the queue until the plan is topped up. Do not strip `FIRECRAWL_API_KEY` from the environment when starting the worker unless you intend an HTTP-only run.

**Production:** Vercel app reads Neon. Pushing `origin/main` deploys code; prerequisite rows appear on https://prehealth-advisor.vercel.app as soon as they are written to Neon, even before a deploy.
