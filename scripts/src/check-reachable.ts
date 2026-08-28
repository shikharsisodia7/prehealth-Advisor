/** Report the HTTP status of each unfinished row's current source, so a dead seed is not mistaken for a school that publishes nothing. */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const only = process.argv.find((a) => a.startsWith("--profession="))?.split("=")[1] ?? "";
const rows = await db.execute(sql.raw(`
  select id, name, coalesce(source_url,'') s from program_schools
  where directory_status='active' and verification_status in ('draft','needs_review','imported','outdated')
    ${only ? `and profession_slug='${only}'` : ""} and coalesce(source_url,'') <> '' order by id`));

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const out: string[] = [];
let dead = 0, ok = 0;
await Promise.all((rows.rows as any[]).map(async (r) => {
  let status = "";
  try {
    const res = await fetch(r.s, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(25000), redirect: "follow" });
    status = String(res.status);
    if (res.ok) ok++; else dead++;
  } catch (e) {
    status = `ERR ${(e as Error).message.slice(0, 30)}`;
    dead++;
  }
  if (!/^2\d\d$/.test(status)) out.push(`${status.padEnd(34)} ${String(r.id).padStart(5)} ${String(r.name).slice(0, 32).padEnd(34)} ${r.s}`);
}));
out.sort();
for (const l of out) console.log(l);
console.log(`\nCHECKED=${rows.rows.length} reachable=${ok} unreachable=${dead}`);
process.exit(0);
