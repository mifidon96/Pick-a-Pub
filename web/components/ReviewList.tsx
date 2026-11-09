import ReportButton from "@/components/ReportButton";
import { SCORE_KEYS, SCORE_LABELS, teamName } from "@/lib/ratings";
import type { Review } from "@/lib/types";

// Customer reviews on a pub page, newest first, each with a report button.
export default function ReviewList({ reviews }: { reviews: Review[] }) {
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Reviews</h2>
      {reviews.length === 0 && <p className="text-sm text-muted">No reviews yet.</p>}
      {reviews.map((r) => (
        <article key={r.id} className="rounded-xl border border-line bg-card p-4 text-sm">
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">{r.display_name}</span>
            <time className="text-xs text-muted" dateTime={r.updated_at}>
              {new Date(r.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </time>
          </header>
          {r.match_label && <p className="mt-1 text-xs text-muted">Watched: {r.match_label}</p>}
          {r.comment && <p className="mt-2">{r.comment}</p>}
          <p className="mt-2 text-xs text-muted">
            {SCORE_KEYS.filter((k) => r[k] !== null).map((k) => `${SCORE_LABELS[k].label} ${r[k]}`).join(" · ")}
            {r.fan_team && ` · Fans here: ${teamName(r.fan_team)}`}
          </p>
          <ReportButton reviewId={r.id} />
        </article>
      ))}
    </section>
  );
}
