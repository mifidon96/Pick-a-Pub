"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import PubInfoCard from "@/components/PubInfoCard";
import PubPhotos from "@/components/PubPhotos";
import ReviewList from "@/components/ReviewList";
import { FactChips, RatingBadge, ScoreBars } from "@/components/Scores";
import ShareButton from "@/components/ShareButton";
import { VerdictPanel } from "@/components/Verdict";
import { useFetch } from "@/hooks/useFetch";
import { getPub } from "@/lib/api";
import { lastList } from "@/lib/lastList";
import { usePageInfo } from "@/lib/pageInfo";

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
  const { data, error } = useFetch(validId ? String(id) : null, () => getPub(id));

  // The page is shared by every pub, so name the tab and description once it loads.
  usePageInfo(data
    ? {
        title: `${data.pub.name}: football rating`,
        description: data.pub.stars !== null
          ? `${data.pub.name} is rated ${data.pub.stars.toFixed(1)} out of 5 for watching football by ${data.pub.review_count} fan${data.pub.review_count === 1 ? "" : "s"}. View of the screen, sound, crowd and seats.`
          : `Is ${data.pub.name} good for watching football? Ratings for the view of the screen, sound, crowd and seats.`,
        canonical: data.pub.page,
      }
    : null);

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
          {(pub.address || pub.postcode) && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([pub.name, pub.address, pub.postcode].filter(Boolean).join(", "))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center text-sm text-muted underline decoration-muted/50 underline-offset-2 hover:text-pitch"
            >
              {[pub.address, pub.postcode].filter(Boolean).join(", ")}
            </a>
          )}
          <FactChips pub={pub} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={reviewHref} className="inline-flex h-12 items-center gap-2 rounded-xl bg-pitch px-5 font-bold text-on-pitch hover:bg-pitch-dark">
          <PencilIcon /> Rate this pub
        </Link>
        <ShareButton pub={pub} />
      </div>

      <PubPhotos pubId={pub.id} pubName={pub.name} photos={pub.photos ?? []} />

      {pub.verdict && <VerdictPanel verdict={pub.verdict} />}

      <PubInfoCard pub={pub} />

      <section className="space-y-3 rounded-xl border border-line bg-card p-4">
        <h2 className="font-semibold">Football ratings</h2>
        {pub.review_count ? (
          <>
            <ScoreBars pub={pub} />
            {pub.review_count < 3 && (
              <p className="text-xs text-muted">Based on {pub.review_count} review{pub.review_count === 1 ? "" : "s"} so far, so it may change as more people rate it.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">
            Nobody has rated this pub for football yet. <Link href={reviewHref} className="text-pitch underline">Be the first.</Link>
          </p>
        )}
      </section>

      <ReviewList reviews={reviews} />

      <p className="text-xs text-muted">Pub ID: {pub.ref}</p>
    </div>
  );
}

// Go back to the list the visitor came from (keeping their area), or home for a shared link.
function BackToPubs() {
  const router = useRouter();
  return (
    <button onClick={() => router.push(lastList())} className="inline-flex min-h-11 items-center text-sm font-semibold text-pitch underline">
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
      <Link href="/" className="inline-flex min-h-11 items-center text-sm font-semibold text-pitch underline">Back to pubs</Link>
    </div>
  );
}
