import { sql } from "drizzle-orm";
import { db, programSchoolsTable } from "@workspace/db";

const [{ active, verified, nop, unfinished, blocked }] = await db.select({
  active: sql<number>`count(*) filter (where directory_status='active')::int`,
  verified: sql<number>`count(*) filter (where directory_status='active' and verification_status='verified')::int`,
  nop: sql<number>`count(*) filter (where directory_status='active' and verification_status='no_prereqs_published')::int`,
  unfinished: sql<number>`count(*) filter (where directory_status='active' and verification_status in ('draft','imported','needs_review','outdated'))::int`,
  blocked: sql<number>`count(*) filter (where directory_status='active' and verification_status in ('source_blocked','unavailable'))::int`,
}).from(programSchoolsTable);

const byProf = await db.execute(sql`
  select profession_slug,
    count(*) filter (where directory_status='active')::int as active,
    count(*) filter (where directory_status='active' and verification_status='verified')::int as verified,
    count(*) filter (where directory_status='active' and verification_status='no_prereqs_published')::int as nop,
    count(*) filter (where directory_status='active' and verification_status in ('draft','imported','needs_review','outdated'))::int as unfinished
  from program_schools
  group by profession_slug
  order by profession_slug
`);

console.log(`TOTALS active=${active} verified=${verified} nop=${nop} unfinished=${unfinished} blocked=${blocked} finalizedPct=${((100*(verified+nop))/active).toFixed(1)}`);
for (const r of byProf.rows as Array<Record<string, unknown>>) {
  const a = Number(r.active); const fin = Number(r.verified)+Number(r.nop);
  const cov = a ? ((100*fin)/a).toFixed(1) : '0';
  console.log(`${r.profession_slug}: active=${r.active} verified=${r.verified} nop=${r.nop} unfinished=${r.unfinished} cov=${cov}%`);
}
process.exit(0);

export {}

