/**
 * Search-free discovery of official, program-specific admissions/prerequisite pages.
 *
 * Every general web-search backend (Google, Bing, DuckDuckGo, Firecrawl, Jina, Keenable)
 * is bot-blocked or unfunded from this host, so discovery must work directly against the
 * institution's own domain. Universities are highly predictable:
 *   - schools live on <school>.<root> subdomains (dentistry.utah.edu, nursing.jhu.edu)
 *   - CMSes expose a native search endpoint (WordPress ?s=, Drupal /search/node)
 *   - most publish a sitemap that enumerates every page
 * Everything returned is on the institution's own domain, so these are authoritative
 * sources by construction.
 */

export type Fetched = { url: string; html: string; text: string };
export type Fetcher = (url: string) => Promise<Fetched>;

/** Subdomain labels institutions commonly use for each profession's school/college. */
const SUBDOMAINS: Record<string, string[]> = {
  dental: ["dentistry", "dental", "dentalmedicine", "sod"],
  medicine: ["medicine", "med", "medschool", "som", "medicalschool"],
  nursing: ["nursing", "son", "nurse"],
  pharmacy: ["pharmacy", "sop", "rx"],
  "physical-therapy": ["pt", "physicaltherapy", "shrs", "healthprofessions", "chp"],
  "occupational-therapy": ["ot", "occupationaltherapy", "healthprofessions", "chp", "shrs"],
  "physician-assistant": ["pa", "physicianassistant", "healthprofessions", "chp", "medicine"],
  "speech-language-pathology": ["csd", "slp", "communication", "commdisorders", "shs"],
  dietetics: ["nutrition", "dietetics", "humansciences", "hhs", "ches"],
  optometry: ["optometry", "opt"],
  podiatry: ["podiatry", "cpm"],
  veterinary: ["vetmed", "veterinary", "cvm", "vet"],
  "genetic-counseling": ["genetics", "medicine", "gradschool"],
  "prosthetics-orthotics": ["prosthetics", "healthprofessions", "medicine"],
  "anesthesiologist-assistant": ["medicine", "anesthesiology", "health"],
  "pathologists-assistant": ["medicine", "pathology", "health"],
  postbac: ["postbac", "postbacc", "continuingstudies", "scs", "extension", "gradschool"],
};

/** Path fragments that commonly host the program under a generic university host. */
const PATHS: Record<string, string[]> = {
  dental: ["/dentistry", "/dental", "/dental-medicine"],
  medicine: ["/medicine", "/school-of-medicine", "/med"],
  nursing: ["/nursing", "/school-of-nursing"],
  pharmacy: ["/pharmacy", "/school-of-pharmacy"],
  "physical-therapy": ["/physical-therapy", "/pt", "/dpt"],
  "occupational-therapy": ["/occupational-therapy", "/ot", "/otd"],
  "physician-assistant": ["/physician-assistant", "/pa-program", "/pa"],
  "speech-language-pathology": [
    "/speech-language-pathology",
    "/csd",
    "/communication-sciences-and-disorders",
    "/speech",
  ],
  dietetics: ["/nutrition", "/dietetics", "/nutrition-and-dietetics"],
  optometry: ["/optometry"],
  podiatry: ["/podiatric-medicine", "/podiatry"],
  veterinary: ["/veterinary-medicine", "/vetmed"],
  "genetic-counseling": ["/genetic-counseling"],
  "prosthetics-orthotics": ["/prosthetics-orthotics", "/orthotics-prosthetics"],
  "anesthesiologist-assistant": ["/anesthesiologist-assistant", "/anesthesia"],
  "pathologists-assistant": ["/pathologists-assistant", "/pathology"],
  postbac: ["/postbac", "/post-baccalaureate", "/postbaccalaureate", "/premedical"],
};

/** Native CMS search endpoints, ordered by how common they are in higher-ed. */
const SEARCH_ENDPOINTS: Array<(host: string, q: string) => string> = [
  (h, q) => `https://${h}/?s=${encodeURIComponent(q)}`,
  (h, q) => `https://${h}/search?q=${encodeURIComponent(q)}`,
  (h, q) => `https://${h}/search/node?keys=${encodeURIComponent(q)}`,
  (h, q) => `https://${h}/search/?q=${encodeURIComponent(q)}`,
  (h, q) => `https://${h}/search.html?q=${encodeURIComponent(q)}`,
];

/**
 * Per-host memoization.
 *
 * Discovery issues many requests per program (subdomain probes, CMS search endpoints,
 * sitemap traversal). Programs frequently share an institution host, and the supervisor
 * re-runs rounds over the same hosts, so without caching the same dead subdomain is probed
 * repeatedly. Cached per process; the worker is restarted each round so entries stay fresh.
 */
const memo = new Map<string, Promise<string[]>>();
function memoized(key: string, run: () => Promise<string[]>): Promise<string[]> {
  const hit = memo.get(key);
  if (hit) return hit;
  const p = run().catch(() => [] as string[]);
  memo.set(key, p);
  return p;
}

export function rootDomainOf(host: string): string {
  const parts = host.replace(/^www\./, "").split(".");
  if (parts.length > 2 && /^(ac|edu|gov|co|org)$/.test(parts[parts.length - 2])) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

const RELEVANT =
  /prereq|pre-requisit|requirement|admission|apply|coursework|curriculum|handbook|catalog/i;

/** True when a URL plausibly belongs to this profession's program area. */
export function matchesProfession(url: string, slug: string): boolean {
  const subs = SUBDOMAINS[slug] ?? [];
  const paths = (PATHS[slug] ?? []).map((p) => p.replace(/^\//, ""));
  const hay = url.toLowerCase();
  return [...subs, ...paths].some((t) => t.length > 2 && hay.includes(t));
}

/**
 * Probe predictable program subdomains and paths on the institution's root domain.
 * Returns live program-area URLs.
 */
export async function probeProgramHosts(
  rootDomain: string,
  slug: string,
  fetcher: Fetcher,
  limit = 4,
): Promise<string[]> {
  return memoized(`probe:${rootDomain}:${slug}`, () => probeProgramHostsUncached(rootDomain, slug, fetcher, limit));
}

async function probeProgramHostsUncached(
  rootDomain: string,
  slug: string,
  fetcher: Fetcher,
  limit: number,
): Promise<string[]> {
  const found: string[] = [];
  for (const s of (SUBDOMAINS[slug] ?? []).slice(0, limit)) {
    try {
      const page = await fetcher(`https://${s}.${rootDomain}/`);
      if (page.text.length > 500) found.push(page.url);
    } catch {
      /* subdomain does not exist */
    }
    if (found.length >= 2) break;
  }
  if (found.length < 2) {
    for (const p of (PATHS[slug] ?? []).slice(0, 4)) {
      try {
        const page = await fetcher(`https://www.${rootDomain}${p}`);
        if (page.text.length > 500) found.push(page.url);
      } catch {
        /* path does not exist */
      }
      if (found.length >= 2) break;
    }
  }
  return [...new Set(found)];
}

/**
 * Extract same-root-domain result links from a search results page.
 *
 * Many university CMSes answer an unsupported search endpoint with the homepage rather than
 * a 404. Accepting any link that merely mentions "admission" then harvests the site's
 * top-level admissions nav ("/admissions/first-year/"), which is never the program's
 * prerequisite page and costs a fetch and an extraction attempt per program. A link must
 * therefore either name this profession or explicitly mention prerequisites; generic
 * top-level admissions pages are rejected outright.
 */
function resultLinks(html: string, base: string, rootDomain: string, slug: string): string[] {
  const out = new Map<string, number>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const u = new URL(m[1], base);
      if (!u.hostname.endsWith(rootDomain)) continue;
      const full = u.toString();
      if (/\/search|[?&]s=|\/tag\/|\/category\//i.test(full)) continue;
      const label = m[2].replace(/<[^>]+>/g, " ").toLowerCase();
      const hay = `${u.pathname} ${label}`;
      if (!RELEVANT.test(hay)) continue;

      const professionRelevant = matchesProfession(full, slug) || matchesProfession(hay, slug);
      const mentionsPrereq = /prereq|pre-requisit|required\s*cours|coursework/i.test(hay);
      if (!professionRelevant && !mentionsPrereq) continue;
      // Generic top-level admissions funnels ("/admissions/", "/admissions/transfer/").
      if (!professionRelevant && /^\/admissions?\/?[a-z-]*\/?$/i.test(u.pathname)) continue;

      let score = 0;
      if (/prereq|pre-requisit/.test(hay)) score += 6;
      if (/requirement/.test(hay)) score += 3;
      if (/admission/.test(hay)) score += 2;
      if (professionRelevant) score += 5;
      if (/\.pdf$/i.test(u.pathname)) score += 2;
      u.hash = "";
      out.set(u.toString(), Math.max(out.get(u.toString()) ?? 0, score));
    } catch {
      /* skip malformed */
    }
  }
  return [...out.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([u]) => u);
}

/** Query the institution's own on-site search for prerequisite pages. */
export async function nativeSiteSearch(
  host: string,
  queries: string[],
  fetcher: Fetcher,
  slug = "",
): Promise<string[]> {
  const clean = host.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return memoized(`sitesearch:${clean}:${slug}:${queries[0] ?? ""}`, () =>
    nativeSiteSearchUncached(clean, queries, fetcher, slug),
  );
}

/** Hosts whose CMS exposes no working search endpoint — stop retrying all five per program. */
const noSearchEndpoint = new Set<string>();

async function nativeSiteSearchUncached(
  clean: string,
  queries: string[],
  fetcher: Fetcher,
  slug: string,
): Promise<string[]> {
  if (noSearchEndpoint.has(clean)) return [];
  const rootDomain = rootDomainOf(clean);
  const found: string[] = [];
  let anyEndpointWorked = false;
  for (const q of queries.slice(0, 2)) {
    for (const build of SEARCH_ENDPOINTS) {
      try {
        const page = await fetcher(build(clean, q));
        if (!page.html || page.text.length < 300) continue;
        anyEndpointWorked = true;
        const links = resultLinks(page.html, page.url, rootDomain, slug);
        if (links.length) {
          found.push(...links);
          break;
        }
      } catch {
        /* endpoint not present */
      }
    }
    if (found.length >= 4) break;
  }
  if (!anyEndpointWorked) noSearchEndpoint.add(clean);
  return [...new Set(found)];
}

/**
 * Harvest the host's sitemap(s) and return URLs that look like this profession's
 * prerequisite/admissions pages. Bounded so a huge sitemap cannot stall the worker.
 */
export async function sitemapCandidates(
  host: string,
  slug: string,
  fetcher: Fetcher,
  maxSitemaps = 6,
): Promise<string[]> {
  const clean = host.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return memoized(`sitemap:${clean}:${slug}`, () =>
    sitemapCandidatesUncached(clean, slug, fetcher, maxSitemaps),
  );
}

async function sitemapCandidatesUncached(
  clean: string,
  slug: string,
  fetcher: Fetcher,
  maxSitemaps: number,
): Promise<string[]> {
  const roots = [
    `https://${clean}/sitemap.xml`,
    `https://${clean}/sitemap_index.xml`,
    `https://${clean}/wp-sitemap.xml`,
  ];
  const seen = new Set<string>();
  const pages: string[] = [];
  const queue: string[] = [];

  for (const r of roots) {
    try {
      const page = await fetcher(r);
      if (/<(urlset|sitemapindex)/i.test(page.html || page.text)) {
        queue.push(page.url);
        break;
      }
    } catch {
      /* try next root */
    }
  }

  while (queue.length && seen.size < maxSitemaps) {
    const u = queue.shift();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    try {
      const page = await fetcher(u);
      const body = page.html || page.text;
      const locs = [...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
      if (/<sitemapindex/i.test(body)) {
        const ranked = locs.sort(
          (a, b) =>
            Number(/page|program|academic/i.test(b)) - Number(/page|program|academic/i.test(a)),
        );
        queue.push(...ranked.slice(0, maxSitemaps));
      } else {
        pages.push(...locs);
      }
    } catch {
      /* skip */
    }
  }

  const scored = pages
    .filter((u) => RELEVANT.test(u))
    .map((u) => {
      let s = 0;
      if (/prereq|pre-requisit/i.test(u)) s += 6;
      if (/requirement/i.test(u)) s += 3;
      if (/admission/i.test(u)) s += 2;
      if (matchesProfession(u, slug)) s += 5;
      return [u, s] as const;
    })
    .filter(([, s]) => s >= 5)
    .sort((a, b) => b[1] - a[1]);

  return [...new Set(scored.map(([u]) => u))].slice(0, 6);
}
