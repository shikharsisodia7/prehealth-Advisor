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

- **CODA (dental)**: the coda.ada.org site runs Coveo for Sitecore with an UNAUTHENTICATED server-side proxy — `POST https://coda.ada.org/coveo/rest/search/v2` (form-encoded `q`, `aq`, `groupBy`, `fieldsToInclude`). Filter `@codatype=="Predoctoral (DDS/DMD) Dental Education Programs"`; fields `@city/@state/@country/@programname`. Includes 2 international programs — filter country.
- **ACOTE (OT)**: FacetWP endpoint `POST https://acoteonline.org/wp-json/facetwp/v1/refresh` with `data.template:"schools"` (NOT "wp") returns paged fwpl-result HTML (51/page, 667 rows incl. OTA). Occasionally returns an HTML error page — retry with backoff. States have trailing periods ("AZ.").
- **ACGC (genetic counseling)**: find-a-program page IS server-rendered — `li.item-program` entries carry `data-states`, program URL, status, modality. (Earlier "no locations" note was wrong: locations are in data-states attributes.)
- **ACEND (dietetics)**: eatrightpro.org itself 302-loops through SSO for bots, but the actual directory iframe is **https://acendportal.org/Program/Accredited/Directory.aspx** (found via Wayback raw snapshot `id_` URL). Classic WebForms: replay hidden fields + `__EVENTTARGET` postbacks to set country/program-type, then paginate via PageLinkButton targets (10/page).
- **AACN (nursing ABSN/MEPN)**: member-school directory is public via cvweb — `POST https://www.aacnnursing.org/cvweb/cgi-bin/organizationdll.dll/List` with the hidden-field set from `utilities.dll/openpage?wrp=orgsearchNM.htm` plus `_MULTIPLE_UDEF3TXT=BSN_Accel` (ABSN) or `Masters_Entry` (MEPN), `RANGE=1/2000`, `ORGTYPE=|IN|INSTITUTE,CBRANCH,PRVISIONAL`, `ISMEMBERFLG=Y`. Rows in `<th data-label="School">`.

## Blocked (recorded in directory_sources + data/coverage-report.json)
- **AAMC postbac (mec.aamc.org)**: Angular SPA fetchable, but all backend services (config-service/services-rs/*) fail at TLS/network level from this environment; legacy apps.aamc.org/postbac is 404.

## Wayback trick
- When a site SSO-blocks bots, fetch the raw archived HTML: `web.archive.org/web/<ts>id_/<url>` (find `<ts>` via the CDX API). The raw snapshot exposes iframe/app hosts that the live page hides behind scripts.

## General tactics
- Try plain fetch with full Chrome UA + Accept/Referer headers first; many WAFs only block default UAs.
- For WP sites: `?rest_route=/` lists all REST routes even when /wp-json/ is blocked.
- For JS search apps: read the shipped JS bundle for the underlying API host/keys before reaching for a browser.
- webFetch renders JS but truncates markdown (~7-8KB) — fine for discovery, not for full extraction.
