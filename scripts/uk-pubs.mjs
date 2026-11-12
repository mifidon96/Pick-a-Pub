// Reading the UK map data for the monthly load of every pub and bar
// (.github/workflows/uk-pubs.yml). The command line is uk-pubs-batches.mjs;
// this file holds the parts the tests check (api/test/ukpubs.test.ts).
// Same pub shape and ids as the on-demand import (osm-to-pub.mjs), so the
// load updates existing pubs in place rather than duplicating them.
import { osmToPub } from "./osm-to-pub.mjs";
import { inUk, tileFor } from "./tiles.mjs";

// About 0.5 MB per payload; the Lambda limit is 6 MB.
export const BATCH = 1500;

// Every [lng, lat] pair in a GeoJSON geometry.
function points(geometry) {
  const out = [];
  const walk = (c) => (typeof c[0] === "number" ? out.push(c) : c.forEach(walk));
  walk(geometry.coordinates);
  return out;
}

// One osmium GeoJSON feature -> the element shape Overpass returns. A building
// or site outline is placed at the centre of its bounding box, the same as
// Overpass's "out center".
export function featureToElement(feature) {
  const { "@type": type, "@id": id, ...tags } = feature.properties ?? {};
  if (!type || id === undefined || !feature.geometry) return null;
  if (feature.geometry.type === "Point") {
    const [lon, lat] = feature.geometry.coordinates;
    return { type, id: Number(id), lat, lon, tags };
  }
  const pts = points(feature.geometry);
  if (!pts.length) return null;
  const lons = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
  const center = { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lon: (Math.min(...lons) + Math.max(...lons)) / 2 };
  return { type, id: Number(id), center, tags };
}

// Pubs and the tiles they fall in, from geojsonseq lines (one feature per line,
// each optionally led by the RS character).
export async function readPubs(lines) {
  const elements = [], pubs = [], seen = new Set();
  for await (const raw of lines) {
    const line = raw.replace(/^\x1e/, "").trim();
    if (!line) continue;
    const e = featureToElement(JSON.parse(line));
    if (!e) continue;
    const p = osmToPub(e);
    if (!p.name || !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || !inUk(p.lat, p.lng)) continue;
    if (seen.has(p.source_id)) continue;
    seen.add(p.source_id);
    elements.push(e);
    pubs.push(p);
  }
  const tiles = new Map();
  for (const p of pubs) {
    const t = tileFor(p.lat, p.lng).tile;
    tiles.set(t, (tiles.get(t) ?? 0) + 1);
  }
  return { elements, pubs, tiles: [...tiles].map(([tile, pub_count]) => ({ tile, pub_count })) };
}
