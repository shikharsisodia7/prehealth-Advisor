---
name: Sandbox web-fetch quirks
description: Gotchas when using webFetch/queryWithLLM/webSearch in the CodeExecution sandbox
---

- `webFetch` returns content under `.markdown` (NOT `.content`) — using the wrong key silently yields empty strings that look like blocked fetches. It truncates around ~50k chars; use a `"use impure"` `fetch` for full HTML.
- `queryWithLLM` returns the answer as the result string itself, not `.answer`; long list answers can truncate (~50 items) — prefer deterministic HTML parsing for big directories.
- `webSearch` results are under `resultPages` `[{title,url,snippet}]`.
- `setTimeout` is not defined in the durable scope; wrap delays in a `"use impure"` function.
- `waitForJob` timeout max is 600 seconds.
- Profession slugs in this project differ from shorthand (e.g. `speech-language-pathology`, not `slp`) — always check the `professions` table before bulk inserts keyed by slug.
