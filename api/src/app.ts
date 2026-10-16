import { db } from "./db";

export type Req = {
  method: string;
  path: string;
  query: Record<string, string | undefined>;
  body: unknown;
  userId?: string; // set only when the caller is signed in
};
export type Res = { status: number; body: unknown };

// Scored categories that feed the star rating (see db/schema.sql, pub_scores).
const SCORES = ["sightlines", "crowd", "screens", "seating", "commentary", "service_speed", "drink_prices"] as const;
const FACTS = [
  "shows_sky", "shows_tnt", "shows_amazon", "bookable",
  "outdoor_screen", "away_friendly", "family_friendly", "step_free",
  "dog_friendly", "low_no_alcohol",
] as const;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
const bad = (msg: string) => new HttpError(400, msg);

function num(v: string | undefined, name: string, min: number, max: number, fallback?: number): number {
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw bad(`${name} is required`);
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw bad(`${name} must be between ${min} and ${max}`);
  return n;
}

function score(v: unknown, name: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 5) throw bad(`${name} must be a whole number from 1 to 5`);
  return v;
}

function text(v: unknown, name: string, max: number): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw bad(`${name} must be text`);
  const t = v.trim();
  if (t.length > max) throw bad(`${name} must be ${max} characters or fewer`);
  return t || null;
}

const SCORE_COLS = `s.review_count, s.stars, s.score, ${SCORES.map((k) => `s.${k}`).join(", ")}, s.food, s.vibe,
  s.shows_sky, s.shows_tnt, s.shows_amazon, s.bookable, s.outdoor_screen,
  s.away_friendly, s.family_friendly, s.step_free, s.dog_friendly, s.low_no_alcohol, s.last_reviewed_at`;

// Things a visitor can filter on. Each combines customer reviews (majority yes)
// with pub details from OpenStreetMap and content/pubs.yaml.
const INFO = `(p.info || coalesce(e.about, '{}'::jsonb))`;
const FILTERS: Record<string, string> = {
  beer_garden: `(${INFO}->>'beer_garden' = 'true' or s.outdoor_screen)`,
  dog_friendly: `(${INFO}->>'dog' = 'true' or s.dog_friendly)`,
  big_screens: `(s.screens >= 4)`,
  low_no_alcohol: `(${INFO}->>'low_no_alcohol' = 'true' or s.low_no_alcohol)`,
};
// Sort by any scored category (best first), as well as stars or distance.
const SORTABLE = new Set<string>([...SCORES, "food"]);

// GET /pubs?lat=&lng=&radius_m=&sort=stars|distance|<category>&vibe=calm|lively&has=beer_garden,dog_friendly
async function listPubs(req: Req): Promise<Res> {
  const lat = num(req.query.lat, "lat", -90, 90);
  const lng = num(req.query.lng, "lng", -180, 180);
  const radius = num(req.query.radius_m, "radius_m", 100, 10000, 3000);
  // Rated pubs first (by stars, then the unrounded score), then unrated pubs by distance.
  const sort = req.query.sort ?? "stars";
  const order =
    sort === "distance" ? "distance_m" :
    sort === "stars" ? "s.stars desc nulls last, s.score desc nulls last, distance_m" :
    SORTABLE.has(sort) ? `s.${sort} desc nulls last, s.stars desc nulls last, distance_m` :
    (() => { throw bad("sort must be stars, distance or a category"); })();
  const has = (req.query.has ?? "").split(",").filter(Boolean);
  for (const h of has) if (!FILTERS[h]) throw bad(`unknown filter "${h}"`);
  const filters = has.map((h) => `and ${FILTERS[h]}`).join("\n        ");
  // Vibe is 1 (calm) to 5 (lively). Pubs with no reviews yet are kept out of a vibe filter.
  const vibe =
    req.query.vibe === "calm" ? "and s.vibe <= 2.5" :
    req.query.vibe === "lively" ? "and s.vibe >= 3.5" :
    req.query.vibe ? (() => { throw bad("vibe must be calm or lively"); })() : "";

  const { rows } = await db().query(
    `select p.id, p.name, p.address, p.postcode, p.lat, p.lng,
            round(earth_distance(ll_to_earth($1, $2), ll_to_earth(p.lat, p.lng)))::int as distance_m,
            e.rating::float8 as verdict_rating,
            ${SCORE_COLS}
       from pubs p
       left join pub_scores s on s.pub_id = p.id
       left join pub_editorial e on e.pub_id = p.id
      where earth_box(ll_to_earth($1, $2), $3) @> ll_to_earth(p.lat, p.lng)
        and earth_distance(ll_to_earth($1, $2), ll_to_earth(p.lat, p.lng)) <= $3
        ${vibe}
        ${filters}
      order by ${order}
      limit 50`,
    [lat, lng, radius],
  );
  return { status: 200, body: { pubs: rows } };
}

// GET /pubs/{id}
async function getPub(id: number): Promise<Res> {
  const pub = await db().query(
    `select p.id, p.name, p.address, p.postcode, p.lat, p.lng,
            p.source || ':' || p.source_id as ref,
            p.info || coalesce(e.about, '{}'::jsonb) as info,
            case when e.rating is not null then json_build_object(
              'rating', e.rating::float8, 'summary', e.summary, 'best_for', e.best_for,
              'tip', e.tip, 'visited', e.visited) end as verdict,
            ${SCORE_COLS}
       from pubs p
       left join pub_scores s on s.pub_id = p.id
       left join pub_editorial e on e.pub_id = p.id
      where p.id = $1`,
    [id],
  );
  if (!pub.rows[0]) throw new HttpError(404, "Pub not found");

  const reviews = await db().query(
    `select r.id, u.display_name, ${SCORES.map((k) => `r.${k}`).join(", ")}, r.food, r.vibe,
            ${FACTS.map((f) => `r.${f}`).join(", ")},
            r.match_label, r.comment, r.updated_at
       from reviews r join users u on u.id = r.user_id
      where r.pub_id = $1
      order by r.updated_at desc
      limit 30`,
    [id],
  );
  return { status: 200, body: { pub: pub.rows[0], reviews: reviews.rows } };
}

// GET /pubs/{id}/review  (signed in). The caller's own review, or null.
async function getMyReview(id: number, req: Req): Promise<Res> {
  if (!req.userId) throw new HttpError(401, "Sign in first");
  const { rows } = await db().query(
    `select r.id, u.display_name, ${SCORES.map((k) => `r.${k}`).join(", ")}, r.food, r.vibe,
            ${FACTS.map((f) => `r.${f}`).join(", ")},
            r.match_label, r.comment, r.updated_at
       from reviews r join users u on u.id = r.user_id
      where r.pub_id = $1 and r.user_id = $2`,
    [id, req.userId],
  );
  return { status: 200, body: { review: rows[0] ?? null } };
}

// PUT /pubs/{id}/review  (signed in). Creates or replaces the caller's review.
async function putReview(id: number, req: Req): Promise<Res> {
  if (!req.userId) throw new HttpError(401, "Sign in to leave a review");
  if (typeof req.body !== "object" || req.body === null) throw bad("Body must be JSON");
  const b = req.body as Record<string, unknown>;

  const displayName = text(b.display_name, "display_name", 30);
  if (!displayName || displayName.length < 2) throw bad("display_name must be 2 to 30 characters");
  const scores = SCORES.map((k) => score(b[k], k));
  const food = b.food === undefined || b.food === null ? null : score(b.food, "food");
  const vibe = score(b.vibe, "vibe");
  const facts = FACTS.map((k) => {
    const v = b[k];
    if (v === undefined || v === null) return null;
    if (typeof v !== "boolean") throw bad(`${k} must be true, false or null`);
    return v;
  });
  const matchLabel = text(b.match_label, "match_label", 80);
  const comment = text(b.comment, "comment", 500);

  const client = await db().connect();
  try {
    await client.query("begin");
    const exists = await client.query("select 1 from pubs where id = $1", [id]);
    if (!exists.rowCount) throw new HttpError(404, "Pub not found");

    await client.query(
      `insert into users (id, display_name) values ($1, $2)
       on conflict (id) do update set display_name = excluded.display_name`,
      [req.userId, displayName],
    );

    const cols = [...SCORES, "food", "vibe", ...FACTS, "match_label", "comment"];
    const vals = [...scores, food, vibe, ...facts, matchLabel, comment];
    const placeholders = vals.map((_, i) => `$${i + 3}`).join(", ");
    const updates = cols.map((c) => `${c} = excluded.${c}`).join(", ");
    await client.query(
      `insert into reviews (pub_id, user_id, ${cols.join(", ")})
       values ($1, $2, ${placeholders})
       on conflict (pub_id, user_id) do update set ${updates}, updated_at = now()`,
      [id, req.userId, ...vals],
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

export async function handle(req: Req): Promise<Res> {
  try {
    const path = req.path.replace(/\/+$/, "") || "/";
    if (req.method === "GET" && path === "/pubs") return await listPubs(req);

    const m = /^\/pubs\/(\d{1,9})(\/review)?$/.exec(path);
    if (m) {
      const id = Number(m[1]);
      if (!m[2] && req.method === "GET") return await getPub(id);
      if (m[2] && req.method === "GET") return await getMyReview(id, req);
      if (m[2] && req.method === "PUT") return await putReview(id, req);
    }
    return { status: 404, body: { error: "Not found" } };
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: { error: e.message } };
    console.error(e);
    return { status: 500, body: { error: "Something went wrong" } };
  }
}
