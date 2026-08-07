async function main() {
  const url = "https://chp.mercer.edu/academics-and-departments/physical-therapy/";
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36" } });
  const html = await res.text();
  console.log("status", res.status, "len", html.length);
  const links = new Set<string>();
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    try {
      const u = new URL(m[1], url);
      if (u.hostname.endsWith("mercer.edu") && /prereq|requirement|admiss|apply/i.test(u.pathname)) links.add(u.toString());
    } catch {}
  }
  console.log([...links].slice(0, 15).join("\n"));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
