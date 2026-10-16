import assert from "node:assert/strict";
import { handler } from "../src/importer";
import { asyncCalls } from "./mock-lambda";
import { db } from "../src/db";
import { tileFor } from "../src/tiles";

// Fake Overpass: two pubs near Cardiff Central.
globalThis.fetch = (async () => new Response(JSON.stringify({ elements: [
  { type: "node", id: 991, lat: 51.4760, lon: -3.1790, tags: { name: "Test Cardiff Pub", amenity: "pub", sport: "soccer", dog: "yes" } },
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

const result = await handler(worker as never) as { upserted: number };
assert.equal(result.upserted, 2, "two named pubs imported");

r = await api("POST", "/areas/import", { body: cardiff });
assert.equal(JSON.parse(r.body).status, "ready", "tile now fresh");
assert.equal(asyncCalls.length, 1, "no second import for a fresh tile");

const info = (await db().query("select info from pubs where source_id = 'node/991'")).rows[0].info;
assert.equal(info.dog, true); assert.equal(info.shows_sport, true);

r = await api("POST", "/areas/import", { body: { lat: 48.85, lng: 2.35 } }); // Paris
assert.equal(r.statusCode, 400, "outside the UK refused");
r = await api("POST", "/areas/import", { body: { lat: "x", lng: 1 } });
assert.equal(r.statusCode, 400);

await db().query("delete from pubs where source_id in ('node/991','way/992')");
await db().query("delete from import_tiles where tile = $1", [t.tile]);
await db().end();
console.log("importer tests passed: tile", t.tile, "centre", t.lat, t.lng);
