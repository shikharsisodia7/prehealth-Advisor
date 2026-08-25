/**
 * Gather per-row evidence for every unfinished program, so each one can be answered
 * individually instead of being left as a bare "unfinished".
 *
 * Writes nothing unless --apply is passed, and even then only for categories whose evidence is
 * unambiguous. A program is never recorded as publishing no prerequisites just because none
 * could be read: that status asserts something about the school, and absence of a readable
 * page is not evidence of absence of requirements.
 */
import { sql, eq } from "drizzle-orm";
import { db, programSchoolsTable } from "@workspace/db";
import fs from "node:fs";
import path from "node:path";
import { NO_PREREQ_ASSERTION } from "./extraction-rules.js";

const APPLY = process.argv.includes("--apply");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

type Probe = { url: string; status: number | string; textLen: number; mentions: boolean; asserts: boolean; enumerates: boolean };

/** Does the page list actual courses, rather than merely referring to prerequisites? */
function enumeratesCourses(text: string): boolean {
  const subjects = text.match(/\b(anatomy|physiology|biology|chemistry|physics|statistics|psychology|microbiology|biochemistry|sociology|nutrition|calculus|genetics)\b/gi) ?? [];
  return new Set(subjects.map((s) => s.toLowerCase())).size >= 3;
}

async function probe(url: string): Promise<Probe> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1200 * attempt));
    try {
      const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000), redirect: "follow" });
      if (!res.ok) { if (attempt === 2) return { url, status: res.status, textLen: 0, mentions: false, asserts: false, enumerates: false }; continue; }
      const raw = await res.text();
      const text = raw.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      return {
        url, status: res.status, textLen: text.length,
        mentions: /prerequisit|required course|course requirement/i.test(text),
        asserts: NO_PREREQ_ASSERTION.test(text),
        enumerates: enumeratesCourses(text),
      };
    } catch (e) {
      if (attempt === 2) return { url, status: (e as Error).message.slice(0, 40), textLen: 0, mentions: false, asserts: false, enumerates: false };
    }
  }
  return { url, status: "unknown", textLen: 0, mentions: false, asserts: false, enumerates: false };
}

const rows = await db.execute(sql.raw(`
  select id, name, profession_slug, coalesce(website_url,'') w, coalesce(source_url,'') s, coalesce(verification_note,'') n
  from program_schools
  where directory_status='active' and verification_status in ('draft','needs_review')
  order by profession_slug, id`));

const out: any[] = [];
let blocked = 0, unreadable = 0, referencesOnly = 0, hasList = 0, noSource = 0;

for (const r of rows.rows as any[]) {
  // Probe the row's own URLs plus any the worker already recorded as tried.
  const noted = [...String(r.n).matchAll(/https?:\/\/[^\s;:]+/g)].map((m) => m[0]).slice(0, 3);
  const urls = [...new Set([r.w, r.s, ...noted].filter(Boolean))].slice(0, 4);
  if (!urls.length) { noSource++; out.push({ id: r.id, name: r.name, slug: r.profession_slug, verdict: "no source url", probes: [] }); continue; }

  const probes: Probe[] = [];
  for (const u of urls) probes.push(await probe(u));

  const readable = probes.filter((p) => p.status === 200 && p.textLen > 300);
  let verdict: string;
  if (!readable.length) { verdict = "all sources unreadable"; unreadable++; }
  else if (readable.some((p) => p.asserts)) { verdict = "explicit no-prereq statement"; blocked++; }
  else if (readable.some((p) => p.enumerates)) { verdict = "course list present — retry extraction"; hasList++; }
  else if (readable.some((p) => p.mentions)) { verdict = "references prerequisites but publishes no list"; referencesOnly++; }
  else { verdict = "readable but nothing about prerequisites"; referencesOnly++; }

  out.push({ id: r.id, name: r.name, slug: r.profession_slug, verdict, probes });
  console.log(`${String(r.id).padStart(5)} ${verdict.padEnd(46)} ${String(r.name).slice(0, 34)}`);
}

fs.writeFileSync(path.join(process.cwd(), "..", "data", "unfinished-evidence.json"), JSON.stringify(out, null, 2));
console.log(`\nTOTALS unreadable=${unreadable} explicit-no-prereq=${blocked} has-list=${hasList} references-only=${referencesOnly} no-source=${noSource} of ${out.length}`);

if (APPLY) {
  for (const o of out) {
    if (o.verdict !== "all sources unreadable") continue;
    const detail = o.probes.map((p: Probe) => `${p.url}: ${p.status}`).join("; ").slice(0, 400);
    await db.update(programSchoolsTable)
      .set({
        verificationStatus: "source_blocked",
        verificationNote: `Every known source refused or failed on 3 attempts each, ${new Date().toISOString().slice(0, 10)}: ${detail}. No prerequisite claim is recorded for this program.`,
      })
      .where(eq(programSchoolsTable.id, o.id));
  }
  console.log("applied source_blocked to unreadable rows");
}
process.exit(0);
