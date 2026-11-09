import type { FactKey } from "./ratings";
import type { Channel } from "./types";

// Helpers for "Where's it showing?" (app/match).

// The review fact that says a pub has this channel.
export const CHANNEL_FACT: Partial<Record<Channel, FactKey>> = { sky: "shows_sky", tnt: "shows_tnt", amazon: "shows_amazon" };
// UK TV listings, because our channel is a best guess.
export const LISTINGS_URL = "https://www.live-footballontv.com/";

// Kick-off day and time in UK time, whatever the visitor's clock says.
export const ukDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
export const ukTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

// Your team is remembered in this browser only, as a convenience.
const TEAM_KEY = "pickapub:team";
export function readTeam(): string {
  try {
    return localStorage.getItem(TEAM_KEY) ?? "";
  } catch {
    return "";
  }
}
export function saveTeam(t: string) {
  try {
    if (t) localStorage.setItem(TEAM_KEY, t);
    else localStorage.removeItem(TEAM_KEY);
  } catch {
    /* storage blocked */
  }
}
