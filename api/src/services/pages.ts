import { FACT_KEYS, FACT_LABELS, SCORE_KEYS, SCORE_LABELS, teamName, vibeLabel } from "../../../web/lib/ratings";

// Plain HTML pages that search engines can read without running JavaScript:
//   /pubs/<name>-<id>/          one per pub that has a review or our verdict
//   /football-pubs/<area>/      one per featured area, listing those pubs
// The app's own pages (/pub/?id=) load their content in the browser, which
// search engines index poorly. These carry the same facts as real HTML, and
// link into the app for everything interactive (rating, photos, reporting).
// Built by the admin Lambda (admin/pages.ts) nightly and after each deploy.
// Styled by web/public/pages.css.

export type PagePub = {
  id: number; name: string; address: string | null; postcode: string | null; lat: number; lng: number;
  review_count: number | null; stars: number | null; vibe: number | null; fan_team?: string | null;
  info?: Record<string, unknown> | null;
  verdict?: { rating: number; summary: string | null; best_for: string | null; tip: string | null; visited: string | null } | null;
  photos?: { url: string; credit: string | null; link?: string; licence_url?: string }[];
  photo?: string | null; // cover photo, in lists
  distance_m?: number;
} & Record<string, unknown>;
export type PageReview = { display_name: string; match_label: string | null; comment: string | null; updated_at: string | Date };
export type PageArea = { id: string; label: string };
export type Site = { url: string; index: boolean }; // index: false on dev, so only the live site is in search results

// A pub gets a page once there is something to say about it.
export const hasPage = (p: { review_count?: number | null; verdict?: unknown }) => (p.review_count ?? 0) > 0 || Boolean(p.verdict);

const slug = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "pub";
// The id keeps addresses unique and stable if two pubs share a name.
export const pubPagePath = (name: string, id: number) => `/pubs/${slug(name)}-${id}/`;
export const areaPagePath = (areaId: string) => `/football-pubs/${areaId}/`;

// Everything from the database is escaped before it goes into HTML.
const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const jsonLd = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const starText = (stars: number) => "★".repeat(Math.round(stars)) + "☆".repeat(5 - Math.round(stars));
const httpUrl = (v: unknown) => (typeof v === "string" && /^https?:\/\//i.test(v) ? v : null);

function layout(site: Site, o: { path: string; title: string; description: string; image?: string | null; body: string; data?: unknown }) {
  const canonical = site.url + o.path;
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)} | Pick-a-Pub</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${esc(canonical)}">
${site.index ? "" : '<meta name="robots" content="noindex">\n'}<meta property="og:type" content="website">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(o.image ?? `${site.url}/og.png`)}">
<meta name="theme-color" content="#0b100d">
<link rel="icon" href="/icons/icon-192.png">
<link rel="stylesheet" href="/pages.css">
${o.data ? jsonLd(o.data) : ""}
</head>
<body>
<header><div class="wrap"><a class="brand" href="/">Pick-a-Pub</a><a href="/match/">Matches</a></div></header>
<main class="wrap">
${o.body}
</main>
<footer class="wrap"><p><a href="/privacy/">Privacy</a> <a href="/terms/">Terms</a></p>
<p>Pub locations © OpenStreetMap contributors.</p></footer>
</body>
</html>
`;
}

const ratingTile = (p: PagePub) =>
  p.stars !== null && p.stars !== undefined
    ? `<div class="tile"><strong>${p.stars.toFixed(1)}</strong><span class="stars" aria-hidden="true">${starText(p.stars)}</span><small>${plural(p.review_count ?? 0, "review")}</small></div>`
    : `<div class="tile quiet"><small>No customer reviews yet</small></div>`;

// True facts (Sky Sports, beer garden...), the vibe and whose fans watch here.
function chips(p: PagePub): string[] {
  const out: string[] = [];
  const vibe = vibeLabel((p.vibe as number | null) ?? null);
  if (vibe) out.push(vibe);
  for (const k of FACT_KEYS) if (p[k] === true) out.push(FACT_LABELS[k]);
  const fans = teamName(p.fan_team);
  if (fans) out.push(`${fans} fans`);
  return out;
}

export function renderPubPage(site: Site, pub: PagePub, reviews: PageReview[], area: PageArea | null): string {
  const path = pubPagePath(pub.name, pub.id);
  const where = [pub.address, pub.postcode].filter(Boolean).join(", ");
  const place = area?.label ?? pub.postcode ?? "";
  const rated = pub.stars !== null && pub.stars !== undefined;
  const title = `${pub.name}${place ? `, ${place}` : ""}: watching football here`;
  const description = [
    `${pub.name}${where ? ` (${where})` : ""} for watching football.`,
    rated ? `Rated ${pub.stars!.toFixed(1)} out of 5 by ${plural(pub.review_count ?? 0, "fan")} for screens, view, sound and crowd.` : "",
    pub.verdict?.summary ?? "",
  ].filter(Boolean).join(" ").slice(0, 300);

  const info = pub.info ?? {};
  const photo = pub.photos?.[0];
  const v = pub.verdict;
  const scores = SCORE_KEYS.filter((k) => typeof pub[k] === "number");
  const facts = chips(pub);
  const written = reviews.filter((r) => r.comment);
  const website = httpUrl(info.website);
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${pub.name} ${where}`)}`;

  const body = `<p class="crumbs"><a href="/">Pubs</a>${area ? ` › <a href="${areaPagePath(area.id)}">${esc(area.label)}</a>` : ""}</p>
<div class="head">${ratingTile(pub)}<div><h1>${esc(pub.name)}</h1>
<p class="muted">${where ? `${esc(where)} · ` : ""}<a href="${esc(maps)}" rel="noopener">Directions</a></p></div></div>
${facts.length ? `<ul class="chips">${facts.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
<p class="actions"><a class="button" href="/pub/review/?id=${pub.id}">Rate this pub</a> <a class="button ghost" href="/pub/?id=${pub.id}">Photos, share and more</a></p>
${photo ? `<figure><img src="${esc(photo.url)}" alt="${esc(pub.name)}" loading="lazy">${photo.credit ? `<figcaption>Photo: ${photo.link ? `<a href="${esc(photo.link)}" rel="noopener">${esc(photo.credit)}</a>` : esc(photo.credit)}</figcaption>` : ""}</figure>` : ""}
${v ? `<section class="card"><h2>Pick-a-Pub's verdict: ${v.rating.toFixed(1)} out of 5</h2>
${v.summary ? `<p>${esc(v.summary)}</p>` : ""}
${v.best_for ? `<p><strong>Best for:</strong> ${esc(v.best_for)}</p>` : ""}
${v.tip ? `<p><strong>Tip:</strong> ${esc(v.tip)}</p>` : ""}
<p class="muted small">Our own view${v.visited ? `, visited ${esc(v.visited)}` : ""}. It is separate from the customer star rating.</p></section>` : ""}
${scores.length ? `<section class="card"><h2>Football ratings</h2><dl class="bars">${scores.map((k) => {
    const n = pub[k] as number;
    return `<dt>${esc(SCORE_LABELS[k].label)}</dt><dd><span class="bar"><span style="width:${Math.round((n / 5) * 100)}%"></span></span><b>${n.toFixed(1)}</b></dd>`;
  }).join("")}</dl>
<p class="muted small">Averages from ${plural(pub.review_count ?? 0, "review")} by people who watched a game here.</p></section>` : ""}
${info.opening_hours || website || info.phone ? `<section class="card"><h2>About this pub</h2><dl class="facts">
${info.opening_hours ? `<dt>Opening hours</dt><dd>${esc(info.opening_hours)}</dd>` : ""}
${info.phone ? `<dt>Phone</dt><dd>${esc(info.phone)}</dd>` : ""}
${website ? `<dt>Website</dt><dd><a href="${esc(website)}" rel="noopener nofollow">${esc(website.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a></dd>` : ""}
</dl><p class="muted small">Check with the pub before you go.</p></section>` : ""}
<section><h2>Reviews</h2>
${written.length ? written.map((r) => `<article class="card"><p class="by"><strong>${esc(r.display_name)}</strong> <time datetime="${new Date(r.updated_at).toISOString().slice(0, 10)}">${new Date(r.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" })}</time></p>
${r.match_label ? `<p class="muted small">Watched: ${esc(r.match_label)}</p>` : ""}<p>${esc(r.comment)}</p></article>`).join("\n") : `<p class="muted">No written reviews yet.</p>`}
<p><a href="/pub/review/?id=${pub.id}">Watched a game here? Add your review</a></p></section>
${area ? `<p><a href="${areaPagePath(area.id)}">More pubs for watching football in ${esc(area.label)}</a></p>` : ""}`;

  // Stars in search results come from customer reviews only, never our verdict.
  const data = {
    "@context": "https://schema.org",
    "@type": "BarOrPub",
    name: pub.name,
    url: site.url + path,
    ...(photo ? { image: photo.url } : {}),
    address: { "@type": "PostalAddress", ...(pub.address ? { streetAddress: pub.address } : {}), ...(pub.postcode ? { postalCode: pub.postcode } : {}), addressCountry: "GB" },
    geo: { "@type": "GeoCoordinates", latitude: pub.lat, longitude: pub.lng },
    ...(rated && (pub.review_count ?? 0) > 0
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: pub.stars, bestRating: 5, worstRating: 1, reviewCount: pub.review_count } }
      : {}),
    ...(written.length
      ? { review: written.slice(0, 10).map((r) => ({ "@type": "Review", author: { "@type": "Person", name: r.display_name }, datePublished: new Date(r.updated_at).toISOString().slice(0, 10), reviewBody: r.comment })) }
      : {}),
  };
  return layout(site, { path, title, description, image: photo?.url, body, data });
}

export function renderAreaPage(site: Site, area: PageArea, pubs: PagePub[]): string {
  const path = areaPagePath(area.id);
  const title = `Best pubs for watching football in ${area.label}`;
  const description = `${plural(pubs.length, "pub")} in ${area.label} rated by football fans for screens, view of the match, sound and crowd. Find where to watch the game.`;
  const body = `<p class="crumbs"><a href="/">Pubs</a> › ${esc(area.label)}</p>
<h1>${esc(title)}</h1>
<p class="muted">Rated by people who watched a game there: the view of a screen, the sound, the crowd and getting a seat. Best first.</p>
<p class="actions"><a class="button" href="/?area=${esc(area.id)}">Search, filter and map</a> <a class="button ghost" href="/match/">Where's the match showing?</a></p>
<ol class="list">
${pubs.map((p) => {
    const where = [p.address, p.postcode].filter(Boolean).join(", ");
    const c = chips(p).slice(0, 4);
    return `<li class="card row">${ratingTile(p)}<div><h2><a href="${pubPagePath(p.name, p.id)}">${esc(p.name)}</a></h2>
${where ? `<p class="muted">${esc(where)}</p>` : ""}
${c.length ? `<ul class="chips">${c.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</div></li>`;
  }).join("\n")}
</ol>
<p class="muted small">Only pubs with a review are listed here. <a href="/?area=${esc(area.id)}">See every pub in ${esc(area.label)}</a>.</p>`;
  const data = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: title,
    itemListElement: pubs.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: p.name, url: site.url + pubPagePath(p.name, p.id) })),
  };
  return layout(site, { path, title, description, body, data });
}

// Every page search engines should know about. lastmod: YYYY-MM-DD.
export function renderSitemap(site: Site, pages: { path: string; priority: string; lastmod: string }[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${esc(site.url + p.path)}</loc><lastmod>${p.lastmod}</lastmod><priority>${p.priority}</priority></url>`).join("\n")}
</urlset>
`;
}
