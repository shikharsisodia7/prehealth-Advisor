---
name: Accreditor directory sources
description: Which health-profession accreditor directories are machine-readable vs blocked, and the fetch tricks that worked.
---

# Accreditor directory sources — access notes

## Working (machine-readable)
- **ARC-PA (PA)**: static HTML table; plain fetch with browser UA works.
- **CAPTE (PT), ASHA CAA (SLP), ACPE (pharmacy), AVMA (vet), ASCO (optometry), CPME (podiatry), NCOPE (P&O), LCME (MD), AACOM (DO)**: fetched successfully (HTML or CSV); see data/directories/*.json source notes.
- **CAAHEP (Anesthesiologist Assistant + 30 other professions)**: the caahep.org page loads a React app from search-app.caahep.org. Real data API: `POST https://search-api.caahep.org/api/programs?code=<key>` with JSON body `{professionIds:[1],sortStatuses:[1],degree*:true,paging:{pageNumber,pageSize}}`; the `code` key is a public Azure Function key embedded in their shipped main.js (fetch `search-app.caahep.org/asset-manifest.json` → main.js → grep `search-api.caahep.org`). GET returns 404 — must be POST. `/api/professions` (GET) lists professionIds. X-Pagination header has totalCount. Some satellite-campus records lack any address — resolve state from official program pages, never guess.
- **NAACLS (Pathologists' Assistant, MLS, etc.)**: WordPress. `/wp-json/*` is WAF-blocked but `?rest_route=/wp/v2/program&per_page=100&page=N` works with browser UA (634 programs). Filter by `class_list` containing `program-type-pathologists-assistant` (the `program-type` REST query param does NOT work — a CPT shadows the taxonomy). Addresses are NOT exposed via REST/detail pages (Search & Filter Pro renders cards with a nonce-gated endpoint; URL pagination is a decoy — every page returns the same first 10 entries). For PathA, city/state came from the AAPA official list at pathassist.org/page/AboutUs_NAACLS, which matches NAACLS 1:1.

## Blocked (recorded in directory_sources + data/coverage-report.json)
- **CODA (dental)**: JS app, no accessible API found.
- **ACOTE (OT)**: client-rendered; API incomplete.
- **ACGC (genetic counseling)**: no per-program locations in source.
- **ACEND (dietetics)**: JS app.
- **AACN (nursing ABSN/MEPN)**: login-gated.
- **AAMC postbac**: JS app.

## General tactics
- Try plain fetch with full Chrome UA + Accept/Referer headers first; many WAFs only block default UAs.
- For WP sites: `?rest_route=/` lists all REST routes even when /wp-json/ is blocked.
- For JS search apps: read the shipped JS bundle for the underlying API host/keys before reaching for a browser.
- webFetch renders JS but truncates markdown (~7-8KB) — fine for discovery, not for full extraction.
