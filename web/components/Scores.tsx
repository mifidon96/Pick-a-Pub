import { FACT_KEYS, FACT_LABELS, SCORE_KEYS, SCORE_LABELS, teamName, vibeLabel, type Pub } from "@/lib/api";

// Five stars, filled to the nearest half.
export function Stars({ value, size = "text-base" }: { value: number; size?: string }) {
  return (
    <span className={`inline-flex ${size} leading-none`} role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <span key={i} className="relative inline-block text-line" aria-hidden>
            ★
            <span className="absolute inset-0 overflow-hidden text-amber" style={{ width: `${fill * 100}%` }}>
              ★
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function RatingBadge({ pub }: { pub: Pub }) {
  const n = pub.review_count ?? 0;
  if (pub.stars === null) {
    return (
      <div className="rounded-lg border border-dashed border-line px-2 py-2 text-center text-xs text-muted">
        {n === 0 ? "No reviews yet" : <>New<br />{n} review{n === 1 ? "" : "s"}</>}
      </div>
    );
  }
  return (
    <div className="rounded-lg bg-pitch px-2 py-2 text-center text-white">
      <div className="text-2xl font-bold leading-none">{pub.stars.toFixed(1)}</div>
      <div className="mt-1"><Stars value={pub.stars} size="text-xs" /></div>
      <div className="mt-1 text-[11px] text-white/80">{n} review{n === 1 ? "" : "s"}</div>
    </div>
  );
}

export function ScoreBars({ pub }: { pub: Pub }) {
  const rows = [...SCORE_KEYS, "food" as const];
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {rows.map((k) => {
        const v = pub[k];
        return (
          <div key={k} className="flex items-center gap-3 text-sm">
            <dt className="w-28 shrink-0 text-muted">{SCORE_LABELS[k].label}</dt>
            <dd className="flex flex-1 items-center gap-2">
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                <span className="block h-full rounded-full bg-amber" style={{ width: `${((v ?? 0) / 5) * 100}%` }} />
              </span>
              <span className="w-7 text-right tabular-nums">{v === null ? "n/a" : v.toFixed(1)}</span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function FactChips({ pub }: { pub: Pub }) {
  const yes = FACT_KEYS.filter((k) => pub[k] === true);
  const vibe = vibeLabel(pub.vibe);
  const fans = teamName(pub.fan_team);
  if (!yes.length && !vibe && !fans) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {fans && <li className="rounded-full bg-pitch px-2 py-0.5 text-xs text-white">{fans} fans</li>}
      {vibe && <li className="rounded-full bg-amber/20 px-2 py-0.5 text-xs text-ink">{vibe}</li>}
      {yes.map((k) => (
        <li key={k} className="rounded-full border border-pitch/30 bg-pitch/5 px-2 py-0.5 text-xs text-pitch">
          {FACT_LABELS[k]}
        </li>
      ))}
    </ul>
  );
}
