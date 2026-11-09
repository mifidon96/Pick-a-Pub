import type { FactKey, ScoreKey } from "./ratings";

// The shapes of what the API sends back (api/src/routes).

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

// Where's it showing? Upcoming matches.
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
// A pub in a match list: has_channel is what reviewers say (null = nobody said).
export type MatchPub = Pub & { has_channel: boolean | null };

// Search anywhere: whether a new area's pubs have been imported yet.
export type AreaStatus = "ready" | "importing";
