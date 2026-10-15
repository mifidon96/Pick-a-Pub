"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { listPubs, type Pub, type Vibe } from "@/lib/api";
import { FactChips, RatingBadge } from "@/components/Scores";
import AREAS from "@/lib/areas.json";
import { VerdictChip } from "@/components/Verdict";

// Areas with imported pubs (web/lib/areas.json). The first is the default.
type Centre = { lat: number; lng: number; label: string; areaId?: string };
const AREA_CENTRES: Centre[] = AREAS.map((a) => ({ lat: a.lat, lng: a.lng, label: a.label, areaId: a.id }));
const DEFAULT_CENTRE = AREA_CENTRES[0]!;
type Sort = "stars" | "distance";

// The chosen area lives in the URL (/?area=reading) so "Back" and shared links keep it.
export default function Home() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading...</p>}>
      <PubSearch />
    </Suspense>
  );
}

function PubSearch() {
  const router = useRouter();
  const areaParam = useSearchParams().get("area");
  const [centre, setCentre] = useState<Centre>(() => AREA_CENTRES.find((a) => a.areaId === areaParam) ?? DEFAULT_CENTRE);
  const [sort, setSort] = useState<Sort>("stars");
  const [radius, setRadius] = useState(3000);
  const [vibe, setVibe] = useState<Vibe | "">("");
  const [result, setResult] = useState<{ key: string; pubs?: Pub[]; error?: string }>({ key: "" });
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");

  const key = `${centre.lat},${centre.lng},${radius},${sort},${vibe}`;
  useEffect(() => {
    let live = true;
    listPubs(centre.lat, centre.lng, radius, sort, vibe)
      .then((r) => live && setResult({ key, pubs: r.pubs }))
      .catch((e: Error) => live && setResult({ key, error: e.message }));
    return () => {
      live = false;
    };
  }, [centre, radius, sort, vibe, key]);
  const loading = result.key !== key;

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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Where to watch the match</h1>
        <p className="text-sm text-muted">Pubs near {centre.label}, rated by people who watched a game there.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button onClick={useMyLocation} disabled={locating} className="rounded bg-pitch px-3 py-2 font-medium text-white disabled:opacity-60">
          {locating ? "Locating..." : "Use my location"}
        </button>
        <label className="flex items-center gap-1">
          <span className="text-muted">Area</span>
          <select
            value={centre.areaId ?? ""}
            onChange={(e) => {
              const a = AREA_CENTRES.find((x) => x.areaId === e.target.value);
              if (a) {
                setCentre(a);
                router.replace(`/?area=${a.areaId}`, { scroll: false });
              }
            }}
            className="rounded border border-line bg-card px-2 py-2"
          >
            {!centre.areaId && <option value="">My location</option>}
            {AREA_CENTRES.map((a) => (
              <option key={a.areaId} value={a.areaId}>{a.label}</option>
            ))}
          </select>
        </label>
        <label className="ml-auto flex items-center gap-1">
          <span className="text-muted">Within</span>
          <select value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="rounded border border-line bg-card px-2 py-2">
            <option value={1000}>1 km</option>
            <option value={3000}>3 km</option>
            <option value={5000}>5 km</option>
            <option value={10000}>10 km</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-muted">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded border border-line bg-card px-2 py-2">
            <option value="stars">Best for football</option>
            <option value="distance">Nearest</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-muted">Vibe</span>
          <select value={vibe} onChange={(e) => setVibe(e.target.value as Vibe | "")} className="rounded border border-line bg-card px-2 py-2">
            <option value="">Any</option>
            <option value="calm">Calm</option>
            <option value="lively">Lively</option>
          </select>
        </label>
      </div>
      {locError && <p className="text-sm text-red-700">{locError}</p>}

      {loading && <p className="text-sm text-muted">Loading pubs...</p>}
      {!loading && result.error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{result.error}</p>}
      {!loading && result.pubs?.length === 0 && (
        <p className="rounded border border-line bg-card p-4 text-sm">No pubs match. Try a wider search{vibe ? " or any vibe" : ""}.</p>
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
