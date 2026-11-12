"use client";

import Link from "next/link";
import { Suspense } from "react";
import ErrorNotice from "@/components/ErrorNotice";
import PubCard from "@/components/PubCard";
import PubCardSkeletons from "@/components/PubCardSkeleton";
import PubMap from "@/components/PubMap";
import SearchOptions from "@/components/SearchOptions";
import { useAreaImport } from "@/hooks/useAreaImport";
import { useFetch } from "@/hooks/useFetch";
import { useListSettings } from "@/hooks/useListSettings";
import { listPubs } from "@/lib/api";

// The home page: pubs near a place, best for football first.
//   useListSettings - where, filters and sort, kept in the URL
//   useAreaImport   - imports pubs for a new place before we list them
//   useFetch        - loads the list for the current settings
export default function Home() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading...</p>}>
      <PubSearch />
    </Suspense>
  );
}

function PubSearch() {
  const s = useListSettings();
  const { centre, radius, sort, vibe, has, fans, view, page } = s;
  const area = useAreaImport(centre);

  const key = `${centre.lat},${centre.lng},${radius},${sort},${vibe},${has.join(",")},${fans},${page}`;
  const list = useFetch(area.ready ? key : null, () =>
    listPubs({ lat: centre.lat, lng: centre.lng, radiusM: radius, sort, vibe, has, fans, page }),
  );
  const pubs = list.data?.pubs;
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / (list.data?.page_size ?? 20)));
  const showing = !list.loading && pubs && pubs.length > 0;
  const goTo = (p: number) => {
    s.setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h1 className="text-2xl font-extrabold">Pubs near {centre.label}</h1>
        <Link href="/match/" className="inline-flex min-h-11 items-center text-sm font-semibold text-pitch underline">
          Know the match? See where it&apos;s on
        </Link>
      </div>

      <SearchOptions s={s} count={list.data?.total} />

      {area.pending && (
        <p className="rounded-xl border border-line bg-card p-4 text-sm">
          {area.busy
            ? "OpenStreetMap is busy right now. We'll keep trying; check back in a few minutes."
            : `Finding pubs near ${centre.label}... The first search in a new area can take up to a minute.`}
        </p>
      )}
      {area.failed && <ErrorNotice title={`Couldn't find pubs near ${centre.label}`} message={area.failed} />}
      {(list.loading || area.pending) && (
        <>
          <p className="sr-only" role="status">Loading pubs</p>
          <PubCardSkeletons />
        </>
      )}
      {list.error && <ErrorNotice title="Couldn't load pubs" message={list.error} onRetry={list.reload} />}
      {!list.loading && pubs?.length === 0 && page > 1 && total > 0 && (
        <div className="rounded-xl border border-line bg-card p-4 text-sm">
          <p>There are only {pages} page{pages === 1 ? "" : "s"} of pubs here.</p>
          <button onClick={() => goTo(1)} className="mt-2 min-h-11 font-semibold text-pitch underline">Back to page 1</button>
        </div>
      )}
      {!list.loading && pubs?.length === 0 && !(page > 1 && total > 0) && (
        <div className="rounded-xl border border-line bg-card p-4 text-sm">
          <p>No pubs match.{(has.length > 0 || fans) && " Filters like big screens and fans only include pubs people have reviewed so far."}</p>
          {s.filtered && <button onClick={s.clearFilters} className="mt-2 min-h-11 font-semibold text-pitch underline">Clear filters</button>}
        </div>
      )}

      {showing && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">
            {total} pub{total === 1 ? "" : "s"}
            {pages > 1 && ` · page ${page} of ${pages}`}
          </p>
          <div className="inline-flex rounded-full border border-line bg-card p-0.5 text-sm" role="group" aria-label="View">
            {(["list", "map"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => s.setView(v)}
                className={`min-h-11 rounded-full px-4 font-semibold ${view === v ? "bg-pitch text-on-pitch" : "text-ink"}`}
              >
                {v === "list" ? "List" : "Map"}
              </button>
            ))}
          </div>
        </div>
      )}

      {view === "map" && showing && <PubMap pubs={pubs} centre={centre} radiusM={radius} />}

      <ul className={`space-y-3 ${view === "map" ? "hidden" : ""}`}>
        {!list.loading &&
          pubs?.map((pub) => (
            <li key={pub.id}>
              <PubCard pub={pub} />
            </li>
          ))}
      </ul>

      {showing && pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={() => goTo(page - 1)}
            disabled={page <= 1}
            className="h-11 rounded-full border border-line bg-card px-5 font-semibold disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-muted" aria-current="page">Page {page} of {pages}</span>
          <button
            type="button"
            onClick={() => goTo(page + 1)}
            disabled={page >= pages}
            className="h-11 rounded-full bg-pitch px-5 font-bold text-on-pitch hover:bg-pitch-dark disabled:opacity-40"
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
