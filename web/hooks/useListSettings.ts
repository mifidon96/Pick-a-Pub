import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { centreFromQuery, DEFAULT_CENTRE, MY_LOCATION, type Centre } from "@/lib/areas";
import { saveLastList } from "@/lib/lastList";
import { FILTERS, SCORE_KEYS, SCORE_LABELS, TEAMS, type Filter, type Sort, type Vibe } from "@/lib/ratings";

// The pub list's settings: where, how far, sort, vibe, filters, fans, list or
// map, and which page of 20. Changing anything but the page or view goes back
// to page 1.
// They all live in the URL (/?area=reading&sort=seating&has=beer_garden), so
// Back, refresh and shared links keep them. Anything odd in the URL is ignored.

// 5 km: most fans in the survey would travel 20 minutes or more for a good pub.
export const DEFAULTS = { radius: 5000, sort: "stars" as Sort, vibe: "" as Vibe | "" };
export const SORT_OPTIONS: [Sort, string][] = [
  ["stars", "Best for football"],
  ["distance", "Nearest"],
  ...SCORE_KEYS.map((k): [Sort, string] => [k, `Best ${SCORE_LABELS[k].label.toLowerCase()}`]),
];
export const RADII = [1000, 3000, 5000, 10000];
const SORTS = new Set(SORT_OPTIONS.map(([v]) => v));

export function useListSettings() {
  const router = useRouter();
  const params = useSearchParams();

  const [centre, setCentreState] = useState<Centre>(() => centreFromQuery(params) ?? DEFAULT_CENTRE);
  const [sort, setSortState] = useState<Sort>(() => {
    const v = params.get("sort") as Sort | null;
    return v && SORTS.has(v) ? v : DEFAULTS.sort;
  });
  const [radius, setRadiusState] = useState(() => {
    const v = Number(params.get("within"));
    return RADII.includes(v) ? v : DEFAULTS.radius;
  });
  const [vibe, setVibeState] = useState<Vibe | "">(() => {
    const v = params.get("vibe");
    return v === "calm" || v === "lively" ? v : DEFAULTS.vibe;
  });
  const [has, setHas] = useState<Filter[]>(() =>
    (params.get("has") ?? "").split(",").filter((f): f is Filter => f in FILTERS),
  );
  const [fans, setFansState] = useState(() => {
    const v = params.get("fans") ?? "";
    return TEAMS.some((t) => t.id === v) ? v : "";
  });
  const [view, setView] = useState<"list" | "map">(() => (params.get("view") === "map" ? "map" : "list"));
  const [page, setPage] = useState(() => {
    const v = Number(params.get("page"));
    return Number.isInteger(v) && v >= 1 && v <= 100 ? v : 1;
  });

  // New settings = a new list, so start again at page 1.
  const fresh = <T,>(set: (v: T) => void) => (v: T) => {
    setPage(1);
    set(v);
  };
  const setCentre = fresh(setCentreState);
  const setSort = fresh(setSortState);
  const setRadius = fresh(setRadiusState);
  const setVibe = fresh(setVibeState);
  const setFans = fresh(setFansState);

  // Keep the URL in step with the settings, and remember it for "Back to pubs".
  const url = (() => {
    const q = new URLSearchParams();
    if (centre.areaId) q.set("area", centre.areaId);
    else if (centre.label !== MY_LOCATION) {
      q.set("place", centre.label);
      q.set("lat", centre.lat.toFixed(5));
      q.set("lng", centre.lng.toFixed(5));
    }
    if (radius !== DEFAULTS.radius) q.set("within", String(radius));
    if (sort !== DEFAULTS.sort) q.set("sort", sort);
    if (vibe) q.set("vibe", vibe);
    if (has.length) q.set("has", has.join(","));
    if (fans) q.set("fans", fans);
    if (view === "map") q.set("view", "map");
    if (page > 1) q.set("page", String(page));
    const s = q.toString();
    return s ? `/?${s}` : "/";
  })();
  useEffect(() => {
    router.replace(url, { scroll: false });
    saveLastList(url);
  }, [url, router]);

  const filtered = sort !== DEFAULTS.sort || radius !== DEFAULTS.radius || vibe !== DEFAULTS.vibe || has.length > 0 || fans !== "";
  function clearFilters() {
    setPage(1);
    setSort(DEFAULTS.sort);
    setRadius(DEFAULTS.radius);
    setVibe(DEFAULTS.vibe);
    setHas([]);
    setFans("");
  }
  const toggleFilter = (f: Filter) => {
    setPage(1);
    setHas((h) => (h.includes(f) ? h.filter((x) => x !== f) : [...h, f]));
  };

  return {
    centre, setCentre, sort, setSort, radius, setRadius, vibe, setVibe,
    has, toggleFilter, fans, setFans, view, setView, page, setPage, filtered, clearFilters,
  };
}
export type ListSettings = ReturnType<typeof useListSettings>;
