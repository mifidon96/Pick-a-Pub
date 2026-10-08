"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listPubs, type Pub } from "@/lib/api";
import { FactChips, OverallBadge } from "@/components/Scores";

// Launch area. Used until the visitor shares their location.
const BALHAM = { lat: 51.4431, lng: -0.1525, label: "Balham" };

type Centre = typeof BALHAM;
type Sort = "score" | "distance";

export default function Home() {
  const [centre, setCentre] = useState<Centre>(BALHAM);
  const [sort, setSort] = useState<Sort>("score");
  const [radius, setRadius] = useState(1500);
  const [result, setResult] = useState<{ key: string; pubs?: Pub[]; error?: string }>({ key: "" });
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");

  const key = `${centre.lat},${centre.lng},${radius},${sort}`;
  useEffect(() => {
    let live = true;
    listPubs(centre.lat, centre.lng, radius, sort)
      .then((r) => live && setResult({ key, pubs: r.pubs }))
      .catch((e: Error) => live && setResult({ key, error: e.message }));
    return () => {
      live = false;
    };
  }, [centre, radius, sort, key]);
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
        setLocError("Could not get your location. Showing Balham.");
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
        {centre !== BALHAM && (
          <button onClick={() => setCentre(BALHAM)} className="rounded border border-line bg-card px-3 py-2">
            Back to Balham
          </button>
        )}
        <label className="ml-auto flex items-center gap-1">
          <span className="text-muted">Within</span>
          <select value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="rounded border border-line bg-card px-2 py-2">
            <option value={500}>500 m</option>
            <option value={1000}>1 km</option>
            <option value={1500}>1.5 km</option>
            <option value={3000}>3 km</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-muted">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded border border-line bg-card px-2 py-2">
            <option value="score">Best for football</option>
            <option value="distance">Nearest</option>
          </select>
        </label>
      </div>
      {locError && <p className="text-sm text-red-700">{locError}</p>}

      {loading && <p className="text-sm text-muted">Loading pubs...</p>}
      {!loading && result.error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{result.error}</p>}
      {!loading && result.pubs?.length === 0 && (
        <p className="rounded border border-line bg-card p-4 text-sm">No pubs listed within this distance yet. Try a wider search.</p>
      )}

      <ul className="space-y-3">
        {!loading &&
          result.pubs?.map((pub) => (
            <li key={pub.id}>
              <Link href={`/pub/?id=${pub.id}`} className="flex gap-4 rounded-xl border border-line bg-card p-4 hover:border-pitch">
                <div className="w-20 shrink-0">
                  <OverallBadge pub={pub} />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <h2 className="truncate font-semibold">{pub.name}</h2>
                    <p className="truncate text-sm text-muted">
                      {pub.distance_m !== undefined && <>{formatDistance(pub.distance_m)} away</>}
                      {pub.address && <> · {pub.address}</>}
                    </p>
                  </div>
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
