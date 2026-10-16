// Search anywhere works on fixed map tiles, so each patch of the country is
// imported from OpenStreetMap once and then reused.
// A tile is 0.04° of latitude by 0.06° of longitude: about 4.4 km by 4 km in the UK.
const LAT_STEP = 0.04;
const LNG_STEP = 0.06;

// Importing this far around the tile centre covers the whole tile plus a 3 km
// search radius from anywhere inside it.
export const TILE_IMPORT_RADIUS_M = 6000;

// How long an imported tile counts as fresh.
export const TILE_MAX_AGE_DAYS = 30;

// Mainland UK, Northern Ireland and islands, roughly. Keeps imports (and abuse) bounded.
export function inUk(lat: number, lng: number): boolean {
  return lat >= 49.8 && lat <= 60.95 && lng >= -8.7 && lng <= 1.9;
}

export function tileFor(lat: number, lng: number): { tile: string; lat: number; lng: number } {
  const y = Math.floor(lat / LAT_STEP);
  const x = Math.floor(lng / LNG_STEP);
  return {
    tile: `${y}_${x}`,
    lat: Number(((y + 0.5) * LAT_STEP).toFixed(5)),
    lng: Number(((x + 0.5) * LNG_STEP).toFixed(5)),
  };
}
