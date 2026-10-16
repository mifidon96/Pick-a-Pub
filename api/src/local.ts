import { createServer } from "node:http";
import { handle } from "./app";
import { runAdmin } from "./admin";
import { fetchPubs } from "./importer";
import { osmToPub } from "../../scripts/osm-to-pub.mjs";
import { inUk, TILE_IMPORT_RADIUS_M, tileFor } from "./tiles";

// Local stand-in for the importer Lambda: same API, imports straight into the local database.
async function localArea(method: string, path: string, lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inUk(lat, lng)) return { status: 400, body: { error: "Pick-a-Pub only covers the UK for now" } };
  const t = tileFor(lat, lng);
  const st = (await runAdmin({ action: "tile_status", tile: t.tile })) as { fresh: boolean };
  if (st.fresh) return { status: 200, body: { status: "ready" } };
  if (method === "POST") {
    fetchPubs(t.lat, t.lng, TILE_IMPORT_RADIUS_M)
      .then((els) => runAdmin({ action: "import_pubs", tile: t.tile, pubs: els.map(osmToPub).filter((p) => p.name && Number.isFinite(p.lat)) as never }))
      .then((r) => console.log("imported", t.tile, r))
      .catch((e) => console.error("area import failed", t.tile, e));
  }
  return { status: method === "POST" ? 202 : 200, body: { status: "importing" } };
}

// Local dev server. Stands in for API Gateway.
// Auth is faked: send an "x-dev-user" header to act as a signed-in user.
const port = Number(process.env.PORT ?? 4000);

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, authorization, x-dev-user",
    "access-control-allow-methods": "GET, PUT, POST, OPTIONS",
  };
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors).end();
    return;
  }

  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  let body: unknown;
  if (chunks.length) {
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      res.writeHead(400, { ...cors, "content-type": "application/json" }).end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }
  }

  if (url.pathname === "/areas/import" || url.pathname === "/areas/status") {
    const b = (body ?? {}) as { lat?: unknown; lng?: unknown };
    const lat = Number(url.pathname === "/areas/import" ? b.lat : url.searchParams.get("lat"));
    const lng = Number(url.pathname === "/areas/import" ? b.lng : url.searchParams.get("lng"));
    const out = await localArea(req.method ?? "GET", url.pathname, lat, lng);
    res.writeHead(out.status, { ...cors, "content-type": "application/json" }).end(JSON.stringify(out.body));
    return;
  }

  const devUser = req.headers["x-dev-user"];
  const out = await handle({
    method: req.method ?? "GET",
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    body,
    userId: typeof devUser === "string" && devUser ? devUser : undefined,
  });
  res.writeHead(out.status, { ...cors, "content-type": "application/json" }).end(JSON.stringify(out.body));
}).listen(port, () => console.log(`API on http://localhost:${port}`));
