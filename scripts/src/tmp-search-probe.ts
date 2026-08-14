const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
async function bing(q){
  const res=await fetch(`https://www.bing.com/search?q=${encodeURIComponent(q)}`,{headers:{'user-agent':USER_AGENT,'accept-language':'en-US'},signal:AbortSignal.timeout(30000)});
  console.log('bing_status', res.status);
  const html=await res.text();
  console.log('bing_len', html.length);
  const urls=[];
  for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/gi)) {
    const u=m[1]; if(/bing\.|microsoft\.|msn\.|aka\.ms/i.test(u)) continue; urls.push(u);
  }
  for (const m of html.matchAll(/<cite[^>]*>([\s\S]*?)<\/cite>/gi)) {
    const text=m[1].replace(/<[^>]+>/g,'').replace(/\s+/g,'');
    if(/^https?:\/\//i.test(text)) urls.push(text);
    else if(/^[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) urls.push('https://'+text);
  }
  return [...new Set(urls)].slice(0,15);
}
console.log(await bing('Samford University physician assistant prerequisites site:samford.edu'));
console.log(await bing('Northern Arizona University PA program prerequisites admissions'));
