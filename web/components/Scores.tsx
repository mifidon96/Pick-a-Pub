import { FACT_KEYS, FACT_LABELS, SCORE_KEYS, SCORE_LABELS, type Pub } from "@/lib/api";

export function OverallBadge({ pub }: { pub: Pub }) {
  if (pub.overall === null) {
    return <div className="rounded-lg border border-dashed border-line px-3 py-2 text-center text-xs text-muted">No reviews yet</div>;
  }
  return (
    <div className="rounded-lg bg-pitch px-3 py-2 text-center text-white">
      <div className="text-2xl font-bold leading-none">{pub.overall.toFixed(1)}</div>
      <div className="mt-1 text-[11px] text-white/80">
        {pub.review_count} review{pub.review_count === 1 ? "" : "s"}
      </div>
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
            <dt className="w-24 shrink-0 text-muted">{SCORE_LABELS[k].label}</dt>
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
  if (!yes.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {yes.map((k) => (
        <li key={k} className="rounded-full border border-pitch/30 bg-pitch/5 px-2 py-0.5 text-xs text-pitch">
          {FACT_LABELS[k]}
        </li>
      ))}
    </ul>
  );
}
