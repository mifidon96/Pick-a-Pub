import { db } from "../lib/db";
import { guessChannel, type FixtureInput } from "../services/fixtures";

// Upcoming matches from the importer (every 6 hours). Matches that have gone are cleared out.
export async function setFixtures(event: { fixtures: FixtureInput[] }) {
  if (!Array.isArray(event.fixtures)) throw new Error("fixtures must be a list");
  let saved = 0;
  for (const f of event.fixtures) {
    const kickoff = new Date(f.kickoff);
    if (!Number.isInteger(f.id) || Number.isNaN(kickoff.getTime()) || !f.home_name || !f.away_name) continue;
    await db().query(
      `insert into fixtures (id, competition, kickoff, status, home_name, away_name, home_team, away_team, channel, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       on conflict (id) do update set competition = excluded.competition, kickoff = excluded.kickoff,
         status = excluded.status, home_name = excluded.home_name, away_name = excluded.away_name,
         home_team = excluded.home_team, away_team = excluded.away_team, channel = excluded.channel, updated_at = now()`,
      [f.id, String(f.competition).slice(0, 10), kickoff, String(f.status).slice(0, 20),
       String(f.home_name).slice(0, 80), String(f.away_name).slice(0, 80),
       f.home_team ?? null, f.away_team ?? null, guessChannel(f.competition, kickoff)],
    );
    saved++;
  }
  const old = await db().query("delete from fixtures where kickoff < now() - interval '1 day'");
  return { ok: true, saved, removed: old.rowCount };
}
