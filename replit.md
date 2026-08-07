# Health Professions Program Planner

A focused academic-planning tool that helps pre-health students identify the prerequisite courses required by professional schools they are considering.

## Purpose

The planner performs three functions:
1. Select a health profession (and nursing degree type when applicable)
2. Select programs of interest (searchable, multi-select, alphabetized)
3. View required prerequisite courses — exportable as CSV, TSV, or printable

It does **not** rank programs, predict admission outcomes, or recommend specific schools.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite 7 + TypeScript + Tailwind CSS 4 |
| UI components | shadcn/ui (sage-green design system) |
| State / data | TanStack Query v5 + custom fetch |
| Routing | Wouter |
| Backend | Express 5 + Pino logging |
| Database | PostgreSQL via Drizzle ORM |
| API contract | OpenAPI 3.1 → Orval codegen (Zod + React Query) |
| Monorepo | pnpm workspaces |

## Workspace layout

```
artifacts/
  api-server/          Express API (port 8080)
  prehealth-advisor/   Vite React frontend
lib/
  api-spec/            openapi.yaml + orval.config.ts (codegen source)
  api-client-react/    Generated React Query hooks + type stubs
  api-zod/             Generated Zod validators for API server
  db/                  Drizzle schema + migrations
scripts/
  src/seed.ts               Prereq reference seed (idempotent upsert, never deletes)
  src/import-programs.ts    CSV/JSON import script for new schools
  src/import-directory.ts   Idempotent nationwide directory import (data/directories/*.json)
  src/record-blockers.ts    Records blocked accreditor sources in directory_sources
  src/coverage-report.ts    Writes data/coverage-report.json reconciliation report
```

## Navigation

The student-facing app has **one page** — the Program Planner — at `/`.

Previous routes (`/dashboard`, `/professions`, `/schools`, `/prerequisites`) remain registered but are **not linked** from the nav; they are available for internal/admin use.

## Data model

### `program_schools` table

| Column | Type | Notes |
|---|---|---|
| id | serial | PK |
| profession_slug | text | e.g. "medicine", "nursing" |
| name | text | Official institution name |
| program_name | text | Official program name (e.g. "Doctor of Medicine (MD)") |
| city | text (nullable) | City where known from official source |
| state | text | 2-letter state code |
| degree_type | text (nullable) | "ABSN" or "MEPN" for nursing; null for others |
| source_url | text | Official admissions/prereq page URL |
| last_verified | date (nullable) | Date requirements were confirmed |
| verification_status | text | draft / imported / needs_review / verified / rejected / outdated |
| prereq_courses | jsonb | Array of `PrereqItem` objects (see below) |

### `PrereqItem` structure

```ts
{
  name: string;
  details?: string;           // Official wording (e.g. "1 year required, with lab")
  classification: "required" | "recommended" | "preferred" |
                  "informational" | "unclear" | "needs_review";
  labRequired?: boolean;
  courseCount?: number;
  semesterCredits?: number;
  quarterCredits?: number;
  otherConditions?: string;   // Recency, grade, or sequence requirements
}
```

### Directory vs. prerequisite verification (two separate concerns)

- **Program existence** comes from nationwide accreditor directories (`directory_status`, `directory_source`, `website_url`, `aliases`, `external_id`, `last_directory_verified` columns; `directory_sources` table records each source and its coverage status).
- **Prerequisite verification** is per-program (`verification_status`, `prereq_courses`, `source_url`, `last_verified`).
- Step 2 lists ALL active directory programs regardless of prerequisite verification. Step 3 shows verified required prerequisites, or an honest "still being verified" message. Exports represent every selected program (status rows for unverified ones) and are formula-injection-safe.

### Directory data (imported 2026-07-23)

Complete from accreditor sources: medicine (LCME MD 163 + AACOM DO 73; 5 records untyped — the MD/DO browse filter never hides untyped programs), physician-assistant (ARC-PA 330), physical-therapy (CAPTE 308), speech-language-pathology (ASHA CAA 322), pharmacy (ACPE 140), veterinary (AVMA 32), optometry (ASCO 24), podiatry (CPME 11), prosthetics-orthotics (NCOPE 15), anesthesiologist-assistant (CAAHEP 25, imported 2026-08-07 via its public search API), pathologists-assistant (NAACLS 20 incl. 4 Canadian, imported 2026-08-07; NAACLS REST for existence, AAPA pathassist.org official list for city/state — the two match 1:1).

Blocked (exact blockers recorded in `directory_sources`, coverageStatus='blocked'): dental (CODA JS app), occupational-therapy (ACOTE JS-only data), genetic-counseling (ACGC lists no per-program locations), dietetics (ACEND JS app), nursing ABSN/MEPN (AACN login-gated), postbac (AAMC JS app).

Directory JSON files live in `data/directories/`; machine-readable reconciliation report at `data/coverage-report.json` (regenerate with `coverage-report.ts`).

## Verified prerequisite data (46 programs, lastVerified 2026-07-23)

Schools dropped and why are documented in `scripts/src/seed.ts`. Directory imports never modify or delete verified prerequisite rows.

## Import script

Add new schools from CSV or JSON:

```bash
pnpm --filter @workspace/scripts exec tsx src/import-programs.ts path/to/file.csv
```

Required CSV fields: `profession`, `school_name`, `program_name`, `state`, `requirement_name`, `official_source_url`.

Imported records always enter with `verificationStatus = "imported"`. A human reviewer must verify against the official source before setting `verificationStatus = "verified"`.

## Development commands

```bash
# Start both dev servers (managed by Replit workflows)
# Frontend:  http://localhost:20024
# API:       http://localhost:8080

# Typecheck everything
pnpm typecheck

# Run tests
pnpm --filter @workspace/prehealth-advisor test

# Regenerate API client from openapi.yaml
pnpm --filter @workspace/api-spec run codegen

# Seed reference data
pnpm --filter @workspace/scripts exec tsx src/seed.ts

# Import programs from file
pnpm --filter @workspace/scripts exec tsx src/import-programs.ts data.csv

# Push DB schema changes
cd lib/db && npx drizzle-kit push
```

## Export format

One prerequisite per row. Columns:
Profession · Degree Type · School · Program · Required Prerequisite · Requirement Details · Course Count · Semester Credits · Quarter Credits · Laboratory Required · Other Required Conditions · Official Source · Last Verified

## User preferences

- Sage-green + Fraunces serif design system — preserve it
- Required-only prerequisites in student results (non-negotiable per professor)
- No admissions predictions, rankings, or school recommendations
- All new school data must be verified from official program sources before seeding
