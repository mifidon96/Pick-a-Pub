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

// Each server gets at most this long before we try the next one.
const PER_SERVER_MS = 45_000;
// Don't start a request with less than this left before the deadline.
const MIN_ATTEMPT_MS = 15_000;

// deadline: a time (ms since 1970) to give up by. The importer Lambda passes
// one so a slow server can't run it past its own timeout.
export async function overpass(query, { fetchFn = fetch, servers = OVERPASS_SERVERS, waitMs = 10_000, log = console.log, deadline = Infinity, now = Date.now } = {}) {
  const errors = [];
  // Two rounds through the servers, with a pause between rounds.
  for (let round = 0; round < 2; round++) {
    for (const url of servers) {
      const left = deadline - now();
      if (left < MIN_ATTEMPT_MS) {
        throw new Error(`OpenStreetMap too slow, gave up before the time limit: ${errors.join(", ") || "no answer"}`);
      }
      try {
        const res = await fetchFn(url, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(Math.min(PER_SERVER_MS, left - 5_000)),
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
    if (round === 0 && deadline - now() > waitMs + MIN_ATTEMPT_MS) await new Promise((r) => setTimeout(r, waitMs));
  }
  throw new Error(`All OpenStreetMap servers busy: ${errors.join(", ")}`);
}
