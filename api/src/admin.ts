import schema from "../../db/schema.sql";
import { db } from "./db";

// Admin actions. On AWS these run through a separate Lambda that is not behind
// API Gateway, so only someone with AWS credentials can call them.
export type AdminEvent =
  | { action: "migrate" }
  | { action: "import_pubs"; pubs: PubInput[] };

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
const INFO_KEYS = ["opening_hours", "website", "phone", "operator", "beer_garden", "food", "real_ale", "wheelchair", "shows_sport"];
function cleanInfo(info: unknown): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  if (typeof info !== "object" || info === null) return out;
  for (const k of INFO_KEYS) {
    const v = (info as Record<string, unknown>)[k];
    if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 300);
  }
  if (typeof out.website === "string" && !/^https?:\/\//i.test(out.website)) delete out.website;
  return out;
}

export async function runAdmin(event: AdminEvent): Promise<unknown> {
  if (event.action === "migrate") {
    await db().query(schema);
    return { ok: true, action: "migrate" };
  }

  if (event.action === "import_pubs") {
    if (!Array.isArray(event.pubs)) throw new Error("pubs must be an array");
    let upserted = 0;
    for (const p of event.pubs) {
      if (!p.source || !p.source_id || !p.name || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
      await db().query(
        `insert into pubs (source, source_id, name, address, postcode, lat, lng, info)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (source, source_id) do update
           set name = excluded.name, address = excluded.address, postcode = excluded.postcode,
               lat = excluded.lat, lng = excluded.lng, info = excluded.info`,
        [p.source, p.source_id, p.name, p.address ?? null, p.postcode ?? null, p.lat, p.lng, JSON.stringify(cleanInfo(p.info))],
      );
      upserted++;
    }
    return { ok: true, action: "import_pubs", upserted, skipped: event.pubs.length - upserted };
  }

  throw new Error("Unknown action");
}
