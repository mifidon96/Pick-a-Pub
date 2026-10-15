// Turn one OpenStreetMap element into the shape the admin "import_pubs" action expects.
// Kept separate from the fetch so it can be tested without the network.

const MAX = 300;
const clean = (v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, MAX) : undefined);
const yesNo = (v) => (v === "yes" ? true : v === "no" ? false : undefined);

export function osmToPub(e) {
  const t = e.tags ?? {};
  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  const website = clean(t.website ?? t["contact:website"]);
  const info = {
    opening_hours: clean(t.opening_hours),
    website: website && /^https?:\/\//i.test(website) ? website : website ? `https://${website}` : undefined,
    phone: clean(t.phone ?? t["contact:phone"]),
    operator: clean(t.brewery ?? t.operator ?? t.brand),
    beer_garden: yesNo(t.beer_garden) ?? yesNo(t.outdoor_seating),
    food: yesNo(t.food),
    real_ale: yesNo(t.real_ale),
    wheelchair: ["yes", "limited", "no"].includes(t.wheelchair) ? t.wheelchair : undefined,
    shows_sport: t.sport ? true : undefined,
  };
  // Drop empty fields so the stored JSON stays small.
  for (const k of Object.keys(info)) if (info[k] === undefined) delete info[k];

  return {
    source: "osm",
    source_id: `${e.type}/${e.id}`,
    name: clean(t.name),
    address: street || null,
    postcode: clean(t["addr:postcode"]) ?? null,
    lat: e.lat ?? e.center?.lat,
    lng: e.lon ?? e.center?.lon,
    info,
  };
}
