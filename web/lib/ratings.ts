import TEAMS_JSON from "./teams.json";

// What a review is made of, and the words shown for each part. The keys match
// the API and database columns (api/src/lib/ratings.ts, db/schema.sql).

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

// Yes/no facts about a pub.
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

// Vibe is 1 (very calm) to 5 (very lively).
export type Vibe = "calm" | "lively";
export const VIBE_LABELS = ["Very calm", "Calm", "Mixed", "Lively", "Very lively"] as const;
export function vibeLabel(v: number | null): string | null {
  return v === null ? null : VIBE_LABELS[Math.min(4, Math.max(0, Math.round(v) - 1))]!;
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

// Why someone reports a review. Three reports hide it until it has been checked.
export const REPORT_REASONS = {
  spam: "Spam or advertising",
  offensive: "Rude or offensive",
  fake: "Fake, or not about this pub",
  personal: "Shares someone's personal details",
  other: "Something else",
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;
