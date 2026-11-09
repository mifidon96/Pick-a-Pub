import { db } from "../lib/db";
import { bad, bodyOf, notFound, score, signedIn, text, type Req, type Res } from "../lib/http";
import { FACTS, REQUIRED, REVIEW_COLS, SCORES, TEAM_IDS } from "../lib/ratings";

// Reviews: read your own, write one, report someone else's.
// All three need a signed-in user (API Gateway checks the Cognito token).

// GET /pubs/{id}/review  The caller's own review, or null.
export async function getMyReview(req: Req, id: number): Promise<Res> {
  const userId = signedIn(req);
  const { rows } = await db().query(
    `select ${REVIEW_COLS}
       from reviews r join users u on u.id = r.user_id
      where r.pub_id = $1 and r.user_id = $2`,
    [id, userId],
  );
  // The name they used before, so a first review of a new pub is pre-filled.
  const user = await db().query("select display_name from users where id = $1", [userId]);
  return { status: 200, body: { review: rows[0] ?? null, display_name: user.rows[0]?.display_name ?? null } };
}

// PUT /pubs/{id}/review  Creates or replaces the caller's review.
export async function putReview(req: Req, id: number): Promise<Res> {
  const userId = signedIn(req, "Sign in to leave a review");
  if (typeof req.body !== "object" || req.body === null) throw bad("Body must be JSON");
  const b = bodyOf(req);

  // Check everything before touching the database.
  const displayName = text(b.display_name, "display_name", 30);
  if (!displayName || displayName.length < 2) throw bad("display_name must be 2 to 30 characters");
  const optional = (k: string) => (b[k] === undefined || b[k] === null ? null : score(b[k], k));
  const scores = SCORES.map((k) => (REQUIRED.has(k) ? score(b[k], k) : optional(k)));
  const food = optional("food");
  const vibe = optional("vibe");
  const fanTeam = b.fan_team === undefined || b.fan_team === null || b.fan_team === "" ? null : String(b.fan_team);
  if (fanTeam && !TEAM_IDS.has(fanTeam)) throw bad("fan_team is not a team we know");
  const facts = FACTS.map((k) => {
    const v = b[k];
    if (v === undefined || v === null) return null;
    if (typeof v !== "boolean") throw bad(`${k} must be true, false or null`);
    return v;
  });
  const matchLabel = text(b.match_label, "match_label", 80);
  const comment = text(b.comment, "comment", 500);

  // Save the user's name and the review together, or neither.
  const client = await db().connect();
  try {
    await client.query("begin");
    const exists = await client.query("select 1 from pubs where id = $1", [id]);
    if (!exists.rowCount) throw notFound("Pub not found");

    await client.query(
      `insert into users (id, display_name) values ($1, $2)
       on conflict (id) do update set display_name = excluded.display_name`,
      [userId, displayName],
    );

    const cols = [...SCORES, "food", "vibe", ...FACTS, "fan_team", "match_label", "comment"];
    const vals = [...scores, food, vibe, ...facts, fanTeam, matchLabel, comment];
    const placeholders = vals.map((_, i) => `$${i + 3}`).join(", ");
    const updates = cols.map((c) => `${c} = excluded.${c}`).join(", ");
    await client.query(
      `insert into reviews (pub_id, user_id, ${cols.join(", ")})
       values ($1, $2, ${placeholders})
       on conflict (pub_id, user_id) do update set ${updates}, updated_at = now()`,
      [id, userId, ...vals],
    );
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
  return { status: 200, body: { ok: true } };
}

// POST /reviews/{id}/report  Three open reports hide the review until it has
// been checked (scripts/moderate.sh).
const REPORT_REASONS = ["spam", "offensive", "fake", "personal", "other"] as const;
const HIDE_AFTER_REPORTS = 3;
export async function reportReview(req: Req, id: number): Promise<Res> {
  const userId = signedIn(req, "Sign in to report a review");
  const b = bodyOf(req);
  const reason = b.reason;
  if (typeof reason !== "string" || !(REPORT_REASONS as readonly string[]).includes(reason)) {
    throw bad(`reason must be one of ${REPORT_REASONS.join(", ")}`);
  }
  const note = text(b.note, "note", 300);
  const review = await db().query("select user_id from reviews where id = $1", [id]);
  if (!review.rows[0]) throw notFound("Review not found");
  if (review.rows[0].user_id === userId) throw bad("You cannot report your own review");
  await db().query(
    `insert into review_reports (review_id, user_id, reason, note) values ($1, $2, $3, $4)
     on conflict (review_id, user_id) do update set reason = excluded.reason, note = excluded.note, resolved_at = null`,
    [id, userId, reason, note],
  );
  await db().query(
    `update reviews set hidden = true
      where id = $1 and (select count(*) from review_reports where review_id = $1 and resolved_at is null) >= $2`,
    [id, HIDE_AFTER_REPORTS],
  );
  return { status: 200, body: { ok: true } };
}
