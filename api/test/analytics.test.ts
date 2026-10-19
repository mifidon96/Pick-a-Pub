import assert from "node:assert/strict";
const { cleanPath, cleanReferrer } = await import("../src/analytics");
const { handle } = await import("../src/app");
const { runAdmin } = await import("../src/admin");
const { db } = await import("../src/db");

// Paths keep only the query that identifies the page.
assert.equal(cleanPath("/pub/?id=12&utm_source=x"), "/pub/?id=12");
assert.equal(cleanPath("/pub?id=12"), "/pub/?id=12");
assert.equal(cleanPath("/?area=balham&sort=food"), "/?area=balham");
assert.equal(cleanPath("/privacy/?email=someone@x.com"), "/privacy/", "nothing personal from a query string");
assert.equal(cleanPath("https://evil.example/"), null);
assert.equal(cleanPath("//evil.example/"), null);
assert.equal(cleanReferrer("https://www.google.com/search?q=pubs", "pickapub.co.uk"), "google.com");
assert.equal(cleanReferrer("https://pickapub.co.uk/pub/?id=1", "pickapub.co.uk"), null, "own site is not a referrer");

await db().query("delete from page_views where path like '/test-%' or path = '/pub/?id=1'");
const browser = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)";
const view = (path: string, ip: string, ua = browser, extra: Record<string, unknown> = {}) =>
  handle({ method: "POST", path: "/events", query: {}, body: { path, ...extra }, client: { ip, ua, host: "pickapub.co.uk" } });

assert.equal((await view("/pub/?id=1", "1.1.1.1", browser, { referrer: "https://www.whatsapp.com/" })).status, 202);
await view("/pub/?id=1", "1.1.1.1");          // same person again
await view("/pub/?id=1", "2.2.2.2", browser, { app: true }); // someone else, from the installed app
await view("/pub/?id=1", "3.3.3.3", "WhatsApp/2.23 (link preview)"); // a bot: ignored
await view("not-a-path", "4.4.4.4");          // junk: ignored

const rows = (await db().query("select * from page_views where path = '/pub/?id=1' order by id")).rows;
assert.equal(rows.length, 3, "bot and junk ignored");
assert.equal(new Set(rows.map((r) => r.visitor)).size, 2, "two different visitors");
assert.equal(rows[0].referrer, "whatsapp.com");
assert.equal(rows[2].app, true);
assert.ok(!JSON.stringify(rows).includes("1.1.1.1"), "IP address never stored");

const s = (await runAdmin({ action: "stats", days: 7 })) as { page_views: number; visitors: number; top_pages: { path: string; pub: string }[] };
assert.ok(s.page_views >= 3 && s.visitors >= 2);
assert.equal(s.top_pages.find((p) => p.path === "/pub/?id=1")?.pub, "The Bedford", "pub names shown in stats");

await db().query("delete from page_views where path = '/pub/?id=1'");
console.log("analytics tests passed");
await db().end();
