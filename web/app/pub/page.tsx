"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { getMyReview, getPub, SCORE_KEYS, SCORE_LABELS, type Pub, type Review } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { FactChips, RatingBadge, ScoreBars } from "@/components/Scores";
import ShareButton from "@/components/ShareButton";
import ReviewForm from "@/components/ReviewForm";

// The pub id is a query parameter (/pub/?id=12) so the whole site can be a static export.
export default function PubPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading...</p>}>
      <PubDetail />
    </Suspense>
  );
}

function PubDetail() {
  const id = Number(useSearchParams().get("id"));
  const { ready, signedIn, available, headers, signIn } = useAuth();
  const [data, setData] = useState<{ pub: Pub; reviews: Review[]; mine: Review | null } | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const validId = Number.isInteger(id) && id > 0;

  useEffect(() => {
    if (!ready || !validId) return;
    let live = true;
    Promise.all([getPub(id), signedIn ? getMyReview(id, headers) : null])
      .then(([d, my]) => live && setData({ ...d, mine: my?.review ?? null }))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [id, validId, ready, signedIn, headers, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  if (!validId) return <NotFound message="That pub link is not valid." />;
  if (error) return <NotFound message={error} />;
  if (!data) return <p className="text-sm text-muted">Loading...</p>;

  const { pub, reviews, mine } = data;

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-pitch underline">Back to pubs</Link>

      <div className="flex items-start gap-4">
        <div className="w-24 shrink-0">
          <RatingBadge pub={pub} />
        </div>
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-bold">{pub.name}</h1>
          <p className="text-sm text-muted">{[pub.address, pub.postcode].filter(Boolean).join(", ")}</p>
          <FactChips pub={pub} />
          <ShareButton pub={pub} />
        </div>
      </div>

      {pub.review_count !== null && (
        <section className="rounded-xl border border-line bg-card p-4">
          <ScoreBars pub={pub} />
        </section>
      )}

      {signedIn ? (
        <ReviewForm key={`${mine?.id ?? "new"}-${mine?.updated_at ?? ""}`} pubId={pub.id} existing={mine ?? undefined} onSaved={reload} />
      ) : available ? (
        <div className="rounded-xl border border-line bg-card p-4 text-sm">
          <p>Watched a match here? Sign in to rate it.</p>
          <button onClick={signIn} className="mt-3 rounded bg-pitch px-4 py-2 font-medium text-white">Sign in to review</button>
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-semibold">Reviews</h2>
        {reviews.length === 0 && <p className="text-sm text-muted">Nobody has rated this pub yet.</p>}
        {reviews.map((r) => (
          <article key={r.id} className="rounded-xl border border-line bg-card p-4 text-sm">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{r.display_name}{r.id === mine?.id && " (you)"}</span>
              <time className="text-xs text-muted" dateTime={r.updated_at}>
                {new Date(r.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </time>
            </header>
            {r.match_label && <p className="mt-1 text-xs text-muted">Watched: {r.match_label}</p>}
            {r.comment && <p className="mt-2">{r.comment}</p>}
            <p className="mt-2 text-xs text-muted">
              {SCORE_KEYS.map((k) => `${SCORE_LABELS[k].label} ${r[k]}`).join(" · ")}
              {r.food !== null && ` · Food ${r.food}`}
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}

function NotFound({ message }: { message: string }) {
  return (
    <div className="space-y-3">
      <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message}</p>
      <Link href="/" className="text-sm text-pitch underline">Back to pubs</Link>
    </div>
  );
}
