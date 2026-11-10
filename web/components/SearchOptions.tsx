"use client";

import { useRef } from "react";
import PlaceSearch from "@/components/PlaceSearch";
import { DEFAULTS, RADII, SORT_OPTIONS, type ListSettings } from "@/hooks/useListSettings";
import { useMyLocation } from "@/hooks/useMyLocation";
import { AREA_CENTRES, MY_LOCATION } from "@/lib/areas";
import { FILTERS, TEAMS, teamName, type Filter, type Sort, type Vibe } from "@/lib/ratings";

// The search bar on the home page, kept short so pubs show on the first screen
// of a phone: place search, my location, a Filters button and sort. The rest
// (area, distance, vibe, fans, must-haves) is in a sheet that opens from
// Filters. Settings apply straight away; all state lives in useListSettings.
//
// count: how many pubs the current settings found, for the sheet's button.
export default function SearchOptions({ s, count }: { s: ListSettings; count?: number }) {
  const { centre, setCentre } = s;
  const me = useMyLocation((lat, lng) => setCentre({ lat, lng, label: MY_LOCATION }));
  const sheet = useRef<HTMLDialogElement>(null);

  // What is switched on, as chips you can tap to remove.
  const active: { label: string; clear: () => void }[] = [
    ...(s.radius !== DEFAULTS.radius ? [{ label: `Within ${s.radius / 1000} km`, clear: () => s.setRadius(DEFAULTS.radius) }] : []),
    ...(s.vibe ? [{ label: s.vibe === "calm" ? "Calm" : "Lively", clear: () => s.setVibe("") }] : []),
    ...(s.fans ? [{ label: `${teamName(s.fans)} fans`, clear: () => s.setFans("") }] : []),
    ...s.has.map((f) => ({ label: FILTERS[f], clear: () => s.toggleFilter(f) })),
  ];

  return (
    <section className="space-y-3" aria-label="Search options">
      <div className="flex gap-2">
        <div className="flex-1">
          <PlaceSearch onPick={(p) => setCentre({ lat: p.lat, lng: p.lng, label: p.label })} />
        </div>
        <button
          type="button"
          onClick={() => me.locate(centre.label)}
          disabled={me.locating}
          aria-label={me.locating ? "Finding your location" : "Use my location"}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-pitch text-on-pitch hover:bg-pitch-dark disabled:opacity-60"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" />
            <circle cx="12" cy="9" r="2.5" />
          </svg>
        </button>
      </div>
      {me.error && <p className="text-sm text-red-700">{me.error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => sheet.current?.showModal()}
          className="flex h-11 shrink-0 items-center gap-2 rounded-full border border-pitch bg-card px-4 text-[15px] font-semibold text-pitch"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
            <circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" />
          </svg>
          Filters
          {active.length > 0 && (
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-pitch px-1.5 text-xs font-bold text-on-pitch">
              {active.length}
            </span>
          )}
        </button>
        <label className="flex h-11 min-w-0 flex-1 items-center gap-1.5 rounded-full border border-line bg-card px-4 text-[15px]">
          <span className="text-muted">Sort</span>
          <select
            value={s.sort}
            onChange={(e) => s.setSort(e.target.value as Sort)}
            className="min-w-0 flex-1 bg-transparent font-semibold"
          >
            {SORT_OPTIONS.map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      {active.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Filters on">
          {active.map((a) => (
            <li key={a.label}>
              <button
                type="button"
                onClick={a.clear}
                aria-label={`Remove filter: ${a.label}`}
                className="flex min-h-11 items-center gap-1 rounded-full bg-pitch/15 pl-3.5 pr-2.5 text-sm font-semibold text-pitch"
              >
                {a.label}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                  <path d="M7 7l10 10M17 7L7 17" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* The filter sheet. A native <dialog>: Esc closes it and focus stays inside. */}
      <dialog
        ref={sheet}
        aria-labelledby="filters-title"
        onClick={(e) => e.target === sheet.current && sheet.current.close()}
        className="m-0 mt-auto max-h-[90dvh] w-full max-w-none rounded-t-2xl bg-card p-0 text-ink backdrop:bg-black/70 sm:m-auto sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex max-h-[90dvh] flex-col">
          <div className="flex items-center justify-between py-1 pl-5 pr-2">
            <h2 id="filters-title" className="text-xl font-extrabold">Filters</h2>
            <button type="button" onClick={() => sheet.current?.close()} aria-label="Close filters" className="flex h-11 w-11 items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-4">
            <label className="block space-y-2">
              <span className="block text-sm font-bold">Area</span>
              <select
                value={centre.areaId ?? ""}
                onChange={(e) => {
                  const a = AREA_CENTRES.find((x) => x.areaId === e.target.value);
                  if (a) setCentre(a);
                }}
                className="h-12 w-full rounded-xl border border-line bg-chalk px-3 text-base"
              >
                {!centre.areaId && <option value="">{centre.label === MY_LOCATION ? "My location" : centre.label}</option>}
                {AREA_CENTRES.map((a) => (
                  <option key={a.areaId} value={a.areaId}>{a.label}</option>
                ))}
              </select>
            </label>

            <Segmented
              legend="How far"
              options={RADII.map((r) => [String(r), `${r / 1000} km`])}
              value={String(s.radius)}
              onChange={(v) => s.setRadius(Number(v))}
            />
            <Segmented
              legend="Vibe"
              options={[["", "Any"], ["calm", "Calm"], ["lively", "Lively"]]}
              value={s.vibe}
              onChange={(v) => s.setVibe(v as Vibe | "")}
            />

            <label className="block space-y-2">
              <span className="block text-sm font-bold">Fans&apos; pub for</span>
              <select value={s.fans} onChange={(e) => s.setFans(e.target.value)} className="h-12 w-full rounded-xl border border-line bg-chalk px-3 text-base">
                <option value="">Any team</option>
                {TEAMS.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>

            <fieldset>
              <legend className="mb-2.5 text-sm font-bold">Must have</legend>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(FILTERS) as Filter[]).map((f) => {
                  const on = s.has.includes(f);
                  return (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={on}
                      onClick={() => s.toggleFilter(f)}
                      className={`flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold ${on ? "border-pitch bg-pitch/15 text-pitch" : "border-line bg-chalk"}`}
                    >
                      {on && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden><path d="M5 12l5 5L19 7" /></svg>
                      )}
                      {FILTERS[f]}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-sm text-muted">Big screens and fans only include pubs people have reviewed so far.</p>
            </fieldset>
          </div>

          <div className="flex items-center gap-3 border-t border-line px-5 pb-7 pt-3">
            {s.filtered && (
              <button type="button" onClick={s.clearFilters} className="min-h-12 px-2 font-semibold text-pitch underline">
                Clear all
              </button>
            )}
            <button
              type="button"
              onClick={() => sheet.current?.close()}
              className="h-12 flex-1 rounded-xl bg-pitch font-bold text-on-pitch hover:bg-pitch-dark"
            >
              {count === undefined ? "Show pubs" : `Show ${count} pub${count === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </dialog>
    </section>
  );
}

// A row of buttons where exactly one is picked (distance, vibe).
function Segmented(props: { legend: string; options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-bold">{props.legend}</legend>
      <div className="flex overflow-hidden rounded-xl border border-line">
        {props.options.map(([v, label]) => {
          const on = v === props.value;
          return (
            <button
              key={v}
              type="button"
              aria-pressed={on}
              onClick={() => props.onChange(v)}
              className={`h-11 flex-1 border-r border-line text-[15px] font-semibold last:border-r-0 ${on ? "bg-pitch text-on-pitch" : "bg-chalk"}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
