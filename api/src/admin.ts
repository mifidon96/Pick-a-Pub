import schema from "../../db/schema.sql";
import { db } from "./db";
import type { ContentEntry } from "./content";
import areas from "../../web/lib/areas.json";

// Admin actions. On AWS these run through a separate Lambda that is not behind
// API Gateway, so only someone with AWS credentials can call them.
export type AdminEvent =
  | { action: "migrate" }
  | { action: "import_pubs"; pubs: PubInput[] }
  | { action: "apply_content"; entries: ContentEntry[] };

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

  if (event.action === "apply_content") return applyContent(event.entries);

  throw new Error("Unknown action");
}

// Names are compared loosely: "The Regent" matches "Regent", "Hagen and Hyde" matches "Hagen & Hyde".
export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/^\s*the\s+/, "")
    .replace(/[^a-z0-9]+/g, "");
}

// Replace all Pick-a-Pub verdicts and details with what is in content/pubs.yaml.
// The file is the source of truth: pubs removed from it lose their verdict.
// Entries that match no pub (or several) are skipped with a warning, so one
// unknown name does not block the rest. Runs in one transaction.
async function applyContent(entries: ContentEntry[]) {
  if (!Array.isArray(entries)) throw new Error("entries must be a list");
  const client = await db().connect();
  const warnings: string[] = [];
  try {
    await client.query("begin");
    const ids: number[] = [];
    for (const e of entries) {
      const label = e.pub ?? `${e.name} (${e.area})`;
      let rows: { id: number; name: string }[];
      if (e.pub) {
        const [source, sourceId] = [e.pub.slice(0, e.pub.indexOf(":")), e.pub.slice(e.pub.indexOf(":") + 1)];
        rows = (await client.query("select id, name from pubs where source = $1 and source_id = $2", [source, sourceId])).rows;
      } else {
        const area = areas.find((a) => a.id === e.area);
        if (!area) throw new Error(`${label}: unknown area "${e.area}" (use ${areas.map((a) => a.id).join(" or ")})`);
        const nearby: { id: number; name: string }[] = (await client.query(
          `select id, name from pubs
            where earth_box(ll_to_earth($1, $2), $3) @> ll_to_earth(lat, lng)
              and earth_distance(ll_to_earth($1, $2), ll_to_earth(lat, lng)) <= $3`,
          [area.lat, area.lng, area.import_radius_m],
        )).rows;
        const want = normaliseName(e.name ?? "");
        rows = nearby.filter((p) => normaliseName(p.name) === want);
      }
      if (rows.length === 0) {
        warnings.push(`${label}: no matching pub found, skipped`);
        continue;
      }
      if (rows.length > 1) {
        warnings.push(`${label}: ${rows.length} pubs match (${rows.map((r) => r.name).join(", ")}), use pub: <id> instead. Skipped`);
        continue;
      }
      const id = rows[0]!.id;
      if (ids.includes(id)) throw new Error(`${label}: this pub is listed twice`);
      ids.push(id);

      const v = e.verdict;
      await client.query(
        `insert into pub_editorial (pub_id, about, rating, summary, best_for, tip, visited, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, now())
         on conflict (pub_id) do update set
           about = excluded.about, rating = excluded.rating, summary = excluded.summary,
           best_for = excluded.best_for, tip = excluded.tip, visited = excluded.visited, updated_at = now()`,
        [id, JSON.stringify(e.about ?? {}), v?.rating ?? null, v?.summary ?? null, v?.best_for ?? null, v?.tip ?? null, v?.visited ?? null],
      );
    }
    const removed = await client.query("delete from pub_editorial where not (pub_id = any($1::int[]))", [ids]);
    await client.query("commit");
    return { ok: true, action: "apply_content", applied: ids.length, removed: removed.rowCount, warnings };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
