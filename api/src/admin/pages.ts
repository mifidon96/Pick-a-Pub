import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import areas from "../../../web/lib/areas.json";
import { db } from "../lib/db";
import { loadPub, nearbyPubs } from "../routes/pubs";
import { areaPagePath, pubPagePath, renderAreaPage, renderPubPage, renderSitemap, type PageArea, type PagePub, type Site } from "../services/pages";

// Builds the pages search engines read (services/pages.ts) and saves them in
// the website bucket, next to the app. Run nightly (infra/pages.tf) and at the
// end of each deploy, so a new review shows up on its pub's page within a day.
//
// Only these two folders and sitemap.xml are ever written or cleaned up here;
// the app's own files are left alone.
const FOLDERS = ["pubs/", "football-pubs/"];
const HAS_PAGE = "(coalesce(s.review_count, 0) > 0 or e.rating is not null)";

let s3: S3Client | undefined;
const client = () => (s3 ??= new S3Client({ region: process.env.AWS_REGION ?? "eu-west-2" }));

export async function renderPages() {
  const bucket = process.env.WEB_BUCKET;
  const url = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
  if (!bucket || !url) return { ok: true, skipped: "WEB_BUCKET or SITE_URL not set" };
  // Only the live site should appear in search results.
  const site: Site = { url, index: process.env.SITE_ENV === "prod" };
  const today = new Date().toISOString().slice(0, 10);

  const written = new Set<string>();
  const save = async (key: string, body: string, type: string) => {
    // Cached for an hour by CloudFront and browsers, so no cache clearing is needed.
    await client().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: type, CacheControl: "public, max-age=3600" }));
    written.add(key);
  };
  const sitemap = [
    { path: "/", priority: "1.0", lastmod: today },
    { path: "/match/", priority: "0.8", lastmod: today },
  ];

  // Area pages: reviewed pubs within 5 km (the list's default), best first.
  const areaOf = new Map<number, PageArea>();
  for (const a of areas) {
    const { pubs } = await nearbyPubs({
      lat: a.lat, lng: a.lng, radius: 5000,
      where: `and ${HAS_PAGE}`,
      order: "s.stars desc nulls last, s.review_count desc nulls last, e.rating desc nulls last, distance_m",
      params: [],
    });
    for (const p of pubs) if (!areaOf.has(p.id)) areaOf.set(p.id, a);
    if (pubs.length) {
      await save(`${areaPagePath(a.id).slice(1)}index.html`, renderAreaPage(site, a, pubs as PagePub[]), "text/html; charset=utf-8");
      sitemap.push({ path: areaPagePath(a.id), priority: "0.9", lastmod: today });
    } else {
      sitemap.push({ path: `/?area=${a.id}`, priority: "0.9", lastmod: today });
    }
  }

  // One page per pub with a review or our verdict, a few at a time.
  const { rows } = await db().query(
    `select p.id from pubs p
       left join pub_scores s on s.pub_id = p.id
       left join pub_editorial e on e.pub_id = p.id
      where ${HAS_PAGE} order by p.id limit 5000`,
  );
  const ids = rows.map((r) => r.id as number);
  for (let i = 0; i < ids.length; i += 8) {
    await Promise.all(ids.slice(i, i + 8).map(async (id) => {
      const found = await loadPub(id);
      if (!found) return;
      const path = pubPagePath(found.pub.name, id);
      await save(`${path.slice(1)}index.html`, renderPubPage(site, found.pub as PagePub, found.reviews, areaOf.get(id) ?? null), "text/html; charset=utf-8");
      const last = found.pub.last_reviewed_at ? new Date(found.pub.last_reviewed_at).toISOString().slice(0, 10) : today;
      sitemap.push({ path, priority: found.pub.stars !== null ? "0.7" : "0.6", lastmod: last });
    }));
  }

  sitemap.push({ path: "/privacy/", priority: "0.2", lastmod: today }, { path: "/terms/", priority: "0.2", lastmod: today });
  await save("sitemap.xml", renderSitemap(site, sitemap), "application/xml");

  // Remove pages for pubs that no longer have one (review deleted, pub renamed).
  let removed = 0;
  for (const prefix of FOLDERS) {
    let token: string | undefined;
    do {
      const page = await client().send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
      for (const o of page.Contents ?? []) {
        if (o.Key && !written.has(o.Key)) {
          await client().send(new DeleteObjectCommand({ Bucket: bucket, Key: o.Key }));
          removed++;
        }
      }
      token = page.NextContinuationToken;
    } while (token);
  }
  return { ok: true, action: "render_pages", pubs: ids.length, areas: areas.length, sitemap: sitemap.length, removed };
}
