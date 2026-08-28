/**
 * Find groups of rows at one institution that share an identical prerequisite list.
 *
 * Separate programmes rarely publish the same list course-for-course. When they appear to, the
 * usual cause is one page having been read for all of them -- which is how several Tulane
 * postbac rows came to carry the medical school's MD prerequisites.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const rows = await db.execute(sql.raw(`
  select name, profession_slug p,
         md5(prereq_courses::text) sig,
         count(*) n,
         max(jsonb_array_length(prereq_courses)) len,
         string_agg(distinct coalesce(source_url,''), ' | ') urls,
         string_agg(id::text, ',' order by id) ids
  from program_schools
  where directory_status='active' and verification_status='verified'
    and jsonb_array_length(coalesce(prereq_courses,'[]'::jsonb)) >= 4
  group by name, profession_slug, md5(prereq_courses::text)
  having count(*) > 1
  order by count(*) desc, name`));

for (const r of rows.rows as any[]) {
  console.log(`${String(r.n).padStart(2)} rows share a ${r.len}-course list  ${String(r.name).slice(0, 42)} [${r.p}]`);
  console.log(`     ids: ${r.ids}`);
  console.log(`   source: ${String(r.urls).slice(0, 150)}`);
}
console.log(`\nGROUPS=${rows.rows.length}`);
process.exit(0);
