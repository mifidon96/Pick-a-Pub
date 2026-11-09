import { db } from "../lib/db";
import { bad, notFound, num, type Req, type Res } from "../lib/http";
import { TEAM_IDS } from "../lib/ratings";
import { CHANNEL_NAMES, COMPETITION_NAMES, type Channel } from "../services/fixtures";
import { nearbyPubs, searchArea } from "./pubs";

// "Where's it showing?": upcoming matches, and pubs likely to show one.
// The matches come from football-data.org every 6 hours (services/fixtures.ts).

const fixtureOut = (f: Record<string, unknown>) => ({
  ...f,
  competition_name: COMPETITION_NAMES[f.competition as string] ?? f.competition,
  channel_name: CHANNEL_NAMES[f.channel as Channel] ?? CHANNEL_NAMES.unknown,
});
const FIXTURE_COLS = "id, competition, kickoff, status, home_name, away_name, home_team, away_team, channel";

// GET /fixtures?days=7&team=arsenal  Upcoming matches (and ones that kicked off in the last 2 hours).
export async function listFixtures(req: Req): Promise<Res> {
  const days = num(req.query.days, "days", 1, 14, 7);
  const team = req.query.team ?? "";
  if (team && !TEAM_IDS.has(team)) throw bad("unknown team");
  const { rows } = await db().query(
    `select ${FIXTURE_COLS} from fixtures
      where kickoff > now() - interval '2 hours' and kickoff < now() + make_interval(days => $1)
        and status not in ('FINISHED', 'POSTPONED', 'CANCELLED', 'SUSPENDED')
        ${team ? "and (home_team = $2 or away_team = $2)" : ""}
      order by kickoff, id limit 150`,
    team ? [days, team] : [days],
  );
  return { status: 200, body: { fixtures: rows.map(fixtureOut) } };
}

// GET /fixtures/{id}/pubs?lat=&lng=&radius_m=  Pubs near a point for this match:
// reviewers say it has the channel first, then unknown, then "no"; best rated first within each.
export async function fixturePubs(req: Req, id: number): Promise<Res> {
  const { lat, lng, radius } = searchArea(req);
  const f = await db().query(`select ${FIXTURE_COLS} from fixtures where id = $1`, [id]);
  if (!f.rows[0]) throw notFound("Match not found");
  const fixture = f.rows[0];
  const col = { sky: "s.shows_sky", tnt: "s.shows_tnt", amazon: "s.shows_amazon" }[fixture.channel as string];
  const has = col ?? "null::boolean";
  const pubs = await nearbyPubs({
    lat, lng, radius,
    where: "",
    extraCols: `${has} as has_channel`,
    order: `case when ${has} then 0 when ${has} is null then 1 else 2 end,
            s.stars desc nulls last, s.review_count desc nulls last, distance_m`,
    params: [],
  });
  return { status: 200, body: { fixture: fixtureOut(fixture), pubs } };
}
