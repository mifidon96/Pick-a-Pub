#!/usr/bin/env node
// Fetch pubs from OpenStreetMap (free, no API key) and write pubs.json in the
// shape the admin "import_pubs" action expects.
//
//   node scripts/import-osm-pubs.mjs                       # Balham, 1.2 km
//   node scripts/import-osm-pubs.mjs 51.4613 -0.1156 1500  # anywhere else
//
// Data is © OpenStreetMap contributors (ODbL). Keep the credit in the site footer.
import { writeFileSync } from "node:fs";

const [lat = "51.4431", lng = "-0.1525", radius = "1200", out = "pubs.json"] = process.argv.slice(2);

const query = `[out:json][timeout:25];
nwr[amenity~"^(pub|bar)$"][name](around:${Number(radius)},${Number(lat)},${Number(lng)});
out center tags;`;

const res = await fetch("https://overpass-api.de/api/interpreter", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "pick-a-pub-import/0.1" },
  body: new URLSearchParams({ data: query }),
});
if (!res.ok) {
  console.error(`Overpass returned ${res.status}. It rate limits heavily, so wait a minute and retry.`);
  process.exit(1);
}

const { elements } = await res.json();
const pubs = elements
  .map((e) => {
    const t = e.tags ?? {};
    const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
    return {
      source: "osm",
      source_id: `${e.type}/${e.id}`,
      name: t.name,
      address: street || null,
      postcode: t["addr:postcode"] ?? null,
      lat: e.lat ?? e.center?.lat,
      lng: e.lon ?? e.center?.lon,
    };
  })
  .filter((p) => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lng))
  .sort((a, b) => a.name.localeCompare(b.name));

// The admin Lambda takes { action, pubs } as its whole payload.
writeFileSync(out, JSON.stringify({ action: "import_pubs", pubs }, null, 2));
console.log(`Wrote ${pubs.length} pubs to ${out}`);
