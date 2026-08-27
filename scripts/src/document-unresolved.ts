/**
 * Write a per-programme account of everything still unfinished, so no active row is left as a
 * bare "unfinished" with nothing said about it.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import fs from "node:fs";
import path from "node:path";

const rows = await db.execute(sql.raw(`
  select id, profession_slug, name, program_name, state, coalesce(source_url,'') s,
         coalesce(verification_note,'') n, directory_source
  from program_schools
  where directory_status='active' and verification_status in ('draft','needs_review','imported','outdated')
  order by profession_slug, name`));

function cause(note: string, source: string): string {
  if (!note.trim()) return source ? "not yet attempted since its source was corrected" : "no source URL and none found yet";
  // Rows whose note records why they were added or reset, rather than an extraction failure:
  // extraction has not run on them yet in their current state.
  if (/^Added \d{4}-\d{2}-\d{2} from the ASHA/.test(note)) return "newly added from the accreditor's directory; extraction has not run yet";
  if (/^Reset \d{4}-\d{2}-\d{2}/.test(note)) return "evidence removed as not the school's own; awaiting a correct source";
  if (/^Cleared \d{4}-\d{2}-\d{2}/.test(note)) return "wrong website removed; its own source is unaffected and awaiting extraction";
  if (/^Marked inactive/.test(note)) return "retired by the accreditor's directory";
  if (/no usable prereq list/.test(note)) return "pages read, but the programme does not publish an enumerable course list";
  if (/render failed|too little text|plain fetch returned/.test(note)) return "pages could not be read even in a browser";
  if (/HTTP 4\d\d/.test(note)) return "the stored source no longer resolves";
  if (/different campus/.test(note)) return "only a sibling campus's catalogue was found, which is a different programme";
  if (/PDF/.test(note)) return "the requirements are in a PDF that could not be read";
  return "other";
}

const byProf = new Map<string, Array<{ id: number; name: string; program: string; state: string; why: string; source: string }>>();
for (const r of rows.rows as any[]) {
  const list = byProf.get(r.profession_slug) ?? [];
  list.push({
    id: r.id, name: String(r.name), program: String(r.program_name ?? ""), state: String(r.state ?? ""),
    why: cause(String(r.n), String(r.s)), source: String(r.s),
  });
  byProf.set(r.profession_slug, list);
}

const causeCounts: Record<string, number> = {};
for (const list of byProf.values()) for (const x of list) causeCounts[x.why] = (causeCounts[x.why] ?? 0) + 1;

const out: string[] = [];
out.push("# Programmes still unfinished\n");
out.push(`Generated ${new Date().toISOString().slice(0, 10)} from the live database. ${rows.rows.length} active programmes are not yet finalized, each listed below with why.\n`);
out.push("None of these is recorded as publishing no prerequisites. That status asserts something about a school and requires the school to say it; not having found a list is not the same claim.\n");
out.push("## Why they are unfinished\n");
for (const [k, v] of Object.entries(causeCounts).sort((a, b) => b[1] - a[1])) out.push(`- **${v}** — ${k}`);
out.push("\nThe dominant case is a programme that refers to prerequisites without listing them. Florida International's speech-language pathology page, for example, states that applicants need \"10 required prerequisite courses\" and never names them, in the rendered page as well as the raw HTML. Those ten course names cannot be supplied without inventing them.\n");

for (const [slug, list] of [...byProf.entries()].sort((a, b) => b[1].length - a[1].length)) {
  out.push(`\n## ${slug} (${list.length})\n`);
  for (const x of list.sort((a, b) => a.name.localeCompare(b.name))) {
    out.push(`- **${x.name}**${x.state ? ` (${x.state})` : ""} — ${x.program}`);
    out.push(`  - ID ${x.id}: ${x.why}`);
    if (x.source) out.push(`  - Last source tried: ${x.source}`);
  }
}

const file = path.join(process.cwd(), "..", "data", "unresolved-programs.md");
fs.writeFileSync(file, out.join("\n") + "\n");
console.log(`WROTE ${file} covering ${rows.rows.length} programmes`);
process.exit(0);
