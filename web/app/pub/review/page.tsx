"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { getMyReview, getPub, type PubDetail, type Review } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import ReviewForm from "@/components/ReviewForm";

// Rate a pub: /pub/review/?id=12. Sends people back to the pub page when saved.
export default function ReviewPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading...</p>}>
      <ReviewView />
    </Suspense>
  );
}

function ReviewView() {
  const router = useRouter();
  const id = Number(useSearchParams().get("id"));
  const validId = Number.isInteger(id) && id > 0;
  const { ready, signedIn, available, headers, signIn } = useAuth();
  const [pub, setPub] = useState<PubDetail | null>(null);
  const [mine, setMine] = useState<Review | null | undefined>(undefined); // undefined = still loading
  const [knownName, setKnownName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!validId || !ready) return;
    let live = true;
    Promise.all([getPub(id), signedIn ? getMyReview(id, headers) : null])
      .then(([d, my]) => {
        if (!live) return;
        setPub(d.pub);
        setMine(my?.review ?? null);
        setKnownName(my?.display_name ?? "");
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [id, validId, ready, signedIn, headers]);

  const pubHref = `/pub/?id=${id}`;
  if (!validId) return <Problem message="That pub link is not valid." />;
  if (error) return <Problem message={error} />;
  if (!pub || mine === undefined) return <p className="text-sm text-muted">Loading...</p>;

  return (
    <div className="space-y-5">
      {/* replace, not push, so the review page never ends up in the Back history */}
      <button onClick={() => router.replace(pubHref)} className="text-sm text-pitch underline">Back to {pub.name}</button>
      <div>
        <h1 className="text-2xl font-bold">{mine ? "Update your review" : "Rate this pub"}</h1>
        <p className="text-sm text-muted">{pub.name}{pub.address ? `, ${pub.address}` : ""}</p>
      </div>

      {signedIn ? (
        <ReviewForm
          key={mine ? `${mine.id}-${mine.updated_at}` : "new"}
          pubId={pub.id}
          existing={mine ?? undefined}
          defaultName={knownName}
          onSaved={() => router.replace(pubHref)}
        />
      ) : available ? (
        <div className="rounded-xl border border-line bg-card p-4 text-sm">
          <p>
            Sign in to rate {pub.name}. It takes a minute and we only use your email to sign you in. By posting
            you agree to the <Link href="/terms/" className="text-pitch underline">terms</Link> and{" "}
            <Link href="/privacy/" className="text-pitch underline">privacy notice</Link>.
          </p>
          <button onClick={signIn} className="mt-3 rounded bg-pitch px-4 py-2 font-medium text-white">Sign in to review</button>
        </div>
      ) : (
        <p className="text-sm text-muted">Reviews are not available right now.</p>
      )}
    </div>
  );
}

function Problem({ message }: { message: string }) {
  return (
    <div className="space-y-3">
      <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message}</p>
      <Link href="/" className="text-sm text-pitch underline">Back to pubs</Link>
    </div>
  );
}
