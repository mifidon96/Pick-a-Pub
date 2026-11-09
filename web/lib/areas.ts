import AREAS from "./areas.json";

// Where to look for pubs. Featured areas (areas.json) are always imported; the
// first is the default. Anywhere else (search or "my location") is imported on
// first visit (hooks/useAreaImport.ts).
export type Centre = { lat: number; lng: number; label: string; areaId?: string };

export const AREA_CENTRES: Centre[] = AREAS.map((a) => ({ lat: a.lat, lng: a.lng, label: a.label, areaId: a.id }));
export const DEFAULT_CENTRE = AREA_CENTRES[0]!;
export const MY_LOCATION = "your location";

// The centre a list URL describes: ?area=balham, or ?place=Leeds&lat=..&lng=..
// (a search). Null if it describes neither.
export function centreFromQuery(q: URLSearchParams): Centre | null {
  const featured = AREA_CENTRES.find((a) => a.areaId === q.get("area"));
  if (featured) return featured;
  const lat = Number(q.get("lat")), lng = Number(q.get("lng"));
  const label = q.get("place");
  if (label && q.get("lat") && q.get("lng") && Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng, label };
  return null;
}
