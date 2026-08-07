/**
 * Resumable official-source prerequisite acquisition.
 *
 * This script deliberately does not infer or mark requirements verified. It
 * discovers and caches candidate pages from official program domains, writes a
 * durable review queue, and persists source provenance to the owning program.
 * A structured extractor/reviewer must supply the actual prerequisite records.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run acquire:prereqs -- --profession physical-therapy --limit 25
 *   pnpm --filter @workspace/scripts run acquire:prereqs -- --all-draft --limit 100
 *   pnpm --filter @workspace/scripts run acquire:prereqs -- --program-id 42
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  programSchoolsTable,
  type PrereqSource,
} from "@workspace/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, "../../data/prereq-source-cache");
const QUEUE_DIR = path.resolve(__dirname, "../../data/prereq-review-queue");
const TODAY = new Date().toISOString().slice(0, 10);
const USER_AGENT =
  "HealthProfessionsPlanner/1.0 (+official-prerequisite-research; contact via project owner)";
const KEYWORDS = [
  "prerequisite",
  "admission",
  "admissions",
  "requirements",
  "required-course",
  "apply",
  "eligibility",
  "prospective",
  "catalog",
  "handbook",
];
const SOURCE_TYPE: PrereqSource["sourceType"] = "program_page";

type Args = {
  profession?: string;
  programId?: number;
  allDraft: boolean;
  limit: number;
  dryRun: boolean;
  force: boolean;
};

function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const limitRaw = get("--limit");
  const limit = limitRaw ? Number(limitRaw) : 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("--limit must be an integer from 1 to 500");
  }
  const programIdRaw = get("--program-id");
  if (programIdRaw && !/^\d+$/.test(programIdRaw)) {
    throw new Error("--program-id must be a positive integer");
  }
  return {
    profession: get("--profession"),
    programId: programIdRaw ? Number(programIdRaw) : undefined,
    allDraft: argv.includes("--all-draft"),
    limit,
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
  };
}

function isOfficialHttpUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

function looksRelevant(url: URL, text: string): boolean {
  const candidate = `${url.pathname} ${url.search} ${text}`.toLowerCase();
  return KEYWORDS.some((keyword) => candidate.includes(keyword));
}

function textFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPage(url: string): Promise<{
  finalUrl: string;
  title: string | null;
  html: string;
  links: Array<{ url: string; text: string }>;
  hash: string;
}> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/pdf;q=0.9,*/*;q=0.1" },
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const finalUrl = normalizeUrl(response.url);
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("html")) {
        throw new Error(`Unsupported content type ${contentType || "unknown"}; route PDF to a document extractor`);
      }
      const html = await response.text();
      const final = new URL(finalUrl);
      const links: Array<{ url: string; text: string }> = [];
      for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        try {
          const candidate = new URL(match[1], final);
          if (candidate.hostname === final.hostname && looksRelevant(candidate, textFromHtml(match[2]))) {
            links.push({ url: normalizeUrl(candidate.toString()), text: textFromHtml(match[2]).slice(0, 200) });
          }
        } catch {
          // Ignore malformed links; they are not usable provenance.
        }
      }
      const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
      return {
        finalUrl,
        title: title ? textFromHtml(title).slice(0, 300) : null,
        html,
        links: [...new Map(links.map((link) => [link.url, link])).values()].slice(0, 12),
        hash: crypto.createHash("sha256").update(html).digest("hex"),
      };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.profession && !args.programId && !args.allDraft) {
    throw new Error("Choose --profession <slug>, --program-id <id>, or --all-draft.");
  }

  const where = args.programId
    ? eq(programSchoolsTable.id, args.programId)
    : and(
        eq(programSchoolsTable.directoryStatus, "active"),
        inArray(programSchoolsTable.verificationStatus, ["draft", "needs_review", "outdated"]),
        args.profession ? eq(programSchoolsTable.professionSlug, args.profession) : undefined,
      );
  const candidatePrograms = await db.select().from(programSchoolsTable).where(where);
  const programs = candidatePrograms
    .filter((program) => isOfficialHttpUrl(program.websiteUrl))
    .filter(
      (program) =>
        args.force ||
        !(program.prereqSources ?? []).some(
          (source) =>
            source.url === normalizeUrl(program.websiteUrl!) &&
            source.retrievedAt === TODAY &&
            source.contentHash,
        ),
    )
    .slice(0, args.limit);

  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.mkdir(QUEUE_DIR, { recursive: true });
  const summary = { processed: 0, discovered: 0, failures: 0, skippedNoOfficialUrl: 0 };
  summary.skippedNoOfficialUrl = candidatePrograms.filter(
    (program) => !isOfficialHttpUrl(program.websiteUrl),
  ).length;
  const alreadyCurrent = candidatePrograms.length - summary.skippedNoOfficialUrl - programs.length;
  console.log(
    `Acquiring candidate sources for ${programs.length} program(s)${args.dryRun ? " (dry run)" : ""}; ` +
      `${alreadyCurrent} already have a current cached root source.`,
  );

  for (const program of programs) {
    const origin = new URL(program.websiteUrl!).hostname;
    try {
      const root = await fetchPage(program.websiteUrl!);
      const candidates = [
        { url: root.finalUrl, title: root.title, sourceType: SOURCE_TYPE, hash: root.hash, extractionMethod: "http" as const },
        ...root.links.map((link) => ({
          url: link.url,
          title: link.text || null,
          sourceType: "admissions_page" as const,
          hash: null,
          extractionMethod: "http" as const,
        })),
      ];
      const existing = program.prereqSources ?? [];
      const allSources = [...existing];
      for (const candidate of candidates) {
        if (!allSources.some((source) => source.url === candidate.url)) {
          allSources.push({
            url: candidate.url,
            title: candidate.title,
            sourceType: candidate.sourceType,
            retrievedAt: TODAY,
            contentHash: candidate.hash,
            extractionMethod: candidate.extractionMethod,
          });
        }
      }
      const cachePath = path.join(CACHE_DIR, `${program.id}-${root.hash.slice(0, 16)}.html`);
      const queuePath = path.join(QUEUE_DIR, `${program.id}.json`);
      const queueRecord = {
        programId: program.id,
        profession: program.professionSlug,
        institution: program.name,
        programName: program.programName,
        directoryWebsiteUrl: program.websiteUrl,
        retrievedAt: TODAY,
        root: { url: root.finalUrl, title: root.title, contentHash: root.hash, cacheFile: path.relative(path.resolve(__dirname, "../.."), cachePath) },
        candidateOfficialSources: allSources,
        nextAction: "Review cached official page and candidates; extract only explicitly stated requirements into the structured import format. Do not promote status without source evidence.",
      };
      if (!args.dryRun) {
        await fs.writeFile(cachePath, root.html);
        await fs.writeFile(queuePath, JSON.stringify(queueRecord, null, 2));
        await db
          .update(programSchoolsTable)
          .set({
            prereqSources: allSources,
            verificationNote: `Official-source discovery completed ${TODAY}; ${allSources.length} official candidate document(s) queued for structured prerequisite extraction. No requirements inferred.`,
          })
          .where(eq(programSchoolsTable.id, program.id));
      }
      summary.processed++;
      summary.discovered += allSources.length;
      console.log(`✓ ${program.id} ${program.name} (${origin}) — ${allSources.length} candidate source(s)`);
    } catch (error) {
      summary.failures++;
      const message = error instanceof Error ? error.message : String(error);
      const queuePath = path.join(QUEUE_DIR, `${program.id}.json`);
      if (!args.dryRun) {
        await fs.writeFile(
          queuePath,
          JSON.stringify(
            {
              programId: program.id,
              profession: program.professionSlug,
              institution: program.name,
              programName: program.programName,
              directoryWebsiteUrl: program.websiteUrl,
              retrievedAt: TODAY,
              failure: message,
              nextAction: "Retry with browser/PDF/official-domain search before any source_blocked status.",
            },
            null,
            2,
          ),
        );
      }
      console.warn(`! ${program.id} ${program.name} — ${message}`);
    }
    // Conservative per-domain pacing. This script is intentionally resumable;
    // callers can run batches rather than applying pressure to school domains.
    await new Promise((resolve) => setTimeout(resolve, 900));
  }
  console.log(JSON.stringify(summary));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});