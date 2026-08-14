import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
const statuses = await db.execute(sql`
  SELECT COALESCE(verification_status, 'null') AS status, COUNT(*)::int AS n
  FROM program_schools GROUP BY 1 ORDER BY n DESC
`);
const unfinished = await db.execute(sql`
  SELECT COUNT(*)::int AS n FROM program_schools
  WHERE verification_status IS DISTINCT FROM 'verified'
    AND verification_status IS DISTINCT FROM 'no_prereqs_published'
`);
console.log(JSON.stringify({ statuses: statuses.rows ?? statuses, unfinished: unfinished.rows?.[0] ?? unfinished }, null, 2));
process.exit(0);
