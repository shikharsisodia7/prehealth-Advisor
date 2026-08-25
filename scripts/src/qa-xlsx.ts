/**
 * Parse the XLSX that production actually produced and check the cells, not the code that
 * writes them. Cross-programme leakage is the specific risk: every prerequisite row must carry
 * its own institution and that institution's own source.
 */
// The workbook parser ships without types; this file only reads cells from it.
// @ts-ignore -- untyped ESM build of the xlsx package used by the web app
import * as XLSX from "../../artifacts/prehealth-advisor/node_modules/xlsx/xlsx.mjs";
import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "..", "qa", "export.xlsx");
const wb = XLSX.read(fs.readFileSync(file));
console.log("SHEETS=" + JSON.stringify(wb.SheetNames));

for (const name of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" }) as any[];
  console.log(`\nSHEET "${name}" rows=${rows.length}`);
  if (!rows.length) continue;
  console.log("HEADERS=" + JSON.stringify(Object.keys(rows[0])));
  for (const r of rows.slice(0, 4)) console.log("ROW " + JSON.stringify(r).slice(0, 300));

  // Leakage check: group source URLs by institution.
  const instKey = Object.keys(rows[0]).find((k) => /institution|school|name/i.test(k));
  const srcKey = Object.keys(rows[0]).find((k) => /source/i.test(k));
  if (instKey && srcKey) {
    const map = new Map<string, Set<string>>();
    for (const r of rows) {
      const inst = String(r[instKey] ?? "").trim();
      const src = String(r[srcKey] ?? "").trim();
      if (!inst || !src) continue;
      if (!map.has(inst)) map.set(inst, new Set());
      map.get(inst)!.add(src);
    }
    console.log("INSTITUTIONS=" + map.size);
    let leak = 0;
    for (const [inst, srcs] of map) {
      console.log(`  ${inst.slice(0, 40)} -> ${[...srcs].map((s) => s.slice(0, 70)).join(" | ")}`);
      // A source shared by two different institutions is the leak that matters.
      for (const [other, osrcs] of map) {
        if (other === inst) continue;
        for (const s of srcs) if (osrcs.has(s)) leak++;
      }
    }
    console.log("SHARED_SOURCE_PAIRS=" + leak);
  }
}
process.exit(0);
