---
name: AAMC postbac API access
description: How to reach the live AAMC postbac program data despite the Angular SPA appearing blocked.
---

# AAMC postbac API access

## Rule
The AAMC postbac Angular SPA shell (mec.aamc.org/postbac) may appear blocked, but the underlying REST service is independently reachable at `https://api.mec.aamc.org/postbac-service/services-rs/programs/` and returns all 338 active programs as JSON with no auth required.

**Why:** The SPA bundles pointed to `mec.aamc.org` backend paths that failed at TLS level, but the config endpoint revealed the real `SERVICE_URL` pointing to `api.mec.aamc.org`, a different host. The Wayback CDX API for `api.platform.aamc.org/config-service/services-rs/config/POSTBAC` had captured the config JSON which revealed this URL.

**How to apply:** For any AAMC Angular SPA that appears blocked:
1. Fetch `https://web.archive.org/cdx/search/cdx?url=api.platform.aamc.org/config-service/services-rs/config/<APP_CODE>&output=json` to find captures of the config JSON.
2. Fetch the captured config from Wayback (`id_` URL) to get `SERVICE_URL`.
3. Try `SERVICE_URL/programs` or `SERVICE_URL/programs/` directly — often no auth needed for public directory data.

## Key endpoints (as of 2026-08-07)
- Config: `https://api.platform.aamc.org/config-service/services-rs/config/POSTBAC` (Wayback: 20220412 and 20221205)
- Programs: `https://api.mec.aamc.org/postbac-service/services-rs/programs/` — returns `{ programs: [...] }` with 338 active entries
- Each program has: `id`, `name`, `instName`, `webUrl`, `address.city`, `address.state`, `status` ("A" = active)
