import assert from "node:assert/strict";
import { featureToElement, readPubs } from "../../scripts/uk-pubs.mjs";
import { tileFor } from "../src/lib/tiles";
const { runAdmin } = await import("../src/admin");
const { db } = await import("../src/lib/db");

// osmium GeoJSON -> the same element shape Overpass returns.
const node = { type: "Feature", geometry: { type: "Point", coordinates: [-0.15, 51.44] }, properties: { "@type": "node", "@id": 101, amenity: "pub", name: "The Test Arms" } };
assert.deepEqual(featureToElement(node), { type: "node", id: 101, lat: 51.44, lon: -0.15, tags: { amenity: "pub", name: "The Test Arms" } });
const way = { type: "Feature", geometry: { type: "Polygon", coordinates: [[[-0.2, 51.5], [-0.1, 51.5], [-0.1, 51.6], [-0.2, 51.6], [-0.2, 51.5]]] }, properties: { "@type": "way", "@id": 7, amenity: "bar", name: "Square Bar" } };
const w = featureToElement(way)!;
assert.equal(w.type, "way");
assert.ok(Math.abs(w.center!.lat - 51.55) < 1e-9 && Math.abs(w.center!.lon + 0.15) < 1e-9, "a building is placed at its centre");

// Unnamed, outside the UK, or listed twice: left out. Lines may start with the RS character.
const lines = [
  `\x1e${JSON.stringify(node)}`,
  JSON.stringify(way),
  JSON.stringify(node),
  JSON.stringify({ ...node, properties: { "@type": "node", "@id": 102, amenity: "pub" } }),
  JSON.stringify({ ...node, geometry: { type: "Point", coordinates: [2.35, 48.85] }, properties: { "@type": "node", "@id": 103, amenity: "pub", name: "Le Pub" } }),
  "",
];
const { pubs, tiles } = await readPubs(lines);
assert.deepEqual(pubs.map((p) => p.source_id), ["node/101", "way/7"], "same ids as the on-demand import");
assert.equal(tiles.length, 2);
assert.equal(tiles.find((t) => t.tile === tileFor(51.44, -0.15).tile)?.pub_count, 1);

// mark_tiles: every tile becomes fresh, so searches there skip the on-demand import.
const t = tileFor(51.44, -0.15).tile;
await db().query("delete from import_tiles where tile = any($1)", [tiles.map((x) => x.tile)]);
const out = (await runAdmin({ action: "mark_tiles", tiles: [...tiles, { tile: "drop table", pub_count: 1 }] })) as { marked: number };
assert.equal(out.marked, 2, "a malformed tile name is ignored");
const status = (await runAdmin({ action: "tile_status", tile: t })) as { fresh: boolean; pub_count: number };
assert.equal(status.fresh, true);
assert.equal(status.pub_count, 1);
await db().query("delete from import_tiles where tile = any($1)", [tiles.map((x) => x.tile)]);
console.log("UK load tests passed");
await db().end();
