/**
 * Reconcile speech-language pathology rows against ASHA's current accreditation status.
 *
 * ASHA's CAA listing gives each programme a status. "Historically Accredited" means the
 * programme is no longer accredited, and several of ours are in that state -- which is why no
 * prerequisites could ever be found for them. Carrying them as unfinished presents them to a
 * student as programmes they could apply to.
 *
 * Reads the rendered listing saved by fetch-asha-listing.ts. Parsing happens here rather than
 * inside the browser because a regex written into an evaluate string is one escaping mistake
 * away from silently stripping characters.
 *
 * Reports by default; --apply marks matched rows inactive, citing the directory.
 */
import { sql, eq } from "drizzle-orm";
import { db, programSchoolsTable } from "@workspace/db";
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const LISTING = "https://apps.asha.org/eweb/ashadynamicpage.aspx?caacat=slp&site=ashacms&webcode=caalisting";
const htmlPath = path.join(process.cwd(), "..", "qa", "asha-slp.html");

const html = fs.readFileSync(htmlPath, "utf8");
const boxes = html.split('<div class="caa-program-box">').slice(1);
const strip = (s: string) =>
  s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, " ").trim();

const statuses: Array<{ name: string; status: string }> = [];
for (const b of boxes) {
  const name = /<h3[^>]*>([\s\S]*?)<\/h3>/.exec(b)?.[1];
  const status = /<span class="label[^"]*"><strong>([\s\S]*?)<\/strong><\/span>/.exec(b)?.[1];
  if (name && status) statuses.push({ name: strip(name), status: strip(status) });
}
const historic = statuses.filter((s) => s.status === "Historically Accredited").map((s) => s.name);
console.log(`DIRECTORY_PROGRAMS=${statuses.length} HISTORICALLY_ACCREDITED=${historic.length}`);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const historicKeys = historic.map((h) => ({ raw: h, key: norm(h) }));

const rows = await db.execute(sql.raw(`
  select id, name, verification_status, jsonb_array_length(coalesce(prereq_courses,'[]'::jsonb)) pc
  from program_schools
  where profession_slug='speech-language-pathology' and directory_status='active'
  order by name`));

let matched = 0;
for (const r of rows.rows as any[]) {
  const key = norm(String(r.name));
  // Exact or whole-prefix match only. A substring test would pair "College of Saint Rose" with
  // any other college, and the point of this pass is to stop mistaking one school for another.
  const hit = historicKeys.find((h) => h.key === key || key.startsWith(h.key) || h.key.startsWith(key));
  if (!hit) continue;
  matched++;
  console.log(`STALE ${String(r.id).padStart(5)} ${String(r.name).slice(0, 44).padEnd(46)} [${r.verification_status}, ${r.pc} prereqs] ~ "${hit.raw}"`);
  if (APPLY) {
    await db.update(programSchoolsTable)
      .set({
        directoryStatus: "inactive",
        verificationNote: `Marked inactive 2026-08-27: ASHA's CAA listing records this programme as "Historically Accredited", meaning it is no longer accredited. Prerequisites could not be found because the programme is not admitting students, and showing it as one to apply to would mislead. Source: ${LISTING}`,
      })
      .where(eq(programSchoolsTable.id, r.id));
  }
}
console.log(`\nMATCHED=${matched} applyMode=${APPLY}`);
process.exit(0);
