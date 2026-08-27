/**
 * Add the speech-language pathology programmes ASHA accredits that this dataset does not hold.
 *
 * Retiring the historically accredited programmes made the gap visible: ASHA lists 337
 * programmes with a current status and the dataset held 298. The missing ones are real schools
 * -- DePaul, Grand Canyon, Binghamton, Augusta -- most of them accredited since the original
 * import, several still in candidacy.
 *
 * Adds them as active rows with the programme page ASHA lists, so extraction can run normally.
 * Nothing about their prerequisites is assumed here.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const LISTING = "https://apps.asha.org/eweb/ashadynamicpage.aspx?caacat=slp&site=ashacms&webcode=caalisting";

const html = fs.readFileSync(path.join(process.cwd(), "..", "qa", "asha-slp.html"), "utf8");
const boxes = html.split('<div class="caa-program-box">').slice(1);
const strip = (s: string) =>
  s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

interface Entry { name: string; status: string; degree: string; state: string; city: string; website: string }

const entries: Entry[] = [];
for (const b of boxes) {
  const name = /<h3[^>]*>([\s\S]*?)<\/h3>/.exec(b)?.[1];
  const status = /<span class="label[^"]*"><strong>([\s\S]*?)<\/strong><\/span>/.exec(b)?.[1];
  if (!name || !status) continue;
  const text = strip(b.slice(0, 9000));
  // "... 2400 North Sheffield Ave Chicago, IL 60614 Phone Number ..."
  const loc = /([A-Za-z.'\- ]+),\s*([A-Z]{2})\s+\d{5}/.exec(text);
  // Take the link the entry labels "Website", not merely the first link in the box. Entries
  // awaiting candidacy lead with ASHA's own call-for-public-comments page, and seeding a
  // programme with the accreditor's page is the wrong-institution problem in a new coat.
  const websiteSection = /Website[\s\S]{0,200}?href="(https?:\/\/[^"]+)"/.exec(b.slice(0, 9000))?.[1] ?? "";
  const website = /(^|\.)asha\.org/i.test(websiteSection) ? "" : websiteSection;
  const degree = /Master's in Speech-Language Pathology \(([^)]+)\)/.exec(text)?.[1] ?? "MS";
  entries.push({
    name: strip(name),
    status: strip(status),
    degree,
    city: loc ? loc[1]!.trim().split(/\s{2,}/).pop()!.trim() : "",
    state: loc ? loc[2]! : "",
    website,
  });
}

const current = entries.filter((e) => e.status !== "Historically Accredited");
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const rows = await db.execute(sql.raw(`select name from program_schools where profession_slug='speech-language-pathology' and directory_status='active'`));
const have = new Set((rows.rows as any[]).map((r) => norm(String(r.name))));

const missing = current.filter((c) => {
  const k = norm(c.name);
  if (have.has(k)) return false;
  for (const h of have) if (h.startsWith(k) || k.startsWith(h)) return false;
  return true;
});

console.log(`ASHA_CURRENT=${current.length} DB_ACTIVE=${have.size} MISSING=${missing.length}`);

let added = 0;
let skipped = 0;
for (const m of missing) {
  if (!m.state) { skipped++; console.log(`SKIP  ${m.name} (no state parsed — not added rather than guessed)`); continue; }
  const esc = (s: string) => s.replace(/'/g, "''");
  console.log(`ADD   ${m.name.slice(0, 42).padEnd(44)} ${m.state}  ${m.status.padEnd(26)} ${m.website.slice(0, 58)}`);
  if (APPLY) {
    await db.execute(sql.raw(`
      insert into program_schools
        (profession_slug, name, program_name, city, state, source_url, website_url,
         verification_status, prereq_courses, prereq_sources, directory_status, directory_source,
         aliases, last_directory_verified, verification_note)
      values
        ('speech-language-pathology', '${esc(m.name)}', 'Master''s in Speech-Language Pathology (${esc(m.degree)})',
         ${m.city ? `'${esc(m.city)}'` : "null"}, '${esc(m.state)}',
         ${m.website ? `'${esc(m.website)}'` : "null"}, ${m.website ? `'${esc(m.website)}'` : "null"},
         'draft', '[]'::jsonb, '[]'::jsonb, 'active',
         'ASHA CAA Accredited SLP Master''s Programs', '[]'::jsonb, current_date,
         'Added 2026-08-27 from the ASHA CAA listing, which records this programme as "${esc(m.status)}". It was absent from the original import. Source: ${esc(LISTING)}')`));
    added++;
  }
}
console.log(`\nADDED=${added} SKIPPED=${skipped} applyMode=${APPLY}`);
process.exit(0);
