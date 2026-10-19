import schema from "../../db/schema.sql";
import { db } from "./db";
import type { ContentEntry } from "./content";
import areas from "../../web/lib/areas.json";
import { TILE_MAX_AGE_DAYS } from "./tiles";
import { pendingExists, previewUrl, publish, removePending } from "./photos";
import { guessChannel, type FixtureInput } from "./fixtures";

// Admin actions. On AWS these run through a separate Lambda that is not behind
// API Gateway, so only someone with AWS credentials can call them.
export type AdminEvent =
  | { action: "migrate" }
  | { action: "pub_count" }
  | { action: "import_pubs"; pubs: PubInput[]; tile?: string }
  | { action: "tile_status"; tile: string }
  | { action: "list_photos_to_copy"; limit?: number }
  | { action: "set_photo_copies"; results: { id: number; key?: string; gone?: boolean }[] }
  | { action: "list_pending_photos" }
  | { action: "approve_photo"; id: string }
  | { action: "reject_photo"; id: string }
  | { action: "apply_content"; entries: ContentEntry[] }
  | { action: "set_fixtures"; fixtures: FixtureInput[] }
  | { action: "list_reports" }
  | { action: "hide_review"; id: number }
  | { action: "restore_review"; id: number }
  | { action: "delete_review"; id: number };

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
        `insert into import_tiles (tile, imported_at, pub_count) values ($1, now(), $2)
         on conflict (tile) do update set imported_at = now(), pub_count = excluded.pub_count`,
        [event.tile, upserted],
      );
    }
    return { ok: true, action: "import_pubs", upserted, skipped: event.pubs.length - upserted };
  }

  if (event.action === "apply_content") return applyContent(event.entries);

  // Used by deploy.sh to import pubs automatically on a brand new database.
  if (event.action === "pub_count") {
    const { rows } = await db().query("select count(*)::int as n from pubs");
    return { pubs: rows[0].n };
  }

  if (event.action === "tile_status") {
    const { rows } = await db().query(
      `select imported_at, pub_count, imported_at > now() - make_interval(days => $2) as fresh
         from import_tiles where tile = $1`,
      [event.tile, TILE_MAX_AGE_DAYS],
    );
    return rows[0] ?? { fresh: false, imported_at: null, pub_count: 0 };
  }

  if (event.action === "list_photos_to_copy") {
    const limit = Math.min(Math.max(Number(event.limit) || 25, 1), 100);
    const { rows } = await db().query(
      `select id, info->'photo'->>'url' as url from pubs
        where info->'photo' ? 'url' and not (info->'photo' ? 'key')
        order by id limit $1`,
      [limit],
    );
    const left = await db().query(`select count(*)::int as n from pubs where info->'photo' ? 'url' and not (info->'photo' ? 'key')`);
    return { items: rows, remaining: left.rows[0].n };
  }

  if (event.action === "set_photo_copies") {
    let copied = 0, removed = 0;
    for (const r of event.results ?? []) {
      if (r.gone) {
        await db().query(`update pubs set info = info - 'photo' where id = $1`, [r.id]);
        removed++;
      } else if (typeof r.key === "string" && /^public\/wikimedia\/[0-9a-f]{20}\.jpg$/.test(r.key)) {
        await db().query(`update pubs set info = jsonb_set(info, '{photo,key}', to_jsonb($2::text)) where id = $1 and info ? 'photo'`, [r.id, r.key]);
        copied++;
      }
    }
    return { ok: true, copied, removed };
  }

  if (event.action === "list_pending_photos") {
    const { rows } = await db().query(
      `select ph.id, ph.created_at, p.name as pub, u.display_name as uploader,
              ph.created_at < now() - interval '1 day' as stale
         from pub_photos ph
         join pubs p on p.id = ph.pub_id
         left join users u on u.id = ph.user_id
        where ph.status = 'pending'
        order by ph.created_at`,
    );
    const out = [];
    for (const r of rows) {
      if (!(await pendingExists(r.id))) {
        // Upload never finished. Tidy up old ones, skip recent ones (may still be uploading).
        if (r.stale) await db().query("delete from pub_photos where id = $1", [r.id]);
        continue;
      }
      out.push({ id: r.id, pub: r.pub, uploader: r.uploader, uploaded: r.created_at, preview: await previewUrl(r.id) });
    }
    return { pending: out };
  }

  if (event.action === "approve_photo" || event.action === "reject_photo") {
    const { rows } = await db().query("select status from pub_photos where id = $1", [event.id]);
    if (!rows[0]) throw new Error("No photo with that id");
    if (rows[0].status !== "pending") throw new Error(`Photo is already ${rows[0].status}`);
    if (event.action === "approve_photo") await publish(event.id);
    else await removePending(event.id);
    const status = event.action === "approve_photo" ? "approved" : "rejected";
    await db().query("update pub_photos set status = $2, reviewed_at = now() where id = $1", [event.id, status]);
    return { ok: true, id: event.id, status };
  }

  // Upcoming matches from the importer. Matches that have gone are cleared out.
  if (event.action === "set_fixtures") {
    if (!Array.isArray(event.fixtures)) throw new Error("fixtures must be a list");
    let saved = 0;
    for (const f of event.fixtures) {
      const kickoff = new Date(f.kickoff);
      if (!Number.isInteger(f.id) || Number.isNaN(kickoff.getTime()) || !f.home_name || !f.away_name) continue;
      await db().query(
        `insert into fixtures (id, competition, kickoff, status, home_name, away_name, home_team, away_team, channel, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
         on conflict (id) do update set competition = excluded.competition, kickoff = excluded.kickoff,
           status = excluded.status, home_name = excluded.home_name, away_name = excluded.away_name,
           home_team = excluded.home_team, away_team = excluded.away_team, channel = excluded.channel, updated_at = now()`,
        [f.id, String(f.competition).slice(0, 10), kickoff, String(f.status).slice(0, 20),
         String(f.home_name).slice(0, 80), String(f.away_name).slice(0, 80),
         f.home_team ?? null, f.away_team ?? null, guessChannel(f.competition, kickoff)],
      );
      saved++;
    }
    const old = await db().query("delete from fixtures where kickoff < now() - interval '1 day'");
    return { ok: true, saved, removed: old.rowCount };
  }

  // Moderation (scripts/moderate.sh).
  if (event.action === "list_reports") {
    const { rows } = await db().query(
      `select r.id, r.hidden, p.name as pub, u.display_name as author, r.comment, r.match_label, r.updated_at,
              count(rr.*)::int as reports,
              array_agg(rr.reason || coalesce(': ' || rr.note, '') order by rr.created_at) as reasons
         from review_reports rr
         join reviews r on r.id = rr.review_id
         join pubs p on p.id = r.pub_id
         join users u on u.id = r.user_id
        where rr.resolved_at is null
        group by r.id, p.name, u.display_name
        order by count(rr.*) desc, max(rr.created_at)`,
    );
    return { reports: rows };
  }

  if (event.action === "hide_review" || event.action === "restore_review" || event.action === "delete_review") {
    const id = Number(event.id);
    if (!Number.isInteger(id)) throw new Error("id must be a review id");
    const found = await db().query("select 1 from reviews where id = $1", [id]);
    if (!found.rowCount) throw new Error("No review with that id");
    if (event.action === "delete_review") {
      await db().query("delete from reviews where id = $1", [id]); // reports go with it
    } else {
      await db().query("update reviews set hidden = $2 where id = $1", [id, event.action === "hide_review"]);
      await db().query("update review_reports set resolved_at = now() where review_id = $1 and resolved_at is null", [id]);
    }
    return { ok: true, id, action: event.action };
  }

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
        `insert into pub_editorial (pub_id, about, rating, summary, best_for, tip, visited, photos, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, now())
         on conflict (pub_id) do update set
           about = excluded.about, rating = excluded.rating, summary = excluded.summary,
           best_for = excluded.best_for, tip = excluded.tip, visited = excluded.visited,
           photos = excluded.photos, updated_at = now()`,
        [id, JSON.stringify(e.about ?? {}), v?.rating ?? null, v?.summary ?? null, v?.best_for ?? null, v?.tip ?? null, v?.visited ?? null, JSON.stringify(e.photos ?? [])],
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
