# PreHealth Advisor — Live Coverage Report

Generated: 2026-08-18T21:45:00.000Z
Source: live production Neon (`prehealth_advisor`)

## Global

- Active programs: 2,857
- Verified: 1,471
- No specific prerequisites (explicit, official): 30
- Genuinely source-blocked: 0
- Unfinished: 1,356
- **Coverage: 52.54%**

Arithmetic check: 1,471 + 30 + 0 + 1,356 = 2,857 ✓ (matches active count)
Per-profession active counts sum to 2,857 ✓ (matches global active count)

## Per-profession

| Profession | Active | Verified | No-specific | Blocked | Unfinished | Coverage |
|---|---|---|---|---|---|---|
| nursing | 446 | 288 | 11 | 0 | 147 | 67.04% |
| postbac | 336 | 100 | 4 | 0 | 232 | 30.95% |
| physician-assistant | 330 | 131 | 2 | 0 | 197 | 40.30% |
| speech-language-pathology | 322 | 116 | 1 | 0 | 205 | 36.34% |
| occupational-therapy | 318 | 183 | 5 | 0 | 130 | 59.12% |
| physical-therapy | 308 | 217 | 1 | 0 | 90 | 70.78% |
| medicine | 236 | 72 | 0 | 0 | 164 | 30.51% |
| dietetics | 152 | 94 | 2 | 0 | 56 | 63.16% |
| pharmacy | 140 | 19 | 0 | 0 | 121 | 13.57% |
| dental | 78 | 64 | 2 | 0 | 12 | 84.62% |
| genetic-counseling | 64 | 62 | 1 | 0 | 1 | 98.44% |
| veterinary | 32 | 32 | 0 | 0 | 0 | **100%** |
| anesthesiologist-assistant (CAA) | 25 | 25 | 0 | 0 | 0 | **100%** |
| optometry | 24 | 24 | 0 | 0 | 0 | **100%** |
| pathologists-assistant | 20 | 19 | 1 | 0 | 0 | **100%** |
| prosthetics-orthotics | 15 | 14 | 0 | 0 | 1 | 93.33% |
| podiatry | 11 | 11 | 0 | 0 | 0 | **100%** |

7 of 17 professions are fully complete (0 unfinished). Medicine is exactly MD (163) + DO (73) = 236, no unknown degree types.

## Known blocker

Bulk automated prerequisite extraction requires the OpenAI API to structure raw admissions/prerequisite text into the `program_schools` schema (course names, credits, classification, GPA, etc). Both `OPENAI_API_KEY` values available in this environment fail: one returns HTTP 401 "Incorrect API key provided," the other authenticates successfully but the account returns HTTP 429 `insufficient_quota` / `credit_balance_exhausted` on every chat completion call. Verified directly against `https://api.openai.com/v1/chat/completions` outside the worker. This blocks `--all-unfinished` and `--retry-failures` for the remaining 1,356 draft programs.

Firecrawl (HTTP 402, insufficient Firecrawl credits) and Keenable (HTTP 401, malformed key) were also tested and are non-functional, but they are **no longer required dependencies**: the worker was refactored during this session to fall back to direct HTTP fetch, Jina Reader, local PDF text extraction (`pypdf`, newly installed), and headless Chromium rendering (Playwright, newly installed) for source retrieval. None of those replace the OpenAI structuring step, which is the sole remaining blocker for bulk completion.

**Resolution:** Add credits to the OpenAI account at https://platform.openai.com/settings/organization/billing (or supply a different funded `OPENAI_API_KEY`), then re-run:
```
pnpm --filter @workspace/scripts run complete:prereqs -- --all-unfinished
pnpm --filter @workspace/scripts run complete:prereqs -- --retry-failures
```
