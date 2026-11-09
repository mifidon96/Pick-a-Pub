"use client";

import Link from "next/link";
import { Suspense } from "react";
import PubCard from "@/components/PubCard";
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
  const { centre, radius, sort, vibe, has, fans, view } = s;
  const area = useAreaImport(centre);

  const key = `${centre.lat},${centre.lng},${radius},${sort},${vibe},${has.join(",")},${fans}`;
  const list = useFetch(area.ready ? key : null, () =>
    listPubs({ lat: centre.lat, lng: centre.lng, radiusM: radius, sort, vibe, has, fans }),
  );
  const pubs = list.data?.pubs;
  const showing = !list.loading && pubs && pubs.length > 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Where to watch the match</h1>
        <p className="text-sm text-muted">Pubs near {centre.label}, rated by people who watched a game there.</p>
        <Link href="/match/" className="mt-2 inline-block text-sm font-medium text-pitch underline">
          Know the match? See where it&apos;s showing
        </Link>
      </div>

      <SearchOptions s={s} />

      {area.pending && (
        <p className="rounded border border-line bg-card p-4 text-sm">
          {area.busy
            ? "OpenStreetMap is busy right now. We'll keep trying; check back in a few minutes."
            : `Finding pubs near ${centre.label}... The first search in a new area can take up to a minute.`}
        </p>
      )}
      {area.failed && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{area.failed}</p>}
      {list.loading && <p className="text-sm text-muted">Loading pubs...</p>}
      {list.error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{list.error}</p>}
      {!list.loading && pubs?.length === 0 && (
        <div className="rounded border border-line bg-card p-4 text-sm">
          <p>No pubs match.{(has.length > 0 || fans) && " Filters like big screens and fans only include pubs people have reviewed so far."}</p>
          {s.filtered && <button onClick={s.clearFilters} className="mt-2 text-pitch underline">Clear filters</button>}
        </div>
      )}

      {showing && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">{pubs.length} pub{pubs.length === 1 ? "" : "s"}</p>
          <div className="inline-flex rounded border border-line bg-card p-0.5 text-sm" role="group" aria-label="View">
            {(["list", "map"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => s.setView(v)}
                className={`rounded px-3 py-1 ${view === v ? "bg-pitch text-white" : "text-ink"}`}
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
    </div>
  );
}
