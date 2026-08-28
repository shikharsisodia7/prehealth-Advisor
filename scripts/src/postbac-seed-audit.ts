/**
 * Compare each unfinished postbac row against the URL the AAMC directory publishes for it.
 *
 * These rows were imported from AAMC's postbac directory, which gives a programme URL for all
 * 338 entries. Several rows are instead sitting on a generic page picked up later -- a university
 * international-admission page, a 2018 blog post -- which is why extraction has nothing to read.
 * The directory's own URL is the better seed and needs no search to obtain.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import fs from "node:fs";
import path from "node:path";

const dir = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "data", "directories", "postbac.json"), "utf8"));
const byId = new Map<string, any>(dir.programs.map((p: any) => [String(p.externalId), p]));

const rows = await db.execute(sql.raw(`
  select id, name, coalesce(external_id,'') ext, coalesce(source_url,'') s, coalesce(website_url,'') w
  from program_schools
  where directory_status='active' and profession_slug='postbac'
    and verification_status in ('draft','needs_review','imported','outdated')
  order by name`));

let same = 0, differs = 0, missing = 0;
for (const r of rows.rows as any[]) {
  const p = byId.get(String(r.ext));
  if (!p) { console.log(`NOEXT  ${r.id} ${String(r.name).slice(0, 40)} ext=${r.ext || "(none)"}`); missing++; continue; }
  const aamc = String(p.websiteUrl ?? "");
  const cur = String(r.s || r.w);
  if (cur && cur.replace(/\/$/, "") === aamc.replace(/\/$/, "")) { same++; continue; }
  differs++;
  console.log(`DIFFER ${String(r.id).padStart(5)} ${String(r.name).slice(0, 38).padEnd(40)}`);
  console.log(`   now: ${cur || "(none)"}`);
  console.log(`  aamc: ${aamc}  [${p.programName}]`);
}
console.log(`\nUNFINISHED=${rows.rows.length} alreadyAamcUrl=${same} differs=${differs} noDirectoryEntry=${missing}`);
process.exit(0);
