/** Print a page's links, optionally filtered, to follow a hub page to the sub-page that holds the requirements. */
import { chromium } from "playwright";
const [url, filter] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" }).then((c) => c.newPage());
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2500);
// Evaluated as a source string, the way the worker does it, so this script needs no DOM lib.
//
// String.raw is required, not cosmetic. In an ordinary template literal `\s` is an unrecognised
// escape and collapses to `s`, so the page receives /s+/g and strips every literal "s" from the
// link text -- "Health Pre-Professions" came back as "Health Pre-Profe ion". This is the same
// escape-eaten-by-the-literal fault that turned ASHA's "Historically" into "Hi torically".
const links = (await page.evaluate(String.raw`
  Array.prototype.slice.call(document.querySelectorAll("a[href]")).map(function (a) {
    return (a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 70) + " :: " + a.href;
  })
`)) as string[];
const re = filter ? new RegExp(filter, "i") : null;
for (const l of [...new Set(links)]) if (!re || re.test(l)) console.log(l);
await browser.close();
process.exit(0);
