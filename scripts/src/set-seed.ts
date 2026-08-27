/** Set a programme's seed URL from verified manual research, recording what it replaced. */
import { eq } from "drizzle-orm";
import { db, programSchoolsTable } from "@workspace/db";
import fs from "node:fs";
import path from "node:path";
const [idArg, url] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const id = Number(idArg);
const cur = await db.select().from(programSchoolsTable).where(eq(programSchoolsTable.id, id));
if (!cur.length) { console.log("NO_ROW " + id); process.exit(1); }
fs.appendFileSync(path.join(process.cwd(), "..", "data", "seed-corrections.jsonl"),
  `${JSON.stringify({ at: new Date().toISOString(), id, name: cur[0]!.name, from: cur[0]!.websiteUrl ?? "", to: url, why: "located by manual browser research and fetched to confirm it resolves" })}\n`);
await db.update(programSchoolsTable).set({ websiteUrl: url, sourceUrl: url }).where(eq(programSchoolsTable.id, id));
console.log(`SET ${id} ${String(cur[0]!.name).slice(0, 34)} -> ${url}`);
process.exit(0);
