import assert from "node:assert/strict";
process.env.PHOTOS_BUCKET = "test-bucket";
process.env.PHOTOS_BASE_URL = "https://cdn.example";
const { handler } = await import("../src/importer");
const { objects } = await import("./mock-s3");
const { handle } = await import("../src/app");
import { asyncCalls } from "./mock-lambda";
import { db } from "../src/db";
import { tileFor } from "../src/tiles";

// Fake Overpass: two pubs near Cardiff Central.
let wikimediaGone = false;
globalThis.fetch = (async (url: string) => url.startsWith("https://upload.wikimedia.org/")
  ? (wikimediaGone ? new Response("", { status: 404 }) : new Response(new Uint8Array(1234), { headers: { "content-type": "image/jpeg" } }))
  : url.includes("commons.wikimedia.org") ? new Response(JSON.stringify({ query: { pages: { "5": {
  title: "File:Test pub.jpg",
  imageinfo: [{ thumburl: "https://upload.wikimedia.org/t.jpg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Test_pub.jpg",
    extmetadata: { Artist: { value: "Ann" }, LicenseShortName: { value: "CC BY 2.0" } } }],
} } } })) : new Response(JSON.stringify({ elements: [
  { type: "node", id: 991, lat: 51.4760, lon: -3.1790, tags: { name: "Test Cardiff Pub", amenity: "pub", sport: "soccer", dog: "yes", wikimedia_commons: "File:Test_pub.jpg" } },
  { type: "way", id: 992, center: { lat: 51.4800, lon: -3.1750 }, tags: { name: "Second Cardiff Bar", amenity: "bar" } },
  { type: "node", id: 993, lat: 51.48, lon: -3.17, tags: { amenity: "pub" } }, // no name: skipped
] }))) as typeof fetch;

const api = (method: string, path: string, opts: { body?: unknown; query?: Record<string, string> } = {}) =>
  handler({
    rawPath: path, body: opts.body ? JSON.stringify(opts.body) : undefined, isBase64Encoded: false,
    queryStringParameters: opts.query, requestContext: { http: { method } },
  } as never) as Promise<{ statusCode: number; body: string }>;

const cardiff = { lat: 51.4816, lng: -3.1791 };
const t = tileFor(cardiff.lat, cardiff.lng);
await db().query("delete from import_tiles where tile = $1", [t.tile]);
await db().query("delete from pubs where source_id in ('node/991','way/992','node/993')");

let r = await api("GET", "/areas/status", { query: { lat: String(cardiff.lat), lng: String(cardiff.lng) } });
assert.equal(JSON.parse(r.body).status, "importing", "unknown tile is not ready");

r = await api("POST", "/areas/import", { body: cardiff });
assert.equal(r.statusCode, 202);
assert.equal(asyncCalls.length, 1, "worker started in the background");
const worker = asyncCalls[0] as { tile: string };
assert.equal(worker.tile, t.tile);

// A second search of the same area while it imports does not start another import
r = await api("POST", "/areas/import", { body: cardiff });
assert.equal(JSON.parse(r.body).status, "importing");
assert.equal(asyncCalls.length, 1, "one import per tile at a time");

// A claim left by a failed import is taken again after 5 minutes
await db().query("update import_tiles set started_at = now() - interval '10 minutes' where tile = $1", [t.tile]);
r = await api("POST", "/areas/import", { body: cardiff });
assert.equal(asyncCalls.length, 2, "stale claim retried");
asyncCalls.pop();

const result = await handler(worker as never) as { upserted: number };
assert.equal(result.upserted, 2, "two named pubs imported");

r = await api("POST", "/areas/import", { body: cardiff });
assert.equal(JSON.parse(r.body).status, "ready", "tile now fresh");
assert.equal(asyncCalls.length, 1, "no second import for a fresh tile");

const info = (await db().query("select info from pubs where source_id = 'node/991'")).rows[0].info;
assert.equal(info.dog, true); assert.equal(info.shows_sport, true);
assert.equal(info.photo?.author, "Ann", "Wikimedia photo stored with credit");
assert.match(info.photo?.key ?? "", /^public\/wikimedia\/[0-9a-f]{20}\.jpg$/, "copied into our bucket during the import");
assert.ok(objects.has(info.photo.key), "file saved to S3");
const pubId = (await db().query("select id from pubs where source_id = 'node/991'")).rows[0].id;
const detail = (await handle({ method: "GET", path: `/pubs/${pubId}`, query: {}, body: {} })).body as { pub: { photos: { url: string; link?: string }[] } };
assert.equal(detail.pub.photos[0]!.url, `https://cdn.example/${info.photo.key}`, "served from our copy");
assert.match(detail.pub.photos[0]!.link ?? "", /commons\.wikimedia\.org/, "credit link unchanged");

// Re-importing the same photo keeps our copy (no second download)
await db().query("delete from import_tiles where tile = $1", [t.tile]);
const before = objects.size;
await handler({ worker: true, ...t } as never);
const again = (await db().query("select info from pubs where source_id = 'node/991'")).rows[0].info;
assert.equal(again.photo.key, info.photo.key, "copy kept on re-import");
assert.equal(objects.size, before);

// A photo deleted on Wikimedia is dropped by the catch-up copy
await db().query("update pubs set info = jsonb_set(info, '{photo}', (info->'photo') - 'key') where source_id = 'node/991'");
wikimediaGone = true;
const res = await handler({ copy_photos: true } as never) as { removed: number };
assert.ok(res.removed >= 1);
assert.equal((await db().query("select info ? 'photo' as has from pubs where source_id = 'node/991'")).rows[0].has, false, "gone photo removed");

r = await api("POST", "/areas/import", { body: { lat: 48.85, lng: 2.35 } }); // Paris
assert.equal(r.statusCode, 400, "outside the UK refused");
r = await api("POST", "/areas/import", { body: { lat: "x", lng: 1 } });
assert.equal(r.statusCode, 400);

await db().query("delete from pubs where source_id in ('node/991','way/992')");
await db().query("delete from import_tiles where tile = $1", [t.tile]);
await db().end();
console.log("importer tests passed: tile", t.tile, "centre", t.lat, t.lng);
