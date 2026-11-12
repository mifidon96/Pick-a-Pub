import { db } from "../lib/db";
import { TILE_MAX_AGE_DAYS } from "../lib/tiles";

// Loading pubs from OpenStreetMap, and the "tiles" that record which areas
// have been imported (so a new area is fetched once, not on every search).

export type PubInput = {
  source: string;
  source_id: string;
  name: string;
  address?: string | null;
  postcode?: string | null;
  lat: number;
  lng: number;
  info?: Record<string, unknown>;
};

// Only these keys are stored, each a short string or a boolean.
const INFO_KEYS = ["opening_hours", "website", "phone", "operator", "beer_garden", "food", "real_ale", "wheelchair", "shows_sport", "dog"];
function cleanInfo(info: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof info !== "object" || info === null) return out;
  for (const k of INFO_KEYS) {
    const v = (info as Record<string, unknown>)[k];
    if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 300);
  }
  if (typeof out.website === "string" && !/^https?:\/\//i.test(out.website)) delete out.website;
  const photo = (info as Record<string, unknown>).photo as Record<string, unknown> | undefined;
  if (
    photo && typeof photo.url === "string" && /^https:\/\/upload\.wikimedia\.org\//.test(photo.url) &&
    typeof photo.page === "string" && /^https:\/\/commons\.wikimedia\.org\//.test(photo.page)
  ) {
    const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined);
    out.photo = {
      url: photo.url.slice(0, 500),
      page: photo.page.slice(0, 500),
      author: str(photo.author, 120) ?? "Unknown",
      licence: str(photo.licence, 40) ?? "",
      ...(typeof photo.licence_url === "string" && /^https?:\/\//.test(photo.licence_url) ? { licence_url: photo.licence_url.slice(0, 300) } : {}),
    };
  }
  return out;
}

// Insert or update pubs, then mark the tile as imported.
export async function importPubs(event: { pubs: PubInput[]; tile?: string }) {
  if (!Array.isArray(event.pubs)) throw new Error("pubs must be an array");
  let upserted = 0;
  for (const p of event.pubs) {
    if (!p.source || !p.source_id || !p.name || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    await db().query(
      `insert into pubs (source, source_id, name, address, postcode, lat, lng, info)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (source, source_id) do update
         set name = excluded.name, address = excluded.address, postcode = excluded.postcode,
             lat = excluded.lat, lng = excluded.lng,
             -- keep our copy of the Wikimedia photo if the photo has not changed
             info = case
               when excluded.info->'photo'->>'url' = pubs.info->'photo'->>'url' and pubs.info->'photo' ? 'key'
               then jsonb_set(excluded.info, '{photo,key}', pubs.info->'photo'->'key')
               else excluded.info
             end`,
      [p.source, p.source_id, p.name, p.address ?? null, p.postcode ?? null, p.lat, p.lng, JSON.stringify(cleanInfo(p.info))],
    );
    upserted++;
  }
  if (event.tile) {
    await db().query(
      `insert into import_tiles (tile, imported_at, pub_count, started_at) values ($1, now(), $2, null)
       on conflict (tile) do update set imported_at = now(), pub_count = excluded.pub_count, started_at = null`,
      [event.tile, upserted],
    );
  }
  return { ok: true, action: "import_pubs", upserted, skipped: event.pubs.length - upserted };
}

// Used by deploy.sh to import pubs automatically on a brand new database.
export async function pubCount() {
  const { rows } = await db().query("select count(*)::int as n from pubs");
  return { pubs: rows[0].n };
}

// Marks a tile as being imported. Only one caller gets claimed: true; a claim
// older than 5 minutes (a failed import) can be taken again.
export async function claimTile(event: { tile: string }) {
  const { rows } = await db().query(
    `insert into import_tiles (tile, imported_at, pub_count, started_at) values ($1, '-infinity', 0, now())
     on conflict (tile) do update set started_at = now()
       where import_tiles.started_at is null or import_tiles.started_at < now() - interval '5 minutes'
     returning tile`,
    [event.tile],
  );
  return { claimed: rows.length === 1 };
}

// Marks many tiles as freshly imported at once. Used by the monthly UK load
// (scripts/uk-pubs-batches.mjs), which has already loaded every pub in them, so
// searches there no longer start an on-demand import.
export async function markTiles(event: { tiles: { tile: string; pub_count: number }[] }) {
  const tiles = (event.tiles ?? []).filter((t) => /^-?\d{1,4}_-?\d{1,4}$/.test(t.tile) && Number.isInteger(t.pub_count));
  if (!tiles.length) return { ok: true, marked: 0 };
  await db().query(
    `insert into import_tiles (tile, imported_at, pub_count, started_at)
     select t.tile, now(), t.pub_count, null from unnest($1::text[], $2::int[]) as t(tile, pub_count)
     on conflict (tile) do update set imported_at = now(), pub_count = excluded.pub_count, started_at = null`,
    [tiles.map((t) => t.tile), tiles.map((t) => t.pub_count)],
  );
  return { ok: true, action: "mark_tiles", marked: tiles.length };
}

// Has this tile been imported recently enough?
export async function tileStatus(event: { tile: string }) {
  const { rows } = await db().query(
    `select imported_at, pub_count, imported_at > now() - make_interval(days => $2) as fresh
       from import_tiles where tile = $1`,
    [event.tile, TILE_MAX_AGE_DAYS],
  );
  return rows[0] ?? { fresh: false, imported_at: null, pub_count: 0 };
}
