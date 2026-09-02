import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { APP_LOGO } from "./site-config";

// APP_LOGO is a public-root-relative path (e.g. "/branding/x.png"); resolve
// it against the frontend package's public/ directory, which Vite serves
// verbatim at that path.
const publicDir = path.resolve(fileURLToPath(new URL("../../public", import.meta.url)));
const logoPath = path.join(publicDir, APP_LOGO!.replace(/^\//, ""));

describe("logo asset", () => {
  it("the cleaned logo PNG exists in public/", () => {
    expect(existsSync(logoPath)).toBe(true);
  });

  it("is a real PNG with an alpha channel (not the flat JPEG the professor supplied)", () => {
    const buf = readFileSync(logoPath);
    // PNG signature
    expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    // IHDR color type byte: 25 = grayscale+alpha, 6 = RGBA
    const colorType = buf.readUInt8(25);
    expect([4, 6]).toContain(colorType);
  });
});
