// Place and postcode search with postcodes.io (free, UK only, no key).
// Contains OS data © Crown copyright and database right; credited in the footer.

export type Place = { label: string; detail: string; lat: number; lng: number };

const FULL_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const OUTCODE = /^[A-Z]{1,2}\d[A-Z\d]?$/i;
// Settlement types worth offering (skips farms, hills, woods and so on).
const SETTLEMENTS = new Set(["City", "Town", "Village", "Suburban Area", "Hamlet", "Other Settlement"]);

async function get(url: string) {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Place search is not working right now");
  return (await res.json()).result;
}

export async function searchPlaces(q: string): Promise<Place[]> {
  const query = q.trim();
  if (query.length < 2) return [];

  if (FULL_POSTCODE.test(query)) {
    const r = await get(`https://api.postcodes.io/postcodes/${encodeURIComponent(query)}`);
    return r && r.latitude != null ? [{ label: r.postcode, detail: r.admin_district ?? "", lat: r.latitude, lng: r.longitude }] : [];
  }
  if (OUTCODE.test(query)) {
    const r = await get(`https://api.postcodes.io/outcodes/${encodeURIComponent(query)}`);
    if (r && r.latitude != null) {
      const district = Array.isArray(r.admin_district) ? r.admin_district[0] : r.admin_district;
      return [{ label: r.outcode, detail: district ?? "", lat: r.latitude, lng: r.longitude }];
    }
  }

  const results = (await get(`https://api.postcodes.io/places?q=${encodeURIComponent(query)}&limit=20`)) ?? [];
  const seen = new Set<string>();
  const places: Place[] = [];
  for (const p of results as Record<string, string | number | null>[]) {
    if (!SETTLEMENTS.has(String(p.local_type))) continue;
    const detail = String(p.district_borough ?? p.county_unitary ?? p.region ?? "");
    const key = `${p.name_1}|${detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    places.push({ label: String(p.name_1), detail, lat: Number(p.latitude), lng: Number(p.longitude) });
    if (places.length === 6) break;
  }
  return places;
}
