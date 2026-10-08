export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

export const SCORE_KEYS = ["tvs", "sightlines", "atmosphere", "seating", "drinks", "service"] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];

export const SCORE_LABELS: Record<ScoreKey | "food", { label: string; hint: string }> = {
  tvs: { label: "TVs", hint: "Size and picture quality" },
  sightlines: { label: "Sightlines", hint: "Can you see a screen from most seats" },
  atmosphere: { label: "Atmosphere", hint: "Match day buzz" },
  seating: { label: "Seating", hint: "Chance of getting a seat" },
  drinks: { label: "Drinks", hint: "Price and range" },
  service: { label: "Bar service", hint: "The half-time queue" },
  food: { label: "Food", hint: "Leave blank if you did not eat" },
};

export const FACT_KEYS = [
  "sound_on", "shows_sky", "shows_tnt", "shows_amazon", "bookable",
  "outdoor_screen", "away_friendly", "family_friendly", "step_free",
] as const;
export type FactKey = (typeof FACT_KEYS)[number];

export const FACT_LABELS: Record<FactKey, string> = {
  sound_on: "Commentary on",
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
  id: number;
  name: string;
  address: string | null;
  postcode: string | null;
  lat: number;
  lng: number;
  distance_m?: number;
  review_count: number | null;
  overall: number | null;
};

export type Review = { [K in ScoreKey]: number } & Facts & {
  id: number;
  display_name: string;
  food: number | null;
  match_label: string | null;
  comment: string | null;
  updated_at: string;
};

export type ReviewInput = { [K in ScoreKey]: number } & Partial<Facts> & {
  display_name: string;
  food: number | null;
  match_label: string;
  comment: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export function listPubs(lat: number, lng: number, radiusM: number, sort: "score" | "distance") {
  const q = new URLSearchParams({ lat: String(lat), lng: String(lng), radius_m: String(radiusM), sort });
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
