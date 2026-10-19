import assert from "node:assert/strict";
process.env.PHOTOS_BUCKET = "test-bucket";
process.env.PHOTOS_BASE_URL = "https://cdn.example";
const { handle } = await import("../src/app");
const { runAdmin } = await import("../src/admin");
const { objects } = await import("./mock-s3");
const { db } = await import("../src/db");

// Test users, cleaned up first so the test can run again.
const AUTHOR = "acct-test-author";
const REPORTERS = ["acct-test-r1", "acct-test-r2", "acct-test-r3"];
await db().query("delete from users where id like 'acct-test-%'");
await db().query("delete from review_reports where user_id like 'acct-test-%'");

const as = (userId?: string, body: unknown = {}) => ({ query: {}, body, userId });
const review = {
  display_name: "Account Test", sightlines: 5, crowd: 5, screens: 5, seating: 5, commentary: 5,
  service_speed: 5, drink_prices: 5, vibe: 3, comment: "Test review",
};
const PUB = 2;
let r = await handle({ method: "PUT", path: `/pubs/${PUB}/review`, ...as(AUTHOR, review) });
assert.equal(r.status, 200);
const reviewId = (await db().query("select id from reviews where user_id = $1", [AUTHOR])).rows[0].id as number;
const countBefore = (await handle({ method: "GET", path: `/pubs/${PUB}`, ...as() })).body as { pub: { review_count: number } };

// --- Report a review ---
r = await handle({ method: "POST", path: `/reviews/${reviewId}/report`, ...as(undefined, { reason: "spam" }) });
assert.equal(r.status, 401, "must be signed in to report");
r = await handle({ method: "POST", path: `/reviews/${reviewId}/report`, ...as(REPORTERS[0], { reason: "rude" }) });
assert.equal(r.status, 400, "reason must be from the list");
r = await handle({ method: "POST", path: `/reviews/${reviewId}/report`, ...as(AUTHOR, { reason: "spam" }) });
assert.equal(r.status, 400, "cannot report your own review");
r = await handle({ method: "POST", path: "/reviews/999999/report", ...as(REPORTERS[0], { reason: "spam" }) });
assert.equal(r.status, 404);

// Two reports: still visible. Reporting twice counts once.
for (const u of [REPORTERS[0], REPORTERS[0], REPORTERS[1]]) {
  r = await handle({ method: "POST", path: `/reviews/${reviewId}/report`, ...as(u, { reason: "fake", note: "never went" }) });
  assert.equal(r.status, 200);
}
const visible = async () => {
  const body = (await handle({ method: "GET", path: `/pubs/${PUB}`, ...as() })).body as { reviews: { id: number }[]; pub: { review_count: number } };
  return { shown: body.reviews.some((x) => x.id === reviewId), count: body.pub.review_count };
};
assert.equal((await visible()).shown, true, "two reports do not hide a review");

// Third report hides it from the page and the star rating.
await handle({ method: "POST", path: `/reviews/${reviewId}/report`, ...as(REPORTERS[2], { reason: "offensive" }) });
let v = await visible();
assert.equal(v.shown, false, "three reports hide the review");
assert.equal(v.count, countBefore.pub.review_count - 1, "hidden review is left out of the rating");

const listed = (await runAdmin({ action: "list_reports" })) as { reports: { id: number; reports: number; hidden: boolean }[] };
const mine = listed.reports.find((x) => x.id === reviewId);
assert.equal(mine?.reports, 3);
assert.equal(mine?.hidden, true);

// Moderator restores it: visible again, reports closed.
await runAdmin({ action: "restore_review", id: reviewId });
v = await visible();
assert.equal(v.shown, true, "restored review is visible");
const after = (await runAdmin({ action: "list_reports" })) as { reports: { id: number }[] };
assert.ok(!after.reports.some((x) => x.id === reviewId), "reports are closed after a decision");

// --- Download my data ---
r = await handle({ method: "GET", path: "/me", ...as() });
assert.equal(r.status, 401);
await db().query("insert into pub_photos (id, pub_id, user_id, status) values ($1, $2, $3, 'approved')",
  ["00000000-0000-4000-8000-00000000acc7", PUB, AUTHOR]);
objects.set("public/00000000-0000-4000-8000-00000000acc7.jpg", "jpeg");
r = await handle({ method: "GET", path: "/me", ...as(AUTHOR) });
assert.equal(r.status, 200);
const data = r.body as { user: { display_name: string }; reviews: Record<string, unknown>[]; photos: { url: string }[] };
assert.equal(data.user.display_name, "Account Test");
assert.equal(data.reviews.length, 1);
assert.equal(data.reviews[0]!.comment, "Test review");
assert.ok(!("user_id" in data.reviews[0]!), "export does not repeat the internal id");
assert.equal(data.photos[0]!.url, "https://cdn.example/public/00000000-0000-4000-8000-00000000acc7.jpg");

const reporterData = (await handle({ method: "GET", path: "/me", ...as(REPORTERS[0]) })).body as { user: unknown; reports: unknown[] };
assert.equal(reporterData.user, null, "a reporter who never reviewed has no profile");
assert.equal(reporterData.reports.length, 1);

// --- Delete my account ---
r = await handle({ method: "DELETE", path: "/me", ...as() });
assert.equal(r.status, 401);
r = await handle({ method: "DELETE", path: "/me", ...as(AUTHOR) });
assert.equal(r.status, 200);
assert.deepEqual(r.body, { ok: true, deleted: true, photos: 1 });
assert.equal((await db().query("select 1 from reviews where user_id = $1", [AUTHOR])).rowCount, 0, "reviews deleted");
assert.equal((await db().query("select 1 from pub_photos where user_id = $1", [AUTHOR])).rowCount, 0, "photo records deleted");
assert.ok(!objects.has("public/00000000-0000-4000-8000-00000000acc7.jpg"), "photo file deleted");
assert.equal((await db().query("select 1 from review_reports where review_id = $1", [reviewId])).rowCount, 0, "reports on their review go too");

r = await handle({ method: "DELETE", path: "/me", ...as(REPORTERS[0]) });
assert.deepEqual(r.body, { ok: true, deleted: false, photos: 0 }, "no profile, but their reports are removed");
assert.equal((await db().query("select 1 from review_reports where user_id = $1", [REPORTERS[0]])).rowCount, 0);

await db().query("delete from review_reports where user_id like 'acct-test-%'");
console.log("account tests passed");
await db().end();
