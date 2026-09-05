/**
 * Developer maintenance tool for the pilot "Report an Error" workflow.
 *
 * Deliberately a CLI, not an admin UI: this is how reports get triaged without building a
 * student-data admin dashboard. Shows open reports newest-first by default.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts exec tsx src/list-error-reports.ts
 *   pnpm --filter @workspace/scripts exec tsx src/list-error-reports.ts --all
 *   pnpm --filter @workspace/scripts exec tsx src/list-error-reports.ts --json
 *   pnpm --filter @workspace/scripts exec tsx src/list-error-reports.ts --csv
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const ALL = process.argv.includes("--all");
const AS_JSON = process.argv.includes("--json");
const AS_CSV = process.argv.includes("--csv");

const rows = await db.execute(sql.raw(`
  select id, program_id, coalesce(profession,'') profession, coalesce(institution,'') institution,
         coalesce(program_name,'') program_name, coalesce(program_degree,'') program_degree,
         issue_type, coalesce(reported_source_url,'') reported_source_url,
         coalesce(suggested_source_url,'') suggested_source_url,
         coalesce(description,'') description, status, created_at
  from program_error_reports
  ${ALL ? "" : "where status = 'open'"}
  order by created_at desc
`));

const list = rows.rows as any[];

if (AS_JSON) {
  console.log(JSON.stringify(list, null, 2));
} else if (AS_CSV) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const headers = ["id", "program_id", "profession", "institution", "program_name", "program_degree", "issue_type", "reported_source_url", "suggested_source_url", "description", "status", "created_at"];
  console.log(headers.join(","));
  for (const r of list) console.log(headers.map((h) => esc(r[h])).join(","));
} else {
  for (const r of list) {
    console.log(`#${String(r.id).padStart(4)} [${r.status}] ${r.issue_type}  ${r.created_at}`);
    if (r.program_id) console.log(`      program_id=${r.program_id}`);
    if (r.institution || r.profession) console.log(`      ${r.profession}${r.profession && r.institution ? " — " : ""}${r.institution} ${r.program_name}${r.program_degree ? ` (${r.program_degree})` : ""}`);
    if (r.reported_source_url) console.log(`      current:   ${r.reported_source_url}`);
    if (r.suggested_source_url) console.log(`      suggested: ${r.suggested_source_url}`);
    if (r.description) console.log(`      note: ${r.description}`);
    console.log("");
  }
  console.log(`${list.length} ${ALL ? "" : "open "}report(s).`);
}
process.exit(0);
