/**
 * Deterministic queue of every unfinished active program, with the evidence needed to decide
 * what each one actually needs -- identity correction, a different source, or documentation.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import fs from "node:fs";
import path from "node:path";

const r = await db.execute(sql.raw(`
  select id, profession_slug, name, program_name, city, state, degree_type,
         coalesce(website_url,'') website_url, coalesce(source_url,'') source_url,
         verification_status, coalesce(verification_note,'') note,
         directory_source, coalesce(last_verified::text,'') last_verified
  from program_schools
  where directory_status='active' and verification_status in ('draft','imported','needs_review','outdated')
  order by profession_slug, name`));

let evidence: Record<string, any> = {};
try {
  const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "data", "unfinished-evidence.json"), "utf8"));
  for (const e of raw) evidence[String(e.id)] = e;
} catch { /* evidence pass may not have run */ }

const rows = (r.rows as any[]).map((x) => {
  const ev = evidence[String(x.id)];
  const verdict: string = ev?.verdict ?? "not probed";
  const note = String(x.note);
  const host = (() => { try { return new URL(x.website_url).hostname; } catch { return ""; } })();

  // Category assignment drives what kind of work the row needs, not how hard it looked.
  let category: string;
  if (!x.website_url && !x.source_url) category = "A-no-source";
  else if (verdict === "course list present — retry extraction") category = "J-extraction-failure";
  else if (verdict === "explicit no-prereq statement") category = "I-no-prereqs-claimed";
  else if (verdict === "all sources unreadable") category = "D-unreachable";
  else if (verdict === "references prerequisites but publishes no list") category = "B-list-elsewhere";
  else if (/\.gov|\.jo|ox\.ac\.uk|sanantonio/i.test(x.website_url)) category = "E-wrong-seed";
  else category = "A-source-not-found";

  return {
    id: x.id, profession: x.profession_slug, institution: x.name, program: x.program_name,
    state: x.state, city: x.city, degreeType: x.degree_type,
    websiteUrl: x.website_url, sourceUrl: x.source_url, host,
    status: x.verification_status, directorySource: x.directory_source,
    lastVerified: x.last_verified, verdict, category,
    lastError: (note.match(/Errors:([\s\S]*)$/)?.[1] ?? "").trim().slice(0, 200),
  };
});

fs.writeFileSync(path.join(process.cwd(), "..", "data", "tail-queue.json"), JSON.stringify(rows, null, 2));
const byCat: Record<string, number> = {};
const byProf: Record<string, number> = {};
for (const x of rows) { byCat[x.category] = (byCat[x.category] ?? 0) + 1; byProf[x.profession] = (byProf[x.profession] ?? 0) + 1; }
console.log("TOTAL " + rows.length);
console.log("-- by category --");
for (const [k, v] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(4) + "  " + k);
console.log("-- by profession --");
for (const [k, v] of Object.entries(byProf).sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(4) + "  " + k);
process.exit(0);
