import { describe, expect, it } from "vitest";
import {
  BANNED_SOURCE,
  MIN_REPLACEMENT_SCORE,
  domainAcceptable,
  pageMatchesProfession,
  seedScore,
} from "./seed-rules.js";

describe("seedScore", () => {
  // The word boundaries in the profession hints were once replaced by literal backspace
  // characters, which silently zeroed the profession component for five professions and got 44
  // usable pages dismissed as too weak -- including a school's own admissions page.
  it.each([
    ["https://www.unmc.edu/alliedhealth/academics/programs/ot/admission/index.html", "occupational-therapy"],
    ["https://catalog.k-state.edu/programs/MPAS/program-requirements", "physician-assistant"],
    ["https://pharmacy.uky.edu/admission-aid/pharmd-program/pre-pharmacy", "pharmacy"],
    ["https://med.emory.edu/departments/rehabilitation-medicine/dpt/admission/", "physical-therapy"],
  ])("scores a real programme page high enough to use: %s", (url, slug) => {
    expect(seedScore(url, slug)).toBeGreaterThanOrEqual(MIN_REPLACEMENT_SCORE);
  });

  // A bare homepage scores zero, so requiring only "better than the stored seed" let a generic
  // page win: UC Santa Barbara's undergraduate transfer-eligibility page was written this way.
  it("does not let a generic admissions page qualify as a replacement", () => {
    expect(seedScore("https://admissions.sa.ucsb.edu/transfer-eligibility-selection", "speech-language-pathology"))
      .toBeLessThan(MIN_REPLACEMENT_SCORE);
    expect(seedScore("https://www.byu.edu/", "speech-language-pathology")).toBeLessThan(MIN_REPLACEMENT_SCORE);
  });

  it("reports an absent url as worse than any candidate", () => {
    expect(seedScore("", "nursing")).toBe(-1);
  });
});

describe("BANNED_SOURCE", () => {
  // A school's test catalogue is not the catalogue it publishes, and an aggregator is not the
  // school. Ole Miss was offered catalogtest.olemiss.edu, and its SLP row cited learn.org.
  it.each([
    "https://catalogtest.olemiss.edu/2026/fall/nhm",
    "https://learn.org/best-colleges/mississippi",
    "https://www.usnews.com/best-graduate-schools",
    "https://staging-www.example.edu/admissions",
  ])("rejects %s as evidence", (url) => {
    expect(BANNED_SOURCE.test(url)).toBe(true);
  });

  it.each([
    "https://catalog.olemiss.edu/2026/fall/nhm",
    "https://pharmacy.uky.edu/admission-aid",
  ])("accepts the school's own published page: %s", (url) => {
    expect(BANNED_SOURCE.test(url)).toBe(false);
  });
});

describe("domainAcceptable", () => {
  const trusted = new Set(["utsa.edu"]);

  it("accepts a candidate on the institution's confirmed domain", () => {
    expect(domainAcceptable({ candidateDomain: "utsa.edu", officialDomain: "utsa.edu", trusted, selfIdentifies: false })).toBe(true);
  });

  // uthscsa.edu is UT Health Science Center San Antonio, a different institution from UTSA.
  // Both names reduce to the same words once the generic ones are dropped, so a name match
  // cannot separate them and the confirmed domain has to win.
  it("rejects another school in the same city once the official domain is known", () => {
    expect(domainAcceptable({ candidateDomain: "uthscsa.edu", officialDomain: "utsa.edu", trusted, selfIdentifies: true })).toBe(false);
  });

  // The route exists so LSU Health, which publishes on lsuhs.edu, is not rejected outright.
  it("allows a self-identifying domain only when no official domain was confirmed", () => {
    expect(domainAcceptable({ candidateDomain: "lsuhs.edu", officialDomain: "", trusted: new Set(), selfIdentifies: true })).toBe(true);
    expect(domainAcceptable({ candidateDomain: "lsuhs.edu", officialDomain: "", trusted: new Set(), selfIdentifies: false })).toBe(false);
  });
});

describe("pageMatchesProfession", () => {
  // Cleveland State's Psychology B.A. and Nursing B.S.N. catalogue pages both carry science
  // subjects and the word "prerequisite", and were nearly attached to nursing, occupational
  // therapy and speech-language pathology rows.
  const psychologyPage = "Program: Psychology, B.A. Prerequisite courses include biology, chemistry and statistics.";
  const nursingPage = "Program: Nursing, B.S.N. Prerequisite courses include anatomy, physiology and microbiology.";

  it("rejects a page belonging to a different programme", () => {
    expect(pageMatchesProfession(psychologyPage, "nursing")).toBe(false);
    expect(pageMatchesProfession(nursingPage, "occupational-therapy")).toBe(false);
    expect(pageMatchesProfession(nursingPage, "speech-language-pathology")).toBe(false);
  });

  it("accepts a page that names the profession", () => {
    expect(pageMatchesProfession(nursingPage, "nursing")).toBe(true);
    expect(
      pageMatchesProfession("Master of Science in Speech-Language Pathology prerequisite coursework", "speech-language-pathology"),
    ).toBe(true);
  });

  // Programmes describe entry coursework in their own vocabulary; a page is not disqualified
  // for saying "communicative sciences" rather than "speech".
  it("accepts the vocabulary a programme actually uses", () => {
    expect(pageMatchesProfession("Department of Communicative Sciences and Disorders leveling courses", "speech-language-pathology")).toBe(true);
    expect(pageMatchesProfession("Post-baccalaureate premedical programme required coursework", "postbac")).toBe(true);
  });
});
