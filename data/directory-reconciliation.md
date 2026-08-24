# Directory Reconciliation

Every supported profession is reconciled against the authoritative accreditor or
professional-body directory recorded in the `directory_sources` table. Counts below compare
that directory's program count against active rows in `program_schools`.

Identity correctness is the standard, not count parity: rows are never invented to match a
directory total, and a campus that the directory lists once but that operates as distinct
accredited programs is kept as distinct rows.

| Profession | Authoritative directory | Source count | DB active | Delta | Status |
|---|---|---:|---:|---:|---|
| Certified Anesthesiologist Assistant | CAAHEP Find an Accredited Program | 25 | 25 | 0 | reconciled |
| Dental (DDS/DMD) | CODA Find-a-Program — Predoctoral | 78 | 78 | 0 | reconciled |
| Dietetics | ACEND Coordinated (53) + Graduate (98) | 151 | 152 | +1 | explained below |
| Genetic Counseling | ACGC Accredited Programs Directory | 65 | 64 | −1 | explained below |
| Medicine | LCME (MD, 163) + AACOM (DO, 73) | 236 | 236 | 0 | reconciled |
| Nursing | AACN ABSN (342) + MEPN (104) | 446 | 446 | 0 | reconciled |
| Occupational Therapy | ACOTE MOT (160) + OTD (158) | 318 | 318 | 0 | reconciled |
| Optometry | ASCO Member Schools and Colleges | 24 | 24 | 0 | reconciled |
| Pathologists' Assistant | NAACLS Accredited Program Search | 20 | 20 | 0 | reconciled |
| Pharmacy | ACPE Program Lookup — PharmD | 140 | 140 | 0 | reconciled |
| Physical Therapy | CAPTE Accredited PT Programs | 308 | 308 | 0 | reconciled |
| Physician Assistant | ARC-PA Accredited Entry-Level | 330 | 330 | 0 | reconciled |
| Podiatric Medicine | CPME Accredited Colleges | 11 | 11 | 0 | reconciled |
| Postbaccalaureate | AAMC Postbac Premedical Database | 338 | 336 | −2 | explained below |
| Prosthetics & Orthotics | NCOPE Accredited Practitioner Programs | 15 | 15 | 0 | reconciled |
| Speech-Language Pathology | ASHA CAA Accredited SLP Master's | 322 | 322 | 0 | reconciled |
| Veterinary Medicine | AVMA Accredited Veterinary Colleges | 32 | 32 | 0 | reconciled |

Every profession with active programs has a `directory_sources` row; none is missing.

## Explained deltas

**Genetic Counseling (−1) — fully reconciled.** 64 active + 1 inactive = 65, matching ACGC
exactly. The inactive row is id 319, Johns Hopkins University / National Human Genome Research
Institute, retained as an inactive record rather than deleted so the directory history stays
intact. Active counts deliberately exclude it.

**Dietetics (+1) — identity split, not a duplicate.** Keiser University operates the
Coordinated Program in Dietetics at two campuses, Lakeland (id 160) and Melbourne (id 161),
held as separate rows because they publish different prerequisite sets (47 and 45 items
respectively). ACEND's directory presents the institution once. The extra row reflects a real
distinction between the campuses, so it is kept.

**Postbaccalaureate (−2) — two AAMC entries not represented.** 336 of the AAMC database's 338
entries are present. The shortfall is left as a shortfall rather than padded with invented
rows; the AAMC database includes entries that do not resolve to a distinct accredited program
identity.

## Same-source programs are not leakage

91 source URLs are shared by more than one institution. These are legitimate authoritative
sources rather than copied requirements:

- **Centralized application services and professional bodies** publishing a per-school
  requirements chart — the VMCAS prerequisite chart covers 29 veterinary schools and the ASCO
  prerequisites table covers 18 optometry schools. Both are named in the requirements as
  acceptable authoritative sources.
- **Multi-campus systems** where one published page governs every campus: Herzing (7),
  South University (5), LECOM (5), Nova Southeastern (5), Case Western (4), Edward Via (4),
  University of St. Augustine (multiple).

Each row still stores its own institution, program identity, verification date and source
link, and the per-program prerequisite payloads differ where the campuses differ.
