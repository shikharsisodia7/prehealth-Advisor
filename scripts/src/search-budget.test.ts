import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SearchBudget } from "./search-budget.js";

function tmpFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "budget-")), "usage.json");
}

describe("SearchBudget", () => {
  it("stops offering a provider once its cap is reached", () => {
    const b = new SearchBudget(tmpFile(), { serper: 2, tavily: 1 });
    expect(b.canSpend("serper")).toBe(true);
    b.spend("serper");
    b.spend("serper");
    expect(b.canSpend("serper")).toBe(false);
    expect(b.remaining("serper")).toBe(0);
    // Providers are budgeted independently.
    expect(b.canSpend("tavily")).toBe(true);
  });

  // The worker restarts on every supervisor round, so an in-memory counter would reset and
  // the free allowance could be spent many times over.
  it("carries usage across process restarts", () => {
    const file = tmpFile();
    const first = new SearchBudget(file, { serper: 3, tavily: 3 });
    first.spend("serper");
    first.spend("serper");

    const second = new SearchBudget(file, { serper: 3, tavily: 3 });
    expect(second.remaining("serper")).toBe(1);
    second.spend("serper");
    expect(second.canSpend("serper")).toBe(false);
  });

  it("starts from zero when no usage file exists yet", () => {
    const b = new SearchBudget(tmpFile(), { serper: 5, tavily: 5 });
    expect(b.remaining("serper")).toBe(5);
    expect(b.remaining("tavily")).toBe(5);
  });

  it("treats a corrupt usage file as zero usage rather than throwing", () => {
    const file = tmpFile();
    fs.writeFileSync(file, "{ not json");
    const b = new SearchBudget(file, { serper: 4, tavily: 4 });
    expect(b.remaining("serper")).toBe(4);
  });
});
