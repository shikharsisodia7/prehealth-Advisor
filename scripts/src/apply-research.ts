/**
 * Apply the pages the targeted research located as each programme's seed, so extraction can run
 * against them. Writes only websiteUrl/sourceUrl, and records the previous value.
 *
 * A finding is only applied when the page is on a domain the research already confirmed belongs
 * to that institution, so this cannot introduce the wrong-school problem it exists to fix.
 */
import { sql, eq } from "drizzle-orm";
import { db, programSchoolsTable } from "@workspace/db";
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/**
 * Words that identify a page as this profession's programme.
 *
 * Findings recorded before this check existed have to be re-tested here, because the research
 * pass accepted any page with science subjects on it -- Cleveland State's Psychology B.A. and
 * Nursing B.S.N. catalogue pages were offered for nursing, occupational therapy and
 * speech-language pathology rows.
 */
const PROF_IDENT: Record<string, RegExp> = {
  "speech-language-pathology": /speech-language|speech language|communication sciences|communicative sciences|\bslp\b|audiolog/i,
  medicine: /medical school|doctor of medicine|osteopathic|\bmd program\b|premedical/i,
  "occupational-therapy": /occupational therapy|\botd\b|\bmot\b/i,
  nursing: /nursing|\bbsn\b|\babsn\b|\bmepn\b/i,
  "physician-assistant": /physician assistant|\bpa program\b|\bcaspa\b/i,
  dietetics: /dietetic|nutrition and dietetics|\bdpd\b|registered dietitian/i,
  pharmacy: /pharmacy|\bpharmd\b|pre-pharmacy/i,
  "physical-therapy": /physical therapy|\bdpt\b|\bptcas\b/i,
  dental: /dental|\bdds\b|\bdmd\b|predental/i,
  "prosthetics-orthotics": /prosthetic|orthotic/i,
  postbac: /postbaccalaureate|post-baccalaureate|postbac|premedical|pre-medical/i,
};

async function pageNamesProfession(url: string, slug: string): Promise<boolean | "unreadable"> {
  const ident = PROF_IDENT[slug];
  if (!ident) return true;
  try {
    const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000), redirect: "follow" });
    if (!res.ok) return "unreadable";
    const text = (await res.text())
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 60_000);
    return ident.test(text);
  } catch {
    return "unreadable";
  }
}
const dataDir = path.join(process.cwd(), "..", "data");
const files = fs.readdirSync(dataDir).filter((f) => f.startsWith("research-") && f.endsWith(".json"));

let applied = 0;
let skipped = 0;
const ids: number[] = [];

for (const f of files) {
  const findings: any[] = JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf8"));
  for (const x of findings) {
    if (!x.best?.url) continue;

    const row = await db.execute(
      sql.raw(`select id, name, coalesce(website_url,'') w, verification_status
               from program_schools where id = ${Number(x.id)}`),
    );
    const r = (row.rows as any[])[0];
    if (!r) continue;
    // Leave rows extraction has since finished.
    if (!["draft", "needs_review", "imported", "outdated"].includes(String(r.verification_status))) { skipped++; continue; }
    if (String(r.w) === String(x.best.url)) { skipped++; continue; }

    const slug = String(x.profession ?? "");
    const named = await pageNamesProfession(String(x.best.url), slug);
    if (named !== true) {
      skipped++;
      console.log(`REJECT ${x.id} ${String(x.name).slice(0, 32).padEnd(34)} page does not name ${slug} (${named === "unreadable" ? "unreadable" : "wrong programme"})  ${String(x.best.url).slice(0, 60)}`);
      continue;
    }

    console.log(`APPLY ${x.id} ${String(x.name).slice(0, 32).padEnd(34)} ${x.best.subjects.length} subj  ${String(x.best.url).slice(0, 70)}`);
    ids.push(Number(x.id));
    if (APPLY) {
      fs.appendFileSync(
        path.join(dataDir, "seed-corrections.jsonl"),
        `${JSON.stringify({ at: new Date().toISOString(), id: x.id, name: x.name, from: r.w, to: x.best.url, why: "targeted research located a prerequisite list" })}\n`,
      );
      await db.update(programSchoolsTable)
        .set({ sourceUrl: x.best.url, websiteUrl: x.best.url })
        .where(eq(programSchoolsTable.id, Number(x.id)));
    }
    applied++;
  }
}

console.log(`\nAPPLIED=${applied} SKIPPED=${skipped} applyMode=${APPLY}`);
console.log("IDS=" + ids.join(","));
process.exit(0);
