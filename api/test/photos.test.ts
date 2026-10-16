import assert from "node:assert/strict";
process.env.PHOTOS_BUCKET = "test-bucket";
process.env.PHOTOS_BASE_URL = "https://cdn.example";
const { handle } = await import("../src/app");
const { runAdmin } = await import("../src/admin");
const { objects } = await import("./mock-s3");
const { db } = await import("../src/db");

await db().query("delete from pub_photos where pub_id = 1"); // start clean

const as = (userId?: string) => ({ query: {}, body: {}, userId });
let r = await handle({ method: "POST", path: "/pubs/1/photos", ...as() });
assert.equal(r.status, 401, "must be signed in");
r = await handle({ method: "POST", path: "/pubs/1/photos", ...as("stranger") });
assert.equal(r.status, 403, "must have reviewed first");
r = await handle({ method: "POST", path: "/pubs/999999/photos", ...as("dev-user-2") });
assert.equal(r.status, 404);

r = await handle({ method: "POST", path: "/pubs/1/photos", ...as("dev-user-2") });
assert.equal(r.status, 200);
const up = r.body as { id: string; url: string; fields: Record<string, string> };
assert.equal(up.fields.key, `pending/${up.id}.jpg`);
assert.equal(up.fields["Content-Type"], "image/jpeg");
assert.ok(up.fields.Policy, "signed upload policy present");
const policy = JSON.parse(Buffer.from(up.fields.Policy!, "base64").toString());
assert.ok(JSON.stringify(policy.conditions).includes("content-length-range"), "size limit enforced by S3");

// Not visible while pending
let pub = (await handle({ method: "GET", path: "/pubs/1", ...as() })).body as { pub: { photos: unknown[] } };
assert.equal(pub.pub.photos.length, 0);

// Upload never finished -> not listed for approval
let pending = await runAdmin({ action: "list_pending_photos" }) as { pending: { id: string }[] };
assert.equal(pending.pending.length, 0);

// Upload finished -> listed with a private preview link
objects.set(`pending/${up.id}.jpg`, "jpegbytes");
pending = await runAdmin({ action: "list_pending_photos" }) as { pending: { id: string; preview: string }[] };
assert.equal(pending.pending.length, 1);
assert.ok(pending.pending[0]!.preview.includes(`pending/${up.id}.jpg`));

await runAdmin({ action: "approve_photo", id: up.id });
assert.ok(objects.has(`public/${up.id}.jpg`) && !objects.has(`pending/${up.id}.jpg`), "moved to public");
await assert.rejects(runAdmin({ action: "approve_photo", id: up.id }), /already approved/);

pub = (await handle({ method: "GET", path: "/pubs/1", ...as() })).body as { pub: { photos: { url: string }[] } };
assert.deepEqual(pub.pub.photos.map((p) => p.url), [`https://cdn.example/public/${up.id}.jpg`]);
const list = (await handle({ method: "GET", path: "/pubs", query: { lat: "51.4431", lng: "-0.1525" }, body: {} })).body as { pubs: { id: number; photo: string | null }[] };
assert.equal(list.pubs.find((p) => p.id === 1)!.photo, `https://cdn.example/public/${up.id}.jpg`);

// Reject path
const r2 = (await handle({ method: "POST", path: "/pubs/1/photos", ...as("dev-user-2") })).body as { id: string };
objects.set(`pending/${r2.id}.jpg`, "x");
await runAdmin({ action: "reject_photo", id: r2.id });
assert.ok(!objects.has(`pending/${r2.id}.jpg`));

await db().query("delete from pub_photos where pub_id = 1");
await db().end();
console.log("photo tests passed");
