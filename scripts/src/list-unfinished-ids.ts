/** Print the ids of every unfinished active programme, for feeding the worker's --ids flag. */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
const r = await db.execute(sql.raw(`
  select id from program_schools
  where directory_status='active'
    and verification_status in ('draft','needs_review','imported','outdated')
  order by id`));
console.log((r.rows as any[]).map((x) => x.id).join(","));
process.exit(0);
