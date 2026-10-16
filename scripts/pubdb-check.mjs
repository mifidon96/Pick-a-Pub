#!/usr/bin/env node
// Check how well Pub DB (thepubdb.com) covers our areas, before deciding to use it.
// Read-only, uses at most 12 requests (the free plan allows 20 an hour).
//
//   PUBDB_KEY=pk_free_xxx node scripts/pubdb-check.mjs
//
// Keep the key out of git: set it in the terminal like above, never in a file.

const KEY = process.env.PUBDB_KEY;
if (!KEY) {
  console.error("Set your key first:  PUBDB_KEY=pk_free_xxx node scripts/pubdb-check.mjs");
  process.exit(1);
}

const BASE = "https://api.thepubdb.com/api/v1";
const MAX_REQUESTS = 12;
const AREAS = {
  balham: ["SW12", "SW17", "SW4"],
  reading: ["RG1", "RG2", "RG4", "RG30", "RG31"],
};
// The pubs in content/pubs.yaml
const OUR_PUBS = [
  "The Bedford", "The Regent", "Hagen & Hyde", "The Cyclist", "Exhibit", "The Devonshire",
  "The Avalon", "The Grove", "Balham Bowls Club", "Market House", "O'Neill's",
  "The Three Guineas", "The Nags Head", "Monks Retreat", "Allied Arms", "Oakford Social Club",
];

const norm = (s) => String(s ?? "").toLowerCase().replace(/&/g, " and ").replace(/^\s*the\s+/, "").replace(/[^a-z0-9]+/g, "");
const outward = (pc) => String(pc ?? "").toUpperCase().trim().split(/\s+/)[0];
let used = 0;

async function get(path) {
  if (used >= MAX_REQUESTS) throw new Error("request budget used up");
  used++;
  const res = await fetch(`${BASE}${path}`, { headers: { "X-API-Key": KEY } });
  const remaining = res.headers.get("x-ratelimit-remaining");
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${body.code ?? ""} ${body.message ?? ""}`.trim());
  return { body, remaining };
}

// 1. Pubs flagged as showing the Premier League (likely a short list), 100 per page.
const sport = [];
let page = 1, pages = 1, remaining;
while (page <= pages && used < MAX_REQUESTS - 1) {
  const r = await get(`/pubs?hasPremierLeague=true&limit=100&page=${page}`);
  sport.push(...(r.body.data ?? []));
  pages = r.body.pagination?.pages ?? 1;
  remaining = r.remaining;
  page++;
}
console.log(`Pub DB pubs flagged as showing the Premier League: ${sport.length}${page <= pages ? ` (stopped after ${page - 1} of ${pages} pages)` : ""}`);

for (const [area, prefixes] of Object.entries(AREAS)) {
  const here = sport.filter((p) => prefixes.includes(outward(p.postcode)));
  console.log(`\n${area}: ${here.length} Premier League pubs`);
  for (const p of here) console.log(`  - ${p.name} (${p.postcode ?? "no postcode"})`);
}

// 2. Which of our 16 pubs appear in that list.
const byName = new Set(sport.map((p) => norm(p.name)));
const found = OUR_PUBS.filter((n) => byName.has(norm(n)));
console.log(`\nOf our ${OUR_PUBS.length} pubs, ${found.length} are flagged for Premier League: ${found.join(", ") || "none"}`);

// 3. One full record so we can see which fields are actually filled in.
const sample = sport.find((p) => AREAS.balham.concat(AREAS.reading).includes(outward(p.postcode))) ?? sport[0];
if (sample?.id) {
  const r = await get(`/pubs/${sample.id}`);
  remaining = r.remaining;
  const rec = r.body.data ?? r.body;
  const filled = Object.entries(rec).filter(([, v]) => v !== null && v !== "" && v !== false).map(([k]) => k);
  console.log(`\nSample record: ${rec.name}\nFields filled in: ${filled.join(", ")}`);
}
console.log(`\nRequests used: ${used}. Remaining this hour (from Pub DB): ${remaining ?? "unknown"}`);
