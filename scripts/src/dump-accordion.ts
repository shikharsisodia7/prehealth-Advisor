/** Print a page's text with every collapsed panel opened, since requirements often hide in accordions. */
import { chromium } from "playwright";
const url = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" }).then((c) => c.newPage());
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2000);
// Click anything that looks like an accordion header, then reveal whatever stayed hidden.
const clickable = await page.$$('[data-toggle], [aria-expanded], .accordion, .accordion-header, summary, .panel-title a, .collapsible');
for (const el of clickable) { try { await el.click({ timeout: 1200 }); } catch { /* not clickable; the CSS pass below still reveals it */ } }
await page.waitForTimeout(1200);
await page.addStyleTag({ content: "*{display:revert !important;visibility:visible !important;max-height:none !important;height:auto !important;opacity:1 !important} .collapse,.hidden,[hidden]{display:block !important}" });
await page.waitForTimeout(600);
console.log(((await page.evaluate("document.body ? document.body.innerText : ''")) as string).replace(/\n{3,}/g, "\n\n"));
await browser.close();
process.exit(0);
