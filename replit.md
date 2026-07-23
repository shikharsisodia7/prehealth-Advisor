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
  src/seed.ts          Reference data seed (14 verified schools)
  src/import-programs.ts  CSV/JSON import script for new schools
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

### Verification rule

**Only `verificationStatus = "verified"` records with `classification = "required"` prereqs appear in student-facing results.** Unverified records show an honest status message.

## Verified data (14 schools, lastVerified 2026-07-23)

| Profession | Count |
|---|---|
| Medicine (MD) | 5 |
| Physical Therapy (DPT) | 7 |
| Nursing (ABSN / MEPN) | 2 |

Schools dropped and why are documented in `scripts/src/seed.ts`.

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
