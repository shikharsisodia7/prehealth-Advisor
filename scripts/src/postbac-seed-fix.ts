/**
 * Put every postbac row back on the URL its own directory entry names.
 *
 * These rows come from AAMC's postbac directory, which publishes a programme URL for all 338
 * entries. 47 of the 58 unfinished rows had drifted onto some other page, and the drift is not
 * merely unhelpful -- several point at a different programme at the same university: Buffalo's
 * postbac row cited the MD prerequisite page, West Virginia's cited physician assistant
 * prerequisites, and four Northern Colorado rows all cited the osteopathic medicine admissions
 * page. Extraction succeeding on any of those would have attached another programme's
 * requirements to a postbac row.
 *
 * Verified rows are reported, never rewritten: a verified row already carries evidence, and
 * whether that evidence is sound is a separate question from which URL the directory names.
 */
import { sql, eq } from "drizzle-orm";
import { db, programSchoolsTable } from "@workspace/db";
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const dataDir = path.join(process.cwd(), "..", "data");
const dir = JSON.parse(fs.readFileSync(path.join(dataDir, "directories", "postbac.json"), "utf8"));
const byId = new Map<string, any>(dir.programs.map((p: any) => [String(p.externalId), p]));

/** AAMC stores a few entries with a doubled scheme ("http://https://sites.wustl.edu/..."). */
function normalize(u: string): string {
  return u.trim().replace(/^https?:\/\/(?=https?:\/\/)/i, "");
}
/** Two URLs are the same page when only the scheme or a trailing slash differs. */
function samePage(a: string, b: string): boolean {
  const strip = (x: string) => x.replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();
  return strip(a) === strip(b);
}

const rows = await db.execute(sql.raw(`
  select id, name, verification_status vs, coalesce(external_id,'') ext,
         coalesce(source_url,'') s, coalesce(website_url,'') w
  from program_schools
  where directory_status='active' and profession_slug='postbac' order by name`));

const log: string[] = [];
let fixed = 0, verifiedDiffer = 0, ok = 0;
for (const r of rows.rows as any[]) {
  const p = byId.get(String(r.ext));
  if (!p?.websiteUrl) continue;
  const aamc = normalize(String(p.websiteUrl));
  const cur = String(r.s || r.w);
  if (cur && samePage(cur, aamc)) { ok++; continue; }

  const unfinished = ["draft", "needs_review", "imported", "outdated"].includes(String(r.vs));
  if (!unfinished) {
    verifiedDiffer++;
    console.log(`VERIFIED-DIFFERS ${String(r.id).padStart(5)} ${String(r.name).slice(0, 34).padEnd(36)} ${r.vs}`);
    console.log(`   stored: ${cur}`);
    console.log(`     aamc: ${aamc}  [${p.programName}]`);
    continue;
  }

  fixed++;
  console.log(`FIX ${String(r.id).padStart(5)} ${String(r.name).slice(0, 34).padEnd(36)} -> ${aamc}`);
  if (!APPLY) continue;
  log.push(JSON.stringify({ id: r.id, name: r.name, at: new Date().toISOString(), priorSource: r.s, priorWebsite: r.w, newUrl: aamc, reason: "restored to the URL the AAMC postbac directory publishes for this programme" }));
  await db.update(programSchoolsTable)
    .set({ sourceUrl: aamc, websiteUrl: aamc })
    .where(eq(programSchoolsTable.id, r.id));
}
if (APPLY && log.length) fs.appendFileSync(path.join(dataDir, "seed-corrections.jsonl"), log.join("\n") + "\n");
console.log(`\nPOSTBAC total=${rows.rows.length} alreadyCorrect=${ok} unfinishedFixed=${fixed} verifiedDiffering=${verifiedDiffer} applyMode=${APPLY}`);
process.exit(0);
