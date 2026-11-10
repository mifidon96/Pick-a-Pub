"use client";

import { useEffect, useRef, useState } from "react";
import { searchPlaces, type Place } from "@/lib/places";

// Search any UK town, area or postcode.
export default function PlaceSearch({ onPick }: { onPick: (p: Place) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) return;
    timer.current = setTimeout(() => {
      searchPlaces(q)
        .then((r) => {
          setResults(r);
          setError("");
        })
        .catch((e: Error) => setError(e.message));
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q]);

  const showResults = q.trim().length >= 2 && results !== null;

  return (
    <div className="relative">
      <label className="block">
        <span className="sr-only">Search a town or postcode</span>
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (e.target.value.trim().length < 2) setResults(null);
          }}
          placeholder="Town or postcode"
          autoComplete="off"
          className="h-12 w-full rounded-xl border border-line bg-card px-4 text-base placeholder:text-muted"
        />
      </label>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      {showResults && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-line bg-card shadow-lg">
          {results.length === 0 && <li className="px-3 py-2 text-sm text-muted">No UK places found</li>}
          {results.map((p) => (
            <li key={`${p.label}-${p.lat}-${p.lng}`}>
              <button
                type="button"
                onClick={() => {
                  onPick(p);
                  setQ("");
                  setResults(null);
                }}
                className="block min-h-11 w-full px-4 py-2.5 text-left text-sm hover:bg-chalk"
              >
                <span className="font-medium">{p.label}</span>
                {p.detail && <span className="text-muted">, {p.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
