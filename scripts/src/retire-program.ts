/**
 * Mark one programme inactive because the institution says it no longer offers it.
 *
 * Retirement needs the same standard of evidence as any other claim: a quote from the
 * institution, not the absence of a page. UW-Madison's pre-health advising site states plainly
 * that it "no longer offers a Cytotechnology program", which is why that row is retired rather
 * than left as a programme a student might try to apply to.
 *
 * Usage: retire-program.ts <id> <sourceUrl> "<quote>" [--apply]
 */
import { eq, sql } from "drizzle-orm";
import { db, programSchoolsTable } from "@workspace/db";

const APPLY = process.argv.includes("--apply");
const [idArg, url, quote] = process.argv.slice(2).filter((a) => a !== "--apply");
const id = Number(idArg);
if (!id || !url || !quote) throw new Error('usage: retire-program.ts <id> <sourceUrl> "<quote>" [--apply]');

const cur = await db.execute(sql.raw(`select id, name, program_name, verification_status vs, directory_status ds from program_schools where id = ${id}`));
const row = cur.rows[0] as any;
if (!row) throw new Error(`no row ${id}`);
console.log(`${APPLY ? "RETIRE" : "DRYRUN"} ${id} ${row.name} — ${row.program_name} [${row.vs}, ${row.ds}]`);
console.log(`  quote: "${quote}"`);
console.log(`  source: ${url}`);

if (APPLY) {
  await db.update(programSchoolsTable).set({
    directoryStatus: "inactive",
    verificationNote: `Marked inactive ${new Date().toISOString().slice(0, 10)}: the institution states that it no longer offers this programme. Source statement: "${quote}" Source: ${url}. Listing it as a programme to apply to would mislead, and its prerequisites are not missing data but data that no longer exists.`,
  }).where(eq(programSchoolsTable.id, id));
}
process.exit(0);
