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
};

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
        `insert into pubs (source, source_id, name, address, postcode, lat, lng)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (source, source_id) do update
           set name = excluded.name, address = excluded.address, postcode = excluded.postcode,
               lat = excluded.lat, lng = excluded.lng`,
        [p.source, p.source_id, p.name, p.address ?? null, p.postcode ?? null, p.lat, p.lng],
      );
      upserted++;
    }
    return { ok: true, action: "import_pubs", upserted, skipped: event.pubs.length - upserted };
  }

  throw new Error("Unknown action");
}
