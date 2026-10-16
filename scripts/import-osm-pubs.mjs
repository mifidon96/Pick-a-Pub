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
import { overpass } from "./overpass.mjs";

const areas = JSON.parse(readFileSync(new URL("../web/lib/areas.json", import.meta.url), "utf8"));
const only = process.argv[2];
const chosen = only ? areas.filter((a) => a.id === only) : areas;
if (!chosen.length) {
  console.error(`Unknown area "${only}". Known: ${areas.map((a) => a.id).join(", ")}`);
  process.exit(1);
}

function fetchArea(a) {
  return overpass(`[out:json][timeout:60];
nwr[amenity~"^(pub|bar)$"][name](around:${Number(a.import_radius_m)},${Number(a.lat)},${Number(a.lng)});
out center tags;`);
}

const byId = new Map();
const failed = [];
for (const a of chosen) {
  let raw;
  try {
    raw = await fetchArea(a);
  } catch (e) {
    console.error(`${a.label}: skipped, ${e.message}`);
    failed.push(a.label);
    continue;
  }
  const elements = raw.filter((e) => {
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
// Exit code 2 = nothing could be fetched (the deploy carries on without an import).
if (failed.length === chosen.length) process.exit(2);
