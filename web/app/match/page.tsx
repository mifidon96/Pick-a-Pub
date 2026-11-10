"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ChannelBadge, MatchChips } from "@/components/MatchChips";
import PubCard from "@/components/PubCard";
import SendPlan from "@/components/SendPlan";
import { useFetch } from "@/hooks/useFetch";
import { fixturePubs, listFixtures } from "@/lib/api";
import { AREA_CENTRES, centreFromQuery, type Centre } from "@/lib/areas";
import { lastList } from "@/lib/lastList";
import { CHANNEL_FACT, LISTINGS_URL, readTeam, saveTeam, ukDay, ukTime } from "@/lib/matches";
import { usePageInfo } from "@/lib/pageInfo";
import { FACT_LABELS, TEAMS, teamName } from "@/lib/ratings";
import type { Fixture } from "@/lib/types";

// Where's it showing?
//   /match/                 upcoming matches, optionally for one team (?team=arsenal)
//   /match/?id=123          pubs near you for that match
export default function MatchPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading...</p>}>
      <MatchView />
    </Suspense>
  );
}

function MatchView() {
  const id = Number(useSearchParams().get("id"));
  return Number.isInteger(id) && id > 0 ? <MatchPubs id={id} /> : <Fixtures />;
}

// --- The list of upcoming matches ---------------------------------------------

function Fixtures() {
  const router = useRouter();
  const params = useSearchParams();
  const [team, setTeam] = useState(() => {
    const v = params.get("team") ?? readTeam();
    return TEAMS.some((t) => t.id === v) ? v : "";
  });
  const { data, error, loading } = useFetch(team, () => listFixtures({ days: 7, team }));

  // Keep the URL and the remembered team in step with the dropdown.
  useEffect(() => {
    router.replace(team ? `/match/?team=${team}` : "/match/", { scroll: false });
    saveTeam(team);
  }, [team, router]);

  // Group by day, in UK time.
  const days = new Map<string, Fixture[]>();
  for (const f of data?.fixtures ?? []) {
    const d = ukDay(f.kickoff);
    days.set(d, [...(days.get(d) ?? []), f]);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Where&apos;s it showing?</h1>
        <p className="text-sm text-muted">Pick a match to see nearby pubs with the right channel, best for football first.</p>
      </div>

      <label className="block max-w-sm space-y-1 text-sm">
        <span className="block text-xs text-muted">Your team</span>
        <select value={team} onChange={(e) => setTeam(e.target.value)} className="h-12 w-full rounded-xl border border-line bg-card px-3 text-base">
          <option value="">All matches</option>
          {TEAMS.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </label>

      {loading && <p className="text-sm text-muted">Loading matches...</p>}
      {error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {data?.fixtures.length === 0 && (
        <p className="rounded border border-line bg-card p-4 text-sm">
          No {team ? `${teamName(team)} ` : ""}matches in the next 7 days that we know about. We list the Premier
          League, Championship and Champions League (plus the Euros and World Cup).
        </p>
      )}

      {[...days].map(([day, fixtures]) => (
        <section key={day} className="space-y-2">
          <h2 className="text-sm font-semibold text-muted">{day}</h2>
          <ul className="space-y-2">
            {fixtures.map((f) => (
              <li key={f.id}>
                <Link href={`/match/?id=${f.id}`} className="block rounded-xl border border-line bg-card p-3 hover:border-pitch">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{f.home_name} v {f.away_name}</span>
                    <span className="shrink-0 tabular-nums text-sm">{ukTime(f.kickoff)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span>{f.competition_name}</span>
                    <ChannelBadge f={f} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="text-xs text-muted">
        Fixtures from football-data.org. TV channels are our best guess from the UK rights deals; check the{" "}
        <a href={LISTINGS_URL} target="_blank" rel="noopener noreferrer" className="underline">TV listings</a> before you go.
      </p>
    </div>
  );
}

// --- Pubs for one match -------------------------------------------------------

// Where to look: the place from the last pub search, then the featured areas.
const keyOf = (c: Centre) => c.areaId ?? "last";
function lastCentre(): Centre | null {
  return centreFromQuery(new URLSearchParams(lastList().split("?")[1] ?? ""));
}

function MatchPubs({ id }: { id: number }) {
  const [last] = useState(lastCentre);
  const centres = last && !last.areaId ? [last, ...AREA_CENTRES] : AREA_CENTRES;
  const [centre, setCentre] = useState<Centre>(() => last ?? AREA_CENTRES[0]!);
  const [team] = useState(readTeam);
  const { data, error, loading } = useFetch(`${id},${centre.lat},${centre.lng}`, () => fixturePubs(id, centre.lat, centre.lng));

  usePageInfo(data
    ? {
        title: `${data.fixture.home_name} v ${data.fixture.away_name}: where it's showing`,
        description: `Pubs showing ${data.fixture.home_name} v ${data.fixture.away_name}, ${ukDay(data.fixture.kickoff)} at ${ukTime(data.fixture.kickoff)}, rated by football fans.`,
      }
    : null);

  if (loading) return <p className="text-sm text-muted">Loading...</p>;
  if (error || !data) {
    return (
      <div className="space-y-3">
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error ?? "Match not found"}</p>
        <Link href="/match/" className="inline-flex min-h-11 items-center text-sm font-semibold text-pitch underline">All matches</Link>
      </div>
    );
  }

  const f = data.fixture;
  const channelFact = CHANNEL_FACT[f.channel];
  const channelLabel = channelFact ? FACT_LABELS[channelFact] : null;
  const yourSide = team && (team === f.home_team || team === f.away_team) ? team : "";
  const rival = yourSide ? (yourSide === f.home_team ? f.away_team : f.home_team) : null;

  return (
    <div className="space-y-5">
      <Link href="/match/" className="text-sm text-pitch underline">All matches</Link>

      <section className="space-y-2 rounded-xl border border-line bg-card p-4">
        <p className="text-xs text-muted">{f.competition_name} · {ukDay(f.kickoff)}, {ukTime(f.kickoff)}</p>
        <h1 className="text-2xl font-bold">{f.home_name} v {f.away_name}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <ChannelBadge f={f} />
          <a href={LISTINGS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-xs text-muted underline">
            Check the TV listings
          </a>
        </div>
      </section>

      {f.channel === "blackout" ? (
        <p className="rounded border border-line bg-card p-4 text-sm">
          Saturday 3pm kick-offs are not shown on UK TV, so pubs cannot show this match. If the kick-off has moved for TV,
          the listings will say so.
        </p>
      ) : (
        <>
          <label className="block max-w-sm space-y-1 text-sm">
            <span className="block text-xs text-muted">Pubs near</span>
            <select
              value={keyOf(centre)}
              onChange={(e) => setCentre(centres.find((c) => keyOf(c) === e.target.value) ?? centre)}
              className="h-12 w-full rounded-xl border border-line bg-card px-3 text-base"
            >
              {centres.map((c) => (
                <option key={keyOf(c)} value={keyOf(c)}>{c.label}</option>
              ))}
            </select>
            <span className="block text-xs text-muted">
              Somewhere else? <Link href="/" className="underline">Search for it</Link>, then come back.
            </span>
          </label>

          {channelLabel && (
            <p className="text-xs text-muted">
              Pubs that reviewers say have {channelLabel} come first. Most pubs have not been reviewed for this yet, so ring
              ahead if it matters.
            </p>
          )}

          {data.pubs.length === 0 && <p className="rounded border border-line bg-card p-4 text-sm">No pubs found near {centre.label}.</p>}
          <ul className="space-y-3">
            {data.pubs.map((p) => (
              <li key={p.id} className="space-y-2">
                <PubCard pub={p} extra={<MatchChips pub={p} fixture={f} channelLabel={channelLabel} rival={rival} />} />
                <SendPlan fixture={f} pub={p} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
