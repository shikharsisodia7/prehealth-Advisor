import { describe, it, expect } from "vitest";
import { PLANNER_GUIDANCE, PLANNER_DISCLAIMER, PLANNER_ATTRIBUTION } from "./planner-copy";

describe("planner-copy — Version 2 professor content", () => {
  it("has exactly the five Version 2 guidance bullets, in order", () => {
    expect(PLANNER_GUIDANCE.map((g) => g.title)).toEqual([
      "Research Early",
      "Start In-State",
      "Verify Missing Data",
      "Export Your List",
      "Seek Advising Support",
    ]);
  });

  it("Research Early matches the professor's exact wording", () => {
    const item = PLANNER_GUIDANCE.find((g) => g.title === "Research Early");
    expect(item?.body).toBe(
      "Review at least 10 programs during your first year. Prerequisites can vary, so checking specific schools is the only way to ensure you meet the requirements for programs you are interested in.",
    );
  });

  it("Start In-State matches the professor's exact wording", () => {
    const item = PLANNER_GUIDANCE.find((g) => g.title === "Start In-State");
    expect(item?.body).toBe(
      "Begin with programs in your home state, which typically offer lower tuition for residents. Then select 10 or more additional programs to review their prerequisites.",
    );
  });

  it("Verify Missing Data matches the professor's exact wording", () => {
    const item = PLANNER_GUIDANCE.find((g) => g.title === "Verify Missing Data");
    expect(item?.body).toBe(
      "Occasionally, the prerequisites for specific programs do not appear in your search. Use this document or the link provided by the application to search any health profession programs manually. Match out-of-institution course titles to the equivalent SCU curriculum.",
    );
  });

  it("Export Your List matches the professor's exact wording", () => {
    const item = PLANNER_GUIDANCE.find((g) => g.title === "Export Your List");
    expect(item?.body).toBe(
      "Save your search as an Excel file to easily access direct program links and prerequisite course lists organized in separate sheets.",
    );
  });

  it("Seek Advising Support matches the professor's exact wording", () => {
    const item = PLANNER_GUIDANCE.find((g) => g.title === "Seek Advising Support");
    expect(item?.body).toBe(
      "See Health Professions Advising and Peer Advising to discuss how to integrate prerequisites into your degree planning.",
    );
  });

  it("disclaimer matches the professor's exact wording", () => {
    expect(PLANNER_DISCLAIMER).toBe(
      "Note: This planner supports early academic planning. It does not rank programs, predict admission chances, or recommend where to apply.",
    );
  });

  it("attribution is Dr. McNelis", () => {
    expect(PLANNER_ATTRIBUTION).toBe("— Dr. McNelis");
  });

  it("does not contain Version 1 phrasing", () => {
    const all = JSON.stringify(PLANNER_GUIDANCE) + PLANNER_DISCLAIMER + PLANNER_ATTRIBUTION;
    // Phrases unique to Version 1 of the professor's document that must not
    // leak into the Version 2 content he explicitly asked us to use.
    expect(all).not.toContain("Our recommendation is that in your first year");
    expect(all).not.toContain("For many health professions programs there is not uniform set");
    expect(all).not.toContain("predict admission, or recommend where you should apply");
  });
});
