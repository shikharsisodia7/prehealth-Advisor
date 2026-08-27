/**
 * Drives the professor's workflow against production and reports what it actually observed:
 * profession -> state -> several programmes -> prerequisites -> per-programme sources ->
 * Copy Results -> XLSX.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "https://prehealth-advisor.vercel.app/";
const OUT = path.join(process.cwd(), "..", "qa");
fs.mkdirSync(OUT, { recursive: true });

const PROFESSION = process.argv[process.argv.indexOf("--profession") + 1] ?? "Physical Therapy";
const STATE = process.argv.includes("--state") ? process.argv[process.argv.indexOf("--state") + 1]! : "";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  permissions: ["clipboard-read", "clipboard-write"],
  acceptDownloads: true,
});
const page = await ctx.newPage();
const errors: string[] = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 160)));

await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2000);

// 1. Profession
await page.getByRole("combobox").first().click();
await page.waitForTimeout(900);
await page.getByRole("option", { name: new RegExp(PROFESSION, "i") }).first().click();
await page.waitForTimeout(2500);
console.log("STEP profession=" + PROFESSION);

// 2. Report the controls now available, so the run adapts to the real UI.
const stage = (await page.evaluate(`(function(){
  return {
    combos: Array.from(document.querySelectorAll('[role="combobox"]')).map(function(c){return (c.textContent||'').trim().slice(0,40);}),
    buttons: Array.from(document.querySelectorAll('button')).map(function(b){return (b.textContent||'').trim();}).filter(Boolean).slice(0,30),
    checkboxes: document.querySelectorAll('[role="checkbox"], input[type="checkbox"]').length,
    bodylen: (document.body.innerText||'').length
  };
})()`)) as any;
console.log("STAGE " + JSON.stringify(stage));

// 3. State filter, when the UI offers one.
if (STATE) {
  // The state filter is a native <select>, styled so its options are never visibly clickable.
  const sel = page.locator("select").first();
  if (await sel.count()) {
    await sel.selectOption(STATE);
    await page.waitForTimeout(2500);
    console.log("STEP state=" + STATE);
  } else {
    console.log("STATE_SELECT=absent");
  }
  const shown = String(await page.evaluate(`document.body ? document.body.innerText : ''`)).match(/(\d+) of (\d+) programs shown/);
  if (shown) console.log("STATE_FILTER_COUNT=" + shown[1] + " of " + shown[2]);
}

// 3b. Degree-type filter, which medicine exposes as MD (Allopathic) / DO (Osteopathic).
const DEGREE = process.argv.includes("--degree") ? process.argv[process.argv.indexOf("--degree") + 1]! : "";
if (DEGREE) {
  const other = DEGREE.toUpperCase() === "MD" ? /DO \(Osteopathic\)/i : /MD \(Allopathic\)/i;
  const toggle = page.getByText(other).first();
  if (await toggle.count()) {
    await toggle.click();
    await page.waitForTimeout(2500);
    console.log("STEP degree-filter kept=" + DEGREE);
  } else {
    console.log("DEGREE_TOGGLE=absent");
  }
}

// 3c. Some professions ask for a pathway before listing programmes. Nursing keeps ABSN and
// MEPN apart, which is why its programme list is empty until one is chosen.
const PATHWAY = process.argv.includes("--pathway") ? process.argv[process.argv.indexOf("--pathway") + 1]! : "";
if (PATHWAY) {
  // Matched by visible text: these buttons carry an aria-label that hides their wording from
  // getByRole's accessible-name filter.
  const btn = page.locator("button").filter({ hasText: new RegExp(PATHWAY, "i") }).first();
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(2500);
    console.log("STEP pathway=" + PATHWAY);
  } else {
    console.log("PATHWAY_BUTTON=absent");
  }
}

// 4. Select programmes. They are role=option rows inside the programme listbox, not checkboxes.
const listbox = page.locator('[role="listbox"]').first();
const options = listbox.locator('[role="option"]');
const total = await options.count();
console.log("PROGRAM_OPTIONS=" + total);

const chosen: string[] = [];
const PICK = process.argv.includes("--pick") ? process.argv[process.argv.indexOf("--pick") + 1]!.split("|") : null;

if (PICK) {
  // Named programmes, so a specific case can be checked rather than whatever sorts first.
  for (const nameFragment of PICK) {
    const row = options.filter({ hasText: nameFragment }).first();
    if (!(await row.count())) { console.log("PICK_NOT_FOUND=" + nameFragment); continue; }
    const label = ((await row.textContent()) ?? "").replace(/\s+/g, " ").trim();
    await row.scrollIntoViewIfNeeded({ timeout: 5000 });
    await row.click({ timeout: 8000 });
    chosen.push(label.slice(0, 60));
    await page.waitForTimeout(900);
  }
} else {
  // Spread the picks across the list so the three programmes are unrelated schools.
  for (const idx of [0, Math.floor(total / 3), Math.floor((2 * total) / 3)]) {
    if (idx >= total) continue;
    const label = ((await options.nth(idx).textContent()) ?? "").replace(/\s+/g, " ").trim();
    try {
      await options.nth(idx).scrollIntoViewIfNeeded({ timeout: 5000 });
      await options.nth(idx).click({ timeout: 8000 });
      chosen.push(label.slice(0, 60));
      await page.waitForTimeout(900);
    } catch { /* row may be virtualised out */ }
  }
}
console.log("CHOSEN=" + JSON.stringify(chosen));
await page.waitForTimeout(1500);

// 4b. Results are behind an explicit step, not rendered on selection.
const viewBtn = page.getByRole("button", { name: /view required prerequisites|view prerequisites/i }).first();
if (await viewBtn.count()) {
  await viewBtn.scrollIntoViewIfNeeded();
  await viewBtn.click();
  console.log("STEP clicked View Required Prerequisites");
  await page.waitForTimeout(4000);
} else {
  console.log("VIEW_BUTTON=absent");
}
await page.waitForTimeout(1500);

const text = String(await page.evaluate(`document.body ? document.body.innerText : ''`));
fs.writeFileSync(path.join(OUT, "flow-body.txt"), text);
console.log("BODY_LEN=" + text.length);
console.log("SELECTED_MENTIONS=" + (text.match(/Selected|selected/g) ?? []).length);

// 5. Per-programme sources actually rendered.
const links = (await page.evaluate(`(function(){
  return Array.from(document.querySelectorAll('a[href^="http"]')).map(function(a){
    return { href: a.href, label: (a.textContent||'').trim().slice(0,60) };
  });
})()`)) as Array<{ href: string; label: string }>;
const sourceLinks = links.filter((l) => !/prehealth-advisor\.vercel\.app/.test(l.href));
console.log("SOURCE_LINKS=" + sourceLinks.length);
for (const l of sourceLinks.slice(0, 10)) console.log("   SRC " + l.href.slice(0, 96));

// 6. Copy Results.
let clip = "";
const copyBtn = page.getByRole("button", { name: /copy/i }).first();
if (await copyBtn.count()) {
  await copyBtn.click();
  await page.waitForTimeout(1200);
  try { clip = String(await page.evaluate(`navigator.clipboard.readText()`)); } catch (e) { clip = "CLIPBOARD_READ_FAILED: " + (e as Error).message.slice(0, 80); }
  fs.writeFileSync(path.join(OUT, "clipboard.txt"), clip);
  console.log("CLIPBOARD_LEN=" + clip.length);
  console.log("CLIPBOARD_HEAD=" + JSON.stringify(clip.slice(0, 300)));
} else {
  console.log("COPY_BUTTON=absent");
}

// 7. XLSX download.
const xlsxBtn = page.getByRole("button", { name: /xlsx|excel|download/i }).first();
if (await xlsxBtn.count()) {
  try {
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }),
      xlsxBtn.click(),
    ]);
    const dest = path.join(OUT, "export.xlsx");
    await dl.saveAs(dest);
    console.log("XLSX_SAVED=" + dest + " bytes=" + fs.statSync(dest).size);
  } catch (e) {
    console.log("XLSX_DOWNLOAD_FAILED=" + (e as Error).message.slice(0, 120));
  }
} else {
  console.log("XLSX_BUTTON=absent");
}

console.log("CONSOLE_ERRORS=" + JSON.stringify(errors.slice(0, 6)));
await browser.close();
process.exit(0);
