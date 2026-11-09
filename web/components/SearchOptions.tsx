"use client";

import PlaceSearch from "@/components/PlaceSearch";
import { useMyLocation } from "@/hooks/useMyLocation";
import { RADII, SORT_OPTIONS, type ListSettings } from "@/hooks/useListSettings";
import { AREA_CENTRES, MY_LOCATION } from "@/lib/areas";
import { FILTERS, TEAMS, type Filter, type Sort, type Vibe } from "@/lib/ratings";

// 16px text stops iPhones zooming in when a dropdown is tapped.
const select = "w-full rounded border border-line bg-card px-2 py-2 text-base";

// The search box on the home page: place, area, my location, sort, distance,
// vibe, fans and filter chips. All state lives in useListSettings.
export default function SearchOptions({ s }: { s: ListSettings }) {
  const { centre, setCentre } = s;
  const me = useMyLocation((lat, lng) => setCentre({ lat, lng, label: MY_LOCATION }));

  return (
    <>
      <section className="space-y-3 rounded-xl border border-line bg-card p-3 text-sm" aria-label="Search options">
        <PlaceSearch onPick={(p) => setCentre({ lat: p.lat, lng: p.lng, label: p.label })} />
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="block text-xs text-muted">Or pick an area</span>
            <select
              value={centre.areaId ?? ""}
              onChange={(e) => {
                const a = AREA_CENTRES.find((x) => x.areaId === e.target.value);
                if (a) setCentre(a);
              }}
              className={select}
            >
              {!centre.areaId && <option value="">{centre.label === MY_LOCATION ? "My location" : centre.label}</option>}
              {AREA_CENTRES.map((a) => (
                <option key={a.areaId} value={a.areaId}>{a.label}</option>
              ))}
            </select>
          </label>
          <div className="space-y-1">
            <span className="block text-xs text-muted">&nbsp;</span>
            <button onClick={() => me.locate(centre.label)} disabled={me.locating} className="w-full rounded bg-pitch px-2 py-2 font-medium text-white disabled:opacity-60">
              {me.locating ? "Locating..." : "Use my location"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <label className="col-span-2 space-y-1 sm:col-span-1">
            <span className="block text-xs text-muted">Sort</span>
            <select value={s.sort} onChange={(e) => s.setSort(e.target.value as Sort)} className={select}>
              {SORT_OPTIONS.map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-muted">Within</span>
            <select value={s.radius} onChange={(e) => s.setRadius(Number(e.target.value))} className={select}>
              {RADII.map((r) => (
                <option key={r} value={r}>{r / 1000} km</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-muted">Vibe</span>
            <select value={s.vibe} onChange={(e) => s.setVibe(e.target.value as Vibe | "")} className={select}>
              <option value="">Any</option>
              <option value="calm">Calm</option>
              <option value="lively">Lively</option>
            </select>
          </label>
        </div>

        <label className="block space-y-1">
          <span className="block text-xs text-muted">Fans&apos; pub for</span>
          <select value={s.fans} onChange={(e) => s.setFans(e.target.value)} className={select}>
            <option value="">Any team</option>
            {TEAMS.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filters">
          {(Object.keys(FILTERS) as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={s.has.includes(f)}
              onClick={() => s.toggleFilter(f)}
              className={`rounded-full border px-3 py-1 text-xs ${s.has.includes(f) ? "border-pitch bg-pitch text-white" : "border-line bg-chalk"}`}
            >
              {FILTERS[f]}
            </button>
          ))}
          {s.filtered && (
            <button type="button" onClick={s.clearFilters} className="ml-auto text-xs text-pitch underline">
              Clear filters
            </button>
          )}
        </div>
      </section>
      {me.error && <p className="text-sm text-red-700">{me.error}</p>}
    </>
  );
}
