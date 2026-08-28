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
  // A single distinctive word cannot establish identity by word-overlap alone: "University of
  // Michigan" reduces to ["michigan"], a subset of "Michigan State University", though they
  // are different institutions.
  //
  // Requiring two distinctive words rejected those correctly but also rejected legitimate
  // single-word institutions -- "Boston University" reduces to ["boston"], so the Chobanian &
  // Avedisian School of Medicine never matched its own parent. Fall back to phrase
  // containment, which separates the two cases exactly: "Boston University Aram V. Chobanian
  // ..." contains the phrase "boston university", whereas "Michigan State University" does not
  // contain "university of michigan" and "University of Miami" does not contain "miami
  // university".
  let identityMatches: boolean;
  if (shorter.length < 2) {
    // Containment is compared over whole words, not raw text. Substring containment let a name
    // that is a PREFIX of a different school match it -- "university of maryland" contains the
    // string "university of mary", so University of Mary (Bismarck, ND) resolved to umd.edu.
    const phraseWords = (s: string) =>
      s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
    const contains = (hay: string[], needle: string[]) =>
      needle.length > 0 &&
      hay.some((_, i) => needle.every((w, j) => hay[i + j] === w));
    const a2 = phraseWords(label);
    const b2 = phraseWords(name);
    identityMatches = a2.join(" ").length >= 6 && (contains(b2, a2) || contains(a2, b2));
  } else {
    const longerSet = new Set(longer);
    identityMatches = shorter.every((w) => longerSet.has(w));
  }
  if (!identityMatches) return false;

  // A subset match alone accepts the PARENT system as if it were the campus: "University of
  // North Carolina" reduces to [north, carolina], a subset of "University of North
  // Carolina-Greensboro", so the UNC system site (northcarolina.edu) was accepted for the
  // Greensboro program instead of uncg.edu. Strict set equality would fix that but would
  // reject legitimate matches like "Cleveland State University School of Nursing" or a
  // donor-named school ("Idaho State University L.S. Skaggs College of Pharmacy").
  //
  // The discriminator is the campus qualifier -- the text after a dash, comma, or "at". When
  // the program name carries one, the entity must name that campus too.
  const qualifier = /(?:[-–—,]|\bat\b)\s*([^-–—,]+)$/i.exec(name);
  if (qualifier) {
    const qualifierWords = words(qualifier[1]);
    const labelSet = new Set(words(label));
    if (qualifierWords.length && !qualifierWords.every((w) => labelSet.has(w))) return false;
  }
  return true;
}

/**
 * The words in an institution's name that actually identify it.
 *
 * A profession word is not an identity. Schools are routinely named for the profession they
 * teach -- "... Skaggs School of Pharmacy", "... Feik School of Pharmacy" -- and treating
 * "pharmacy" as distinctive meant any host containing it was accepted as that institution's.
 * That is how UC San Diego's row came to cite pharmacy.cuanschutz.edu (Colorado), Incarnate
 * Word's pharmacy.umaryland.edu (Maryland), and UT San Antonio's slhs.utexas.edu (UT Austin):
 * the guard meant to catch exactly this waved them through.
 */
export function institutionTokens(name: string): string[] {
  const stop = new Set([
    // Generic institution words.
    "university", "college", "school", "institute", "health", "sciences", "science",
    "medical", "medicine", "center", "centre", "campus", "the", "of", "and", "at", "for",
    "state", "system", "program", "programs", "graduate", "professional", "studies",
    // Profession and department words: these name what is taught, not who teaches it.
    "pharmacy", "nursing", "dental", "dentistry", "therapy", "physical", "occupational",
    "speech", "language", "pathology", "audiology", "veterinary", "optometry", "podiatric",
    "podiatry", "nutrition", "dietetics", "physician", "assistant", "anesthesiologist",
    "prosthetics", "orthotics", "counseling", "genetic", "rehabilitation", "allied",
    "osteopathic", "biomedical", "communication", "disorders",
  ]);
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !stop.has(t));
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

/**
 * Which programme a URL's path is about, and whether that conflicts with the row's profession.
 *
 * Seventy-six verified rows were serving another programme's prerequisites: Duke's medicine row
 * carried Duke's DPT list, Louisiana State's carried the veterinary school's, and five Tulane
 * one-year master's rows carried the medical school's MD list. Cleaning those up once was not
 * enough -- re-running extraction put 39 of them straight back on the same pages, because
 * nothing in the pipeline treats "this page is about a different profession" as a reason to
 * refuse a source. This is that reason, applied before a candidate is fetched and again before
 * an extraction is accepted.
 */
const PROFESSION_MARKERS: Array<{ slug: string; re: RegExp }> = (() => {
  const B = String.raw`(^|[/_.-])`;
  const E = String.raw`([/_.-]|$)`;
  return [
    { slug: "occupational-therapy", re: new RegExp(`${B}(occupational[-_]?therapy|otd|msot|ot)${E}`, "i") },
    { slug: "physical-therapy", re: new RegExp(`${B}(physical[-_]?therapy|dpt|ptcas|pt)${E}`, "i") },
    { slug: "speech-language-pathology", re: new RegExp(`${B}(speech[-_]?language[-_]?pathology|speech[-_]?language|communication[-_]?sciences|communication[-_]?disorders|communicative[-_]?disorders|slp|csd)${E}`, "i") },
    { slug: "nursing", re: new RegExp(`${B}(nursing|bsn|msn|absn|mepn|dnp)${E}`, "i") },
    { slug: "pharmacy", re: new RegExp(`${B}(pharmacy|pharmd)${E}`, "i") },
    { slug: "physician-assistant", re: new RegExp(`${B}(physician[-_]?assistant|pa)${E}`, "i") },
    { slug: "dentistry", re: new RegExp(`${B}(dental[-_]?medicine|dentistry|dental|dmd|dds)${E}`, "i") },
    { slug: "dietetics", re: new RegExp(`${B}(dietetics|dietetic[-_]?internship|nutrition)${E}`, "i") },
    { slug: "veterinary", re: new RegExp(`${B}(veterinary|dvm)${E}`, "i") },
    { slug: "optometry", re: new RegExp(`${B}(optometry|optometric)${E}`, "i") },
    { slug: "prosthetics-orthotics", re: new RegExp(`${B}(orthotics[-_]?and[-_]?prosthetics|prosthetics[-_]?and[-_]?orthotics|orthotics|prosthetics)${E}`, "i") },
  ];
})();

/** The medical school's own MD track, whose prerequisites are a claim about MD applicants. */
const MD_TRACK_PATH =
  /(\/md-program\/|\/m-d-program\/|\/md\/admission|\/admissions\/md\/|admission\.med\.|\/medical-student-admissions|\/medicine-md\/|\/allopathic-medicine|\/doctor-of-medicine|\/medicine\/md\/)/i;

/** A path naming a postbaccalaureate programme is a postbac page whatever profession it prepares for. */
const PATH_NAMES_POSTBAC = /(post-?bacc?alaureate|post-?bacc|postbac)/i;

/** Dentistry is stored under two slugs in this dataset. */
const EQUIVALENT_SLUG: Record<string, string> = { dentistry: "dental", dental: "dentistry" };

/**
 * The profession a URL's path is about, or null when the path names none.
 *
 * The deepest marker wins, because a URL is hierarchical: college, then department, then
 * programme. Fairleigh Dickinson's occupational therapy page is at
 * /colleges-schools/pharmacy/otd/admissions/ because the School of Pharmacy houses the OTD, and
 * Murray State's is at /nursing-and-health-sciences/ot/. Taking any marker calls both wrong.
 */
export function professionOfUrlPath(url: string): string | null {
  let pathOnly = url;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    pathOnly = `/${u.hostname.split(".").slice(0, -2).join(".")}${u.pathname}`;
  } catch { /* compare the raw string */ }
  let deepest: { slug: string; at: number } | null = null;
  for (const m of PROFESSION_MARKERS) {
    const found = m.re.exec(pathOnly);
    if (found && (deepest === null || found.index > deepest.at)) deepest = { slug: m.slug, at: found.index };
  }
  return deepest?.slug ?? null;
}

/**
 * Why this URL is the wrong programme for this row, or null when it is not.
 *
 * Returns a sentence so the refusal can be recorded rather than being a silent skip.
 */
export function sourceProfessionConflicts(url: string, professionSlug: string): string | null {
  let pathOnly = url;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    pathOnly = `/${u.hostname.split(".").slice(0, -2).join(".")}${u.pathname}`;
  } catch { /* compare the raw string */ }

  // A postbac page routinely names the profession it prepares students for; that is not a clash.
  if (professionSlug === "postbac" && PATH_NAMES_POSTBAC.test(pathOnly)) return null;
  if (professionSlug === "postbac" && MD_TRACK_PATH.test(pathOnly)) {
    return "the page is the medical school's own MD admissions track, whose prerequisites describe MD applicants rather than postbaccalaureate ones";
  }
  const found = professionOfUrlPath(url);
  if (!found || found === professionSlug || EQUIVALENT_SLUG[found] === professionSlug) return null;
  return `the page is a ${found} page, and this row is a ${professionSlug} programme`;
}
