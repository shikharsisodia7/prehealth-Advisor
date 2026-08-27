/**
 * Render ASHA's CAA listing and save the HTML, so accreditation status can be parsed outside
 * the browser. Parsing in the page means writing regexes inside an evaluate string, where an
 * escape that survives TypeScript but not the template literal silently strips characters.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const LISTING = "https://apps.asha.org/eweb/ashadynamicpage.aspx?caacat=slp&site=ashacms&webcode=caalisting";
const out = path.join(process.cwd(), "..", "qa", "asha-slp.html");

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" });
const page = await ctx.newPage();
await page.goto(LISTING, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(4000);
const html = await page.content();
fs.writeFileSync(out, html);
console.log("SAVED " + out + " bytes=" + html.length);
await browser.close();
process.exit(0);
