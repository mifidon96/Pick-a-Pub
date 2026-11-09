import { apiUrl } from "./config";
import type { Filter, ReportReason, Sort, Vibe } from "./ratings";
import type { AreaStatus, Fixture, MatchPub, Pub, PubDetail, Review, ReviewInput } from "./types";

// Every call the website makes to the API, one function per endpoint.
// Routes and what they do: api/src/routes/index.ts. Labels: lib/ratings.ts.
// Shapes: lib/types.ts. Calls that need sign-in take the headers from useAuth().

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiUrl()}${path}`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

const json = (headers: HeadersInit, body: unknown) => ({
  headers: { ...headers, "content-type": "application/json" },
  body: JSON.stringify(body),
});

// --- Pubs -------------------------------------------------------------------

export function listPubs(opts: { lat: number; lng: number; radiusM: number; sort: Sort; vibe: Vibe | ""; has: Filter[]; fans?: string }) {
  const q = new URLSearchParams({ lat: String(opts.lat), lng: String(opts.lng), radius_m: String(opts.radiusM), sort: opts.sort });
  if (opts.fans) q.set("fans", opts.fans);
  if (opts.vibe) q.set("vibe", opts.vibe);
  if (opts.has.length) q.set("has", opts.has.join(","));
  return request<{ pubs: Pub[] }>(`/pubs?${q}`);
}

export function getPub(id: number) {
  return request<{ pub: PubDetail; reviews: Review[] }>(`/pubs/${id}`);
}

// Search anywhere: make sure pubs around a point have been imported (the importer Lambda).
export function ensureArea(lat: number, lng: number) {
  return request<{ status: AreaStatus }>(`/areas/import`, { method: "POST", ...json({}, { lat, lng }) });
}
export function areaStatus(lat: number, lng: number) {
  return request<{ status: AreaStatus }>(`/areas/status?${new URLSearchParams({ lat: String(lat), lng: String(lng) })}`);
}

// --- Reviews (signed in) ----------------------------------------------------

// The caller's own review of this pub, if they have one.
// display_name: the name used on earlier reviews, to pre-fill a first review here.
export function getMyReview(id: number, headers: HeadersInit) {
  return request<{ review: Review | null; display_name: string | null }>(`/pubs/${id}/review`, { headers });
}

export function putReview(id: number, input: ReviewInput, headers: HeadersInit) {
  return request<{ ok: true }>(`/pubs/${id}/review`, { method: "PUT", ...json(headers, input) });
}

// Three reports hide a review until it has been checked.
export function reportReview(id: number, reason: ReportReason, note: string, headers: HeadersInit) {
  return request<{ ok: true }>(`/reviews/${id}/report`, { method: "POST", ...json(headers, { reason, note }) });
}

// --- Photos (signed in) -----------------------------------------------------

// Ask for a one-off upload form, then post the image straight to S3.
export async function uploadPhoto(pubId: number, image: Blob, headers: HeadersInit): Promise<void> {
  const form = await request<{ url: string; fields: Record<string, string> }>(`/pubs/${pubId}/photos`, {
    method: "POST",
    headers,
  });
  const body = new FormData();
  for (const [k, v] of Object.entries(form.fields)) body.append(k, v);
  body.append("file", image, "photo.jpg"); // must be the last field
  const res = await fetch(form.url, { method: "POST", body });
  if (!res.ok) throw new Error(res.status === 400 ? "That photo is too large" : `Upload failed (${res.status})`);
}

// --- Account (signed in) ----------------------------------------------------

// Everything we hold about you, and deleting it.
export function exportMyData(headers: HeadersInit) {
  return request<Record<string, unknown>>(`/me`, { headers });
}

export function deleteMyData(headers: HeadersInit) {
  return request<{ ok: true; deleted: boolean; photos: number }>(`/me`, { method: "DELETE", headers });
}

// --- Where's it showing? ----------------------------------------------------

export function listFixtures(opts: { days?: number; team?: string } = {}) {
  const q = new URLSearchParams({ days: String(opts.days ?? 7) });
  if (opts.team) q.set("team", opts.team);
  return request<{ fixtures: Fixture[] }>(`/fixtures?${q}`);
}

export function fixturePubs(id: number, lat: number, lng: number, radiusM = 5000) {
  const q = new URLSearchParams({ lat: String(lat), lng: String(lng), radius_m: String(radiusM) });
  return request<{ fixture: Fixture; pubs: MatchPub[] }>(`/fixtures/${id}/pubs?${q}`);
}
