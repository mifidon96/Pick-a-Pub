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
// Deadline: a slow first server uses up the time, so it gives up cleanly
// instead of running past the Lambda's own timeout.
let clock = 0;
const slow = (async (url: string) => {
  clock += 46_000; // as if the request waited until it was cut off
  if (url.includes("a.example")) { const e = new Error("timed out"); e.name = "TimeoutError"; throw e; }
  return new Response(JSON.stringify({ elements: [] }));
}) as unknown as typeof fetch;
await assert.rejects(
  overpass("q", { fetchFn: slow, servers, waitMs: 0, log: quiet, deadline: 60_000, now: () => clock }),
  /too slow/,
  "gives up when under 15 s are left",
);

// No time at all: no request is made
let calls = 0;
const counting = (async () => { calls++; return new Response("{}"); }) as unknown as typeof fetch;
await assert.rejects(overpass("q", { fetchFn: counting, servers, waitMs: 0, log: quiet, deadline: 10_000, now: () => 0 }), /too slow/);
assert.equal(calls, 0);

// Each request is limited to what is left before the deadline
let signalOk = false;
const check = (async (_url: string, init: RequestInit) => { signalOk = init.signal instanceof AbortSignal; return new Response(JSON.stringify({ elements: [] })); }) as unknown as typeof fetch;
await overpass("q", { fetchFn: check, servers, waitMs: 0, log: quiet, deadline: 30_000, now: () => 0 });
assert.ok(signalOk);
console.log("overpass tests passed");
