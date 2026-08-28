# Current status

Last updated 2026-08-28. Regenerate the numbers with
`cd scripts && . ./envload.sh && pnpm exec tsx src/coverage-snapshot.ts` before trusting them.

## Where the data stands

**95.5% finalized — 2,683 verified, 59 publish no specific prerequisites, 1 source-blocked,
129 unfinished, of 2,872 active programmes.**

All checks currently pass:

| Check | Command | Expected |
|---|---|---|
| Whole-dataset integrity | `pnpm exec tsx src/db-integrity.ts` | `INTEGRITY_FAILING_CHECKS=0 of 12` |
| Source describes this programme | `pnpm exec tsx src/audit-source-profession.ts` | `WRONG_SOURCE=0` |
| No-prerequisite claims are evidenced | `pnpm exec tsx src/audit-no-prereq-claims.ts` | `SUSPECT=0` |
| Unit tests | `pnpm --filter @workspace/scripts exec vitest run` | 71 passing |
| Types | `pnpm -r exec tsc --noEmit` | clean |
| Production build | `pnpm --filter prehealth-advisor build` | succeeds |

Coverage was 97.0% earlier and is deliberately lower now. See "The correction" below.

## Working rules that are easy to get wrong

- **The checked-out branch is `cursor/completion-checkpoint`, not `main`.** Local `main` is
  hundreds of commits behind. Push with `git push origin HEAD:main`.
- **Source `envload.sh` in the same shell command as any database script.** Without it the
  shell profile's `DATABASE_URL` points at a different project's database and the script
  silently reads the wrong one: `. ./envload.sh && pnpm exec tsx src/<script>.ts`.
- **Production reads the database directly.** Data changes appear on
  prehealth-advisor.vercel.app without a redeploy. A redeploy is only needed for frontend code.
- **A background PowerShell loop commits a coverage checkpoint every 30 minutes.** The
  `Checkpoint live coverage` commits on `main` come from `scripts/hourly-checkpoint.ps1`, not
  from a person. Stop it by closing its PowerShell window if the noise is unwanted.
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
