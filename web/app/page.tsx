"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { FILTERS, listPubs, SCORE_KEYS, SCORE_LABELS, type Filter, type Pub, type Sort, type Vibe } from "@/lib/api";
import { FactChips, RatingBadge } from "@/components/Scores";
import { VerdictChip } from "@/components/Verdict";
import { saveLastList } from "@/lib/lastList";
import AREAS from "@/lib/areas.json";

// Areas with imported pubs (web/lib/areas.json). The first is the default.
type Centre = { lat: number; lng: number; label: string; areaId?: string };
const AREA_CENTRES: Centre[] = AREAS.map((a) => ({ lat: a.lat, lng: a.lng, label: a.label, areaId: a.id }));
const DEFAULT_CENTRE = AREA_CENTRES[0]!;

const DEFAULTS = { radius: 3000, sort: "stars" as Sort, vibe: "" as Vibe | "" };
const SORT_OPTIONS: [Sort, string][] = [
  ["stars", "Best for football"],
  ["distance", "Nearest"],
  ...SCORE_KEYS.map((k): [Sort, string] => [k, `Best ${SCORE_LABELS[k].label.toLowerCase()}`]),
  ["food", "Best food"],
];
const SORTS = new Set(SORT_OPTIONS.map(([v]) => v));
const RADII = [1000, 3000, 5000, 10000];

// All list settings live in the URL (/?area=reading&sort=food&has=beer_garden),
// so Back, refresh and shared links keep them.
export default function Home() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading...</p>}>
      <PubSearch />
    </Suspense>
  );
}

function PubSearch() {
  const router = useRouter();
  const params = useSearchParams();

  const [centre, setCentre] = useState<Centre>(() => AREA_CENTRES.find((a) => a.areaId === params.get("area")) ?? DEFAULT_CENTRE);
  const [sort, setSort] = useState<Sort>(() => {
    const v = params.get("sort") as Sort | null;
    return v && SORTS.has(v) ? v : DEFAULTS.sort;
  });
  const [radius, setRadius] = useState(() => {
    const v = Number(params.get("within"));
    return RADII.includes(v) ? v : DEFAULTS.radius;
  });
  const [vibe, setVibe] = useState<Vibe | "">(() => {
    const v = params.get("vibe");
    return v === "calm" || v === "lively" ? v : DEFAULTS.vibe;
  });
  const [has, setHas] = useState<Filter[]>(() =>
    (params.get("has") ?? "").split(",").filter((f): f is Filter => f in FILTERS),
  );
  const [result, setResult] = useState<{ key: string; pubs?: Pub[]; error?: string }>({ key: "" });
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");

  // Keep the URL in step with the settings.
  const url = (() => {
    const q = new URLSearchParams();
    if (centre.areaId) q.set("area", centre.areaId);
    if (radius !== DEFAULTS.radius) q.set("within", String(radius));
    if (sort !== DEFAULTS.sort) q.set("sort", sort);
    if (vibe) q.set("vibe", vibe);
    if (has.length) q.set("has", has.join(","));
    const s = q.toString();
    return s ? `/?${s}` : "/";
  })();
  useEffect(() => {
    router.replace(url, { scroll: false });
    saveLastList(url);
  }, [url, router]);

  const key = `${centre.lat},${centre.lng},${radius},${sort},${vibe},${has.join(",")}`;
  useEffect(() => {
    let live = true;
    listPubs({ lat: centre.lat, lng: centre.lng, radiusM: radius, sort, vibe, has })
      .then((r) => live && setResult({ key, pubs: r.pubs }))
      .catch((e: Error) => live && setResult({ key, error: e.message }));
    return () => {
      live = false;
    };
  }, [centre, radius, sort, vibe, has, key]);
  const loading = result.key !== key;

  const filtered = sort !== DEFAULTS.sort || radius !== DEFAULTS.radius || vibe !== DEFAULTS.vibe || has.length > 0;
  function clearFilters() {
    setSort(DEFAULTS.sort);
    setRadius(DEFAULTS.radius);
    setVibe(DEFAULTS.vibe);
    setHas([]);
  }
  const toggle = (f: Filter) => setHas((h) => (h.includes(f) ? h.filter((x) => x !== f) : [...h, f]));

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocError("Your browser does not support location.");
      return;
    }
    setLocating(true);
    setLocError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCentre({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: "your location" });
        setLocating(false);
      },
      () => {
        setLocError(`Could not get your location. Showing ${centre.label}.`);
        setLocating(false);
      },
      { timeout: 10_000 },
    );
  }

  // 16px text stops iPhones zooming in when a dropdown is tapped.
  const select = "w-full rounded border border-line bg-card px-2 py-2 text-base";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Where to watch the match</h1>
        <p className="text-sm text-muted">Pubs near {centre.label}, rated by people who watched a game there.</p>
      </div>

      <section className="space-y-3 rounded-xl border border-line bg-card p-3 text-sm" aria-label="Search options">
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="block text-xs text-muted">Area</span>
            <select
              value={centre.areaId ?? ""}
              onChange={(e) => {
                const a = AREA_CENTRES.find((x) => x.areaId === e.target.value);
                if (a) setCentre(a);
              }}
              className={select}
            >
              {!centre.areaId && <option value="">My location</option>}
              {AREA_CENTRES.map((a) => (
                <option key={a.areaId} value={a.areaId}>{a.label}</option>
              ))}
            </select>
          </label>
          <div className="space-y-1">
            <span className="block text-xs text-muted">&nbsp;</span>
            <button onClick={useMyLocation} disabled={locating} className="w-full rounded bg-pitch px-2 py-2 font-medium text-white disabled:opacity-60">
              {locating ? "Locating..." : "Use my location"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <label className="col-span-2 space-y-1 sm:col-span-1">
            <span className="block text-xs text-muted">Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={select}>
              {SORT_OPTIONS.map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-muted">Within</span>
            <select value={radius} onChange={(e) => setRadius(Number(e.target.value))} className={select}>
              {RADII.map((r) => (
                <option key={r} value={r}>{r / 1000} km</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-muted">Vibe</span>
            <select value={vibe} onChange={(e) => setVibe(e.target.value as Vibe | "")} className={select}>
              <option value="">Any</option>
              <option value="calm">Calm</option>
              <option value="lively">Lively</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filters">
          {(Object.keys(FILTERS) as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={has.includes(f)}
              onClick={() => toggle(f)}
              className={`rounded-full border px-3 py-1 text-xs ${has.includes(f) ? "border-pitch bg-pitch text-white" : "border-line bg-chalk"}`}
            >
              {FILTERS[f]}
            </button>
          ))}
          {filtered && (
            <button type="button" onClick={clearFilters} className="ml-auto text-xs text-pitch underline">
              Clear filters
            </button>
          )}
        </div>
      </section>
      {locError && <p className="text-sm text-red-700">{locError}</p>}

      {loading && <p className="text-sm text-muted">Loading pubs...</p>}
      {!loading && result.error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{result.error}</p>}
      {!loading && result.pubs?.length === 0 && (
        <div className="rounded border border-line bg-card p-4 text-sm">
          <p>No pubs match.{has.length > 0 && " Filters like big screens only include pubs people have reviewed so far."}</p>
          {filtered && <button onClick={clearFilters} className="mt-2 text-pitch underline">Clear filters</button>}
        </div>
      )}

      <ul className="space-y-3">
        {!loading &&
          result.pubs?.map((pub) => (
            <li key={pub.id}>
              <Link href={`/pub/?id=${pub.id}`} className="flex gap-4 rounded-xl border border-line bg-card p-4 hover:border-pitch">
                <div className="w-20 shrink-0">
                  <RatingBadge pub={pub} />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <h2 className="truncate font-semibold">{pub.name}</h2>
                    <p className="truncate text-sm text-muted">
                      {pub.distance_m !== undefined && <>{formatDistance(pub.distance_m)} away</>}
                      {pub.address && <> · {pub.address}</>}
                    </p>
                  </div>
                  {pub.verdict_rating != null && <VerdictChip rating={pub.verdict_rating} />}
                  <FactChips pub={pub} />
                </div>
              </Link>
            </li>
          ))}
      </ul>
    </div>
  );
}

function formatDistance(m: number) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}
