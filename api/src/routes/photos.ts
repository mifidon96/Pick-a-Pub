import { db } from "../lib/db";
import { HttpError, notFound, signedIn, type Req, type Res } from "../lib/http";
import { photosEnabled, presignUpload } from "../services/photos";

// POST /pubs/{id}/photos  (signed in). Returns a one-off form to upload one JPEG
// straight to S3. The photo stays hidden until approved (scripts/moderate.sh).
export async function startPhotoUpload(req: Req, id: number): Promise<Res> {
  const userId = signedIn(req, "Sign in to add photos");
  if (!photosEnabled()) throw new HttpError(501, "Photo uploads only work on the live site");
  const exists = await db().query("select 1 from pubs where id = $1", [id]);
  if (!exists.rowCount) throw notFound("Pub not found");
  const known = await db().query("select 1 from users where id = $1", [userId]);
  if (!known.rowCount) throw new HttpError(403, "Leave a review first, then you can add photos");
  const pending = await db().query(
    "select count(*)::int as n from pub_photos where user_id = $1 and status = 'pending'",
    [userId],
  );
  if (pending.rows[0].n >= 10) throw new HttpError(429, "You have 10 photos waiting for approval already");

  const upload = await presignUpload();
  await db().query("insert into pub_photos (id, pub_id, user_id) values ($1, $2, $3)", [upload.id, id, userId]);
  return { status: 200, body: upload };
}
