import { describe, it, expect } from "vitest";
import { APP_NAME, APP_DESCRIPTION, APP_LOGO, APP_LOGO_ALT } from "./site-config";

describe("site-config — branding", () => {
  it("uses the professor's exact product title", () => {
    expect(APP_NAME).toBe("SCU Health Professions – Prerequisite Course Planner");
  });

  it("uses the professor's exact Version 2 intro sentence", () => {
    expect(APP_DESCRIPTION).toBe(
      "Use this tool to quickly find prerequisite courses for your target health professions programs.",
    );
  });

  it("APP_LOGO is a real asset path, not the old placeholder", () => {
    expect(APP_LOGO).not.toBeNull();
    expect(APP_LOGO).toBe("/branding/scu-health-professions-advising.png");
  });

  it("has meaningful alt text for the logo", () => {
    expect(APP_LOGO_ALT).toBe("SCU Health Professions Advising");
  });
});
