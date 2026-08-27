/**
 * Check every "publishes no prerequisites" claim against the quote it rests on.
 *
 * The status asserts something about a school, so the sentence behind it has to be about that
 * school's programme. Cleveland State's postbaccalaureate row rested on "there are no required
 * prerequisite courses for law school" -- the right institution, an unrelated field.
 *
 * Reports by default; --apply resets the claims whose quote is about a different field.
 */
import { sql, eq } from "drizzle-orm";
import { db, programSchoolsTable } from "@workspace/db";

const APPLY = process.argv.includes("--apply");

/** Fields a quote can be about that are not this programme. */
const OTHER_FIELD: Array<{ re: RegExp; label: string }> = [
  { re: /\blaw school\b|\bJ\.?D\.?\b|\blegal education\b/i, label: "law" },
  { re: /\bbusiness school\b|\bMBA\b/i, label: "business" },
  { re: /\bdivinity\b|\bseminary\b|\btheolog/i, label: "theology" },
  { re: /\beducation degree\b|\bteacher certification\b|\bteaching licens/i, label: "teacher education" },
  { re: /\bengineering\b/i, label: "engineering" },
];

/** Words that show the quote is about the programme's own field. */
const OWN_FIELD: Record<string, RegExp> = {
  medicine: /medical school|medicine|premedical|osteopathic|\bMD\b|\bDO\b/i,
  postbac: /postbaccalaureate|post-baccalaureate|postbac|premedical|pre-health|health profession/i,
  nursing: /nursing|\bBSN\b|\bABSN\b|\bMEPN\b/i,
  "physician-assistant": /physician assistant|\bPA\b|CASPA/i,
  "occupational-therapy": /occupational therapy|\bOTD?\b/i,
  "physical-therapy": /physical therapy|\bDPT\b/i,
  "speech-language-pathology": /speech|communication sciences|communicative|\bSLP\b/i,
  pharmacy: /pharmacy|PharmD/i,
  dentistry: /dental|\bDDS\b|\bDMD\b/i,
  dental: /dental|\bDDS\b|\bDMD\b/i,
  dietetics: /dietetic|nutrition/i,
  veterinary: /veterinar|\bDVM\b/i,
  optometry: /optometr/i,
  podiatry: /podiatr/i,
  "genetic-counseling": /genetic counsel/i,
  "prosthetics-orthotics": /prosthetic|orthotic/i,
  "anesthesiologist-assistant": /anesthesiolog/i,
  "pathologists-assistant": /patholog/i,
};

const rows = await db.execute(sql.raw(`
  select id, profession_slug, name, coalesce(source_url,'') s, coalesce(verification_note,'') n
  from program_schools
  where directory_status='active' and verification_status='no_prereqs_published'
  order by profession_slug, name`));

let suspect = 0;
for (const r of rows.rows as any[]) {
  // The worker has written the evidence under two labels over time; both are the same thing,
  // and reading only one made five properly evidenced claims look unevidenced.
  const quote =
    /(?:Source statement|Explicit official statement): "([\s\S]*?)"/.exec(String(r.n))?.[1] ??
    (/Confirmed via official [^:]+: (.+)$/.exec(String(r.n))?.[1] ?? "");
  if (!quote) {
    console.log(`NOQUOTE ${r.id} ${String(r.name).slice(0, 40)} — no recorded statement`);
    suspect++;
    continue;
  }
  // A school stating "no specific course requirements" on its own admissions page need not
  // repeat its field, so silence about the field proves nothing. What does prove something is
  // the quote naming a DIFFERENT field: Cleveland State's postbaccalaureate claim rested on a
  // sentence about law school, and Emory's dietetics claim on one about the nursing programme.
  const own = OWN_FIELD[r.profession_slug];
  const otherField = OTHER_FIELD.find((f) => f.re.test(quote));
  const otherProfession = Object.entries(OWN_FIELD).find(
    ([slug, re]) => slug !== r.profession_slug && re.test(quote) && !(own && own.test(quote)),
  );
  if (!otherField && !otherProfession) continue;

  suspect++;
  const why = otherField
    ? `quote is about ${otherField.label}`
    : `quote is about ${otherProfession![0]}, not this programme`;
  console.log(`SUSPECT ${String(r.id).padStart(5)} ${String(r.profession_slug).padEnd(22)} ${String(r.name).slice(0, 34).padEnd(36)} ${why}`);
  console.log(`         "${quote.slice(0, 120)}"`);

  if (APPLY) {
    await db.update(programSchoolsTable)
      .set({
        verificationStatus: "needs_review", lastVerified: null,
        verificationNote: `Reset 2026-08-27: the claim that this programme publishes no prerequisites rested on "${quote.slice(0, 160)}", which ${why}. A statement about another field is not this programme saying it requires no coursework.`,
      })
      .where(eq(programSchoolsTable.id, r.id));
  }
}
console.log(`\nCHECKED=${rows.rows.length} SUSPECT=${suspect} applyMode=${APPLY}`);
process.exit(0);
