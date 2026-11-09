import { db } from "../lib/db";
import { pendingExists, previewUrl, publish, removePending } from "../services/photos";

// Photos: copying Wikimedia photos into our bucket (run by the importer), and
// approving visitors' uploads (scripts/moderate.sh).

// Pubs whose Wikimedia photo we have not copied yet.
export async function listPhotosToCopy(event: { limit?: number }) {
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

// Record where each copy was saved, or drop photos that no longer exist.
export async function setPhotoCopies(event: { results: { id: number; key?: string; gone?: boolean }[] }) {
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

// Uploads waiting for approval, each with a short-lived preview link.
export async function listPendingPhotos() {
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

// Approve (publish to the site) or reject (delete) a pending upload.
export async function decidePhoto(event: { action: "approve_photo" | "reject_photo"; id: string }) {
  const { rows } = await db().query("select status from pub_photos where id = $1", [event.id]);
  if (!rows[0]) throw new Error("No photo with that id");
  if (rows[0].status !== "pending") throw new Error(`Photo is already ${rows[0].status}`);
  if (event.action === "approve_photo") await publish(event.id);
  else await removePending(event.id);
  const status = event.action === "approve_photo" ? "approved" : "rejected";
  await db().query("update pub_photos set status = $2, reviewed_at = now() where id = $1", [event.id, status]);
  return { ok: true, id: event.id, status };
}
