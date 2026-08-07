import fs from "node:fs";
async function main() {
  const state = JSON.parse(fs.readFileSync("../data/completion-state.json", "utf8"));
  for (const [id, s] of Object.entries(state) as [string, any][]) {
    if (s.stage === "failed") { s.attempts = 0; delete state[id]; }
  }
  fs.writeFileSync("../data/completion-state.json", JSON.stringify(state, null, 1));
  console.log("failed states cleared");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
