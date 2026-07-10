---
name: Timestamp column vs OpenAPI string response
description: Why Drizzle timestamp columns break generated Zod response validation and how to handle it
---

# Nullable timestamp columns and generated response schemas

When an OpenAPI field is `type: ["string", "null"]` WITHOUT `format: date-time`, Orval generates `zod.string().nullish()` for it. A Drizzle `timestamp(..., { withTimezone: true })` column returns a JS `Date` object from `db.select()`, which fails that `zod.string()` response `.parse()` at runtime (produces a 500).

By contrast, fields Orval sees as `format: date-time` generate `zod.coerce.date()`, which accepts `Date` objects fine (that's why `createdAt`/`updatedAt` with `format: date-time` work without conversion).

**Rule:** For a nullable date field you want as a *string* on the wire, serialize the `Date` to ISO string in the handler before `.parse()` (`row.deadline ? row.deadline.toISOString() : null`). Alternatively give the field `format: date-time` in the spec so the client gets a `Date`.

**Also:** validate incoming date strings (`new Date(x)`, reject if `Number.isNaN(d.getTime())`) and return 400 — otherwise a bad string reaches the DB insert and surfaces as a 500 instead of a validation error.

**Why:** hit both in the Pre-Health Advisor build; the `deadline` field on target schools triggered both the read-side 500 and the write-side unvalidated-date issue.
