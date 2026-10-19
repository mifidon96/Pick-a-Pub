import assert from "node:assert/strict";
const { handle } = await import("../src/app");
const { db } = await import("../src/db");

// Quick reviews and fan teams.
const U = ["rev-test-1", "rev-test-2", "rev-test-3"];
await db().query("delete from users where id like 'rev-test-%'");
const as = (userId?: string, body: unknown = {}, query: Record<string, string> = {}) => ({ query, body, userId });
const PUB = 3;

// A quick review needs only sightlines, screens and crowd.
let r = await handle({ method: "PUT", path: `/pubs/${PUB}/review`, ...as(U[0], { display_name: "Quick One", sightlines: 5, screens: 4 }) });
assert.equal(r.status, 400, "crowd is required");
assert.match((r.body as { error: string }).error, /crowd/);
r = await handle({ method: "PUT", path: `/pubs/${PUB}/review`, ...as(U[0], { display_name: "Quick One", sightlines: 5, screens: 4, crowd: 4, fan_team: "arsenal" }) });
assert.equal(r.status, 200, JSON.stringify(r.body));
r = await handle({ method: "PUT", path: `/pubs/${PUB}/review`, ...as(U[1], { display_name: "Quick Two", sightlines: 5, screens: 5, crowd: 5, fan_team: "made-up-fc" }) });
assert.equal(r.status, 400, "unknown team");
r = await handle({ method: "PUT", path: `/pubs/${PUB}/review`, ...as(U[1], { display_name: "Quick Two", sightlines: 5, screens: 5, crowd: 5, seating: 2, fan_team: "arsenal" }) });
assert.equal(r.status, 200);

// My review comes back with blanks as null, and my name pre-fills elsewhere.
r = await handle({ method: "GET", path: `/pubs/${PUB}/review`, ...as(U[0]) });
const mine = r.body as { review: Record<string, unknown>; display_name: string };
assert.equal(mine.review.seating, null);
assert.equal(mine.review.vibe, null);
assert.equal(mine.review.fan_team, "arsenal");
r = await handle({ method: "GET", path: "/pubs/1/review", ...as(U[0]) });
assert.deepEqual(r.body, { review: null, display_name: "Quick One" }, "name carried to a new pub");

// The pub is now an Arsenal pub, and the fans filter finds it.
const pub = (await handle({ method: "GET", path: `/pubs/${PUB}`, ...as() })).body as { pub: { fan_team: string; stars: number } };
assert.equal(pub.pub.fan_team, "arsenal");
assert.ok(pub.pub.stars !== null);
const near = { lat: "51.4431", lng: "-0.1525", radius_m: "5000" };
r = await handle({ method: "GET", path: "/pubs", ...as(undefined, {}, { ...near, fans: "arsenal" }) });
const ids = (r.body as { pubs: { id: number; fan_team: string }[] }).pubs;
assert.ok(ids.some((p) => p.id === PUB), "fans=arsenal finds the pub");
assert.ok(ids.every((p) => p.fan_team === "arsenal"), "and only Arsenal pubs");
r = await handle({ method: "GET", path: "/pubs", ...as(undefined, {}, { ...near, fans: "nope" }) });
assert.equal(r.status, 400);
r = await handle({ method: "GET", path: "/pubs", ...as(undefined, {}, { ...near, has: "away_friendly" }) });
assert.equal(r.status, 200, "away_friendly is a filter");

await db().query("delete from users where id like 'rev-test-%'");
console.log("review tests passed");
await db().end();
