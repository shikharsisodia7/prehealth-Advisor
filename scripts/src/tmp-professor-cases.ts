import { db, programSchoolsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
const rows = await db.execute(sql`
  SELECT id, name, profession_slug, verification_status,
         jsonb_array_length(COALESCE(prereq_courses,'[]'::jsonb)) AS courses,
         LEFT(COALESCE(source_url,''), 120) AS source_url
  FROM program_schools
  WHERE
    (name ILIKE '%Ohio University%' AND profession_slug='physician-assistant')
    OR (name ILIKE '%Emory%' AND profession_slug='physical-therapy')
    OR (name ILIKE '%Vanderbilt%' AND profession_slug='nursing')
    OR (name ILIKE '%Samuel Merritt%' AND profession_slug='nursing')
  ORDER BY profession_slug, name
`);
console.log(JSON.stringify(rows.rows ?? rows, null, 2));
process.exit(0);
