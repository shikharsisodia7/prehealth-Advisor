---
name: jsonb null round-trip & drizzle-zod enum widening
description: Typing rules for jsonb object fields and text-enum columns in this monorepo's Drizzle + drizzle-zod + OpenAPI stack.
---

Two recurring type pitfalls:

1. **jsonb optional fields must accept `null`, not just `undefined`.** Postgres jsonb round-trips omitted values as `null`. Type object-array jsonb columns with `field?: T | null` and keep the OpenAPI schema `nullable`, or workspace typecheck breaks when seeded/imported payloads carry nulls.
**Why:** seed/import scripts failed typecheck after structuring prereq items; generated api.schemas.ts already used `string | null`.
**How to apply:** whenever adding structured jsonb columns in lib/db, mirror nullability across the TS type, drizzle schema annotation, and openapi.yaml.

2. **drizzle-zod widens text-enum columns to `string`.** `createInsertSchema` infers `text()` columns as plain `string`, which is not assignable to a Drizzle `$type<Enum>()` insert. Pass an explicit `z.enum([...])` override for that column to `createInsertSchema`.
**How to apply:** any text column with a TS union type needs a matching zod enum override in scripts/validation code.
