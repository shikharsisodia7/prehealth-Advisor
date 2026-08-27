/**
 * Audit every finalized row for evidence that belongs to a different institution.
 *
 * The worker's institution guard accepted any host containing a word from the school's name,
 * and schools are routinely named for the profession they teach, so "pharmacy" in a hostname
 * was enough to pass. This re-applies the guard with profession words no longer counted as
 * identity, and reports what it would now refuse.
 *
 * Reports only. Nothing is changed here; a flagged row is a candidate for review, because the
 * host may still be a legitimate acronym the spelling cannot recognise.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { institutionTokens } from "./extraction-rules.js";

const DEPARTMENT_WORDS = new Set([
  "catalog", "catalogs", "bulletin", "admissions", "admission", "apply", "grad", "graduate",
  "www", "web", "sites", "programs", "academics", "future", "students", "online",
]);

function host(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

/** Registrable label, e.g. pharmacy.cuanschutz.edu -> "cuanschutz". */
function baseLabel(h: string): string {
  const labels = h.replace(/\.(edu|org|com|net|gov|us)$/i, "").split(".");
  return labels[labels.length - 1] ?? "";
}

const rows = await db.execute(sql.raw(`
  select id, profession_slug, name, state, verification_status, coalesce(source_url,'') s,
         jsonb_array_length(coalesce(prereq_courses,'[]'::jsonb)) pc
  from program_schools
  where directory_status='active'
    and verification_status in ('verified','no_prereqs_published')
    and coalesce(source_url,'') <> ''
  order by profession_slug, name`));

let flagged = 0;
for (const r of rows.rows as any[]) {
  const h = host(r.s);
  if (!h) continue;
  const base = baseLabel(h);
  if (!base || DEPARTMENT_WORDS.has(base)) continue;
  // Opaque acronyms are accepted: universities use labels that share no text with their name
  // (wustl, emich, uiw), and judging those by spelling produces overwhelmingly false rejects.
  if (base.length <= 6) continue;

  const tokens = institutionTokens(String(r.name));
  if (!tokens.length) continue;
  const nameNorm = String(r.name).toLowerCase().replace(/[^a-z0-9]/g, "");
  const related =
    tokens.some((t) => base.includes(t) || t.includes(base)) ||
    nameNorm.includes(base);
  if (related) continue;

  flagged++;
  console.log(`FLAG ${String(r.id).padStart(5)} ${String(r.profession_slug).padEnd(24)} ${String(r.name).slice(0, 44).padEnd(46)} ${r.pc} prereqs  ${h}`);
}
console.log(`\nFLAGGED=${flagged} of ${rows.rows.length} finalized rows with a source`);
process.exit(0);
