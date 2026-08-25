import { chromium } from "playwright";

const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" });
const p = await ctx.newPage();

const errors: string[] = [];
p.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
p.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 160)));

await p.goto("https://prehealth-advisor.vercel.app/", { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(2500);

const info = (await p.evaluate(`(function(){
  return {
    url: location.href,
    title: document.title,
    h1: document.querySelector('h1') ? document.querySelector('h1').textContent : '',
    buttons: Array.from(document.querySelectorAll('button')).map(function(b){return (b.textContent||'').trim();}).filter(Boolean).slice(0,25),
    roleCombo: Array.from(document.querySelectorAll('[role="combobox"]')).map(function(c){return (c.textContent||'').trim();}).slice(0,10),
    bodyhead: (document.body.innerText||'').slice(0,260)
  };
})()`)) as any;

console.log("URL=" + info.url);
console.log("TITLE=" + info.title);
console.log("H1=" + info.h1);
console.log("BUTTONS=" + JSON.stringify(info.buttons));
console.log("COMBOS=" + JSON.stringify(info.roleCombo));
console.log("BODYHEAD=" + JSON.stringify(info.bodyhead));
console.log("CONSOLE_ERRORS=" + JSON.stringify(errors.slice(0, 5)));

await b.close();
process.exit(0);
