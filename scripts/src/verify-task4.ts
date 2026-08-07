/**
 * verify-task4.ts
 * Checks the final DB state for all 14 previously-blocked CAA/PA programs.
 * Confirms that each program has a single row, a resolved status
 * (verified or no_prereqs_published), and no placeholder prerequisite entries.
 */
import { db, programSchoolsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

const EXPECTED = [
  { id: "caahep-3478",  label: "CU Anschutz" },
  { id: "caahep-3125",  label: "CWRU - Washington DC" },
  { id: "caahep-110",   label: "CWRU - Cleveland" },
  { id: "caahep-11046", label: "CWRU - Austin TX" },
  { id: "caahep-2882",  label: "CWRU - Houston TX" },
  { id: "caahep-11021", label: "South U - Orlando" },
  { id: "caahep-9837",  label: "South U - West Palm Beach" },
  { id: "caahep-117",   label: "South U - Savannah" },
  { id: "caahep-11329", label: "KCU Joplin" },
  { id: "caahep-11094", label: "UNM" },
  { id: "naacls-2826",  label: "U Calgary" },
  { id: "naacls-2821",  label: "ODU" },
  { id: "naacls-7603",  label: "Carroll U" },
  { id: "naacls-2786",  label: "WVU" },
];

async function main() {
  const ids = EXPECTED.map((e) => e.id);
  const rows = await db
    .select({
      externalId: programSchoolsTable.externalId,
      name: programSchoolsTable.name,
      status: programSchoolsTable.verificationStatus,
      prereqCourses: programSchoolsTable.prereqCourses,
    })
    .from(programSchoolsTable)
    .where(inArray(programSchoolsTable.externalId, ids));

  const byId: Record<string, typeof rows> = {};
  for (const r of rows) {
    if (r.externalId == null) continue;
    if (!byId[r.externalId]) byId[r.externalId] = [];
    byId[r.externalId].push(r);
  }

  let allGood = true;
  console.log("\n=== Task #4 — Final DB Verification ===\n");
  for (const { id, label } of EXPECTED) {
    const matches = byId[id] ?? [];
    if (matches.length === 0) {
      console.log(`❌ ${id} (${label}) — NOT FOUND`);
      allGood = false;
      continue;
    }
    if (matches.length > 1) {
      console.log(`❌ ${id} (${label}) — DUPLICATE ROWS (${matches.length})`);
      allGood = false;
      continue;
    }
    const r = matches[0];
    const count = Array.isArray(r.prereqCourses) ? r.prereqCourses.length : 0;
    const hasPlaceholder =
      Array.isArray(r.prereqCourses) &&
      r.prereqCourses.some((p: any) => p.name === "Prerequisite verification pending");
    const goodStatus =
      r.status === "verified" || r.status === "no_prereqs_published";
    const ok = goodStatus && count > 0 && !hasPlaceholder;
    const icon = ok ? "✅" : "⚠️ ";
    console.log(
      `${icon} ${id} (${label}) | status=${r.status} | ${count} prereqs${hasPlaceholder ? " [has placeholder!]" : ""}`,
    );
    if (!ok) allGood = false;
  }
  console.log();
  console.log(allGood ? "All 14 programs are resolved." : "Some programs need attention.");
  process.exit(allGood ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
