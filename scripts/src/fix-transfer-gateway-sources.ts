/**
 * Reset the 12 rows confirmed (via audit-source-transfer-gateway.ts, hand-reviewed) to carry a
 * generic undergraduate transfer-admissions gateway as their prerequisite source rather than
 * the programme's own admissions/prerequisites page.
 *
 * websiteUrl is left untouched -- it is a separate field (the institution/programme's own
 * website) and is correct on every one of these rows, e.g. Georgetown's Systems Medicine row
 * already carries systemsmedicine.georgetown.edu there. Only sourceUrl (the wrong page) and the
 * prerequisites extracted from it are cleared.
 *
 * Run:
 *   pnpm --filter @workspace/scripts exec tsx src/fix-transfer-gateway-sources.ts          (dry run)
 *   pnpm --filter @workspace/scripts exec tsx src/fix-transfer-gateway-sources.ts --apply
 */
import { eq } from "drizzle-orm";
import { db, programSchoolsTable } from "@workspace/db";
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");

const CONFIRMED: Array<{ id: number; why: string }> = [
  { id: 451, why: "admissions.uci.edu's undergraduate transfer-students page, not UCI School of Medicine's own admissions page" },
  { id: 1003, why: "admissions.uci.edu's undergraduate transfer-students page, not UCI's nursing programme's own admissions page" },
  { id: 1476, why: "admissions.uci.edu's undergraduate transfer-students page, not UCI School of Pharmacy's own admissions page" },
  { id: 2357, why: "admissions.uci.edu's undergraduate transfer-students page, not UCI's postbaccalaureate programme's own page" },
  { id: 546, why: "utoledo.edu's generic 'transfer adult student' guest-registration page; the quoted 'no prerequisites' statement is about guest-student course registration, not College of Medicine admissions" },
  { id: 1518, why: "utoledo.edu's generic 'transfer adult student' guest-registration page; the quoted 'no prerequisites' statement is about guest-student course registration, not College of Pharmacy admissions" },
  { id: 960, why: "Georgetown's undergraduate transfer-applicants page, not the School of Nursing & Health Studies' MEPN admissions page" },
  { id: 2219, why: "Georgetown's undergraduate transfer-applicants page; the quoted 'no specific courses' statement is about undergraduate transfer admission, not this certificate programme" },
  { id: 2325, why: "Georgetown's undergraduate transfer-applicants page; the quoted 'no specific courses' statement is about undergraduate transfer admission, not this master's programme" },
  { id: 267, why: "iup.edu's general admissions/transfer requirements-and-deadlines page, not the Nutrition and Dietetics graduate programme's own admissions page" },
  { id: 436, why: "a 'Pathway USA' undergraduate-to-Biomedical-Sciences-BS transfer articulation plan, not the College of Medicine's own MD admissions/prerequisites page" },
  { id: 2186, why: "admissions.uoregon.edu's general undergraduate transfer-requirements page, not the Postbac Premed Program's own page" },
];

const today = new Date().toISOString().slice(0, 10);
let reset = 0;

for (const { id, why } of CONFIRMED) {
  const cur = await db.select().from(programSchoolsTable).where(eq(programSchoolsTable.id, id));
  if (!cur.length) { console.log(`NOT_FOUND ${id}`); continue; }
  const row = cur[0]!;
  console.log(`${APPLY ? "RESET " : "WOULD_RESET "} ${id} ${String(row.name).slice(0, 44).padEnd(46)} [${row.verificationStatus}] was: ${row.sourceUrl}`);

  if (APPLY) {
    fs.appendFileSync(
      path.join(process.cwd(), "..", "data", "seed-corrections.jsonl"),
      `${JSON.stringify({ at: new Date().toISOString(), id, name: row.name, from: row.sourceUrl ?? "", to: "", why })}\n`,
    );
    await db.update(programSchoolsTable)
      .set({
        sourceUrl: null,
        prereqCourses: [],
        prereqSources: [],
        verificationStatus: "needs_review",
        lastVerified: null,
        verificationNote: `Reset ${today}: ${why}. Prerequisites read from a generic transfer-admissions gateway cannot be attributed to this programme, so they were removed rather than left in place.`,
      })
      .where(eq(programSchoolsTable.id, id));
    reset++;
  }
}

console.log(`\n${APPLY ? "RESET" : "WOULD_RESET"}=${APPLY ? reset : CONFIRMED.length} applyMode=${APPLY}`);
process.exit(0);
