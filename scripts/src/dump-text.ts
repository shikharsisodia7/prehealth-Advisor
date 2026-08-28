/** Print a page's rendered text, so a human decision about it rests on what the page actually says. */
import { chromium } from "playwright";
const url = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" }).then((c) => c.newPage());
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2500);
console.log(((await page.evaluate("document.body ? document.body.innerText : ''")) as string).replace(/\n{3,}/g, "\n\n"));
await browser.close();
process.exit(0);
