// Query OpenStreetMap's Overpass API, trying several public servers in turn.
// The main server is often overloaded (429/502/504), so one busy server should
// never stop an import. Used by import-osm-pubs.mjs and the importer Lambda.

export const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const UA = "pick-a-pub/0.5 (pub import; https://github.com/mifidon96/Pick-a-Pub)";
const BUSY = new Set([429, 502, 503, 504]);

export async function overpass(query, { fetchFn = fetch, servers = OVERPASS_SERVERS, waitMs = 10_000, log = console.log } = {}) {
  const errors = [];
  // Two rounds through the servers, with a pause between rounds.
  for (let round = 0; round < 2; round++) {
    for (const url of servers) {
      try {
        const res = await fetchFn(url, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(60_000),
        });
        if (res.ok) return (await res.json()).elements ?? [];
        errors.push(`${new URL(url).host} ${res.status}`);
        if (!BUSY.has(res.status)) throw new Error(`Overpass query rejected (${res.status})`);
        log(`  ${new URL(url).host} busy (${res.status}), trying the next server...`);
      } catch (e) {
        if (String(e.message).startsWith("Overpass query rejected")) throw e;
        errors.push(`${new URL(url).host} ${e.name === "TimeoutError" ? "timed out" : e.message}`);
        log(`  ${new URL(url).host} unavailable, trying the next server...`);
      }
    }
    if (round === 0) await new Promise((r) => setTimeout(r, waitMs));
  }
  throw new Error(`All OpenStreetMap servers busy: ${errors.join(", ")}`);
}
