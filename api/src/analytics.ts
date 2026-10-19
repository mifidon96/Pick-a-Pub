import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";

// Cookie-free page counts. See the page_views table in db/schema.sql.
const BOTS = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python|facebookexternalhit|whatsapp/i;
const KEEP_QUERY: Record<string, string> = { "/pub/": "id", "/match/": "id", "/": "area" };

// "/pub/?id=12&x=1" -> "/pub/?id=12". Everything else loses its query string.
export function cleanPath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return null;
  let url: URL;
  try {
    url = new URL(raw, "https://x.invalid");
  } catch {
    return null;
  }
  const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  const key = KEEP_QUERY[path];
  const val = key ? url.searchParams.get(key) : null;
  const out = val && /^[a-z0-9-]{1,40}$/i.test(val) ? `${path}?${key}=${val}` : path;
  return out.slice(0, 200);
}

// Only the site name of where they came from, and not our own site.
export function cleanReferrer(raw: unknown, ownHost?: string): string | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "");
    return host && host !== ownHost ? host.slice(0, 100) : null;
  } catch {
    return null;
  }
}

async function todaysSalt(): Promise<string> {
  const { rows } = await db().query(
    `insert into analytics_salt (day, salt) values (current_date, $1)
     on conflict (day) do update set salt = analytics_salt.salt
     returning salt`,
    [randomBytes(16).toString("hex")],
  );
  return rows[0].salt;
}

export async function recordView(input: { path: unknown; referrer?: unknown; app?: unknown; ip?: string; ua?: string; ownHost?: string }): Promise<boolean> {
  const path = cleanPath(input.path);
  if (!path || !input.ip || !input.ua || BOTS.test(input.ua)) return false;
  const salt = await todaysSalt();
  const visitor = createHash("sha256").update(`${salt}|${input.ip}|${input.ua}`).digest("hex").slice(0, 16);
  await db().query(
    "insert into page_views (path, referrer, app, visitor) values ($1, $2, $3, $4)",
    [path, cleanReferrer(input.referrer, input.ownHost), input.app === true, visitor],
  );
  // Housekeeping, about once in 200 views: old salts and old rows go.
  if (Math.random() < 0.005) {
    await db().query("delete from analytics_salt where day < current_date");
    await db().query("delete from page_views where at < now() - interval '90 days'");
  }
  return true;
}

// For scripts/stats.sh.
export async function stats(days: number) {
  const since = `now() - make_interval(days => $1)`;
  const q = async (sql: string) => (await db().query(sql, [days])).rows;
  const [totals] = await q(
    `select count(*)::int as page_views,
            count(distinct (visitor, at::date))::int as visitors,
            round(100.0 * avg(app::int))::int as app_percent
       from page_views where at > ${since}`,
  );
  return {
    days,
    ...totals,
    by_day: await q(
      `select to_char(at::date, 'Dy DD Mon') as day, count(*)::int as views, count(distinct visitor)::int as visitors
         from page_views where at > ${since} group by at::date order by at::date desc`,
    ),
    top_pages: await q(
      `select v.path, coalesce(p.name, '') as pub, count(*)::int as views
         from page_views v
         left join pubs p on v.path like '/pub/?id=%' and p.id::text = split_part(v.path, '=', 2)
        where v.at > ${since} group by v.path, p.name order by views desc limit 15`,
    ),
    referrers: await q(
      `select referrer, count(*)::int as views from page_views
        where at > ${since} and referrer is not null group by referrer order by views desc limit 10`,
    ),
    reviews: (await q(`select count(*)::int as n from reviews where created_at > ${since}`))[0].n,
    new_reviewers: (await q(`select count(*)::int as n from users where created_at > ${since}`))[0].n,
  };
}
