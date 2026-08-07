/**
 * mark-needs-review.ts
 * Updates programs whose prerequisite websites were inaccessible or produced
 * no machine-readable prerequisite courses, setting them to needs_review with
 * the best source URL we found. Idempotent — skips already-verified rows.
 *
 * Run:
 *   pnpm --filter @workspace/scripts exec tsx src/mark-needs-review.ts
 */
import { eq, and, inArray } from "drizzle-orm";
import { db, programSchoolsTable } from "@workspace/db";

const ENTRIES: Array<{
  externalId: string;
  sourceUrl: string;
  blockerNote: string;
}> = [
  // ── Anesthesiologist Assistant (CAA) ─────────────────────────────────────
  {
    externalId: "caahep-3478",
    sourceUrl:
      "https://medschool.cuanschutz.edu/anesthesiology/education/anesthesiologist-assistant-program",
    blockerNote:
      "All sub-paths under /admissions and /how-to-apply return 404; main program page has no prerequisite course list.",
  },
  {
    externalId: "caahep-3125",
    sourceUrl: "https://case.edu/medicine/msa-program/admissions",
    blockerNote:
      "CWRU MSA admissions page states prerequisites were recently revised to expand access but does not list specific courses; /prereqs and /admissions-requirements paths return 404. Shared for all 4 CWRU campuses.",
  },
  {
    externalId: "caahep-110",
    sourceUrl: "https://case.edu/medicine/msa-program/admissions",
    blockerNote:
      "Same as CWRU-DC — CWRU MSA prereq page not publicly accessible.",
  },
  {
    externalId: "caahep-11046",
    sourceUrl: "https://case.edu/medicine/msa-program/admissions",
    blockerNote:
      "Same as CWRU-DC — CWRU MSA prereq page not publicly accessible.",
  },
  {
    externalId: "caahep-2882",
    sourceUrl: "https://case.edu/medicine/msa-program/admissions",
    blockerNote:
      "Same as CWRU-DC — CWRU MSA prereq page not publicly accessible.",
  },
  {
    externalId: "caahep-11021",
    sourceUrl:
      "https://www.southuniversity.edu/orlando/anesthesia-science-mmsc/course-requirements",
    blockerNote:
      "South University course-requirements page renders only a cookie/image banner; no prerequisite table extracted despite JS rendering. Shared curriculum across all South University AA campuses.",
  },
  {
    externalId: "caahep-9837",
    sourceUrl:
      "https://www.southuniversity.edu/west-palm-beach/anesthesia-science-mmsc/course-requirements",
    blockerNote:
      "Same as South-Orlando — course-requirements page does not render prerequisite content.",
  },
  {
    externalId: "caahep-117",
    sourceUrl:
      "https://www.southuniversity.edu/savannah/anesthesia-science-mmsc/course-requirements",
    blockerNote:
      "Same as South-Orlando — course-requirements page does not render prerequisite content.",
  },
  {
    externalId: "caahep-11329",
    sourceUrl:
      "https://www.kansascity.edu/programs/anesthesiologist-assistant",
    blockerNote:
      "KCU program page links to CASAA for requirements but does not list specific prerequisite courses; /admissions-requirements path returns 404.",
  },
  {
    externalId: "caahep-11094",
    sourceUrl:
      "https://hsc.unm.edu/medicine/departments/anesthesiology/education/msa-program/admissions/",
    blockerNote:
      "UNM MSA admissions page loaded (14KB) but prerequisite courses are listed only in a PDF (msa-advising-worksheet-v2-3.pdf) which is not machine-readable via fetch. PDF snippet shows a standard science course table.",
  },
  // ── Pathologists' Assistant (PA) ─────────────────────────────────────────
  {
    externalId: "naacls-2826",
    sourceUrl:
      "https://grad.ucalgary.ca/future-students/graduate/discover-opportunities/explore-programs/pathologists-assistant-mdpa",
    blockerNote:
      "University of Calgary graduate studies page is blocked by a mandatory cookie-consent overlay; no prerequisite content accessible.",
  },
  {
    externalId: "naacls-2821",
    sourceUrl:
      "https://www.odu.edu/academics/programs/masters/pathologists-assistant",
    blockerNote:
      "ODU Pathologists' Assistant program page (20KB) contains program description and admissions overview but does not enumerate prerequisite science courses.",
  },
  {
    externalId: "naacls-7603",
    sourceUrl: "https://www.carrollu.edu/path-as",
    blockerNote:
      "Carroll University Path-As page and 2024-25 graduate catalog entry found; catalog entry describes program structure but prerequisite admissions courses are not explicitly listed.",
  },
  {
    externalId: "naacls-2786",
    sourceUrl: "https://medicine.hsc.wvu.edu/pa",
    blockerNote:
      "WVU Pathologists' Assistant program page loaded (4KB) but contains only program overview and faculty info; no prerequisite course list.",
  },
];

async function main() {
  let updated = 0;
  let skipped = 0;

  for (const entry of ENTRIES) {
    // Find the program row
    const rows = await db
      .select()
      .from(programSchoolsTable)
      .where(eq(programSchoolsTable.externalId, entry.externalId));

    if (rows.length === 0) {
      console.log(`  NOT FOUND: ${entry.externalId}`);
      continue;
    }

    const row = rows[0];

    // Skip if already verified or imported (don't downgrade)
    if (row.verificationStatus === "verified" || row.verificationStatus === "imported") {
      console.log(`  SKIP (${row.verificationStatus}): ${row.name}`);
      skipped++;
      continue;
    }

    await db
      .update(programSchoolsTable)
      .set({
        verificationStatus: "needs_review",
        sourceUrl: entry.sourceUrl,
        // Add a single informational prereq item recording the blocker note
        prereqCourses: [
          {
            name: "Prerequisite verification pending",
            classification: "informational",
            details: entry.blockerNote,
            labRequired: null,
            courseCount: null,
            semesterCredits: null,
            quarterCredits: null,
            otherConditions: null,
          },
        ] as any,
      })
      .where(eq(programSchoolsTable.id, row.id));

    console.log(`  Updated (needs_review): ${row.name} [${entry.externalId}]`);
    updated++;
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
