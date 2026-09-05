# Current status

Last updated 2026-09-02. Regenerate the numbers with
`cd scripts && . ./envload.sh && pnpm exec tsx src/coverage-snapshot.ts` before trusting them.

## Peer-advisor correctness round (2026-09-05)

Three Health Professions Peer Advisors reported wrong-program prerequisite sources during
pilot testing, all Medicine (MD) rows:

- **University of Oklahoma College of Medicine** (id 547) — sourced from OU's Physician
  Associate program prerequisite page, not the MD program.
- **OHSU School of Medicine** (id 548) — sourced from OHSU's Physician Assistant and
  Radiation Therapy prerequisite pages, not the MD program.
- **UC Riverside School of Medicine** (id 452) — sourced from a UC system-wide undergraduate
  Bioengineering transfer-pathway page, unrelated to UCR's medical school.

**Root cause.** `scripts/src/extraction-rules.ts`'s `PROFESSION_MARKERS` had no "medicine"
entry at all, so a medicine row's source was never checked against any other profession's
marker in the first place, and its physician-assistant marker did not recognise
"physician-associate" (ARC-PA's current name for the profession, used on OU's own site) as
the same profession as "physician-assistant". `audit-source-profession.ts` also carried its
own duplicate copy of the marker list, which is exactly how both gaps went unnoticed by the
existing audit: fixing one copy without the other would have left it reporting
`WRONG_SOURCE=0` regardless. That audit now imports `sourceProfessionConflicts` directly from
`extraction-rules.ts` instead of duplicating it, so there is exactly one profession-marker
list from here on.

**Fixes to `extraction-rules.ts`:**
- Added "physician-associate" as a physician-assistant alias.
- Added profession markers for medicine, radiation-therapy, bioengineering, podiatry,
  genetic-counseling, pathologists-assistant, and anesthesiologist-assistant (previously
  absent from the marker list entirely).
- Added an "slpa" alias to the speech-language-pathology marker (WVU's own catalog
  abbreviation for its SLP master's program, previously indistinguishable from the parent
  "schoolofmedicine" catalog department it sits under) and narrowed the pathologists-assistant
  marker to require "-ist-"/"-ists-" so it no longer collides with the unrelated
  "speech-language-pathology-assistant" (SLPA) credential.
- Extended `PATH_NAMES_POSTBAC` with "linkage", "pathway-to-medical-school", and
  "biomedical-sciences"/"msbs"/"msa", after the new medicine marker initially flagged four
  postbac rows' own correct linkage-program pages (Drexel's "Pathway to Medical School",
  George Washington's "GCATS Linkage...MD Program", and two Des Moines University MSA/MSBS
  pages) as wrong sources, purely because a named postbac linkage program legitimately
  mentions the medical school it feeds into.
- Added `professionOfText`/`contentIdentityConflicts`: a second, word-boundary check against
  a page's own title/H1/breadcrumb text, for when a URL path is uninformative but the page's
  own heading still names the wrong profession.
- 20 new regression tests in `extraction-rules.test.ts` cover all of the above, including the
  systemic false positives found and fixed while auditing (not just the three reported bugs).

**Systemic audit.** Running the (now-shared) `audit-source-profession.ts` across all 2,742
finalized rows with a source URL found 14 confirmed wrong-program-source rows total (the 3
reported plus 11 more, all Medicine sources baldly citing a generic/other-program admissions
page: Icahn School of Medicine x3 postbac rows, Medical College of Wisconsin, Rocky Vista
University, Rush University, UCSF, University of Louisville x2 postbac + 1
speech-language-pathology row, University of the Incarnate Word). All 14 were reset to
`needs_review` with their wrong source and prerequisites cleared; the 11 beyond OU/OHSU/UCR
were not independently re-researched (out of scope for this round) and now correctly show as
unfinished rather than carrying wrong data. `WRONG_SOURCE=0` after the reset. Coverage moved
from 95.5% to 95.1% as a direct, expected, and accepted result — wrong data is worse than
missing data.

**OU MD**: now sources `medicine.ouhsc.edu/.../doctor-of-medicine-md`, with its actual
published required (C-or-better) and recommended coursework; the PA-only requirements
previously carried on this row (Microbiology, Human Anatomy, Human Physiology, Statistics)
are gone.

**OHSU MD**: now sources `ohsu.edu/school-of-medicine/md-program/admissions` and is
represented as `no_prereqs_published`, with the verification note quoting OHSU's own
affirmative policy statement ("these recommended competencies have fully replaced all
prerequisite coursework") plus its stated GPA/MCAT minimums — a positive claim, not "we
couldn't find it".

**UC Riverside MD**: now sources `somsa.ucr.edu/program-prerequisites` (School of Medicine
Student Affairs' own page) with its actual published required science core and recommended
humanities core.

**Report an Error (Dr. McNelis's pilot-testing request).** A native in-app workflow, not a
Google Form: `program_error_reports` table (Neon, pushed via `drizzle-kit push` — this
project has no migration files, see `lib/db/drizzle.config.ts`), one authenticated endpoint
(`POST /api/error-reports`), and a `ReportErrorDialog` reachable both from a prominent bar on
the first planner page (with the pilot-testing "check the Official Program Page" instruction
text) and a smaller action on every program result card, prefilled with that program's
profession/institution/program/degree/displayed source so a tester never retypes it. Reports
store the Clerk user id for anti-abuse only — never a session token — and contact email is
optional. Triage is CLI-only (`scripts/src/list-error-reports.ts`,
`scripts/src/resolve-error-report.ts`) — deliberately no admin dashboard. Verified end-to-end
in production: submission via both entry points, validation (issue type, conditional
description, URL/email format, programId existence), and `list-error-reports`/
`resolve-error-report` round-trip.

## Final product state (2026-09-02)

The product is feature-complete for this professor round. Git SHA `6006297` (origin/main).
Production: https://prehealth-advisor.vercel.app — health endpoint 200 at `/api/healthz`.

**Authentication (Clerk).** Every route except `/sign-in`, `/sign-up`, and `/api/healthz`
requires sign-in, mirroring CampusVal's pattern with its own dedicated Clerk application
(not sharing CampusVal's user pool). Google + email sign-in, session persistence, logout,
and protected-deep-link redirect (`?redirect_url=`, validated as an internal path only —
see `src/lib/redirect.ts`) are all live-verified in production. No admin role, no advisor
dashboard, no APR/grade/plan-viewing access exists — the professor explicitly deferred all
of that pending further discussion. `artifacts/api-server/src/middlewares/requireAuth.ts`
gates the API side; `/api/healthz` is intentionally mounted before that gate.

**Branding.** The professor's own "SCU Health Professions Advising" logo replaced the
placeholder. His supplied file (`HPA updated logo rectangle transparent background.jpeg`)
was an opaque RGB JPEG with a gray checkerboard baked into the pixels, not real
transparency — cleaned deterministically (alpha keyed on HSV saturation, since the
checkerboard is achromatic and the logo is a single saturated maroon) into
`artifacts/prehealth-advisor/public/branding/scu-health-professions-advising.png`. One
config (`src/lib/site-config.ts`: `APP_LOGO`, `APP_LOGO_ALT`, `APP_NAME`, `APP_DESCRIPTION`)
drives both the large sign-in-page logo and the small `AppShell` header logo.

**Professor copy.** The planner header renders Version 2 of "SCU Health Professions
Advising - Program Planner.docx" verbatim — title, intro sentence, the five guidance
bullets (Research Early / Start In-State / Verify Missing Data / Export Your List / Seek
Advising Support), the disclaimer, and the "— Dr. McNelis" attribution. The copy lives in
`src/lib/planner-copy.ts` as a single source of truth the planner renders and tests assert
against; Version 1's wording is confirmed absent. "Verify Missing Data" links to
`/manual-search`.

**Regression coverage.** All 8 of the professor's named test programs (Ohio University PA,
Emory University PT, Vanderbilt University School of Nursing MEPN, Samuel Merritt
University ABSN, Samuel Merritt University MEPN, George Fox University PT, Georgia
Southern University PT, University of South Alabama PT) were individually verified live in
production — correct institution, correct distinct prerequisites, correct source, no
cross-program leakage. Samuel Merritt's ABSN and MEPN pathways were specifically confirmed
not to leak into each other (the planner enforces this structurally: nursing requires an
explicit ABSN/MEPN program-type selection before schools are shown). Copy Results and XLSX
export (Programs + Prerequisites sheets, single- and multi-program) were both live-tested
post-deploy with no auth data leaking into the export.

**Authenticated mobile QA.** The Chrome-extension-based browser tool used earlier in this
project could not actually resize its controlled window (`window.innerWidth` never changed
despite the resize call reporting success — a tooling limitation, not a product defect),
and driving a second local browser risked resizing the user's own unrelated Chrome window.
Resolved instead with a disposable Playwright script: a throwaway Clerk test user, a real
sign-in via Clerk's `sign_in_tokens` ticket strategy, genuine `390x844` and `768x1024`
viewports, then the user deleted afterward. All 22 checks passed at both sizes — zero
horizontal overflow, header logo intact within the viewport, account control, title, all
five guidance bullets, the "Search Programs Manually" link, and the profession selector all
visible; `/manual-search` likewise overflow-free with all 17 profession cards, including
Pathologists' Assistant and CAA, stacking cleanly. No engineering defect was found, so
nothing needed fixing.

## Where the data stands

**95.1% finalized — 2,671 verified, 60 publish no specific prerequisites, 1 source-blocked,
140 unfinished, of 2,872 active programmes.**

All checks currently pass:

| Check | Command | Expected |
|---|---|---|
| Whole-dataset integrity | `pnpm exec tsx src/db-integrity.ts` | `INTEGRITY_FAILING_CHECKS=0 of 12` |
| Source describes this programme | `pnpm exec tsx src/audit-source-profession.ts` | `WRONG_SOURCE=0` |
| No-prerequisite claims are evidenced | `pnpm exec tsx src/audit-no-prereq-claims.ts` | `SUSPECT=0` |
| Scripts tests | `pnpm --filter @workspace/scripts exec vitest run` | 91 passing |
| Frontend tests | `pnpm --filter @workspace/prehealth-advisor run test` | 127 passing |
| API tests | `pnpm --filter @workspace/api-server run test` | 20 passing |
| Types | `pnpm -r exec tsc --noEmit` | clean |
| Production build | `pnpm --filter prehealth-advisor build` | succeeds |

Coverage was 97.0% before the original correction and is deliberately lower again after the
2026-09-05 peer-advisor round — see that section above and "The correction" below.

## Working rules that are easy to get wrong

- **The checked-out branch is `cursor/completion-checkpoint`, not `main`.** Local `main` is
  hundreds of commits behind. Push with `git push origin HEAD:main`.
- **Source `envload.sh` in the same shell command as any database script.** Without it the
  shell profile's `DATABASE_URL` points at a different project's database and the script
  silently reads the wrong one: `. ./envload.sh && pnpm exec tsx src/<script>.ts`.
- **Production reads the database directly.** Data changes appear on
  prehealth-advisor.vercel.app without a redeploy. A redeploy is only needed for frontend code.
- **`scripts/hourly-checkpoint.ps1` is a background PowerShell loop that commits a coverage
  checkpoint every 30 minutes** (the historical `Checkpoint live coverage` commits on `main`
  came from it, not from a person). As of 2026-09-02 it is **not running** — no matching
  process or scheduled task was found — so no `Checkpoint live coverage` commits should
  appear until someone deliberately starts it again. It is retained as maintenance tooling,
  not deleted; if the noise starts again, find and close its PowerShell window.
- **Never fabricate prerequisite data.** No inferring profession-standard requirements, no
  copying between schools, no invented courses, credits, GPAs or test scores.
  `no_prereqs_published` requires an explicit statement from the school that it publishes none;
  not finding a list is a different claim and is never evidence of absence.

## The correction that lowered coverage

76 verified rows were serving **another programme's prerequisites** from the same university:
Duke's medicine row carried Duke's DPT requirements, Louisiana State's carried the veterinary
school's, Augusta's carried dental medicine's, and seven Tulane one-year master's rows carried
the medical school's MD list.

Resetting them was not enough — a re-run put 39 straight back on the same pages, because nothing
in the pipeline treated "this page describes a different profession" as a reason to refuse a
source. `sourceProfessionConflicts` in `scripts/src/extraction-rules.ts` is that reason. It is
checked in `validExtraction` before anything else and covered by 10 regression tests.

It reads the **deepest** profession marker in the URL path, because a URL is hierarchical —
college, then department, then programme. Fairleigh Dickinson's occupational therapy page is at
`/colleges-schools/pharmacy/otd/` because the School of Pharmacy houses the OTD; matching any
marker anywhere would discard correct data. Postbaccalaureate rows are exempt when the path
names a postbac programme, since such pages name the profession they prepare students for.

61 of the 76 were recovered against correct sources. The rest show no prerequisites rather than
wrong ones.

## What is left, and what is actually achievable

129 unfinished rows. Bucket them with `pnpm exec tsx src/show-failure-notes.ts`; the written
account per programme is in `data/unresolved-programs.md`.

| Count | Situation | Achievable? |
|---|---|---|
| 99 | Page was read successfully and names no prerequisite courses | **No.** Not without inventing data |
| 22 | Stored source returns an error status | Possibly — needs a URL found by hand |
| 5 | Reset, awaiting re-extraction | Yes — re-run the worker |
| 3 | One never attempted, one unreadable, one other | Possibly |

By profession: postbac 76, speech-language pathology 14, medicine 12, occupational therapy 8,
dietetics 6, pharmacy 4, physician assistant 3, nursing 3, and one each in
prosthetics-orthotics, genetic counselling and dental.

**The postbac block is mostly structurally unfinishable.** A postbaccalaureate programme is
where a student *takes* prerequisites, so most publish none. Effort spent there will not pay off.

Two rows were deliberately left alone: Wilmington University's MEPN and Mills College's postbac.
Neither institution lists the programme any more, but neither *states* that it was discontinued,
and a missing page is not evidence that a programme ended. Retiring them needs an explicit
statement, the way UW-Madison's cytotechnology row had one.

## Tools worth knowing before starting

| Script | What it is for |
|---|---|
| `src/probe-url.ts <url>` | Judge a candidate URL before seeding it. Compares it against a nonsense sibling path, because many university sites answer any unmatched path with a section landing page at status 200 |
| `src/set-seed.ts <id> <url>` | Record a researched URL, logging the previous value |
| `src/record-manual-prereqs.ts <file.json> --apply` | Record a list read by hand from a school's own document, with the reason the automated reader could not take it |
| `src/retire-program.ts <id> <url> "<quote>" --apply` | Mark a programme inactive, only on the institution's own statement |
| `src/dump-accordion.ts <url>` | Read a page with collapsed panels expanded |
| `src/check-reachable.ts` | Find unfinished rows whose stored source is dead |
| `src/list-unfinished-detail.ts` | The worklist, with each row's current source |

## Recurring failure to check for first

**A lookup failure recorded as a fact.** This codebase has produced it repeatedly: a rate-limit
response reported as "no official domain found", a single PDF 403 recorded as "no usable
prerequisite list", a search provider out of credit while every row was recorded as "no page
found", and a worker holding a stale queue snapshot writing old URLs back over freshly curated
seeds. When a result says a school publishes nothing, confirm the page was actually read.

A second, related one: **an escape eaten by a template literal.** A regex passed into
`page.evaluate` as an ordinary template literal loses its backslashes, so `\s` becomes `s` and
the page silently strips every letter "s" — "Historically" became "Hi torically" and
"Pre-Professions" became "Pre-Profe ion". Use `String.raw`.
