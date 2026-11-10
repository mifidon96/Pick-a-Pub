// Grey cards in the same shape as PubCard, shown while the list loads, so the
// page doesn't jump when the pubs arrive.
export default function PubCardSkeletons({ count = 4 }: { count?: number }) {
  return (
    <ul className="space-y-3" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex animate-pulse gap-4 rounded-xl border border-line bg-card p-4">
          <div className="h-20 w-20 shrink-0 rounded-lg bg-line" />
          <div className="flex-1 space-y-2.5 pt-1">
            <div className="h-4 w-3/5 rounded bg-line" />
            <div className="h-3 w-4/5 rounded bg-line/70" />
            <div className="flex gap-1.5">
              <div className="h-5 w-16 rounded bg-line/70" />
              <div className="h-5 w-12 rounded bg-line/70" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
