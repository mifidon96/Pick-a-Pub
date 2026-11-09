import { bodyOf, HttpError, type Req, type Res } from "../lib/http";
import { recordView } from "../services/analytics";
import { deleteMe, exportMe } from "./account";
import { fixturePubs, listFixtures } from "./fixtures";
import { startPhotoUpload } from "./photos";
import { getPub, listPubs } from "./pubs";
import { getMyReview, putReview, reportReview } from "./reviews";

export type { Req, Res } from "../lib/http";

// `id` is the number in the path ({id}), for routes that have one.
type Handler = (req: Req, id: number) => Promise<Res>;

// Every endpoint the api Lambda answers. The keys match the routes in
// infra/api_gateway.tf (test/routes.test.ts checks they stay in step).
// Whether you must be signed in is decided there, by API Gateway.
export const routes: Record<string, Handler> = {
  "GET /pubs": listPubs,
  "GET /pubs/{id}": getPub,
  "GET /fixtures": listFixtures,
  "GET /fixtures/{id}/pubs": fixturePubs,
  "POST /events": pageView,
  "GET /pubs/{id}/review": getMyReview,
  "PUT /pubs/{id}/review": putReview,
  "POST /pubs/{id}/photos": startPhotoUpload,
  "POST /reviews/{id}/report": reportReview,
  "GET /me": exportMe,
  "DELETE /me": deleteMe,
};

// POST /events  A cookie-free page count (services/analytics.ts).
async function pageView(req: Req): Promise<Res> {
  const b = bodyOf(req);
  await recordView({ path: b.path, referrer: b.referrer, app: b.app, ip: req.client?.ip, ua: req.client?.ua, ownHost: req.client?.host });
  return { status: 202, body: { ok: true } };
}

// Finds the handler for a request: same method, same number of path parts, and
// {id} matches a whole number.
function match(method: string, path: string): { handler: Handler; id: number } | null {
  const parts = path.split("/");
  for (const [key, handler] of Object.entries(routes)) {
    const [m, pattern] = key.split(" ") as [string, string];
    const want = pattern.split("/");
    if (m !== method || want.length !== parts.length) continue;
    let id = NaN;
    const ok = want.every((w, i) => {
      if (w !== "{id}") return w === parts[i];
      if (!/^\d{1,9}$/.test(parts[i]!)) return false;
      id = Number(parts[i]);
      return true;
    });
    if (ok) return { handler, id };
  }
  return null;
}

// Runs one request. Errors thrown as HttpError become that status; anything
// else is logged and becomes a 500 (and trips the api-errors alarm).
export async function handle(req: Req): Promise<Res> {
  try {
    const path = req.path.replace(/\/+$/, "") || "/";
    const found = match(req.method, path);
    if (!found) return { status: 404, body: { error: "Not found" } };
    return await found.handler(req, found.id);
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: { error: e.message } };
    console.error(e);
    return { status: 500, body: { error: "Something went wrong" } };
  }
}
