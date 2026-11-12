import { db } from "../lib/db";
import { bad, notFound, num, type Req, type Res } from "../lib/http";
import { REVIEW_COLS, SCORES, TEAM_IDS } from "../lib/ratings";
import { hasPage, pubPagePath } from "../services/pages";
import { editorialPhotoUrl, photoKeyUrl, publicPhotoUrl } from "../services/photos";

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
// Pubs per page in the list.
export const PAGE_SIZE = 20;
// Pubs with at least one review always come first, whatever the sort: an
// unreviewed pub may not even show football yet.
const REVIEWED_FIRST = "coalesce(s.review_count, 0) > 0 desc";

// The centre and radius from ?lat=&lng=&radius_m= (5 km by default: most fans
// in the survey would travel 20 minutes or more).
export function searchArea(req: Req) {
  return {
    lat: num(req.query.lat, "lat", -90, 90),
    lng: num(req.query.lng, "lng", -180, 180),
    radius: num(req.query.radius_m, "radius_m", 100, 10000, 5000),
  };
}

// GET /pubs?lat=&lng=&radius_m=&sort=stars|distance|<category>&vibe=calm|lively&has=beer_garden,dog_friendly&fans=<team>&page=1
// Returns one page of 20 plus the total, so the website can show "Page 1 of 3".
export async function listPubs(req: Req): Promise<Res> {
  const { lat, lng, radius } = searchArea(req);
  const page = Math.floor(num(req.query.page, "page", 1, 100, 1));
  // Reviewed pubs first; within each group, the chosen sort.
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

  const { pubs, total } = await nearbyPubs({
    lat, lng, radius,
    where: `${vibe}\n        ${filters}\n        ${fans ? `and ${FAN_TEAM} = $4` : ""}`,
    order: `${REVIEWED_FIRST}, ${order}, p.id`,
    params: fans ? [fans] : [],
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  return { status: 200, body: { pubs, total, page, page_size: PAGE_SIZE } };
}

// Pubs within radius of a point, with scores and a cover photo, plus how many
// match in total (for paging). Extra params start at $4.
// Also used by "Where's it showing?" (routes/fixtures.ts).
export async function nearbyPubs(o: {
  lat: number; lng: number; radius: number; where: string; order: string; params: unknown[];
  extraCols?: string; limit?: number; offset?: number;
}) {
  const from = `from pubs p
       left join pub_scores s on s.pub_id = p.id
       left join pub_editorial e on e.pub_id = p.id
      where earth_box(ll_to_earth($1, $2), $3) @> ll_to_earth(p.lat, p.lng)
        and earth_distance(ll_to_earth($1, $2), ll_to_earth(p.lat, p.lng)) <= $3
        ${o.where}`;
  const params = [o.lat, o.lng, o.radius, ...o.params];
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
            count(*) over ()::int as total_count,
            ${SCORE_COLS}
       ${from}
      order by ${o.order}
      limit ${o.limit ?? 50} offset ${o.offset ?? 0}`,
    params,
  );
  // An empty page past the end has no rows to carry the total, so count separately.
  const total: number = rows[0]
    ? rows[0].total_count
    : o.offset ? (await db().query(`select count(*)::int as n ${from}`, params)).rows[0].n : 0;
  // Cover photo: ours first, then an approved upload, then Wikimedia.
  const pubs = rows.map(({ editorial_photo, upload_photo, wiki_photo, wiki_copy, total_count: _t, ...p }) => ({
    ...p,
    photo: editorial_photo ? editorialPhotoUrl(editorial_photo)
      : upload_photo ? publicPhotoUrl(upload_photo)
      : photoKeyUrl(wiki_copy) ?? wiki_photo ?? null,
  }));
  return { pubs, total };
}

// GET /pubs/{id}  One pub with its scores, photos and latest reviews.
export async function getPub(_req: Req, id: number): Promise<Res> {
  const found = await loadPub(id);
  if (!found) throw notFound("Pub not found");
  return { status: 200, body: found };
}

// Everything shown about one pub. Also used to build the search-engine pages
// (admin/pages.ts). `page` is that page's address, when the pub has one.
export async function loadPub(id: number) {
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
  if (!pub.rows[0]) return null;
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
    `select ${REVIEW_COLS}
       from reviews r join users u on u.id = r.user_id
      where r.pub_id = $1 and not r.hidden
      order by r.updated_at desc
      limit 30`,
    [id],
  );
  const page = hasPage(pubRow) ? pubPagePath(pubRow.name, pubRow.id) : null;
  return { pub: { ...pubRow, photos, page }, reviews: reviews.rows };
}
