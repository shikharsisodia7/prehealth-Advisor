import { describe, it, expect } from "vitest";
import { getSafeRedirectPath, buildSignInUrl } from "./redirect";

describe("getSafeRedirectPath", () => {
  it("accepts a plain internal path", () => {
    expect(getSafeRedirectPath("/manual-search")).toBe("/manual-search");
  });

  it("accepts an internal path with a query string", () => {
    expect(getSafeRedirectPath("/professions/nursing?state=CA")).toBe(
      "/professions/nursing?state=CA",
    );
  });

  it("falls back to / for nothing given", () => {
    expect(getSafeRedirectPath(null)).toBe("/");
    expect(getSafeRedirectPath(undefined)).toBe("/");
    expect(getSafeRedirectPath("")).toBe("/");
  });

  it("rejects a protocol-relative host escape", () => {
    expect(getSafeRedirectPath("//evil.example.com")).toBe("/");
  });

  it("rejects a backslash host escape", () => {
    expect(getSafeRedirectPath("/\\evil.example.com")).toBe("/");
    expect(getSafeRedirectPath("\\\\evil.example.com")).toBe("/");
  });

  it("rejects an absolute URL with a scheme", () => {
    expect(getSafeRedirectPath("https://evil.example.com")).toBe("/");
    expect(getSafeRedirectPath("javascript:alert(1)")).toBe("/");
  });

  it("rejects a path not starting with a single slash", () => {
    expect(getSafeRedirectPath("manual-search")).toBe("/");
  });

  it("rejects embedded CR/LF", () => {
    expect(getSafeRedirectPath("/manual-search\r\nSet-Cookie: x")).toBe("/");
  });
});

describe("buildSignInUrl", () => {
  it("returns a bare sign-in URL for the app root", () => {
    expect(buildSignInUrl("", "/")).toBe("/sign-in");
  });

  it("preserves a deep-linked protected path as redirect_url", () => {
    expect(buildSignInUrl("", "/manual-search")).toBe(
      "/sign-in?redirect_url=%2Fmanual-search",
    );
  });

  it("respects a non-empty base path", () => {
    expect(buildSignInUrl("/app", "/app/manual-search")).toBe(
      "/app/sign-in?redirect_url=%2Fapp%2Fmanual-search",
    );
  });
});
