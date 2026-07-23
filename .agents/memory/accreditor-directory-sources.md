---
name: Accreditor directory sources
description: Which health-profession accreditor directories are machine-readable vs blocked, and the fetch tricks that worked (2026-07)
---

Rule: program-directory data must come from accreditor sources; when a source is inaccessible, record the exact blocker in `directory_sources` (coverageStatus='blocked') instead of guessing or scraping secondary sites.

**Why:** the professor requires zero fabricated data; partial/secondary data silently biases students.

**How to apply:** before re-attempting ingestion, check `data/coverage-report.json` and `directory_sources` for the current status.

Working fetch paths (as of 2026-07-23):
- LCME, AVMA, ASCO, CPME, NCOPE: plain pages, parseable.
- CAPTE (apta.org) & ASHA CAA: full HTML via direct fetch (multi-MB), parse embedded lists.
- ARC-PA: webFetch shows only page 1 of the wpDataTable; direct fetch with full browser headers (UA + Accept + Accept-Language + Referer) returns 200 with ALL rows server-rendered (406 without them).
- AACOM DO: main page is a Google My Maps embed (acronyms only); the PDF `us-com-directory.pdf` converts to a clean markdown table via webFetch.
- ACPE pharmacy: `program-lookup/?_insitution-program=pharmd` (note misspelled param) is paginated `/page/N/`, entries include address + status; filter to Accredited*.
- Blocked: CODA & AAMC postbac & ACEND (JS apps, no static data/API), ACOTE (WP REST 'school' CPT exists but fields empty; detail pages JS-only), AACN (login-gated), ACGC (no per-program locations).
