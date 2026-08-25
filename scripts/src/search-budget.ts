/**
 * Persistent spend tracking for the metered search providers.
 *
 * Serper and Tavily are free-tier keys with a fixed lifetime allowance (roughly 2,500 and
 * 1,000 queries). The worker restarts constantly -- every supervisor round spawns a fresh
 * process -- so an in-memory counter would reset each time and the allowance could be spent
 * many times over without anyone noticing. Usage is therefore written to disk and reloaded,
 * and each provider stops being offered once its cap is reached.
 *
 * The caps are deliberately below the true allowance so there is always reserve left for
 * re-verification later.
 */
import fs from "node:fs";
import path from "node:path";

export interface SearchBudgetState {
  serper: number;
  tavily: number;
  updatedAt: string;
}

const DEFAULT_CAPS = { serper: 2_000, tavily: 800 } as const;

export class SearchBudget {
  private state: SearchBudgetState;
  private readonly file: string;
  readonly caps: { serper: number; tavily: number };

  constructor(file: string, caps: { serper: number; tavily: number } = { ...DEFAULT_CAPS }) {
    this.file = file;
    this.caps = caps;
    this.state = { serper: 0, tavily: 0, updatedAt: new Date().toISOString() };
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<SearchBudgetState>;
      this.state = {
        serper: Number(raw.serper) || 0,
        tavily: Number(raw.tavily) || 0,
        updatedAt: raw.updatedAt ?? this.state.updatedAt,
      };
    } catch {
      /* first run: no file yet */
    }
  }

  remaining(provider: "serper" | "tavily"): number {
    return Math.max(0, this.caps[provider] - this.state[provider]);
  }

  canSpend(provider: "serper" | "tavily"): boolean {
    return this.remaining(provider) > 0;
  }

  /** Record one query against a provider and persist immediately. */
  spend(provider: "serper" | "tavily"): void {
    this.state[provider] += 1;
    this.state.updatedAt = new Date().toISOString();
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.state, null, 2));
    } catch {
      /* a failed write must never abort a program; worst case the count is under-reported */
    }
  }

  summary(): string {
    return `serper ${this.state.serper}/${this.caps.serper}, tavily ${this.state.tavily}/${this.caps.tavily}`;
  }
}
