/**
 * Pure rules for deciding whether a candidate page may become a programme's seed.
 *
 * These live apart from fix-program-seeds.ts because that script runs its pipeline at import
 * time, which makes the rules themselves untestable. Every rule here exists because a specific
 * wrong page was accepted without it.
 */

/** Words that identify a page as belonging to a given profession's programme. */
export const PROF_IDENT: Record<string, RegExp> = {
  "speech-language-pathology": /speech-language|speech language|communication sciences|communicative sciences|\bslp\b|audiolog/i,
  medicine: /medical school|doctor of medicine|osteopathic|\bmd program\b|premedical/i,
  "occupational-therapy": /occupational therapy|\botd\b|\bmot\b/i,
  nursing: /nursing|\bbsn\b|\babsn\b|\bmepn\b/i,
  "physician-assistant": /physician assistant|\bpa program\b|\bcaspa\b/i,
  dietetics: /dietetic|nutrition and dietetics|\bdpd\b|registered dietitian/i,
  pharmacy: /pharmacy|\bpharmd\b|pre-pharmacy/i,
  "physical-therapy": /physical therapy|\bdpt\b|\bptcas\b/i,
  dental: /dental|\bdds\b|\bdmd\b|predental/i,
  "prosthetics-orthotics": /prosthetic|orthotic/i,
  postbac: /postbaccalaureate|post-baccalaureate|postbac|premedical|pre-medical/i,
};

/**
 * Hints used to score a URL. The word boundaries matter: without them the short forms match
 * inside unrelated words, and an earlier version lost them entirely to a shell escape, which
 * silently zeroed the score for five professions.
 */
export const PROF_HINT: Record<string, RegExp> = {
  dental: /dental|dds|dmd/i,
  "prosthetics-orthotics": /prosthet|orthot/i,
  "physical-therapy": /physical-?therapy|\bdpt\b|\bpt\b/i,
  pharmacy: /pharmac|pharmd/i,
  dietetics: /dietet|nutrition/i,
  // Degree abbreviations are how programme URLs usually name themselves: k-state publishes
  // its PA requirements under /programs/MPAS/, where \bpas\b cannot match.
  "physician-assistant": /physician-?assistant|\bpa\b|\bpas\b|\bmpas\b|\bmspas\b/i,
  "speech-language-pathology": /speech|slp|sphpath|communicat|csd|audiolog/i,
  medicine: /\bmd\b|medic|school-?of-?medicine/i,
  nursing: /nurs|bsn|\bdnp\b/i,
  "occupational-therapy": /occupational-?therapy|\bot\b|\botd\b/i,
  postbac: /post-?bac|postbaccalaureate|premed/i,
};

/**
 * Sources that are never acceptable evidence: aggregators, and a school's own test or staging
 * catalogue, whose content carries no guarantee of being what the school publishes.
 */
export const BANNED_SOURCE =
  /allaccessdietetics|niche\.com|usnews|petersons|gradschools\.com|collegefactual|studentdoctor|reddit|wikipedia|indeed|coursera|learn\.org|catalogtest|\/\/test[.-]|staging[.-]|\.dev\./i;

/** How strongly a URL promises this programme's prerequisites. */
export function seedScore(url: string, slug: string): number {
  if (!url) return -1;
  return (
    (/prereq|pre-requisit/i.test(url) ? 3 : 0) +
    (PROF_HINT[slug]?.test(url) ? 2 : 0) +
    (/admission|requirement|catalog|handbook/i.test(url) ? 1 : 0)
  );
}

/** A replacement must promise the programme's requirements, not merely outrank a bare homepage. */
export const MIN_REPLACEMENT_SCORE = 2;

/**
 * Whether a candidate domain may be used for this programme.
 *
 * The alternate-domain route exists so a school publishing on a second domain it owns is not
 * rejected. Applied when the official domain is already known it accepts a different school
 * instead, because name matching cannot separate two institutions in the same place.
 */
export function domainAcceptable(args: {
  candidateDomain: string;
  officialDomain: string;
  trusted: ReadonlySet<string>;
  selfIdentifies: boolean;
}): boolean {
  const { candidateDomain, officialDomain, trusted, selfIdentifies } = args;
  if (trusted.has(candidateDomain)) return true;
  if (officialDomain !== "") return false;
  return selfIdentifies;
}

/** Whether a page may be attached to a programme of this profession. */
export function pageMatchesProfession(pageText: string, slug: string): boolean {
  const ident = PROF_IDENT[slug];
  return ident ? ident.test(pageText) : true;
}
