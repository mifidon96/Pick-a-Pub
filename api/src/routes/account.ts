import { db } from "../lib/db";
import { signedIn, type Req, type Res } from "../lib/http";
import { deletePhotoObjects, publicPhotoUrl } from "../services/photos";

// Your data (UK GDPR): download it, or delete your account.

// GET /me  Everything we hold about the caller, for "Download my data".
export async function exportMe(req: Req): Promise<Res> {
  const userId = signedIn(req);
  const user = await db().query("select id, display_name, created_at from users where id = $1", [userId]);
  const reviews = await db().query(
    `select r.*, p.name as pub_name from reviews r join pubs p on p.id = r.pub_id
      where r.user_id = $1 order by r.updated_at desc`,
    [userId],
  );
  const photos = await db().query(
    `select ph.id, ph.status, ph.created_at, p.name as pub_name from pub_photos ph join pubs p on p.id = ph.pub_id
      where ph.user_id = $1 order by ph.created_at desc`,
    [userId],
  );
  const reports = await db().query(
    "select review_id, reason, note, created_at from review_reports where user_id = $1 order by created_at desc",
    [userId],
  );
  return {
    status: 200,
    body: {
      exported_at: new Date().toISOString(),
      user: user.rows[0] ?? null,
      reviews: reviews.rows.map(({ user_id: _u, ...r }) => r),
      photos: photos.rows.map((p) => ({ ...p, url: p.status === "approved" ? publicPhotoUrl(p.id) : null })),
      reports: reports.rows,
    },
  };
}

// DELETE /me  Removes the caller's reviews, photos, reports and profile.
// The browser then deletes the Cognito sign-in itself (web/lib/auth.tsx).
export async function deleteMe(req: Req): Promise<Res> {
  const userId = signedIn(req);
  const photos = await db().query("select id from pub_photos where user_id = $1", [userId]);
  const ids = photos.rows.map((r) => r.id as string);
  await deletePhotoObjects(ids);
  const client = await db().connect();
  try {
    await client.query("begin");
    await client.query("delete from review_reports where user_id = $1", [userId]);
    // Reviews and photo records go with the user row (on delete cascade).
    const removed = await client.query("delete from users where id = $1", [userId]);
    await client.query("commit");
    return { status: 200, body: { ok: true, deleted: removed.rowCount === 1, photos: ids.length } };
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
