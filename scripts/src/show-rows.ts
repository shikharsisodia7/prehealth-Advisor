/** Print the identifying fields of specific rows, so a researched URL is matched to the right programme. */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
const ids = (process.argv[2] ?? "").split(",").filter(Boolean).map(Number);
const r = await db.execute(sql.raw(`select id, profession_slug p, name, coalesce(program_name,'') pn,
  coalesce(degree_type,'') d, coalesce(city,'') c, coalesce(state,'') st, coalesce(source_url,'') s, verification_status vs
  from program_schools where id in (${ids.join(",")}) order by id`));
for (const x of r.rows as any[]) console.log(`${x.id} | ${x.p} | ${x.name} | ${x.pn} | ${x.c} ${x.st} | ${x.vs}
    ${x.s || '(no source)'}`);
process.exit(0);
