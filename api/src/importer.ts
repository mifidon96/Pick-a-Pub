import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { osmToPub, type OsmElement } from "../../scripts/osm-to-pub.mjs";
import { attachWikimediaPhotos } from "../../scripts/wikimedia.mjs";
import { overpass } from "../../scripts/overpass.mjs";
import { inUk, TILE_IMPORT_RADIUS_M, tileFor } from "./tiles";
import { copyPhotos, type ToCopy } from "./mirror";
import { fetchFixtures } from "./fixtures";

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
type CopyJob = { copy_photos: true };
type FixturesJob = { fixtures: true }; // every 6 hours (EventBridge) and after each deploy

// Fetch the next 10 days of matches and hand them to the admin Lambda.
export async function refreshFixtures(fetchFn: typeof fetch = fetch) {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) return { skipped: "FOOTBALL_DATA_API_KEY not set" };
  const fixtures = await fetchFixtures(key, 10, fetchFn);
  return invokeAdmin({ action: "set_fixtures", fixtures });
}

// Copy Wikimedia photos into our bucket, in batches, for up to ~60 seconds.
export async function copyPendingPhotos(fetchFn: typeof fetch = fetch) {
  const bucket = process.env.PHOTOS_BUCKET;
  if (!bucket) return { copied: 0, removed: 0, remaining: null, note: "PHOTOS_BUCKET not set" };
  const started = Date.now();
  let copied = 0, removed = 0, remaining = 0;
  const failed = new Set<number>();
  while (Date.now() - started < 60_000) {
    const batch = await invokeAdmin<{ items: ToCopy[]; remaining: number }>({ action: "list_photos_to_copy", limit: 25 });
    const todo = batch.items.filter((i) => !failed.has(i.id));
    remaining = batch.remaining;
    if (!todo.length) break;
    const results = await copyPhotos(todo, bucket, fetchFn);
    for (const i of todo) if (!results.some((r) => r.id === i.id)) failed.add(i.id); // retry on a later run
    const saved = await invokeAdmin<{ copied: number; removed: number }>({ action: "set_photo_copies", results });
    copied += saved.copied;
    removed += saved.removed;
  }
  return { copied, removed, remaining: Math.max(0, remaining - copied - removed) };
}

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

// The Lambda times out at 120 s (infra/importer.tf). OpenStreetMap gets at most
// 75 s of that, which leaves time to save the pubs and copy their photos.
const OVERPASS_BUDGET_MS = 75_000;

export function fetchPubs(lat: number, lng: number, radius: number, deadline = Infinity): Promise<OsmElement[]> {
  return overpass(`[out:json][timeout:50];
nwr[amenity~"^(pub|bar)$"][name](around:${radius},${lat},${lng});
out center tags;`, { waitMs: 5_000, deadline });
}

async function runWorker(w: Worker) {
  const deadline = Date.now() + OVERPASS_BUDGET_MS;
  const elements = (await fetchPubs(w.lat, w.lng, TILE_IMPORT_RADIUS_M, deadline)).filter((e) => {
    const p = osmToPub(e);
    return p.name && Number.isFinite(p.lat) && Number.isFinite(p.lng);
  });
  const pubs = elements.map(osmToPub);
  const photos = await attachWikimediaPhotos(pubs, elements);
  const result = await invokeAdmin({ action: "import_pubs", pubs, tile: w.tile });
  const copies = photos ? await copyPendingPhotos() : null;
  console.log(JSON.stringify({ tile: w.tile, found: pubs.length, photos, result, copies }));
  return result;
}

export async function handler(event: APIGatewayProxyEventV2 | Worker | CopyJob | FixturesJob): Promise<APIGatewayProxyResultV2 | unknown> {
  if ("worker" in event) return runWorker(event);
  if ("fixtures" in event) return refreshFixtures();
  if ("copy_photos" in event) return copyPendingPhotos(); // run by the deploy script

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

    // Only one import per tile at a time: a second search for the same area
    // (another visitor, or a page reload) waits for the first one instead of
    // asking OpenStreetMap again.
    const claim = await invokeAdmin<{ claimed: boolean }>({ action: "claim_tile", tile: t.tile });
    if (!claim.claimed) return json(202, { status: "importing" });

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
