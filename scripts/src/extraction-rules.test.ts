import { describe, expect, it } from "vitest";
import { NO_PREREQ_ASSERTION } from "./extraction-rules.js";

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
