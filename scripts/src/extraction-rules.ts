/**
 * Pure validation rules shared by the completion worker and its tests.
 *
 * complete-prereqs.ts runs its pipeline at import time, so rules that need direct test
 * coverage live here instead.
 */

/**
 * Explicit official statements that a program publishes no required coursework.
 *
 * Only ever applied to a quote the extractor took verbatim from the fetched page (the
 * caller re-checks that the quote appears in the page text), so widening this recognises
 * more genuine statements without ever inventing one.
 *
 * The original pattern required the literal token "prerequis-", which missed the equally
 * explicit phrasings schools actually use -- "no specific course requirements", "we do not
 * require specific courses", "no required coursework". Those programs then failed as
 * "no usable prereq list" even though their official page answered the question directly.
 * Common in postbaccalaureate and competency-based admissions models.
 */
export const NO_PREREQ_ASSERTION = new RegExp(
  [
    // "...no / does not require ... prerequisites | course requirements | specific courses"
    "(?:no|not\\s+require|not\\s+required|not\\s+have|without|does\\s+not\\s+require|do\\s+not\\s+require)" +
      "[^.]{0,80}" +
      "(?:prerequis|required\\s+cours|course\\s+requirement|coursework\\s+requirement|specific\\s+cours|required\\s+coursework|specific\\s+coursework|course\\s+prerequisit)",
    // "...prerequisites | required coursework ... are not required | none | no longer required"
    "(?:prerequis|required\\s+cours|course\\s+requirement|specific\\s+cours|required\\s+coursework)" +
      "[^.]{0,80}" +
      "(?:are\\s+not|is\\s+not|not\\s+required|none|no\\s+longer\\s+required|no\\s+longer\\s+require)",
  ].join("|"),
  "i",
);
