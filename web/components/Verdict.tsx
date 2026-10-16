import { Stars } from "@/components/Scores";
import type { Verdict } from "@/lib/api";

// Pick-a-Pub's own review of a pub. Deliberately styled apart from customer ratings.
export function VerdictPanel({ verdict }: { verdict: Verdict }) {
  const visited = verdict.visited
    ? new Date(`${verdict.visited}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
    : null;
  return (
    <section className="rounded-xl border-2 border-amber bg-amber/10 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-pitch">Pick-a-Pub verdict</h2>
        {visited && <span className="text-xs text-muted">Visited {visited}</span>}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-3xl font-bold leading-none text-ink">{verdict.rating.toFixed(1)}</span>
        <Stars value={verdict.rating} size="text-lg" />
      </div>
      {verdict.summary && <p className="mt-3 text-sm">{verdict.summary}</p>}
      {(verdict.best_for || verdict.tip) && (
        <dl className="mt-3 space-y-1 text-sm">
          {verdict.best_for && (
            <div><dt className="inline font-medium">Best for: </dt><dd className="inline">{verdict.best_for}</dd></div>
          )}
          {verdict.tip && (
            <div><dt className="inline font-medium">Our tip: </dt><dd className="inline">{verdict.tip}</dd></div>
          )}
        </dl>
      )}
      <p className="mt-3 text-xs text-muted">Our own visit. Separate from the customer ratings below.</p>
    </section>
  );
}

export function VerdictChip({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber bg-amber/15 px-2 py-0.5 text-xs font-medium text-ink">
      Our verdict {rating.toFixed(1)}★
    </span>
  );
}
