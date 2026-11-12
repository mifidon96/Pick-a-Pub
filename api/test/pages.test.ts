import assert from "node:assert/strict";
process.env.WEB_BUCKET = "web-test";
process.env.SITE_URL = "https://pickapub.example";
process.env.SITE_ENV = "prod";
const { handle } = await import("../src/routes");
const { runAdmin } = await import("../src/admin");
const { objects } = await import("./mock-s3");
const { db } = await import("../src/lib/db");
const { pubPagePath, renderPubPage } = await import("../src/services/pages");

// A reviewed pub with awkward characters in its name and review.
await db().query("delete from pubs where source = 'pages-test'");
const id: number = (await db().query(
  `insert into pubs (source, source_id, name, address, postcode, lat, lng)
   values ('pages-test', '1', 'The <b>Fox</b> & Hounds', '1 Test Street', 'SW12 9AA', 51.4435, -0.1520) returning id`,
)).rows[0].id;
let r = await handle({ method: "PUT", path: `/pubs/${id}/review`, userId: "pages-test", query: {}, body: {
  display_name: "Paige", sightlines: 5, screens: 4, crowd: 4, shows_sky: true, comment: "Great view <script>alert(1)</script>", match_label: "Arsenal v Chelsea",
} });
assert.equal(r.status, 200);
objects.set("pubs/old-pub-999/index.html", "stale"); // a page for a pub that no longer has one
objects.set("pub/index.html", "the app"); // the app's own file: must be left alone

// The API says where the pub's page is.
const path = pubPagePath("The <b>Fox</b> & Hounds", id);
assert.equal(path, `/pubs/the-b-fox-b-and-hounds-${id}/`);
r = await handle({ method: "GET", path: `/pubs/${id}`, query: {}, body: undefined });
assert.equal((r.body as { pub: { page: string } }).pub.page, path);
r = await handle({ method: "GET", path: "/pubs/1", query: {}, body: undefined });
const one = (r.body as { pub: { page: string | null; review_count: number | null; verdict: unknown } }).pub;
assert.equal(one.page === null, !(one.review_count || one.verdict), "no page for a pub with nothing to say");

const out = (await runAdmin({ action: "render_pages" })) as { ok: boolean; pubs: number; removed: number };
assert.ok(out.ok && out.pubs >= 1);
assert.equal(out.removed, 1, "the stale page is removed");
assert.ok(!objects.has("pubs/old-pub-999/index.html"));
assert.equal(objects.get("pub/index.html"), "the app", "app files are untouched");

// The pub page: real HTML with the facts in it, everything escaped.
const html = objects.get(`${path.slice(1)}index.html`)!;
assert.ok(html, "pub page written");
assert.match(html, /<h1>The &lt;b&gt;Fox&lt;\/b&gt; &amp; Hounds<\/h1>/);
assert.ok(!html.includes("<script>alert(1)"), "review text is escaped");
assert.match(html, /Great view &lt;script&gt;/);
assert.match(html, /1 review/);
assert.match(html, /Sky Sports/);
assert.match(html, /Watched: Arsenal v Chelsea/);
assert.match(html, new RegExp(`<link rel="canonical" href="https://pickapub.example${path}">`));
assert.ok(!html.includes('name="robots"'), "the live site is indexable");
assert.match(html, new RegExp(`href="/pub/review/\\?id=${id}"`));
const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1]!);
assert.equal(ld["@type"], "BarOrPub");
assert.equal(ld.aggregateRating.reviewCount, 1);
assert.equal(ld.review[0].author.name, "Paige");

// The area page lists it and links to it; the sitemap has both.
const area = objects.get("football-pubs/balham/index.html")!;
assert.match(area, /Best pubs for watching football in Balham/);
assert.ok(area.includes(`href="${path}"`));
assert.match(html, /href="\/football-pubs\/balham\/"/, "the pub page links back to its area");
const sitemap = objects.get("sitemap.xml")!;
assert.ok(sitemap.includes(`<loc>https://pickapub.example${path}</loc>`));
assert.ok(sitemap.includes("<loc>https://pickapub.example/football-pubs/balham/</loc>"));

// Dev is kept out of search results; our verdict is never marked up as stars.
const dev = renderPubPage({ url: "https://dev.example", index: false },
  { id: 5, name: "Verdict Only", address: null, postcode: null, lat: 51, lng: 0, review_count: null, stars: null, vibe: null,
    verdict: { rating: 4.5, summary: "Big screens.", best_for: null, tip: null, visited: "2026-10" } }, [], null);
assert.match(dev, /<meta name="robots" content="noindex">/);
assert.match(dev, /Pick-a-Pub's verdict: 4.5 out of 5/);
assert.ok(!dev.includes("aggregateRating"));

await db().query("delete from users where id = 'pages-test'");
await db().query("delete from pubs where source = 'pages-test'");
console.log("search page tests passed");
await db().end();
