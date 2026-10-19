import Link from "next/link";
import type { Pub } from "@/lib/api";
import { FactChips, RatingBadge } from "@/components/Scores";
import { VerdictChip } from "@/components/Verdict";

// One pub in a list: photo or rating, name, distance, chips. `extra` adds lines
// under the chips (used by the match page for channel and fans).
export default function PubCard({ pub, extra }: { pub: Pub; extra?: React.ReactNode }) {
  return (
    <Link href={`/pub/?id=${pub.id}`} className="flex gap-4 rounded-xl border border-line bg-card p-4 hover:border-pitch">
      <div className="w-20 shrink-0">
        {pub.photo ? <PhotoBadge pub={pub} /> : <RatingBadge pub={pub} />}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <h2 className="truncate font-semibold">{pub.name}</h2>
          <p className="truncate text-sm text-muted">
            {pub.distance_m !== undefined && <>{formatDistance(pub.distance_m)} away</>}
            {pub.address && <> · {pub.address}</>}
          </p>
        </div>
        {extra}
        {pub.verdict_rating != null && <VerdictChip rating={pub.verdict_rating} />}
        <FactChips pub={pub} />
      </div>
    </Link>
  );
}

// Cover photo with the rating laid over the bottom.
function PhotoBadge({ pub }: { pub: Pub }) {
  const n = pub.review_count ?? 0;
  const label = pub.stars !== null ? `${pub.stars.toFixed(1)} ★` : n ? `New · ${n}` : "No reviews";
  return (
    <div className="relative h-20 w-20 overflow-hidden rounded-lg bg-line">
      {/* eslint-disable-next-line @next/next/no-img-element -- static export, no image optimiser */}
      <img src={pub.photo!} alt="" loading="lazy" className="h-full w-full object-cover" />
      <span className={`absolute inset-x-0 bottom-0 px-1 py-0.5 text-center text-[11px] font-semibold ${pub.stars !== null ? "bg-pitch/90 text-white" : "bg-black/60 text-white"}`}>
        {label}
      </span>
    </div>
  );
}

export function formatDistance(m: number) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}
