// Writes sitemap.xml and robots.txt into the built site, so search engines can
// find every featured area and the pubs in it. Run by deploy.sh after the build.
//
//   node scripts/sitemap.mjs <api url> <site url> <web/out folder>
//
// If the API cannot be reached, the sitemap still lists the main pages.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [apiUrl, siteUrl, outDir] = process.argv.slice(2);
if (!apiUrl || !siteUrl || !outDir) {
  console.error("usage: node scripts/sitemap.mjs <api url> <site url> <out dir>");
  process.exit(1);
}
const site = siteUrl.replace(/\/+$/, "");
const areas = JSON.parse(readFileSync(new URL("../web/lib/areas.json", import.meta.url), "utf8"));
const today = new Date().toISOString().slice(0, 10);

const urls = new Map(); // path -> priority
const add = (path, priority) => { if (!urls.has(path)) urls.set(path, priority); };
add("/", "1.0");
add("/match/", "0.8");
for (const a of areas) add(`/?area=${a.id}`, "0.9");
add("/privacy/", "0.2");
add("/terms/", "0.2");

let pubs = 0;
for (const a of areas) {
  for (const sort of ["stars", "distance"]) {
    const q = new URLSearchParams({ lat: a.lat, lng: a.lng, radius_m: Math.min(10000, a.import_radius_m * 2), sort });
    try {
      const res = await fetch(`${apiUrl.replace(/\/+$/, "")}/pubs?${q}`, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      for (const p of (await res.json()).pubs ?? []) {
        if (!urls.has(`/pub/?id=${p.id}`)) pubs++;
        add(`/pub/?id=${p.id}`, p.stars !== null ? "0.7" : "0.5");
      }
    } catch (e) {
      console.warn(`sitemap: could not list pubs for ${a.id} (${e.message}); carrying on`);
    }
  }
}

const esc = (s) => s.replace(/&/g, "&amp;");
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...urls].map(([path, pr]) => `  <url><loc>${esc(site + path)}</loc><lastmod>${today}</lastmod><priority>${pr}</priority></url>`).join("\n")}
</urlset>
`;
writeFileSync(join(outDir, "sitemap.xml"), xml);

writeFileSync(join(outDir, "robots.txt"), `User-agent: *
Allow: /
Disallow: /account/
Disallow: /auth/
Disallow: /pub/review/
Disallow: /offline/

Sitemap: ${site}/sitemap.xml
`);
console.log(`sitemap.xml: ${urls.size} pages (${pubs} pubs), robots.txt written`);
