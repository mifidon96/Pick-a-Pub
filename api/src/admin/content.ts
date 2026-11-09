import areas from "../../../web/lib/areas.json";
import { db } from "../lib/db";
import type { ContentEntry } from "../services/content";

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
export async function applyContent(event: { entries: ContentEntry[] }) {
  const entries = event.entries;
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
