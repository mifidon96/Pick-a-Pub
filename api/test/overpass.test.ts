import assert from "node:assert/strict";
import { overpass } from "../../scripts/overpass.mjs";

const quiet = () => {};
const servers = ["https://a.example/api", "https://b.example/api", "https://c.example/api"];
const fake = (answers: Record<string, number[]>) => {
  const seen: string[] = [];
  const fn = (async (url: string) => {
    seen.push(new URL(url).host);
    const status = answers[new URL(url).host]!.shift() ?? 502;
    return status === 200 ? new Response(JSON.stringify({ elements: [{ type: "node", id: 1 }] })) : new Response("busy", { status });
  }) as unknown as typeof fetch;
  return { fn, seen };
};

// First server busy, second works
let f = fake({ "a.example": [502], "b.example": [200], "c.example": [] });
assert.equal((await overpass("q", { fetchFn: f.fn, servers, waitMs: 0, log: quiet })).length, 1);
assert.deepEqual(f.seen, ["a.example", "b.example"]);

// Everything busy in round one, first server recovers in round two
f = fake({ "a.example": [504, 200], "b.example": [429], "c.example": [503] });
assert.equal((await overpass("q", { fetchFn: f.fn, servers, waitMs: 0, log: quiet })).length, 1);
assert.equal(f.seen.length, 4);

// All down: clear error
f = fake({ "a.example": [502, 502], "b.example": [502, 502], "c.example": [502, 502] });
await assert.rejects(overpass("q", { fetchFn: f.fn, servers, waitMs: 0, log: quiet }), /All OpenStreetMap servers busy/);

// A bad query is not retried on other servers
f = fake({ "a.example": [400], "b.example": [200], "c.example": [] });
await assert.rejects(overpass("q", { fetchFn: f.fn, servers, waitMs: 0, log: quiet }), /rejected \(400\)/);
assert.deepEqual(f.seen, ["a.example"]);

// Network error counts as unavailable
const net = (async (url: string) => { if (url.includes("a.example")) throw new Error("ECONNRESET"); return new Response(JSON.stringify({ elements: [] })); }) as unknown as typeof fetch;
assert.deepEqual(await overpass("q", { fetchFn: net, servers, waitMs: 0, log: quiet }), []);
console.log("overpass tests passed");
