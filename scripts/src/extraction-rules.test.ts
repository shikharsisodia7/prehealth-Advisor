import { describe, expect, it } from "vitest";
import { NO_PREREQ_ASSERTION, entityLabelMatchesInstitution } from "./extraction-rules.js";

describe("entityLabelMatchesInstitution", () => {
  // Accepting an authoritative official-website claim for these is the only way rows with no
  // stored seed ever get a candidate URL; their domains are acronyms that share no text with
  // the school name, so a domain-spelling check rejects the correct answer.
  it.each([
    ["Cleveland State University", "Cleveland State University"],
    ["Cleveland State University", "Cleveland State University School of Nursing"],
    ["University of North Texas", "University of North Texas Health Science Center"],
    ["University of Texas at San Antonio", "The University of Texas at San Antonio"],
    ["Iowa State University", "Iowa State University"],
    ["Appalachian State University", "Appalachian State University"],
    // Directory data hyphenates the campus where Wikidata writes "at".
    ["University of North Carolina at Greensboro", "University of North Carolina-Greensboro"],
    // Single distinctive word, but the name contains the label as a phrase: these are the
    // donor-named schools whose parent is a one-word institution.
    ["Boston University", "Boston University Aram V. Chobanian & Edward Avedisian School of Medicine"],
    ["Yale University", "Yale University School of Medicine"],
  ])("matches the same institution: %s ~ %s", (label, name) => {
    expect(entityLabelMatchesInstitution(label, name)).toBe(true);
  });

  // A wrong match would attach another school's website, and every prerequisite discovered
  // through it would belong to the wrong institution.
  it.each([
    ["Ohio State University", "Cleveland State University"],
    ["Harvard University", "Yale University"],
    ["University of North Carolina at Chapel Hill", "University of North Carolina-Greensboro"],
    // A single shared word cannot establish identity, so these fall back to the host-name
    // heuristic rather than being trusted outright.
    ["Michigan State University", "University of Michigan"],
    ["Miami University", "University of Miami"],
    // The parent system is not the campus: accepting it attached northcarolina.edu (the UNC
    // system) to the Greensboro nursing program instead of uncg.edu.
    ["University of North Carolina", "University of North Carolina-Greensboro"],
    ["University of California", "University of California, San Diego"],
    ["Pennsylvania State University", "Pennsylvania State University-Harrisburg"],
  ])("rejects a different institution: %s vs %s", (label, name) => {
    expect(entityLabelMatchesInstitution(label, name)).toBe(false);
  });
});

describe("NO_PREREQ_ASSERTION", () => {
  // Genuine official statements that a program publishes no required coursework.
  // Phrasings without the literal token "prerequis-" are the regression: they used to be
  // rejected, so programs whose official page answered the question directly still failed
  // as "no usable prereq list".
  it.each([
    "There are no prerequisite courses for this program.",
    "Please note that we no longer require course prerequisites or GRE scores.",
    "There are no specific course requirements for admission.",
    "We do not require specific courses for entry into the program.",
    "No required coursework is specified for applicants.",
    "Prerequisites are not required for this certificate.",
    "The program does not require prerequisite coursework.",
  ])("accepts an explicit no-coursework statement: %s", (quote) => {
    expect(NO_PREREQ_ASSERTION.test(quote)).toBe(true);
  });

  // Statements that describe requirements must never be read as "no prerequisites",
  // otherwise a program with real coursework would be recorded as having none.
  it.each([
    "Applicants must complete Biology I and II with labs.",
    "Prerequisite courses must be completed before matriculation.",
    "A minimum GPA of 3.0 is required for admission.",
    "The following prerequisite courses are required: Anatomy, Physiology.",
    "Students should consult an advisor about required coursework.",
    "All prerequisites must be completed with a grade of C or better.",
  ])("rejects a statement that describes requirements: %s", (quote) => {
    expect(NO_PREREQ_ASSERTION.test(quote)).toBe(false);
  });
});
