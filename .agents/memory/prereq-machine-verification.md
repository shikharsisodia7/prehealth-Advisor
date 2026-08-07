---
name: Prerequisite machine-verification pipeline
description: How collected prerequisite records get promoted from imported to verified, and pitfalls of LLM auditing
---

Pipeline that worked (2026-08): fetch each program's official source once per unique URL (webFetch `.markdown`; on 500, plain fetch with a browser UA + HTML-strip), then per program: (1) LLM audit stored records vs page → supported/discrepancies, (2) for discrepancies, LLM regenerates a corrected record set from the page, (3) a strict final adjudication pass that only counts MATERIAL issues (wrong classification/credits, missing required course, unsupported condition) and treats "2 courses vs 2 semesters"-style quibbles as pedantic.

**Why:** naive audit→fix→re-audit loops oscillate — the auditor invents new nitpicks each round and never converges. The materiality-gated adjudication pass is what terminates the loop.

**How to apply:** any future re-verification (e.g. annual refresh, new professions) should reuse this three-stage shape and always record the method in `verification_note` ("machine-verified, no human review") — never collapse machine verification into an unqualified "verified" claim.

Also: blocked official pages are often reachable at a *different* official URL found via web search (Calgary's 403'd program pages vs its accessible FAQ page) — search before accepting a source-blocked state.

Phantom "lost update" (2026-08): a row that appeared to lose a verified promotion (`UPDATE 1` reported, later read showed draft) was never actually promoted — the source-discovery job only writes `prereq_sources` + `verification_note`, so a row with populated sources but draft status/empty courses means extraction/promotion never ran, not DB inconsistency. **How to apply:** before diagnosing persistence/DB-identity problems, read the row back through the same connection immediately after the write and check which code path actually issued the update; every promotion script should include a post-write read-back assertion (status, source_url, course count).
