/**
 * One-line live coverage snapshot, for the background monitor.
 *
 * This lives in the repo rather than as a scratch file because the monitor that calls it
 * silently emitted empty events for an hour after a cleanup pass deleted the temporary
 * script it had been pointed at -- and an empty event looks like a quiet system, not a
 * broken one.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const r = await db.execute(sql`
  select
    count(*) filter (where verification_status = 'verified')::int as verified,
    count(*) filter (where verification_status = 'no_prereqs_published')::int as nop,
    count(*) filter (where verification_status in ('source_blocked','unavailable'))::int as blocked,
    count(*) filter (where verification_status in ('draft','imported','needs_review','outdated'))::int as unfinished,
    count(*)::int as active
  from program_schools
  where directory_status = 'active'`);

const x = (r.rows as any[])[0];
if (!x || !Number(x.active)) {
  console.log("COVERAGE query returned no rows — check DATABASE_URL");
  process.exit(1);
}
const finalized = Number(x.verified) + Number(x.nop) + Number(x.blocked);
const pct = ((finalized / Number(x.active)) * 100).toFixed(1);
console.log(
  `COVERAGE verified=${x.verified} no_prereqs=${x.nop} blocked=${x.blocked} ` +
    `unfinished=${x.unfinished} active=${x.active} finalized=${pct}%`,
);
process.exit(0);
