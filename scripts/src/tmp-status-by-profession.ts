import { db, programSchoolsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const slugs = [
  "medicine", "dental", "physician-assistant", "nursing", "pharmacy",
  "physical-therapy", "occupational-therapy", "optometry", "veterinary",
  "podiatry", "prosthetics-orthotics", "genetic-counseling", "dietetics",
  "speech-language-pathology", "anesthesiologist-assistant",
  "pathologists-assistant", "postbac",
];

async function main() {
  for (const slug of slugs) {
    const rows = await db
      .select({
        id: programSchoolsTable.id,
        verificationStatus: programSchoolsTable.verificationStatus,
      })
      .from(programSchoolsTable)
      .where(and(eq(programSchoolsTable.professionSlug, slug), eq(programSchoolsTable.directoryStatus, "active")));
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.verificationStatus ?? "null"] = (counts[r.verificationStatus ?? "null"] ?? 0) + 1;
    console.log(slug, JSON.stringify(counts), "total=" + rows.length);
  }
  process.exit(0);
}
main();
