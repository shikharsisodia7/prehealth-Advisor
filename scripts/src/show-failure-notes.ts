/** Print the recorded failure reason for unfinished rows, so the next move is chosen from evidence. */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
const only = process.argv.find((a) => a.startsWith("--profession="))?.split("=")[1] ?? "";
const rows = await db.execute(sql.raw(`
  select id, name, coalesce(verification_note,'') n from program_schools
  where directory_status='active' and verification_status in ('draft','needs_review','imported','outdated')
    ${only ? `and profession_slug='${only}'` : ""} order by id`));
const buckets: Record<string, number> = {};
for (const r of rows.rows as any[]) {
  const n = String(r.n);
  const key = /no usable prereq list/.test(n) ? "read the page, no enumerable list"
    : /HTTP 4\d\d|HTTP 5\d\d/.test(n) ? "source returned an error status"
    : /render failed|too little text/.test(n) ? "page could not be read"
    : /^Reset /.test(n) ? "reset, awaiting re-extraction"
    : /^Added /.test(n) ? "newly added, not yet attempted"
    : n.trim() === "" ? "never attempted" : "other";
  buckets[key] = (buckets[key] ?? 0) + 1;
}
for (const [k, v] of Object.entries(buckets).sort((a, b) => b[1] - a[1])) console.log(`${String(v).padStart(3)}  ${k}`);
console.log(`TOTAL ${rows.rows.length}`);
process.exit(0);
