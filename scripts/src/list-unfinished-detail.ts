/** Unfinished active rows with the detail needed to research them by hand: field, name, state, and the source last tried. */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const only = process.argv.find((a) => a.startsWith("--profession="))?.split("=")[1];
const rows = await db.execute(sql.raw(`
  select id, profession_slug p, name, coalesce(program_name,'') pn, coalesce(state,'') st, coalesce(source_url,'') s
  from program_schools
  where directory_status='active' and verification_status in ('draft','needs_review','imported','outdated')
    ${only ? `and profession_slug ${only.startsWith("!") ? "<>" : "="} '${only.replace(/^!/, "")}'` : ""}
  order by profession_slug, name`));
for (const x of rows.rows as any[]) {
  console.log(`${String(x.id).padStart(5)} ${String(x.p).padEnd(20)} ${String(x.name).slice(0, 40).padEnd(42)} ${x.st}`);
  console.log(`      ${x.s || "(no source)"}`);
}
console.log(`TOTAL ${rows.rows.length}`);
process.exit(0);
