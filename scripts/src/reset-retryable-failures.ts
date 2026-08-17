/**
 * reset-retryable-failures.ts
 * Resets completion-state failed entries that should succeed with current worker fixes.
 * Safe to run offline (no DATABASE_URL required).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, "../../data/completion-state.json");

const RETRYABLE =
  /Invalid URL|http:\/\/:|http:\/\/\s*$|\.gov\/|texas\.gov|virginia\.gov|louisiana\.gov|myflorida|transfer\.html|international-student|prospective-students|admissions-events|precollege|undergraduate-admissions|too little text|HTTP 403|HTTP 401|HTTP 404|fetch failed|no usable prereq list|no official candidate URLs|PDF extract failed|PDF source requires Firecrawl|Jina reader|Keenable|academic-catalog\.php|core-curriculum|pennwest\.edu|www\.twu\.edu/i;

type Stage = "unstarted" | "failed" | string;
interface ProgramState {
  stage: Stage;
  lastAttempt: string;
  attempts: number;
  error?: string;
  sourceUrl?: string;
  finalStatus?: string;
}

function main() {
  const state: Record<string, ProgramState> = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  let reset = 0;
  for (const [id, s] of Object.entries(state)) {
    if (s.stage === "source_discovery" || s.stage === "source_fetched" || s.stage === "extracted") {
      state[id] = { ...s, stage: "unstarted", error: "reset interrupted in-flight attempt" };
      reset++;
      continue;
    }
    if (s.stage !== "failed" || !s.error) continue;
    if (!RETRYABLE.test(s.error)) continue;
    state[id] = {
      ...s,
      stage: "unstarted",
      attempts: Math.max(0, (s.attempts ?? 1) - 1),
      error: `reset for improved discovery: ${s.error.slice(0, 120)}`,
      sourceUrl: undefined,
    };
    reset++;
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
  console.log(`Reset ${reset} retryable failed entries in ${STATE_FILE}`);
}

main();
