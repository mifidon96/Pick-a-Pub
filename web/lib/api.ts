export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

// Scored categories, in order of how much they count towards the stars.
export const SCORE_KEYS = ["sightlines", "screens", "crowd", "seating", "commentary", "service_speed", "drink_prices"] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];

export const SCORE_LABELS: Record<ScoreKey | "food", { label: string; hint: string }> = {
  sightlines: { label: "View of a screen", hint: "Could you see it from where you sat" },
  screens: { label: "Screens", hint: "Size and picture quality" },
  crowd: { label: "Crowd", hint: "There to watch, not too packed" },
  seating: { label: "Seating", hint: "Chance of getting a seat" },
  commentary: { label: "Commentary", hint: "Sound on and you could hear it" },
  service_speed: { label: "Bar service", hint: "How quick, e.g. at half time" },
  drink_prices: { label: "Drink prices", hint: "Value for money" },
  food: { label: "Food", hint: "Leave blank if you did not eat" },
};

export const FACT_KEYS = [
  "shows_sky", "shows_tnt", "shows_amazon", "bookable",
  "outdoor_screen", "away_friendly", "family_friendly", "step_free",
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
};

type Scores = { [K in ScoreKey]: number | null } & { food: number | null };
type Facts = { [K in FactKey]: boolean | null };

export type Pub = Scores & Facts & {
  stars: number | null; // null until a pub has enough reviews
  score: number | null; // unrounded rating behind the stars
  vibe: number | null; // 1 calm ... 5 lively
  id: number;
  name: string;
  address: string | null;
  postcode: string | null;
  lat: number;
  lng: number;
  distance_m?: number;
  review_count: number | null;
};

export type Vibe = "calm" | "lively";
export const VIBE_LABELS = ["Very calm", "Calm", "Mixed", "Lively", "Very lively"] as const;
export function vibeLabel(v: number | null): string | null {
  return v === null ? null : VIBE_LABELS[Math.min(4, Math.max(0, Math.round(v) - 1))]!;
}

export type Review = { [K in ScoreKey]: number } & Facts & {
  id: number;
  display_name: string;
  food: number | null;
  vibe: number;
  match_label: string | null;
  comment: string | null;
  updated_at: string;
};

export type ReviewInput = { [K in ScoreKey]: number } & Partial<Facts> & {
  display_name: string;
  food: number | null;
  vibe: number;
  match_label: string;
  comment: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export function listPubs(lat: number, lng: number, radiusM: number, sort: "stars" | "distance", vibe: Vibe | "") {
  const q = new URLSearchParams({ lat: String(lat), lng: String(lng), radius_m: String(radiusM), sort });
  if (vibe) q.set("vibe", vibe);
  return request<{ pubs: Pub[] }>(`/pubs?${q}`);
}

export function getPub(id: number) {
  return request<{ pub: Pub; reviews: Review[] }>(`/pubs/${id}`);
}

// Signed-in only: the caller's own review of this pub, if they have one.
export function getMyReview(id: number, headers: HeadersInit) {
  return request<{ review: Review | null }>(`/pubs/${id}/review`, { headers });
}

export function putReview(id: number, input: ReviewInput, headers: HeadersInit) {
  return request<{ ok: true }>(`/pubs/${id}/review`, {
    method: "PUT",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}
