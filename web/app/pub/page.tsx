"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { getPub, SCORE_KEYS, SCORE_LABELS, type PubDetail, type PubInfo, type Review } from "@/lib/api";
import { FactChips, RatingBadge, ScoreBars } from "@/components/Scores";
import ShareButton from "@/components/ShareButton";

// Pub details: info, ratings and reviews. Reviewing happens on /pub/review/?id=.
// The id is a query parameter so the whole site can be a static export.
export default function PubPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading...</p>}>
      <PubDetailView />
    </Suspense>
  );
}

function PubDetailView() {
  const id = Number(useSearchParams().get("id"));
  const validId = Number.isInteger(id) && id > 0;
  const [data, setData] = useState<{ pub: PubDetail; reviews: Review[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!validId) return;
    let live = true;
    getPub(id)
      .then((d) => live && setData(d))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [id, validId]);

  if (!validId) return <NotFound message="That pub link is not valid." />;
  if (error) return <NotFound message={error} />;
  if (!data) return <p className="text-sm text-muted">Loading...</p>;

  const { pub, reviews } = data;
  const reviewHref = `/pub/review/?id=${pub.id}`;

  return (
    <div className="space-y-6">
      <BackToPubs />

      <div className="flex items-start gap-4">
        <div className="w-24 shrink-0">
          <RatingBadge pub={pub} />
        </div>
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-bold">{pub.name}</h1>
          <p className="text-sm text-muted">{[pub.address, pub.postcode].filter(Boolean).join(", ")}</p>
          <FactChips pub={pub} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={reviewHref} className="inline-flex items-center gap-2 rounded bg-pitch px-4 py-2 font-medium text-white">
          <PencilIcon /> Rate this pub
        </Link>
        <ShareButton pub={pub} />
      </div>

      <InfoCard pub={pub} />

      <section className="space-y-3 rounded-xl border border-line bg-card p-4">
        <h2 className="font-semibold">Football ratings</h2>
        {pub.review_count ? (
          <>
            <ScoreBars pub={pub} />
            {pub.stars === null && (
              <p className="text-xs text-muted">The overall star rating appears once {3 - pub.review_count} more {3 - pub.review_count === 1 ? "person rates" : "people rate"} this pub.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">
            Nobody has rated this pub for football yet. <Link href={reviewHref} className="text-pitch underline">Be the first.</Link>
          </p>
        )}
      </section>

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
              {SCORE_KEYS.map((k) => `${SCORE_LABELS[k].label} ${r[k]}`).join(" · ")}
              {r.food !== null && ` · Food ${r.food}`}
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}

function InfoCard({ pub }: { pub: PubDetail }) {
  const info: PubInfo = pub.info ?? {};
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${pub.lat},${pub.lng}`;
  const yesNo = (v: boolean | undefined) => (v === undefined ? null : v ? "Yes" : "No");
  const rows: [string, React.ReactNode][] = [];

  if (info.opening_hours) rows.push(["Opening hours", <span key="h" className="whitespace-pre-line">{formatHours(info.opening_hours)}</span>]);
  if (info.operator) rows.push(["Run by", info.operator]);
  if (yesNo(info.food)) rows.push(["Food", yesNo(info.food)]);
  if (yesNo(info.beer_garden)) rows.push(["Beer garden", yesNo(info.beer_garden)]);
  if (yesNo(info.real_ale)) rows.push(["Real ale", yesNo(info.real_ale)]);
  if (info.wheelchair) rows.push(["Wheelchair access", { yes: "Yes", limited: "Limited", no: "No" }[info.wheelchair]]);
  if (info.shows_sport) rows.push(["Sport on TV", "Listed as showing sport"]);
  if (info.phone) rows.push(["Phone", <a key="p" href={`tel:${info.phone.replace(/\s+/g, "")}`} className="text-pitch underline">{info.phone}</a>]);

  return (
    <section className="space-y-3 rounded-xl border border-line bg-card p-4">
      <h2 className="font-semibold">About this pub</h2>
      {rows.length > 0 ? (
        <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted">No extra details listed for this pub yet.</p>
      )}
      <div className="flex flex-wrap gap-3 text-sm">
        <a href={directions} target="_blank" rel="noopener noreferrer" className="text-pitch underline">Directions</a>
        {info.website && (
          <a href={info.website} target="_blank" rel="noopener noreferrer nofollow" className="text-pitch underline">Website</a>
        )}
      </div>
      <p className="text-xs text-muted">Details from OpenStreetMap, so check with the pub before you go.</p>
    </section>
  );
}

// OpenStreetMap hours look like "Mo-Th 12:00-23:00; Fr,Sa 12:00-00:00". Make them readable.
const DAYS: Record<string, string> = { Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat", Su: "Sun", PH: "Bank holidays" };
function formatHours(raw: string): string {
  return raw
    .split(";")
    .map((part) => part.trim().replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (d) => DAYS[d] ?? d).replace(/-/g, " to ").replace(/,/g, ", "))
    .filter(Boolean)
    .join("\n");
}

// Go back to the list the visitor came from (keeping their area), or home for a shared link.
function BackToPubs() {
  const router = useRouter();
  return (
    <button
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
      className="text-sm text-pitch underline"
    >
      Back to pubs
    </button>
  );
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
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
