import teams from "../../../web/lib/teams.json";

// What a review is made of. The database columns have the same names
// (db/schema.sql: reviews, and the pub_scores view that averages them).

// Scored categories that feed the star rating.
export const SCORES = ["sightlines", "crowd", "screens", "seating", "commentary", "service_speed", "drink_prices"] as const;
// A quick review needs only these. The others can be left blank.
export const REQUIRED = new Set<string>(["sightlines", "screens", "crowd"]);
// Yes/no facts about the pub.
export const FACTS = [
  "shows_sky", "shows_tnt", "shows_amazon", "bookable",
  "outdoor_screen", "away_friendly", "family_friendly", "step_free",
  "dog_friendly", "low_no_alcohol", "arrive_early", "several_games",
] as const;

export const TEAM_IDS = new Set(teams.map((t) => t.id));

// The review columns we return, in one place so every query matches.
export const REVIEW_COLS = `r.id, u.display_name, ${SCORES.map((k) => `r.${k}`).join(", ")}, r.food, r.vibe,
            ${FACTS.map((f) => `r.${f}`).join(", ")},
            r.fan_team, r.match_label, r.comment, r.updated_at`;
