import { createServer } from "node:http";
import { handle } from "./app";

// Local dev server. Stands in for API Gateway.
// Auth is faked: send an "x-dev-user" header to act as a signed-in user.
const port = Number(process.env.PORT ?? 4000);

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, authorization, x-dev-user",
    "access-control-allow-methods": "GET, PUT, OPTIONS",
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
