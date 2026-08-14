import { db, programSchoolsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import fs from "fs";
// Import by spawning the worker helpers is hard; replicate key bits quickly via dynamic import of the script is not exported.
// Instead: print program seeds and manually call keyword expansion via fetch.
const rows = await db.select().from(programSchoolsTable).where(eq(programSchoolsTable.id, 1866));
const p = rows[0];
console.log(JSON.stringify({id:p.id,name:p.name,website:p.websiteUrl,source:p.sourceUrl,status:p.verificationStatus},null,2));
const USER_AGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const seed = p.websiteUrl || p.sourceUrl;
const res = await fetch(seed!, { headers: { "user-agent": USER_AGENT }, redirect: "follow", signal: AbortSignal.timeout(25000) });
const html = await res.text();
const KEYWORDS=["prerequisite","pre-requisite","admission-requirements","admissions","admission","requirements","required-course","how-to-apply","apply","eligibility","prospective","application-requirements","catalog","handbook"];
const base=new URL(res.url);
const rootDomain=base.hostname.split(".").slice(-2).join(".");
const links=[];
for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
  try {
    const u=new URL(m[1], base);
    if(!u.hostname.endsWith(rootDomain)) continue;
    const hay=`${u.pathname} ${m[2].replace(/<[^>]+>/g," ")}`.toLowerCase();
    if(!KEYWORDS.some(k=>hay.includes(k))) continue;
    links.push(u.toString());
  } catch {}
}
console.log("SEED", res.url, "links", [...new Set(links)].slice(0,15));
const adm='https://medschool.ucsd.edu/education/physician-assistant/admissions/index.html';
const r2=await fetch(adm,{headers:{"user-agent":USER_AGENT},signal:AbortSignal.timeout(25000)});
const t=(await r2.text()).replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ");
console.log("ADM_LEN", t.length, "HAS_PREREQ", /prerequis/i.test(t));
console.log("SNIP", t.match(/.{0,60}prerequis.{0,120}/i)?.[0]);
process.exit(0);
