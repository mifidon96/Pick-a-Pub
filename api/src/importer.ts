import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { osmToPub, type OsmElement } from "../../scripts/osm-to-pub.mjs";
import { inUk, TILE_IMPORT_RADIUS_M, tileFor } from "./tiles";

// "Search anywhere" importer. Runs OUTSIDE the private network so it can reach
// OpenStreetMap without a NAT gateway; it never touches the database itself and
// hands pubs to the admin Lambda instead.
//
//   POST /areas/import {lat, lng}   -> {status: "ready"} or {status: "importing"}
//   GET  /areas/status?lat=&lng=    -> {status: "ready" | "importing"}
//   (async self-invoke) {worker: true, tile, lat, lng} fetches and loads the pubs

const ADMIN_FN = process.env.ADMIN_FUNCTION ?? "";
const lambda = new LambdaClient({});

type Worker = { worker: true; tile: string; lat: number; lng: number };

async function invokeAdmin<T>(payload: unknown): Promise<T> {
  const res = await lambda.send(new InvokeCommand({
    FunctionName: ADMIN_FN,
    Payload: new TextEncoder().encode(JSON.stringify(payload)),
  }));
  const body = JSON.parse(new TextDecoder().decode(res.Payload ?? new Uint8Array()) || "null");
  if (res.FunctionError) throw new Error(`admin Lambda failed: ${body?.errorMessage ?? res.FunctionError}`);
  return body as T;
}

const json = (status: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode: status,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

function readPoint(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const la = Number(lat), lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || !inUk(la, lo)) return null;
  return { lat: la, lng: lo };
}

export async function fetchPubs(lat: number, lng: number, radius: number): Promise<OsmElement[]> {
  const query = `[out:json][timeout:50];
nwr[amenity~"^(pub|bar)$"][name](around:${radius},${lat},${lng});
out center tags;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "pick-a-pub/0.3 (area import)" },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(55_000),
  });
  if (!res.ok) throw new Error(`Overpass returned ${res.status}`);
  return (await res.json()).elements ?? [];
}

async function runWorker(w: Worker) {
  const pubs = (await fetchPubs(w.lat, w.lng, TILE_IMPORT_RADIUS_M))
    .map(osmToPub)
    .filter((p) => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const result = await invokeAdmin({ action: "import_pubs", pubs, tile: w.tile });
  console.log(JSON.stringify({ tile: w.tile, found: pubs.length, result }));
  return result;
}

export async function handler(event: APIGatewayProxyEventV2 | Worker): Promise<APIGatewayProxyResultV2 | unknown> {
  if ("worker" in event) return runWorker(event);

  const method = event.requestContext.http.method;
  const path = event.rawPath.replace(/\/+$/, "");
  let point: { lat: number; lng: number } | null = null;

  if (method === "POST" && path === "/areas/import") {
    let body: { lat?: unknown; lng?: unknown } = {};
    try {
      body = JSON.parse(event.body ? (event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body) : "{}");
    } catch {
      return json(400, { error: "Invalid JSON" });
    }
    point = readPoint(body.lat, body.lng);
  } else if (method === "GET" && path === "/areas/status") {
    point = readPoint(event.queryStringParameters?.lat, event.queryStringParameters?.lng);
  } else {
    return json(404, { error: "Not found" });
  }
  if (!point) return json(400, { error: "Pick-a-Pub only covers the UK for now" });

  try {
    const t = tileFor(point.lat, point.lng);
    const status = await invokeAdmin<{ fresh: boolean }>({ action: "tile_status", tile: t.tile });
    if (status.fresh) return json(200, { status: "ready" });
    if (method === "GET") return json(200, { status: "importing" });

    // Start the import in the background and answer straight away.
    await lambda.send(new InvokeCommand({
      FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
      InvocationType: "Event",
      Payload: new TextEncoder().encode(JSON.stringify({ worker: true, ...t } satisfies Worker)),
    }));
    return json(202, { status: "importing" });
  } catch (e) {
    console.error(e);
    return json(500, { error: "Could not check this area right now" });
  }
}
