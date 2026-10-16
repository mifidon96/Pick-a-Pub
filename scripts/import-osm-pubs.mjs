#!/usr/bin/env node
// Fetch pubs from OpenStreetMap (free, no API key) and write pubs.json in the
// shape the admin "import_pubs" action expects.
//
//   node scripts/import-osm-pubs.mjs            # every area in web/lib/areas.json
//   node scripts/import-osm-pubs.mjs reading    # one area
//
// To add an area, add it to web/lib/areas.json (it also appears in the site's area picker).
// Data is © OpenStreetMap contributors (ODbL). Keep the credit in the site footer.
import { readFileSync, writeFileSync } from "node:fs";
import { osmToPub } from "./osm-to-pub.mjs";
import { attachWikimediaPhotos } from "./wikimedia.mjs";

const areas = JSON.parse(readFileSync(new URL("../web/lib/areas.json", import.meta.url), "utf8"));
const only = process.argv[2];
const chosen = only ? areas.filter((a) => a.id === only) : areas;
if (!chosen.length) {
  console.error(`Unknown area "${only}". Known: ${areas.map((a) => a.id).join(", ")}`);
  process.exit(1);
}

async function fetchArea(a, attempt = 1) {
  const query = `[out:json][timeout:60];
nwr[amenity~"^(pub|bar)$"][name](around:${Number(a.import_radius_m)},${Number(a.lat)},${Number(a.lng)});
out center tags;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "pick-a-pub-import/0.2" },
    body: new URLSearchParams({ data: query }),
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    console.log(`  Overpass busy (${res.status}), retrying in ${attempt * 20}s...`);
    await new Promise((r) => setTimeout(r, attempt * 20_000));
    return fetchArea(a, attempt + 1);
  }
  if (!res.ok) throw new Error(`Overpass returned ${res.status} for ${a.label}`);
  return (await res.json()).elements;
}

const byId = new Map();
for (const a of chosen) {
  const elements = (await fetchArea(a)).filter((e) => {
    const p = osmToPub(e);
    return p.name && Number.isFinite(p.lat) && Number.isFinite(p.lng);
  });
  const pubs = elements.map(osmToPub);
  const photos = await attachWikimediaPhotos(pubs, elements);
  console.log(`${a.label}: ${pubs.length} pubs, ${photos} with a Wikimedia photo`);
  for (const p of pubs) byId.set(p.source_id, p);
}

const pubs = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
// The admin Lambda takes { action, pubs } as its whole payload.
writeFileSync("pubs.json", JSON.stringify({ action: "import_pubs", pubs }, null, 2));
console.log(`Wrote ${pubs.length} pubs to pubs.json`);
