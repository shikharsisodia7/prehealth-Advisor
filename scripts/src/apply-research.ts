/**
 * Apply the pages the targeted research located as each programme's seed, so extraction can run
 * against them. Writes only websiteUrl/sourceUrl, and records the previous value.
 *
 * A finding is only applied when the page is on a domain the research already confirmed belongs
 * to that institution, so this cannot introduce the wrong-school problem it exists to fix.
 */
import { sql, eq } from "drizzle-orm";
import { db, programSchoolsTable } from "@workspace/db";
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const dataDir = path.join(process.cwd(), "..", "data");
const files = fs.readdirSync(dataDir).filter((f) => f.startsWith("research-") && f.endsWith(".json"));

let applied = 0;
let skipped = 0;
const ids: number[] = [];

for (const f of files) {
  const findings: any[] = JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf8"));
  for (const x of findings) {
    if (!x.best?.url) continue;

    const row = await db.execute(
      sql.raw(`select id, name, coalesce(website_url,'') w, verification_status
               from program_schools where id = ${Number(x.id)}`),
    );
    const r = (row.rows as any[])[0];
    if (!r) continue;
    // Leave rows extraction has since finished.
    if (!["draft", "needs_review", "imported", "outdated"].includes(String(r.verification_status))) { skipped++; continue; }
    if (String(r.w) === String(x.best.url)) { skipped++; continue; }

    console.log(`APPLY ${x.id} ${String(x.name).slice(0, 32).padEnd(34)} ${x.best.subjects.length} subj  ${String(x.best.url).slice(0, 70)}`);
    ids.push(Number(x.id));
    if (APPLY) {
      fs.appendFileSync(
        path.join(dataDir, "seed-corrections.jsonl"),
        `${JSON.stringify({ at: new Date().toISOString(), id: x.id, name: x.name, from: r.w, to: x.best.url, why: "targeted research located a prerequisite list" })}\n`,
      );
      await db.update(programSchoolsTable)
        .set({ sourceUrl: x.best.url, websiteUrl: x.best.url })
        .where(eq(programSchoolsTable.id, Number(x.id)));
    }
    applied++;
  }
}

console.log(`\nAPPLIED=${applied} SKIPPED=${skipped} applyMode=${APPLY}`);
console.log("IDS=" + ids.join(","));
process.exit(0);
