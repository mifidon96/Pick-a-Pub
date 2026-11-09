import { db } from "../lib/db";

// Reported reviews (scripts/moderate.sh).

// Reviews with open reports, most reported first.
export async function listReports() {
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

// Hide or restore a review (closing its reports), or delete it outright.
export async function moderateReview(event: { action: "hide_review" | "restore_review" | "delete_review"; id: number }) {
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
