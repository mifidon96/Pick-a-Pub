import teams from "../../web/lib/teams.json";

// "Where's it showing?": upcoming matches from football-data.org (free tier),
// fetched by the importer Lambda (it has internet access) and stored by the
// admin Lambda. https://www.football-data.org/documentation/api

// Competitions on the free tier that UK pubs show. EC and WC only return
// matches during the Euros and the World Cup.
export const COMPETITIONS = ["PL", "ELC", "CL", "EC", "WC"] as const;
export const COMPETITION_NAMES: Record<string, string> = {
  PL: "Premier League",
  ELC: "Championship",
  CL: "Champions League",
  EC: "European Championship",
  WC: "World Cup",
};

export type FixtureInput = {
  id: number;
  competition: string;
  kickoff: string; // ISO, UTC
  status: string;
  home_name: string;
  away_name: string;
  home_team: string | null; // our team id (web/lib/teams.json), if we know the club
  away_team: string | null;
};

// UK TV. football-data.org has no broadcaster data, so this is a best guess
// from the current UK rights deals, always shown with "check listings":
//   - Saturday 2:45pm to 5:15pm: the 3pm blackout, not on UK TV
//   - Premier League: TNT has Saturday 12:30, Sky has nearly everything else
//   - Championship: Sky
//   - Champions League: TNT (one Tuesday match is on Amazon Prime)
//   - Euros and World Cup: BBC or ITV (free to air)
export type Channel = "sky" | "tnt" | "amazon" | "free" | "blackout" | "unknown";
export const CHANNEL_NAMES: Record<Channel, string> = {
  sky: "Sky Sports",
  tnt: "TNT Sports",
  amazon: "Amazon Prime Video",
  free: "BBC or ITV",
  blackout: "Not on UK TV (3pm blackout)",
  unknown: "Check the listings",
};

function ukTime(d: Date): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { day, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function guessChannel(competition: string, kickoff: Date): Channel {
  const { day, minutes } = ukTime(kickoff);
  const domestic = competition === "PL" || competition === "ELC";
  if (domestic && day === 6 && minutes >= 14 * 60 + 45 && minutes < 17 * 60 + 15) return "blackout";
  if (competition === "PL") return day === 6 && minutes === 12 * 60 + 30 ? "tnt" : "sky";
  if (competition === "ELC") return "sky";
  if (competition === "CL") return "tnt";
  if (competition === "EC" || competition === "WC") return "free";
  return "unknown";
}

// "Tottenham Hotspur FC" -> "tottenham-hotspur", "AFC Bournemouth" -> "bournemouth".
// Strips the usual FC / AFC and maps the few names that differ.
const ALIASES: Record<string, string> = {
  "mk-dons": "milton-keynes-dons",
  "hearts": "heart-of-midlothian",
  "ireland": "republic-of-ireland",
};
const TEAM_IDS = new Set(teams.map((t) => t.id));
const slug = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function matchTeam(name: string | null | undefined): string | null {
  if (!name) return null;
  const full = slug(name);
  if (ALIASES[full]) return ALIASES[full]!;
  const trimmed = full.replace(/^(afc|fc)-/, "").replace(/-(fc|afc)$/, "");
  if (ALIASES[trimmed]) return ALIASES[trimmed]!;
  return TEAM_IDS.has(trimmed) ? trimmed : TEAM_IDS.has(full) ? full : null;
}

type ApiMatch = {
  id: number;
  utcDate: string;
  status: string;
  competition: { code: string };
  homeTeam: { name: string | null };
  awayTeam: { name: string | null };
};

// Matches from today to `days` ahead. Throws on a bad key or the rate limit.
export async function fetchFixtures(apiKey: string, days = 10, fetchFn: typeof fetch = fetch, now = new Date()): Promise<FixtureInput[]> {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const to = new Date(now.getTime() + days * 86_400_000);
  const url = `https://api.football-data.org/v4/matches?competitions=${COMPETITIONS.join(",")}&dateFrom=${iso(now)}&dateTo=${iso(to)}`;
  const res = await fetchFn(url, { headers: { "X-Auth-Token": apiKey } });
  if (!res.ok) throw new Error(`football-data.org returned ${res.status}`);
  const data = (await res.json()) as { matches?: ApiMatch[] };
  return (data.matches ?? [])
    .filter((m) => m.homeTeam?.name && m.awayTeam?.name) // knockout ties not yet decided
    .map((m) => ({
      id: m.id,
      competition: m.competition.code,
      kickoff: m.utcDate,
      status: m.status,
      home_name: m.homeTeam.name!.replace(/\s+(FC|AFC)$/, ""),
      away_name: m.awayTeam.name!.replace(/\s+(FC|AFC)$/, ""),
      home_team: matchTeam(m.homeTeam.name),
      away_team: matchTeam(m.awayTeam.name),
    }));
}
