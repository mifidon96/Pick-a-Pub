// Turns every pub and bar in the UK map data into batches for the admin
// Lambda, so no area has to wait for OpenStreetMap on its first search.
// Run monthly by .github/workflows/uk-pubs.yml, after osmium has picked the
// pubs and bars out of Geofabrik's UK extract:
//
//   node scripts/uk-pubs-batches.mjs <pubs.geojsonseq> <out dir> [--no-photos]
//
// Writes <out dir>/pubs-0001.json ... (import_pubs payloads) and
// <out dir>/tiles.json (a mark_tiles payload): every tile that has a pub is
// marked as imported, so searches there skip the on-demand import.
// scripts/load-uk-pubs.sh then sends them to the admin Lambda.
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { BATCH, readPubs } from "./uk-pubs.mjs";
import { attachWikimediaPhotos } from "./wikimedia.mjs";

const [input, outDir] = process.argv.slice(2);
if (!input || !outDir) {
  console.error("usage: node scripts/uk-pubs-batches.mjs <pubs.geojsonseq> <out dir> [--no-photos]");
  process.exit(1);
}
const { elements, pubs, tiles } = await readPubs(createInterface({ input: createReadStream(input), crlfDelay: Infinity }));
console.log(`${pubs.length} pubs and bars in ${tiles.length} tiles`);
if (pubs.length < 20000) throw new Error(`Only ${pubs.length} pubs found; expected 40,000 or more. Stopping before loading anything.`);

// Photos from Wikidata / Wikimedia Commons tags, as the on-demand import does.
// The lookup reports a failure as 0 photos. Loading then would remove every
// pub's existing photo until next month, so stop instead and keep last month's.
if (!process.argv.includes("--no-photos")) {
  const n = await attachWikimediaPhotos(pubs, elements);
  const candidates = elements.filter((e) => e.tags?.wikidata || e.tags?.wikimedia_commons || e.tags?.image).length;
  console.log(`${n} Wikimedia photos found (${candidates} pubs have a photo tag)`);
  if (candidates > 100 && n === 0) throw new Error("Wikimedia photo lookup failed. Stopping before loading anything.");
}

mkdirSync(outDir, { recursive: true });
let files = 0;
for (let i = 0; i < pubs.length; i += BATCH) {
  files++;
  writeFileSync(join(outDir, `pubs-${String(files).padStart(4, "0")}.json`), JSON.stringify({ action: "import_pubs", pubs: pubs.slice(i, i + BATCH) }));
}
writeFileSync(join(outDir, "tiles.json"), JSON.stringify({ action: "mark_tiles", tiles }));
console.log(`Wrote ${files} pub batches and tiles.json to ${outDir}`);

