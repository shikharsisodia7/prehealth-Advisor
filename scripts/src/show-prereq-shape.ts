/** Print one verified row's stored prerequisite JSON, so a hand-recorded row matches the existing shape. */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
const r = await db.execute(sql.raw(`select id, name, prereq_courses, verification_note from program_schools
  where profession_slug='dental' and verification_status='verified'
    and jsonb_array_length(coalesce(prereq_courses,'[]'::jsonb)) > 2 limit 1`));
const row = r.rows[0] as any;
console.log(row.id, row.name);
console.log(JSON.stringify(row.prereq_courses, null, 1).slice(0, 1000));
console.log("NOTE:", String(row.verification_note).slice(0, 300));
process.exit(0);
