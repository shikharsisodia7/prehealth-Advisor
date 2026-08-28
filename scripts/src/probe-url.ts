/**
 * Judge whether a candidate URL is actually a requirements page before it is stored as a seed.
 *
 * A guessed URL cannot be trusted on its status code: university CMSs commonly serve a section
 * landing page for any unmatched path beneath it, so both a real programme page and a typo
 * return 200. Two OU URLs did exactly that -- the guessed MS path returned a 5KB "Degree
 * Programs" nav shell, and only the text told them apart.
 *
 * So each URL is checked against a control: a nonsense sibling path under the same directory.
 * Denver College of Nursing answers /programs/accelerated-bsn.html and /programs/zzz-not-a-real
 * with the same 9,886-character page, which means the first one does not exist. Comparing the
 * candidate against its own site's not-found response is what distinguishes them; a status code
 * cannot, and neither can text length on its own.
 */
import { chromium } from "playwright";

const SUBJECTS = /\b(biolog\w*|chemistr\w*|organic|physic\w*|anatom\w*|physiolog\w*|microbiolog\w*|biochem\w*|statistic\w*|psycholog\w*|phonetic\w*|linguistic\w*|calculus|nutrition)\b/gi;
const CREDITS = /\b\d{1,2}\s*(semester\s+)?(credit|hour|unit)s?\b/gi;

const urls = process.argv.slice(2).filter((a) => a.startsWith("http"));

/** The URL a site returns for a path that certainly does not exist, in the candidate's directory. */
function controlUrl(url: string): string {
  const u = new URL(url);
  const parts = u.pathname.split("/");
  const last = parts[parts.length - 1] ?? "";
  const ext = /\.(html?|aspx|php)$/i.exec(last)?.[0] ?? "";
  parts[parts.length - 1] = `zzz-control-not-a-real-page${ext}`;
  u.pathname = parts.join("/");
  u.search = "";
  return u.toString();
}
const browser = await chromium.launch();
const ctx = await browser.newContext({
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
});
async function read(url: string): Promise<{ status: number; title: string; text: string }> {
  const page = await ctx.newPage();
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(1500);
    return {
      status: resp?.status() ?? 0,
      title: (await page.title()).replace(/\s+/g, " ").trim(),
      text: ((await page.evaluate("document.body ? document.body.innerText : ''")) as string).replace(/\s+/g, " "),
    };
  } finally {
    await page.close();
  }
}

const controlCache = new Map<string, { title: string; text: string }>();

for (const url of urls) {
  let verdict = "";
  try {
    const { status, title, text } = await read(url);
    const cu = controlUrl(url);
    if (!controlCache.has(cu)) controlCache.set(cu, await read(cu));
    const control = controlCache.get(cu)!;
    // Identical text to the site's not-found response means the path does not exist, whatever
    // status it returned. A near-identical length with the same title is the same thing.
    const sameAsControl =
      text === control.text || (title === control.title && Math.abs(text.length - control.text.length) < 40);
    const subjects = new Set((text.match(SUBJECTS) ?? []).map((s) => s.toLowerCase().slice(0, 6)));
    const credits = (text.match(CREDITS) ?? []).length;
    const flag = sameAsControl ? "NOTFOUND" : status === 200 ? "REAL    " : "STATUS  ";
    verdict = `${flag} ${status} len=${String(text.length).padStart(6)} subjects=${String(subjects.size).padStart(2)} credits=${String(credits).padStart(3)} | ${title.slice(0, 48)}`;
  } catch (err) {
    // A fetch failure is a fetch failure, not a finding about the page.
    verdict = `ERROR ${(err as Error).message.split("\n")[0].slice(0, 70)}`;
  }
  console.log(`${verdict}\n   ${url}`);
}
await browser.close();
process.exit(0);
