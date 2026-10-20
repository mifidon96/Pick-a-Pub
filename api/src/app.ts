import { db } from "./db";
import teams from "../../web/lib/teams.json";
import { recordView } from "./analytics";
import { CHANNEL_NAMES, COMPETITION_NAMES, type Channel } from "./fixtures";
import { deletePhotoObjects, editorialPhotoUrl, photoKeyUrl, photosEnabled, presignUpload, publicPhotoUrl } from "./photos";

export type Req = {
  method: string;
  path: string;
  query: Record<string, string | undefined>;
  body: unknown;
  userId?: string; // set only when the caller is signed in
  client?: { ip?: string; ua?: string; host?: string }; // for anonymous page counts only
};
export type Res = { status: number; body: unknown };

// Scored categories that feed the star rating (see db/schema.sql, pub_scores).
const SCORES = ["sightlines", "crowd", "screens", "seating", "commentary", "service_speed", "drink_prices"] as const;
// A quick review needs only these. The others can be left blank.
const REQUIRED = new Set<string>(["sightlines", "screens", "crowd"]);
const TEAM_IDS = new Set(teams.map((t) => t.id));
const FACTS = [
  "shows_sky", "shows_tnt", "shows_amazon", "bookable",
  "outdoor_screen", "away_friendly", "family_friendly", "step_free",
  "dog_friendly", "low_no_alcohol", "arrive_early", "several_games",
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

// Our own details (content/pubs.yaml) win over what reviewers say for fans.
const FAN_TEAM = `coalesce(e.about->>'fans', s.fan_team)`;
const AWAY_OK = `coalesce((e.about->>'away_fans')::boolean, s.away_friendly)`;
const SCORE_COLS = `s.review_count, s.stars, s.score, ${SCORES.map((k) => `s.${k}`).join(", ")}, s.food, s.vibe,
  s.shows_sky, s.shows_tnt, s.shows_amazon, s.bookable, s.outdoor_screen,
  ${AWAY_OK} as away_friendly, ${FAN_TEAM} as fan_team,
  s.family_friendly, s.step_free, s.dog_friendly, s.low_no_alcohol, s.arrive_early, s.several_games, s.last_reviewed_at`;

// Things a visitor can filter on. Each combines customer reviews (majority yes)
// with pub details from OpenStreetMap and content/pubs.yaml.
const INFO = `(p.info || coalesce(e.about, '{}'::jsonb))`;
const FILTERS: Record<string, string> = {
  beer_garden: `(${INFO}->>'beer_garden' = 'true' or s.outdoor_screen)`,
  dog_friendly: `(${INFO}->>'dog' = 'true' or s.dog_friendly)`,
  big_screens: `(s.screens >= 4)`,
  low_no_alcohol: `(${INFO}->>'low_no_alcohol' = 'true' or s.low_no_alcohol)`,
  away_friendly: `(${AWAY_OK})`,
  several_games: `(s.several_games)`,
};
// Sort by any scored category (best first), as well as stars or distance.
const SORTABLE = new Set<string>([...SCORES, "food"]);

// GET /pubs?lat=&lng=&radius_m=&sort=stars|distance|<category>&vibe=calm|lively&has=beer_garden,dog_friendly&fans=<team>
async function listPubs(req: Req): Promise<Res> {
  const lat = num(req.query.lat, "lat", -90, 90);
  const lng = num(req.query.lng, "lng", -180, 180);
  // 5 km by default: most fans in the survey would travel 20 minutes or more.
  const radius = num(req.query.radius_m, "radius_m", 100, 10000, 5000);
  // Rated pubs first (by stars, then the unrounded score), then unrated pubs by distance.
  const sort = req.query.sort ?? "stars";
  const order =
    sort === "distance" ? "distance_m" :
    // Equal stars: more reviews first (a single glowing review should not top 20 good ones).
    sort === "stars" ? "s.stars desc nulls last, s.review_count desc nulls last, s.score desc nulls last, distance_m" :
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
  const fans = req.query.fans ?? "";
  if (fans && !TEAM_IDS.has(fans)) throw bad("unknown team");

  const pubs = await nearbyPubs({
    lat, lng, radius,
    where: `${vibe}\n        ${filters}\n        ${fans ? `and ${FAN_TEAM} = $4` : ""}`,
    order,
    params: fans ? [fans] : [],
  });
  return { status: 200, body: { pubs } };
}

// Pubs within radius of a point, with scores and a cover photo. Extra params start at $4.
async function nearbyPubs(o: { lat: number; lng: number; radius: number; where: string; order: string; params: unknown[]; extraCols?: string }) {
  const { rows } = await db().query(
    `select p.id, p.name, p.address, p.postcode, p.lat, p.lng,
            round(earth_distance(ll_to_earth($1, $2), ll_to_earth(p.lat, p.lng)))::int as distance_m,
            e.rating::float8 as verdict_rating,
            e.photos->>0 as editorial_photo,
            (select ph.id from pub_photos ph where ph.pub_id = p.id and ph.status = 'approved'
              order by ph.created_at desc limit 1) as upload_photo,
            p.info->'photo'->>'url' as wiki_photo,
            p.info->'photo'->>'key' as wiki_copy,
            ${o.extraCols ? `${o.extraCols},` : ""}
            ${SCORE_COLS}
       from pubs p
       left join pub_scores s on s.pub_id = p.id
       left join pub_editorial e on e.pub_id = p.id
      where earth_box(ll_to_earth($1, $2), $3) @> ll_to_earth(p.lat, p.lng)
        and earth_distance(ll_to_earth($1, $2), ll_to_earth(p.lat, p.lng)) <= $3
        ${o.where}
      order by ${o.order}
      limit 50`,
    [o.lat, o.lng, o.radius, ...o.params],
  );
  // Cover photo: ours first, then an approved upload, then Wikimedia.
  return rows.map(({ editorial_photo, upload_photo, wiki_photo, wiki_copy, ...p }) => ({
    ...p,
    photo: editorial_photo ? editorialPhotoUrl(editorial_photo)
      : upload_photo ? publicPhotoUrl(upload_photo)
      : photoKeyUrl(wiki_copy) ?? wiki_photo ?? null,
  }));
}

// --- Where's it showing? ---------------------------------------------------

const fixtureOut = (f: Record<string, unknown>) => ({
  ...f,
  competition_name: COMPETITION_NAMES[f.competition as string] ?? f.competition,
  channel_name: CHANNEL_NAMES[f.channel as Channel] ?? CHANNEL_NAMES.unknown,
});
const FIXTURE_COLS = "id, competition, kickoff, status, home_name, away_name, home_team, away_team, channel";

// GET /fixtures?days=7&team=arsenal  Upcoming matches (and ones that kicked off in the last 2 hours).
async function listFixtures(req: Req): Promise<Res> {
  const days = num(req.query.days, "days", 1, 14, 7);
  const team = req.query.team ?? "";
  if (team && !TEAM_IDS.has(team)) throw bad("unknown team");
  const { rows } = await db().query(
    `select ${FIXTURE_COLS} from fixtures
      where kickoff > now() - interval '2 hours' and kickoff < now() + make_interval(days => $1)
        and status not in ('FINISHED', 'POSTPONED', 'CANCELLED', 'SUSPENDED')
        ${team ? "and (home_team = $2 or away_team = $2)" : ""}
      order by kickoff, id limit 150`,
    team ? [days, team] : [days],
  );
  return { status: 200, body: { fixtures: rows.map(fixtureOut) } };
}

// GET /fixtures/{id}/pubs?lat=&lng=&radius_m=  Pubs near a point for this match:
// reviewers say it has the channel first, then unknown, then "no"; best rated first within each.
async function fixturePubs(id: number, req: Req): Promise<Res> {
  const lat = num(req.query.lat, "lat", -90, 90);
  const lng = num(req.query.lng, "lng", -180, 180);
  const radius = num(req.query.radius_m, "radius_m", 100, 10000, 5000);
  const f = await db().query(`select ${FIXTURE_COLS} from fixtures where id = $1`, [id]);
  if (!f.rows[0]) throw new HttpError(404, "Match not found");
  const fixture = f.rows[0];
  const col = { sky: "s.shows_sky", tnt: "s.shows_tnt", amazon: "s.shows_amazon" }[fixture.channel as string];
  const has = col ?? "null::boolean";
  const pubs = await nearbyPubs({
    lat, lng, radius,
    where: "",
    extraCols: `${has} as has_channel`,
    order: `case when ${has} then 0 when ${has} is null then 1 else 2 end,
            s.stars desc nulls last, s.review_count desc nulls last, distance_m`,
    params: [],
  });
  return { status: 200, body: { fixture: fixtureOut(fixture), pubs } };
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
            coalesce(e.photos, '[]'::jsonb) as editorial_photos,
            ${SCORE_COLS}
       from pubs p
       left join pub_scores s on s.pub_id = p.id
       left join pub_editorial e on e.pub_id = p.id
      where p.id = $1`,
    [id],
  );
  if (!pub.rows[0]) throw new HttpError(404, "Pub not found");
  const { editorial_photos, ...pubRow } = pub.rows[0];
  const uploads = await db().query(
    `select ph.id, u.display_name from pub_photos ph left join users u on u.id = ph.user_id
      where ph.pub_id = $1 and ph.status = 'approved' order by ph.created_at desc limit 12`,
    [id],
  );
  const photos = [
    ...(editorial_photos as string[]).map((f) => ({ url: editorialPhotoUrl(f), credit: "Pick-a-Pub" })),
    ...uploads.rows.map((r) => ({ url: publicPhotoUrl(r.id), credit: r.display_name ?? null })),
  ];
  const wiki = pubRow.info?.photo;
  if (wiki?.url) {
    photos.push({ url: photoKeyUrl(wiki.key) ?? wiki.url, credit: `${wiki.author}, ${wiki.licence}`, link: wiki.page, licence_url: wiki.licence_url } as never);
  }
  if (pubRow.info) delete pubRow.info.photo; // shown in the gallery, not in "About this pub"

  const reviews = await db().query(
    `select r.id, u.display_name, ${SCORES.map((k) => `r.${k}`).join(", ")}, r.food, r.vibe,
            ${FACTS.map((f) => `r.${f}`).join(", ")},
            r.fan_team, r.match_label, r.comment, r.updated_at
       from reviews r join users u on u.id = r.user_id
      where r.pub_id = $1 and not r.hidden
      order by r.updated_at desc
      limit 30`,
    [id],
  );
  return { status: 200, body: { pub: { ...pubRow, photos }, reviews: reviews.rows } };
}

// POST /pubs/{id}/photos  (signed in). Returns a one-off form to upload one JPEG
// straight to S3. The photo stays hidden until approved.
async function startPhotoUpload(id: number, req: Req): Promise<Res> {
  if (!req.userId) throw new HttpError(401, "Sign in to add photos");
  if (!photosEnabled()) throw new HttpError(501, "Photo uploads only work on the live site");
  const exists = await db().query("select 1 from pubs where id = $1", [id]);
  if (!exists.rowCount) throw new HttpError(404, "Pub not found");
  const known = await db().query("select 1 from users where id = $1", [req.userId]);
  if (!known.rowCount) throw new HttpError(403, "Leave a review first, then you can add photos");
  const pending = await db().query(
    "select count(*)::int as n from pub_photos where user_id = $1 and status = 'pending'",
    [req.userId],
  );
  if (pending.rows[0].n >= 10) throw new HttpError(429, "You have 10 photos waiting for approval already");

  const upload = await presignUpload();
  await db().query("insert into pub_photos (id, pub_id, user_id) values ($1, $2, $3)", [upload.id, id, req.userId]);
  return { status: 200, body: upload };
}

// GET /pubs/{id}/review  (signed in). The caller's own review, or null.
async function getMyReview(id: number, req: Req): Promise<Res> {
  if (!req.userId) throw new HttpError(401, "Sign in first");
  const { rows } = await db().query(
    `select r.id, u.display_name, ${SCORES.map((k) => `r.${k}`).join(", ")}, r.food, r.vibe,
            ${FACTS.map((f) => `r.${f}`).join(", ")},
            r.fan_team, r.match_label, r.comment, r.updated_at
       from reviews r join users u on u.id = r.user_id
      where r.pub_id = $1 and r.user_id = $2`,
    [id, req.userId],
  );
  // The name they used before, so a first review of a new pub is pre-filled.
  const user = await db().query("select display_name from users where id = $1", [req.userId]);
  return { status: 200, body: { review: rows[0] ?? null, display_name: user.rows[0]?.display_name ?? null } };
}

// PUT /pubs/{id}/review  (signed in). Creates or replaces the caller's review.
async function putReview(id: number, req: Req): Promise<Res> {
  if (!req.userId) throw new HttpError(401, "Sign in to leave a review");
  if (typeof req.body !== "object" || req.body === null) throw bad("Body must be JSON");
  const b = req.body as Record<string, unknown>;

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

    const cols = [...SCORES, "food", "vibe", ...FACTS, "fan_team", "match_label", "comment"];
    const vals = [...scores, food, vibe, ...facts, fanTeam, matchLabel, comment];
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

// POST /reviews/{id}/report  (signed in). Three open reports hide the review
// until it has been checked (scripts/moderate.sh).
export const REPORT_REASONS = ["spam", "offensive", "fake", "personal", "other"] as const;
const HIDE_AFTER_REPORTS = 3;
async function reportReview(id: number, req: Req): Promise<Res> {
  if (!req.userId) throw new HttpError(401, "Sign in to report a review");
  const b = (typeof req.body === "object" && req.body !== null ? req.body : {}) as Record<string, unknown>;
  const reason = b.reason;
  if (typeof reason !== "string" || !(REPORT_REASONS as readonly string[]).includes(reason)) {
    throw bad(`reason must be one of ${REPORT_REASONS.join(", ")}`);
  }
  const note = text(b.note, "note", 300);
  const review = await db().query("select user_id from reviews where id = $1", [id]);
  if (!review.rows[0]) throw new HttpError(404, "Review not found");
  if (review.rows[0].user_id === req.userId) throw bad("You cannot report your own review");
  await db().query(
    `insert into review_reports (review_id, user_id, reason, note) values ($1, $2, $3, $4)
     on conflict (review_id, user_id) do update set reason = excluded.reason, note = excluded.note, resolved_at = null`,
    [id, req.userId, reason, note],
  );
  await db().query(
    `update reviews set hidden = true
      where id = $1 and (select count(*) from review_reports where review_id = $1 and resolved_at is null) >= $2`,
    [id, HIDE_AFTER_REPORTS],
  );
  return { status: 200, body: { ok: true } };
}

// GET /me  (signed in). Everything we hold about the caller, for "Download my data".
async function exportMe(req: Req): Promise<Res> {
  if (!req.userId) throw new HttpError(401, "Sign in first");
  const user = await db().query("select id, display_name, created_at from users where id = $1", [req.userId]);
  const reviews = await db().query(
    `select r.*, p.name as pub_name from reviews r join pubs p on p.id = r.pub_id
      where r.user_id = $1 order by r.updated_at desc`,
    [req.userId],
  );
  const photos = await db().query(
    `select ph.id, ph.status, ph.created_at, p.name as pub_name from pub_photos ph join pubs p on p.id = ph.pub_id
      where ph.user_id = $1 order by ph.created_at desc`,
    [req.userId],
  );
  const reports = await db().query(
    "select review_id, reason, note, created_at from review_reports where user_id = $1 order by created_at desc",
    [req.userId],
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

// DELETE /me  (signed in). Removes the caller's reviews, photos, reports and
// profile. The browser then deletes the Cognito sign-in itself (lib/auth.tsx).
async function deleteMe(req: Req): Promise<Res> {
  if (!req.userId) throw new HttpError(401, "Sign in first");
  const photos = await db().query("select id from pub_photos where user_id = $1", [req.userId]);
  const ids = photos.rows.map((r) => r.id as string);
  await deletePhotoObjects(ids);
  const client = await db().connect();
  try {
    await client.query("begin");
    await client.query("delete from review_reports where user_id = $1", [req.userId]);
    // Reviews and photo records go with the user row (on delete cascade).
    const removed = await client.query("delete from users where id = $1", [req.userId]);
    await client.query("commit");
    return { status: 200, body: { ok: true, deleted: removed.rowCount === 1, photos: ids.length } };
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

export async function handle(req: Req): Promise<Res> {
  try {
    const path = req.path.replace(/\/+$/, "") || "/";
    if (req.method === "GET" && path === "/pubs") return await listPubs(req);
    if (path === "/events" && req.method === "POST") {
      const b = (typeof req.body === "object" && req.body !== null ? req.body : {}) as Record<string, unknown>;
      await recordView({ path: b.path, referrer: b.referrer, app: b.app, ip: req.client?.ip, ua: req.client?.ua, ownHost: req.client?.host });
      return { status: 202, body: { ok: true } };
    }
    if (path === "/fixtures" && req.method === "GET") return await listFixtures(req);
    const fx = /^\/fixtures\/(\d{1,9})\/pubs$/.exec(path);
    if (fx && req.method === "GET") return await fixturePubs(Number(fx[1]), req);
    if (path === "/me" && req.method === "GET") return await exportMe(req);
    if (path === "/me" && req.method === "DELETE") return await deleteMe(req);

    const rr = /^\/reviews\/(\d{1,9})\/report$/.exec(path);
    if (rr && req.method === "POST") return await reportReview(Number(rr[1]), req);

    const ph = /^\/pubs\/(\d{1,9})\/photos$/.exec(path);
    if (ph && req.method === "POST") return await startPhotoUpload(Number(ph[1]), req);

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
