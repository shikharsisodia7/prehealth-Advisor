/**
 * Audit every finalized row for a source that is a generic undergraduate transfer-admissions
 * gateway rather than the programme's own admissions/prerequisites page.
 *
 * Reports only. Nothing is changed here; a flagged row is a candidate for review, because the
 * pattern match is deliberately loose (see genericTransferGatewayConflict) and a human should
 * confirm each one before its data is reset.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { genericTransferGatewayConflict } from "./extraction-rules.js";

const rows = await db.execute(sql.raw(`
  select id, profession_slug, name, program_name, degree_type, verification_status,
         coalesce(source_url,'') s,
         jsonb_array_length(coalesce(prereq_courses,'[]'::jsonb)) pc
  from program_schools
  where directory_status='active'
    and verification_status in ('verified','no_prereqs_published')
    and coalesce(source_url,'') <> ''
  order by profession_slug, name`));

let flagged = 0;
for (const r of rows.rows as any[]) {
  const reason = genericTransferGatewayConflict(String(r.s), String(r.profession_slug), r.degree_type);
  if (!reason) continue;
  flagged++;
  console.log(
    `FLAG ${String(r.id).padStart(5)} ${String(r.profession_slug).padEnd(24)} ${String(r.name).slice(0, 40).padEnd(42)} [${r.verification_status}, ${r.pc} prereqs]  ${r.s}`,
  );
}
console.log(`\nFLAGGED=${flagged} of ${rows.rows.length} finalized rows with a source`);
process.exit(0);
