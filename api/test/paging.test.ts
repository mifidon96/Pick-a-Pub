import assert from "node:assert/strict";
const { handle } = await import("../src/routes");
const { db } = await import("../src/lib/db");

// 45 test pubs in an empty spot, one reviewed: the farthest one.
const at = { lat: 55.0, lng: -3.0 };
await db().query("delete from pubs where source = 'paging-test'");
for (let i = 0; i < 45; i++) {
  await db().query(
    "insert into pubs (source, source_id, name, lat, lng) values ('paging-test', $1, $2, $3, $4)",
    [String(i), `Paging pub ${i}`, at.lat + i * 0.0002, at.lng],
  );
}
const far = (await db().query("select id from pubs where source = 'paging-test' and source_id = '44'")).rows[0].id;
let r = await handle({ method: "PUT", path: `/pubs/${far}/review`, userId: "paging-test", query: {}, body: { display_name: "Pager", sightlines: 4, screens: 4, crowd: 4 } });
assert.equal(r.status, 200);

type Page = { pubs: { id: number; review_count: number | null }[]; total: number; page: number; page_size: number };
const list = async (q: Record<string, string>) =>
  (await handle({ method: "GET", path: "/pubs", query: { lat: String(at.lat), lng: String(at.lng), radius_m: "1000", ...q }, body: undefined })).body as Page;

// Page 1: 20 pubs, the total, and the reviewed pub first even when sorting by distance.
let p = await list({ sort: "distance" });
assert.equal(p.pubs.length, 20);
assert.equal(p.total, 45);
assert.equal(p.page_size, 20);
assert.equal(p.pubs[0]!.id, far, "a reviewed pub comes before nearer unreviewed ones");
assert.ok(p.pubs.slice(1).every((x) => !x.review_count), "then the unreviewed pubs");

// Pages 2 and 3 carry on without repeats; page 3 holds the last 5.
const seen = new Set(p.pubs.map((x) => x.id));
for (const [page, n] of [["2", 20], ["3", 5]] as const) {
  p = await list({ sort: "distance", page });
  assert.equal(p.pubs.length, n);
  assert.equal(p.page, Number(page));
  for (const x of p.pubs) {
    assert.ok(!seen.has(x.id), "no pub on two pages");
    seen.add(x.id);
  }
}
assert.equal(seen.size, 45);

// Past the end: an empty page, still with the total. A bad page number: 400.
p = await list({ page: "9" });
assert.equal(p.pubs.length, 0);
assert.equal(p.total, 45);
r = await handle({ method: "GET", path: "/pubs", query: { lat: "55", lng: "-3", page: "0" }, body: undefined });
assert.equal(r.status, 400);

await db().query("delete from users where id = 'paging-test'");
await db().query("delete from pubs where source = 'paging-test'");
console.log("paging tests passed");
await db().end();
