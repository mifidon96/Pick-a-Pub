import TEAMS_JSON from "./teams.json";
import { apiUrl } from "./config";

// Clubs and national teams, for "whose fans watch here".
export type Team = { id: string; name: string };
export const TEAMS: Team[] = TEAMS_JSON;
const TEAM_NAMES = new Map(TEAMS.map((t) => [t.id, t.name]));
export const teamName = (id: string | null | undefined) => (id ? TEAM_NAMES.get(id) ?? null : null);

// A quick review only needs these three (the most important to fans).
export const QUICK_KEYS = ["sightlines", "screens", "crowd"] as const;


// Scored categories, in order of how much they count towards the stars.
export const SCORE_KEYS = ["sightlines", "screens", "crowd", "seating", "commentary", "service_speed", "drink_prices"] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];

export const SCORE_LABELS: Record<ScoreKey | "food", { label: string; hint: string }> = {
  sightlines: { label: "View of a screen", hint: "Could you see it from where you sat" },
  screens: { label: "Screens", hint: "Size and picture quality" },
  crowd: { label: "Crowd", hint: "There to watch, not too packed" },
  seating: { label: "Seating", hint: "Chance of getting a seat" },
  commentary: { label: "Commentary", hint: "Sound on and you could hear it (no music or band over it)" },
  service_speed: { label: "Bar service", hint: "How quick, e.g. at half time" },
  drink_prices: { label: "Drink prices", hint: "Value for money" },
  food: { label: "Food", hint: "Leave blank if you did not eat" },
};

export const FACT_KEYS = [
  "shows_sky", "shows_tnt", "shows_amazon", "bookable",
  "outdoor_screen", "away_friendly", "family_friendly", "step_free",
  "dog_friendly", "low_no_alcohol", "several_games", "arrive_early",
] as const;
export type FactKey = (typeof FACT_KEYS)[number];

export const FACT_LABELS: Record<FactKey, string> = {
  shows_sky: "Sky Sports",
  shows_tnt: "TNT Sports",
  shows_amazon: "Amazon Prime",
  bookable: "Tables bookable",
  outdoor_screen: "Outdoor screen",
  away_friendly: "Away fans welcome",
  family_friendly: "Family friendly",
  step_free: "Step-free access",
  dog_friendly: "Dog friendly",
  low_no_alcohol: "Good low/no alcohol options",
  several_games: "Shows several games at once",
  arrive_early: "Get there early for a seat",
};

type Scores = { [K in ScoreKey]: number | null } & { food: number | null };
type Facts = { [K in FactKey]: boolean | null };

export type Pub = Scores & Facts & {
  stars: number | null; // null until a pub has enough reviews
  score: number | null; // unrounded rating behind the stars
  vibe: number | null; // 1 calm ... 5 lively
  verdict_rating?: number | null; // Pick-a-Pub's own rating, if we have reviewed it
  photo?: string | null; // cover photo for the list
  fan_team?: string | null; // team id: whose fans mostly watch here
  id: number;
  name: string;
  address: string | null;
  postcode: string | null;
  lat: number;
  lng: number;
  distance_m?: number;
  review_count: number | null;
};

// Pub details: from OpenStreetMap, overridden by Pick-a-Pub's own (content/pubs.yaml).
// Any field can be missing; text or yes/no.
export type PubInfo = Partial<Record<
  | "opening_hours" | "screens" | "food" | "drinks" | "beer_garden" | "booking" | "real_ale"
  | "wheelchair" | "website" | "phone" | "operator" | "notes" | "shows_sport" | "dog" | "low_no_alcohol"
  | "fans" | "away_fans",
  string | boolean
>>;

// Pick-a-Pub's own review. Separate from, and never part of, the customer stars.
export type Verdict = {
  rating: number;
  summary: string | null;
  best_for: string | null;
  tip: string | null;
  visited: string | null; // YYYY-MM
};

// credit: "Pick-a-Pub", an uploader's name, or "Author, Licence" for Wikimedia photos (with link to the source page)
export type Photo = { url: string; credit: string | null; link?: string; licence_url?: string };
export type PubDetail = Pub & { ref: string; info: PubInfo; verdict: Verdict | null; photos: Photo[] };

export type Vibe = "calm" | "lively";
export const VIBE_LABELS = ["Very calm", "Calm", "Mixed", "Lively", "Very lively"] as const;
export function vibeLabel(v: number | null): string | null {
  return v === null ? null : VIBE_LABELS[Math.min(4, Math.max(0, Math.round(v) - 1))]!;
}

// Quick reviews leave everything but QUICK_KEYS blank (null).
export type Review = { [K in ScoreKey]: number | null } & Facts & {
  id: number;
  display_name: string;
  food: number | null;
  vibe: number | null;
  fan_team: string | null;
  match_label: string | null;
  comment: string | null;
  updated_at: string;
};

export type ReviewInput = { [K in ScoreKey]: number | null } & Partial<Facts> & {
  display_name: string;
  food: number | null;
  vibe: number | null;
  fan_team: string | null;
  match_label: string;
  comment: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiUrl()}${path}`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

// Filters a visitor can switch on in the list.
export const FILTERS = {
  beer_garden: "Beer garden",
  big_screens: "Big screens",
  dog_friendly: "Dog friendly",
  low_no_alcohol: "Low/no alcohol",
  away_friendly: "Away fans welcome",
  several_games: "Several games at once",
} as const;
export type Filter = keyof typeof FILTERS;

export type Sort = "stars" | "distance" | ScoreKey;

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

// Signed-in only: the caller's own review of this pub, if they have one.
export function getMyReview(id: number, headers: HeadersInit) {
  // display_name: the name used on earlier reviews, to pre-fill a first review here.
  return request<{ review: Review | null; display_name: string | null }>(`/pubs/${id}/review`, { headers });
}

export function putReview(id: number, input: ReviewInput, headers: HeadersInit) {
  return request<{ ok: true }>(`/pubs/${id}/review`, {
    method: "PUT",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

// Search anywhere: make sure pubs around a point have been imported.
export type AreaStatus = "ready" | "importing";
export function ensureArea(lat: number, lng: number) {
  return request<{ status: AreaStatus }>(`/areas/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lat, lng }),
  });
}
export function areaStatus(lat: number, lng: number) {
  return request<{ status: AreaStatus }>(`/areas/status?${new URLSearchParams({ lat: String(lat), lng: String(lng) })}`);
}

// Photos: ask for a one-off upload form, then post the image straight to S3.
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

// Report a review (signed in). Three reports hide it until it has been checked.
export const REPORT_REASONS = {
  spam: "Spam or advertising",
  offensive: "Rude or offensive",
  fake: "Fake, or not about this pub",
  personal: "Shares someone's personal details",
  other: "Something else",
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;

export function reportReview(id: number, reason: ReportReason, note: string, headers: HeadersInit) {
  return request<{ ok: true }>(`/reviews/${id}/report`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ reason, note }),
  });
}

// Account: everything we hold about you, and deleting it.
export function exportMyData(headers: HeadersInit) {
  return request<Record<string, unknown>>(`/me`, { headers });
}

export function deleteMyData(headers: HeadersInit) {
  return request<{ ok: true; deleted: boolean; photos: number }>(`/me`, { method: "DELETE", headers });
}

// Where's it showing? Upcoming matches and the pubs to watch them in.
export type Channel = "sky" | "tnt" | "amazon" | "free" | "blackout" | "unknown";
export type Fixture = {
  id: number;
  competition: string;
  competition_name: string;
  kickoff: string;
  status: string;
  home_name: string;
  away_name: string;
  home_team: string | null;
  away_team: string | null;
  channel: Channel;
  channel_name: string;
};
// Fact on reviews that says a pub has this channel.
export const CHANNEL_FACT: Partial<Record<Channel, FactKey>> = { sky: "shows_sky", tnt: "shows_tnt", amazon: "shows_amazon" };
// UK TV listings, because our channel is a best guess.
export const LISTINGS_URL = "https://www.live-footballontv.com/";

export function listFixtures(opts: { days?: number; team?: string } = {}) {
  const q = new URLSearchParams({ days: String(opts.days ?? 7) });
  if (opts.team) q.set("team", opts.team);
  return request<{ fixtures: Fixture[] }>(`/fixtures?${q}`);
}

export function fixturePubs(id: number, lat: number, lng: number, radiusM = 5000) {
  const q = new URLSearchParams({ lat: String(lat), lng: String(lng), radius_m: String(radiusM) });
  return request<{ fixture: Fixture; pubs: (Pub & { has_channel: boolean | null })[] }>(`/fixtures/${id}/pubs?${q}`);
}
