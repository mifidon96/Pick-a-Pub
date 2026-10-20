"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  CHANNEL_FACT, FACT_LABELS, fixturePubs, LISTINGS_URL, listFixtures, TEAMS, teamName,
  type Fixture, type Pub,
} from "@/lib/api";
import PubCard from "@/components/PubCard";
import SendPlan from "@/components/SendPlan";
import { lastList } from "@/lib/lastList";
import { usePageInfo } from "@/lib/pageInfo";
import AREAS from "@/lib/areas.json";

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

// Your team is remembered in this browser only, as a convenience.
const TEAM_KEY = "pickapub:team";
const readTeam = () => {
  try {
    return localStorage.getItem(TEAM_KEY) ?? "";
  } catch {
    return "";
  }
};
const saveTeam = (t: string) => {
  try {
    if (t) localStorage.setItem(TEAM_KEY, t);
    else localStorage.removeItem(TEAM_KEY);
  } catch {
    /* storage blocked */
  }
};

const ukDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
const ukTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

function ChannelBadge({ f }: { f: Fixture }) {
  const style = f.channel === "blackout" ? "bg-line text-muted" : f.channel === "unknown" ? "border border-line text-muted" : "bg-amber/20 text-ink";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${style}`}>{f.channel_name}</span>;
}

function Fixtures() {
  const router = useRouter();
  const params = useSearchParams();
  const [team, setTeam] = useState(() => {
    const v = params.get("team") ?? readTeam();
    return TEAMS.some((t) => t.id === v) ? v : "";
  });
  const [data, setData] = useState<{ team: string; fixtures?: Fixture[]; error?: string } | null>(null);

  useEffect(() => {
    router.replace(team ? `/match/?team=${team}` : "/match/", { scroll: false });
    saveTeam(team);
    let live = true;
    listFixtures({ days: 7, team })
      .then((r) => live && setData({ team, fixtures: r.fixtures }))
      .catch((e: Error) => live && setData({ team, error: e.message }));
    return () => {
      live = false;
    };
  }, [team, router]);

  const loading = !data || data.team !== team;
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
        <select value={team} onChange={(e) => setTeam(e.target.value)} className="w-full rounded border border-line bg-card px-2 py-2 text-base">
          <option value="">All matches</option>
          {TEAMS.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </label>

      {loading && <p className="text-sm text-muted">Loading matches...</p>}
      {!loading && data?.error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{data.error}</p>}
      {!loading && data?.fixtures?.length === 0 && (
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

// Where to look: the place from the last pub search, or a featured area.
type Centre = { lat: number; lng: number; label: string; key: string };
const AREA_CENTRES: Centre[] = AREAS.map((a) => ({ lat: a.lat, lng: a.lng, label: a.label, key: a.id }));
function lastCentre(): Centre | null {
  const q = new URLSearchParams(lastList().split("?")[1] ?? "");
  const area = AREA_CENTRES.find((a) => a.key === q.get("area"));
  if (area) return area;
  const lat = Number(q.get("lat")), lng = Number(q.get("lng")), place = q.get("place");
  return place && q.get("lat") && q.get("lng") && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, label: place, key: "last" } : null;
}

function MatchPubs({ id }: { id: number }) {
  const [last] = useState(lastCentre);
  const centres = last && last.key === "last" ? [last, ...AREA_CENTRES] : AREA_CENTRES;
  const [centre, setCentre] = useState<Centre>(() => last ?? AREA_CENTRES[0]!);
  const [team] = useState(readTeam);
  const [data, setData] = useState<{ key: string; fixture?: Fixture; pubs?: (Pub & { has_channel: boolean | null })[]; error?: string } | null>(null);
  const key = `${id},${centre.lat},${centre.lng}`;

  useEffect(() => {
    let live = true;
    fixturePubs(id, centre.lat, centre.lng)
      .then((r) => live && setData({ key, ...r }))
      .catch((e: Error) => live && setData({ key, error: e.message }));
    return () => {
      live = false;
    };
  }, [id, centre, key]);

  usePageInfo(data?.fixture
    ? {
        title: `${data.fixture.home_name} v ${data.fixture.away_name}: where it's showing`,
        description: `Pubs showing ${data.fixture.home_name} v ${data.fixture.away_name}, ${ukDay(data.fixture.kickoff)} at ${ukTime(data.fixture.kickoff)}, rated by football fans.`,
      }
    : null);

  if (!data || data.key !== key) return <p className="text-sm text-muted">Loading...</p>;
  if (data.error || !data.fixture) {
    return (
      <div className="space-y-3">
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{data.error ?? "Match not found"}</p>
        <Link href="/match/" className="text-sm text-pitch underline">All matches</Link>
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
          <a href={LISTINGS_URL} target="_blank" rel="noopener noreferrer" className="text-xs text-muted underline">
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
              value={centre.key}
              onChange={(e) => setCentre(centres.find((c) => c.key === e.target.value) ?? centre)}
              className="w-full rounded border border-line bg-card px-2 py-2 text-base"
            >
              {centres.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
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

          {data.pubs?.length === 0 && <p className="rounded border border-line bg-card p-4 text-sm">No pubs found near {centre.label}.</p>}
          <ul className="space-y-3">
            {data.pubs?.map((p) => (
              <li key={p.id} className="space-y-2">
                <PubCard
                  pub={p}
                  extra={
                    <MatchChips pub={p} fixture={f} channelLabel={channelLabel} rival={rival} />
                  }
                />
                <SendPlan fixture={f} pub={p} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function MatchChips(props: { pub: Pub & { has_channel: boolean | null }; fixture: Fixture; channelLabel: string | null; rival: string | null }) {
  const { pub, fixture: f, channelLabel, rival } = props;
  const chips: [string, string][] = [];
  if (channelLabel && pub.has_channel === true) chips.push([`Has ${channelLabel}`, "bg-pitch text-white"]);
  if (channelLabel && pub.has_channel === false) chips.push([`Reviewers say no ${channelLabel}`, "bg-red-50 text-red-800"]);
  // "<Team> fans" already shows in the pub's chips; add a word if it matters to you.
  if (rival && pub.fan_team === rival) chips.push(["Rival fans: you may be outnumbered", "bg-amber/30 text-ink"]);
  else if (rival && pub.fan_team && (pub.fan_team === f.home_team || pub.fan_team === f.away_team)) chips.push(["Your team's pub", "bg-amber/30 text-ink"]);
  if (!chips.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {chips.map(([label, style]) => (
        <li key={label} className={`rounded-full px-2 py-0.5 text-xs ${style}`}>{label}</li>
      ))}
    </ul>
  );
}
