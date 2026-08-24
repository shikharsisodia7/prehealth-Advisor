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
/**
 * True when a Wikidata entity's label denotes the same institution as the program name.
 *
 * This is the safety check that lets the worker accept an official-website claim whose
 * domain is an acronym (csuohio.edu for Cleveland State University). Comparing domain
 * spelling to the school name rejects those correct answers, and they matter most: rows with
 * no stored seed reach Wikidata as their only route to a candidate URL.
 *
 * Identity is compared by words, not by domain text -- every distinctive word of the shorter
 * name must appear in the longer one. So "Cleveland State University" matches its own entity
 * and its nursing school, but not "Ohio State University", and UNC Chapel Hill does not match
 * UNC Greensboro.
 */
export function entityLabelMatchesInstitution(label: string, name: string): boolean {
  const stop = new Set([
    "the", "of", "at", "and", "university", "college", "school", "institute",
    "center", "centre", "health", "sciences", "science", "medicine", "medical",
    "campus", "program", "programs",
  ]);
  const words = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !stop.has(w));
  const a = words(label);
  const b = words(name);
  if (!a.length || !b.length) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  // A single distinctive word is not enough to establish identity: "University of Michigan"
  // reduces to ["michigan"], which is a subset of "Michigan State University"
  // (["michigan","state"]) though they are different institutions -- and "Miami University"
  // versus "University of Miami" is indistinguishable this way. Require at least two
  // distinctive words and let such names fall back to the host-name heuristic, which already
  // handles the short .edu domains these schools use.
  if (shorter.length < 2) return false;
  const longerSet = new Set(longer);
  return shorter.every((w) => longerSet.has(w));
}

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
