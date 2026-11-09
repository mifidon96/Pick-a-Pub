import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const { routes, handle } = await import("../src/routes");

// Every route API Gateway sends to the api Lambda (infra/api_gateway.tf) has a
// handler here, and there are no handlers API Gateway can't reach.
const tf = readFileSync(new URL("../../infra/api_gateway.tf", import.meta.url), "utf8");
const gateway = [...tf.matchAll(/"((?:GET|POST|PUT|DELETE) \/[^"]*)"\s*=\s*\{\s*target\s*=\s*"api"/g)].map((m) => m[1]).sort();
assert.ok(gateway.length > 5, "found the routes in api_gateway.tf");
assert.deepEqual(Object.keys(routes).sort(), gateway, "api_gateway.tf and src/routes/index.ts list the same routes");

// Matching: wrong method, bad id and unknown paths are 404s; a trailing slash is fine.
const req = (method: string, path: string) => ({ method, path, query: {}, body: undefined });
assert.equal((await handle(req("DELETE", "/pubs"))).status, 404);
assert.equal((await handle(req("GET", "/pubs/abc"))).status, 404);
assert.equal((await handle(req("GET", "/pubs/1234567890"))).status, 404, "ids are at most 9 digits");
assert.equal((await handle(req("GET", "/nope"))).status, 404);
assert.equal((await handle(req("GET", "/me/"))).status, 401, "trailing slash still matches /me");
assert.equal((await handle(req("GET", "/pubs"))).status, 400, "lat is required");
console.log("route tests passed");
