---
name: LLM extraction validation traps
description: Guardrails needed when using LLM structured output to extract facts from fetched web pages
---
Rule: never trust an LLM's "the page says X" claims without mechanical checks against the actual fetched text.

**Why:** During automated prerequisite extraction, gpt-4o-mini (a) emitted placeholder items like "Prerequisite Course 1", (b) fabricated verbatim-looking evidence quotes (identical sentence across different schools), and (c) once forced to quote real text, cited irrelevant sentences (residency page, generic admissions) to justify a "no prerequisites" claim.

**How to apply:** For any claim-extraction worker:
- Require an evidence quote AND verify it appears (normalized) in the fetched page text.
- Verify the quote semantically supports the claim (regex/keyword assertion), not just that it exists.
- Verify the page is on-topic (mentions the program/profession) before accepting negative claims.
- Reject placeholder-style names and set a minimum item count / plausibility ratio for positive lists.
- Landing pages rarely hold the data; rank same-domain links by relevance (prereq > requirement > admissions, plus profession terms) instead of taking them in page order.
