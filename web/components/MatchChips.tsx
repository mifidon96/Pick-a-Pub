import type { Fixture, MatchPub } from "@/lib/types";

// The channel a match is on (our best guess from the UK rights deals).
export function ChannelBadge({ f }: { f: Fixture }) {
  const style = f.channel === "blackout" ? "bg-line text-muted" : f.channel === "unknown" ? "border border-line text-muted" : "bg-amber/20 text-ink";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${style}`}>{f.channel_name}</span>;
}

// Extra chips on a pub card for one match: does it have the channel, and whose fans are there.
// rival: the other side, when your saved team is playing.
export function MatchChips(props: { pub: MatchPub; fixture: Fixture; channelLabel: string | null; rival: string | null }) {
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
