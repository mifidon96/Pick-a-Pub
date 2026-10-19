import assert from "node:assert/strict";
const { guessChannel, matchTeam, fetchFixtures } = await import("../src/fixtures");
const { refreshFixtures } = await import("../src/importer");
const { runAdmin } = await import("../src/admin");
const { handle } = await import("../src/app");
const { db } = await import("../src/db");

// --- UK TV guess (UK local time, both sides of the clocks going back) ---
assert.equal(guessChannel("PL", new Date("2026-10-24T14:00:00Z")), "blackout", "Sat 3pm BST");
assert.equal(guessChannel("PL", new Date("2026-10-31T15:00:00Z")), "blackout", "Sat 3pm GMT");
assert.equal(guessChannel("ELC", new Date("2026-10-31T15:00:00Z")), "blackout", "EFL 3pm too");
assert.equal(guessChannel("PL", new Date("2026-10-31T12:30:00Z")), "tnt", "Sat 12:30 is TNT");
assert.equal(guessChannel("PL", new Date("2026-10-31T17:30:00Z")), "sky", "Sat 5:30pm is Sky");
assert.equal(guessChannel("PL", new Date("2026-11-01T16:30:00Z")), "sky", "Sunday is Sky");
assert.equal(guessChannel("ELC", new Date("2026-10-30T20:00:00Z")), "sky");
assert.equal(guessChannel("CL", new Date("2026-11-03T20:00:00Z")), "tnt");
assert.equal(guessChannel("WC", new Date("2026-06-20T20:00:00Z")), "free");
assert.equal(guessChannel("XYZ", new Date("2026-06-20T20:00:00Z")), "unknown");

// --- Team names from football-data.org ---
assert.equal(matchTeam("Tottenham Hotspur FC"), "tottenham-hotspur");
assert.equal(matchTeam("AFC Bournemouth"), "bournemouth");
assert.equal(matchTeam("Brighton & Hove Albion FC"), "brighton-and-hove-albion");
assert.equal(matchTeam("Wrexham AFC"), "wrexham");
assert.equal(matchTeam("Reading FC"), "reading");
assert.equal(matchTeam("FC Barcelona"), null, "clubs we do not list stay unmatched");

// --- Fetch with a fake API ---
let seenKey = "";
const fakeFetch = (async (_url: string, init?: RequestInit) => {
  seenKey = (init?.headers as Record<string, string>)["X-Auth-Token"]!;
  return new Response(JSON.stringify({ matches: [
    { id: 900001, utcDate: "2099-10-31T12:30:00Z", status: "TIMED", competition: { code: "PL" },
      homeTeam: { name: "Arsenal FC" }, awayTeam: { name: "Tottenham Hotspur FC" } },
    { id: 900002, utcDate: "2099-10-31T15:00:00Z", status: "TIMED", competition: { code: "ELC" },
      homeTeam: { name: "Reading FC" }, awayTeam: { name: "Watford FC" } },
    { id: 900003, utcDate: "2099-11-03T20:00:00Z", status: "TIMED", competition: { code: "CL" },
      homeTeam: { name: null }, awayTeam: { name: "Arsenal FC" } }, // not decided yet: skipped
  ] }));
}) as typeof fetch;
const got = await fetchFixtures("k123", 10, fakeFetch);
assert.equal(seenKey, "k123");
assert.equal(got.length, 2);
assert.deepEqual(
  { home: got[0]!.home_name, team: got[0]!.home_team, away: got[0]!.away_team },
  { home: "Arsenal", team: "arsenal", away: "tottenham-hotspur" },
);

// No key: the scheduled job does nothing rather than failing.
delete process.env.FOOTBALL_DATA_API_KEY;
assert.deepEqual(await refreshFixtures(fakeFetch), { skipped: "FOOTBALL_DATA_API_KEY not set" });
process.env.FOOTBALL_DATA_API_KEY = "k123";
await db().query("delete from fixtures where id between 900000 and 900099");
const viaImporter = (await refreshFixtures(fakeFetch)) as { saved: number };
assert.equal(viaImporter.saved, 2, "importer hands fixtures to the admin Lambda");

// --- Store and serve ---
const saved = (await runAdmin({ action: "set_fixtures", fixtures: got })) as { saved: number };
assert.equal(saved.saved, 2, "saving again updates in place");
let r = await handle({ method: "GET", path: "/fixtures", query: { days: "14" }, body: {} });
assert.ok(!(r.body as { fixtures: { id: number }[] }).fixtures.some((f) => f.id === 900001), "2099 is not in the next 14 days");
// Bring them close for the listing test.
await db().query("update fixtures set kickoff = now() + interval '2 days' where id = 900001");
await db().query("update fixtures set kickoff = now() + interval '3 days' where id = 900002");
r = await handle({ method: "GET", path: "/fixtures", query: { team: "reading" }, body: {} });
const list = (r.body as { fixtures: { id: number; channel: string; channel_name: string; competition_name: string }[] }).fixtures;
assert.deepEqual(list.map((f) => f.id), [900002], "team filter");
assert.equal(list[0]!.channel, guessChannel("ELC", new Date("2099-10-31T15:00:00Z")), "channel guessed when saved");
assert.equal(list[0]!.competition_name, "Championship");

// Pubs for the Arsenal v Spurs match (TNT): a pub reviewers say has TNT comes first.
await db().query("delete from users where id = 'fx-test'");
await handle({ method: "PUT", path: "/pubs/8/review", userId: "fx-test", query: {}, body: {
  display_name: "Fixture Test", sightlines: 2, screens: 2, crowd: 2, shows_tnt: true,
} });
r = await handle({ method: "GET", path: "/fixtures/900001/pubs", query: { lat: "51.4431", lng: "-0.1525", radius_m: "5000" }, body: {} });
const body = r.body as { fixture: { channel: string }; pubs: { id: number; has_channel: boolean | null }[] };
assert.equal(r.status, 200);
assert.ok(body.pubs.length > 0);
await db().query("update fixtures set channel = 'tnt' where id = 900001");
r = await handle({ method: "GET", path: "/fixtures/900001/pubs", query: { lat: "51.4431", lng: "-0.1525", radius_m: "5000" }, body: {} });
const pubs = (r.body as typeof body).pubs;
const rank = (v: boolean | null) => (v === true ? 0 : v === null ? 1 : 2);
assert.ok(pubs.every((p, i) => i === 0 || rank(pubs[i - 1]!.has_channel) <= rank(p.has_channel)), "has the channel, then unknown, then no");
const p8 = pubs.findIndex((p) => p.id === 8);
assert.equal(pubs[p8]!.has_channel, true);
const firstOther = pubs.findIndex((p) => p.has_channel !== true);
assert.ok(firstOther === -1 || p8 < firstOther, "a low-rated pub with TNT still beats pubs we know nothing about");
r = await handle({ method: "GET", path: "/fixtures/123/pubs", query: { lat: "51.44", lng: "-0.15" }, body: {} });
assert.equal(r.status, 404);

await db().query("delete from users where id = 'fx-test'");
await db().query("delete from fixtures where id between 900000 and 900099");
console.log("fixture tests passed");
await db().end();
