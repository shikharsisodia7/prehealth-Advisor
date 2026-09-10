# Current status

Last updated 2026-09-10. Regenerate the numbers with
`cd scripts && . ./envload.sh && pnpm exec tsx src/coverage-snapshot.ts` before trusting them.

## Generic transfer-gateway re-research round (2026-09-10)

The 12 rows the 2026-09-07 round reset to `needs_review` (see below) were independently
re-researched against each programme's own official source, not the generic transfer gateway
that was removed. 10 of the 12 were recovered with a real, program-specific source and a
structured prerequisite list or an evidenced "no fixed prerequisites" statement: both UC Irvine
School of Medicine (MD) and Sue & Bill Gross School of Nursing (MEPN) pages, UC Irvine School of
Pharmacy (PharmD), UC Irvine School of Medicine's own Postbaccalaureate Program page (live access
returned "Access denied" during verification; content was confirmed via a Wayback Machine
snapshot and cross-checked against independent search-index extracts of the same URL), University
of Toledo's College of Medicine (MD) and College of Pharmacy (Pre-Pharmacy) pages, Georgetown's MS
Entry to Nursing page (Georgetown's current name for what this dataset still calls MEPN) and its
Post-Baccalaureate Pre-Medical Certificate Program page, Indiana University of Pennsylvania's
Dietitian-Nutritionist MS page, and University of South Alabama's College of Medicine Bulletin.
2 of the 12 -- Georgetown's Master's in Systems Medicine and University of Oregon's Postbac Premed
Program -- turned out to genuinely publish no fixed prerequisite list (both explicitly state this
on their own official pages) and are now `no_prereqs_published` with the exact quoted evidence,
not `needs_review`.

**Broader audit sweep.** Running all five permanent audits (`audit-source-profession`,
`audit-source-transfer-gateway`, `audit-source-institution`, `audit-postbac-wrong-programme`,
`audit-no-prereq-claims`) plus `db-integrity` surfaced a manageable set of report-only candidates
from `audit-source-institution` (61, unchanged in shape from 2026-09-07) and 2 confirmed
`WRONG_PROGRAMME` rows from `audit-postbac-wrong-programme`. Only the candidates where the source
domain clearly belonged to a *different, unrelated* institution were investigated and fixed --
most of the 61 are the heuristic not recognising a legitimate same-institution abbreviation or
shared health-science-center domain (`unthealth.edu`, `achehealth.edu`, `csuohio.edu`,
`cuanschutz.edu` for genuine University of Colorado rows, `smartcatalogiq.com` catalog hosting,
etc.) and were left untouched as false positives, not "fixed" to make the count look cleaner:

- **UC San Diego Skaggs School of Pharmacy** (id 1477) -- `sourceUrl` was
  `pharmacy.cuanschutz.edu`, University of Colorado's PharmD admissions page, while `websiteUrl`
  already correctly pointed at `pharmacy.ucsd.edu`. Replaced with UCSD's own admissions
  requirements page.
- **University of Missouri-Kansas City School of Pharmacy** (id 1497) -- `sourceUrl` was
  `pharmacy.umaryland.edu`, University of Maryland's PharmD admissions page. Replaced with UMKC's
  own official pre-pharmacy course transfer sheet.
- **Lyon College School of Dental Medicine** (id 119) -- BOTH `websiteUrl` and `sourceUrl` pointed
  at `dental.umaryland.edu`, University of Maryland's dental school, entirely unrelated to Lyon
  College (Batesville, Arkansas). Replaced both with Lyon College's own dental-medicine pages.
- **Illinois College of Osteopathic Medicine** (id 381) -- `websiteUrl` contained a literal
  embedded space (`thechicago school.edu`), a data-entry corruption. The institution/source
  pairing itself was independently confirmed correct (IllinoisCOM is a real, newly
  COCA-pre-accredited DO program at The Chicago School, inaugural class Fall 2026) -- only the
  malformed URL was fixed; `sourceUrl` and `prereqCourses` were already correct and untouched.
- **Albright College "ADVANCE"** (id 2434, from `audit-postbac-wrong-programme`) -- the stored
  source and prerequisites were Albright's *undergraduate* pre-med major course sequence, not a
  postbac program's entrance requirements. Could not find a current official page for a distinct
  "ADVANCE" postbac program (the AAMC-listed URL now 404s, an albright.edu site search for
  "ADVANCE" returns nothing, and Albright's current pre-med page lists only articulation
  agreements with other institutions). No explicit discontinuation statement was found either, so
  this was reset to `needs_review` rather than retired or guessed.
- **Brown University ScM in Medical Sciences ("Gateways")** (id 2383, from
  `audit-postbac-wrong-programme`) -- `sourceUrl` was Brown's MD-program course-requirements page,
  whose prerequisites describe MD applicants, not this program's own applicants. Replaced with
  Brown's own Gateways admission page, which explicitly states it does not itemize a fixed
  prerequisite list and directs applicants to check their target medical schools instead -- now
  `no_prereqs_published` with that quote as evidence.

**A confirmed validator gap, fixed with a regression test.** Marking Georgetown's Systems Medicine,
Oregon's Postbac, and Brown's Gateways rows `no_prereqs_published` initially tripped
`audit-no-prereq-claims` as `SUSPECT`/`NOQUOTE`: two needed their evidence written under the
`Source statement: "..."` convention the audit parses (a formatting gap, now fixed in the notes),
and Brown's own FAQ legitimately says prerequisites vary "for the specific medical schools you are
applying to" -- a premedical postbac program naming its students' eventual destination, not a
quote about an unrelated field the way Cleveland State's old law-school quote was. Extracted the
audit's OWN_FIELD/OTHER_FIELD conflict logic into a shared, tested `noPrereqQuoteFieldConflict`
function in `extraction-rules.ts` (the same consolidation `audit-source-profession.ts` already
went through in the 2026-09-05 round, for the same reason: two copies of a marker list is how a
gap goes unnoticed), added a postbac/medicine exemption mirroring the existing
`PATH_NAMES_POSTBAC` precedent, and covered it with 5 regression tests in
`extraction-rules.test.ts` -- the Brown counterexample, the original Cleveland State
law-school/Emory nursing-vs-dietetics cases (must still flag), a non-postbac profession citing
medicine (must still flag, the exemption is postbac-scoped only), and a field-silent quote
(must not flag). `audit-no-prereq-claims` now reports `SUSPECT=0` again.

All checks pass after this round: `INTEGRITY_FAILING_CHECKS=0`, `WRONG_SOURCE=0`,
`FLAGGED=0` (transfer gateway), `WRONG_PROGRAMME=0`, `SUSPECT=0`. Scripts tests grew from 102 to
107 (5 new regression tests); frontend (127) and API (20) tests, full-repo typecheck, and the
production build are all unaffected and still pass. Coverage moved from 94.7% to **95.1%**
(2,671 verified, 59 publish no specific prerequisites, 1 source-blocked, 141 unfinished, of 2,872
active programmes) -- net positive even though two previously-"verified" rows (Albright, Brown)
were correctly demoted after their data turned out to be wrong-programme, because 10 of the 12
reset rows and 3 of the 6 additional audit candidates were successfully recovered with real
evidence.

## Generic transfer-gateway sourcing round (2026-09-07)

A full-codebase audit (typecheck, all three test suites, both builds, and every data-integrity
script) turned up no functional bug, but a targeted check for wrong-source data (prompted by a
report that UC Irvine's rows looked off) found a bug the existing `sourceProfessionConflicts`
guard could not see: 12 rows across 6 institutions carried an institution-wide **undergraduate
transfer-admissions gateway** as their prerequisite source, rather than the actual professional
or graduate programme's own admissions page. All four UC Irvine professional-program rows in
this dataset (School of Medicine MD, the nursing MEPN, School of Pharmacy PharmD, and the
postbaccalaureate programme) pointed at the exact same `admissions.uci.edu/apply/transfer-students/...`
URL — UCI's general undergraduate transfer-admissions page, unrelated to any of the four. The
same shape recurred at Toledo (a "transfer adult student" guest-registration page, wrongly
marked `no_prereqs_published` off a quote about guest-student course registration, not MD/PharmD
admissions), Georgetown (an undergraduate transfer-applicants page, cited for its MEPN and two
graduate programmes), Indiana University of Pennsylvania (dietetics), South Alabama (a "Pathway
USA" undergraduate-to-BS transfer articulation plan cited for its MD row), and Oregon (a general
transfer-requirements page cited for its Postbac Premed Program).

**Root cause.** `sourceProfessionConflicts` in `scripts/src/extraction-rules.ts` only flags a URL
that names a *different* profession; a generic institutional transfer gateway names no profession
at all, so it passed as "no conflict" even though it is unambiguously the wrong kind of page —
the same blind spot class as the OU/OHSU/UCR bug (2026-09-05), just on the opposite side (too
little signal instead of the wrong signal). Added `genericTransferGatewayConflict`, which flags a
URL matching a generic `/transfer-students/`, `/transfer-applicants/`, `/transfer-adult-student/`,
etc. path when `professionOfUrlPath` finds no profession/programme signal in it at all.
Second-degree/accelerated nursing (ABSN) is exempted, since it genuinely is a second bachelor's
degree some students reach through a university's ordinary undergraduate transfer process — and
several legitimate ABSN rows cite exactly this kind of page for exactly that reason. 12 new
regression tests in `extraction-rules.test.ts` cover the confirmed cases plus the ABSN and
program-specific-transfer-page exemptions. A new permanent audit,
`scripts/src/audit-source-transfer-gateway.ts`, runs this check read-only across every finalized
row (report-only, by the same convention as `audit-source-institution.ts`).

All 12 confirmed rows were reset to `needs_review` via `scripts/src/fix-transfer-gateway-sources.ts`
(dry-run by default, `--apply` to write): `sourceUrl`, `prereqCourses`, and `prereqSources`
cleared, `verificationNote` recording what was wrong. `websiteUrl` was left untouched on all 12 —
it is a separate field (the institution/programme's own website) and was already correct on
every row, e.g. Georgetown's Systems Medicine row already carried
`systemsmedicine.georgetown.edu` there. `WRONG_SOURCE=0` and the new audit's `FLAGGED=0` after the
reset. Coverage moved from 95.1% to 94.7%, an accepted result of removing wrong data — wrong data
is worse than missing data. None of the 12 were independently re-researched in this round (out of
scope); they now correctly show as unfinished rather than carrying wrong data.

## Auth deployment mode: Clerk Development, intentionally (2026-09-06)

**This deployment runs Clerk's Development instance, not Production — on purpose. Do not
"upgrade" this back to Clerk Production keys without reading this first.**

The app is only reachable at `prehealth-advisor.vercel.app` (a Vercel-owned domain — no
domain we control exists yet for this pilot). Clerk Production instances require a domain
the owner controls (for the Frontend API, cookies, and OAuth callback trust); a Frontend-API
reverse proxy was built to work around that (`/__clerk`, `frontendApiProxy`, `proxyUrl`), and
it got real Google sign-ins as far as Google's consent screen, but sessions never actually
stuck after the callback — a proxied Production instance on a bare `*.vercel.app` host isn't
a configuration Clerk actually supports end-to-end. That entire proxy architecture has been
removed (see git history around 2026-09-06 for the reverted `/__clerk` rewrites, `app.ts`
middleware, and `ClerkProvider proxyUrl`).

Instead: Vercel's `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` / `VITE_CLERK_PUBLISHABLE_KEY`
point at the PreHealth Advisor **Development** Clerk instance (`pk_test_.../sk_test_...`),
which Clerk fully supports on any domain, no proxy required. Limitations this accepts:

- **100-user cap** (Clerk Development instance limit). Fine for a peer-advisor pilot; report
  it if the pilot group approaches that size.
- **Email delivery limits** on Development instances. Google sign-in is the primary path for
  this reason; email/password remains a working fallback.
- Clerk Development user accounts do not migrate automatically to a Production instance.
  Users will need to re-register when this eventually moves to a real Production setup.

**The Clerk Production instance and its dedicated Google Cloud OAuth project still exist** —
neither was deleted. They're simply inactive for this deployment. When a domain this project
controls exists:
1. Point that domain (or a subdomain) at this Vercel project.
2. Configure it as the Clerk Production instance's primary domain (normal CNAME setup —
   prefer that over reviving the proxy).
3. Point Google's OAuth client's authorized origins/redirect URI at the new domain.
4. Swap Vercel's three Clerk env vars back to the Production `pk_live_.../sk_live_...` pair.
5. Re-run the full auth E2E pass before calling it done.

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

**95.1% finalized — 2,671 verified, 59 publish no specific prerequisites, 1 source-blocked,
141 unfinished, of 2,872 active programmes.** (Up from 94.7% because the 2026-09-10 re-research
round above recovered 10 of the 12 generic-transfer-gateway rows and 3 of 6 additional
audit-flagged rows with real, evidenced sources — see that section for exactly which.)

All checks currently pass:

| Check | Command | Expected |
|---|---|---|
| Whole-dataset integrity | `pnpm exec tsx src/db-integrity.ts` | `INTEGRITY_FAILING_CHECKS=0 of 12` |
| Source describes this programme | `pnpm exec tsx src/audit-source-profession.ts` | `WRONG_SOURCE=0` |
| Source isn't a generic transfer gateway | `pnpm exec tsx src/audit-source-transfer-gateway.ts` | `FLAGGED=0` |
| No-prerequisite claims are evidenced | `pnpm exec tsx src/audit-no-prereq-claims.ts` | `SUSPECT=0` |
| Scripts tests | `pnpm --filter @workspace/scripts exec vitest run` | 107 passing |
| Frontend tests | `pnpm --filter @workspace/prehealth-advisor run test` | 127 passing |
| API tests | `pnpm --filter @workspace/api-server run test` | 20 passing |
| Types | `pnpm -r exec tsc --noEmit` | clean |
| Production build | `pnpm --filter prehealth-advisor build` | succeeds |

Coverage was 97.0% before the original correction and is deliberately lower again after the
2026-09-05 peer-advisor round — see that section above and "The correction" below.

## Working rules that are easy to get wrong

- **As of 2026-09-10 the checked-out branch is `main` itself, up to date with `origin/main`.**
  Push with `git push origin HEAD:main`; re-verify with `git status` before assuming this still
  holds, since it has flipped before.
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

141 unfinished rows (regenerated 2026-09-10). Bucket them with
`pnpm exec tsx src/show-failure-notes.ts`; the written account per programme is in
`data/unresolved-programs.md`.

| Count | Situation | Achievable? |
|---|---|---|
| 99 | Page was read successfully and names no prerequisite courses | **No.** Not without inventing data |
| 22 | Stored source returns an error status | Possibly — needs a URL found by hand |
| 17 | Reset, awaiting re-extraction | Yes — re-run the worker |
| 1 | Never attempted | Possibly |
| 1 | Page could not be read | Possibly |
| 1 | Other | Possibly |

By profession: postbac 87, speech-language pathology 15, medicine 12, occupational therapy 8,
dietetics 6, pharmacy 4, physician assistant 3, nursing 3, and one each in
genetic counselling, prosthetics-orthotics, and dental.

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
