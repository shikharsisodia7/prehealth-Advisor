# Pre-Health Advisor

A pre-health advising web app that helps undergraduate and postbac students explore health profession fields, build a target school/program list, and track prerequisite coursework toward applying to graduate health programs.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- API contract (source of truth): `lib/api-spec/openapi.yaml` — run codegen after edits
- DB schema: `lib/db/src/schema/` (`professions`, `targetSchools`, `prereqCourses`)
- API routes: `artifacts/api-server/src/routes/` (professions, target-schools, prereq-courses, dashboard)
- Seed data (incl. all 15 professions): `scripts/src/seed.ts` — run `pnpm --filter @workspace/scripts run seed`
- Frontend: `artifacts/prehealth-advisor/src/` (theme in `src/index.css`)

## Product

Three core surfaces: (1) Explore Professions — 15 health fields with their official program-search directories and prerequisite tables; (2) Target School List — track programs with status/priority/deadline; (3) Prerequisite Tracker — track required coursework and completion. A Dashboard aggregates progress.

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
