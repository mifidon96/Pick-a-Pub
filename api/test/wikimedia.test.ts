import assert from "node:assert/strict";
import { attachWikimediaPhotos, commonsFileFromTags, normaliseTitle } from "../../scripts/wikimedia.mjs";
import type { OsmElement } from "../../scripts/osm-to-pub.mjs";

assert.equal(normaliseTitle("File:the_bedford,_Balham.jpg"), "File:The bedford, Balham.jpg");
assert.equal(commonsFileFromTags({ wikimedia_commons: "File:Pub_A.jpg" }), "File:Pub A.jpg");
assert.equal(commonsFileFromTags({ wikimedia_commons: "Category:Pubs" }), null, "categories ignored");
assert.equal(commonsFileFromTags({ image: "https://commons.wikimedia.org/wiki/File:Pub_B.jpg" }), "File:Pub B.jpg");
assert.equal(commonsFileFromTags({ image: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Pub_C.jpg" }), "File:Pub C.jpg");
assert.equal(commonsFileFromTags({ image: "https://somepub.co.uk/photo.jpg" }), null, "random sites ignored");

const els: OsmElement[] = [
  { type: "node", id: 1, tags: { name: "A", wikimedia_commons: "File:Pub_A.jpg" } },
  { type: "node", id: 2, tags: { name: "B", wikidata: "Q42" } },
  { type: "node", id: 3, tags: { name: "C", image: "https://commons.wikimedia.org/wiki/File:Pub_NC.jpg" } },
  { type: "node", id: 4, tags: { name: "D", wikimedia_commons: "File:Missing.jpg" } },
  { type: "node", id: 5, tags: { name: "E" } },
];
const pubs = els.map((e) => ({ source: "osm", source_id: `node/${e.id}`, name: e.tags!.name, address: null, postcode: null, lat: 51, lng: 0, info: {} as Record<string, unknown> }));

const meta = (licence: string) => ({
  Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Jo">Jo Bloggs</a>' },
  LicenseShortName: { value: licence },
  LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" },
});
const calls: string[] = [];
const fakeFetch = (async (url: string) => {
  calls.push(url);
  if (url.includes("wikidata.org")) {
    return new Response(JSON.stringify({ entities: { Q42: { claims: { P18: [{ mainsnak: { datavalue: { value: "Pub_from_wikidata.jpg" } } }] } } } }));
  }
  return new Response(JSON.stringify({ query: {
    normalized: [{ from: "File:Pub_A.jpg", to: "File:Pub A.jpg" }],
    pages: {
      "11": { title: "File:Pub A.jpg", imageinfo: [{ thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Pub_A.jpg/800px-Pub_A.jpg", url: "https://upload.wikimedia.org/x", descriptionurl: "https://commons.wikimedia.org/wiki/File:Pub_A.jpg", extmetadata: meta("CC BY-SA 4.0") }] },
      "12": { title: "File:Pub from wikidata.jpg", imageinfo: [{ thumburl: "https://upload.wikimedia.org/wd.jpg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Pub_from_wikidata.jpg", extmetadata: meta("Public domain") }] },
      "13": { title: "File:Pub NC.jpg", imageinfo: [{ thumburl: "https://upload.wikimedia.org/nc.jpg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Pub_NC.jpg", extmetadata: meta("CC BY-NC-SA 2.0") }] },
      "-1": { title: "File:Missing.jpg", missing: "" },
    },
  } }));
}) as unknown as typeof fetch;

const added = await attachWikimediaPhotos(pubs as never, els, fakeFetch);
assert.equal(added, 2, "A (direct) and B (via Wikidata); NC and missing skipped");
const a = pubs[0]!.info.photo as Record<string, string>;
assert.equal(a.author, "Jo Bloggs", "HTML stripped from author");
assert.equal(a.licence, "CC BY-SA 4.0");
assert.match(a.url, /800px-Pub_A\.jpg$/);
assert.equal((pubs[1]!.info.photo as Record<string, string>).licence, "Public domain");
assert.equal(pubs[2]!.info.photo, undefined, "non-commercial licence rejected");
assert.equal(pubs[3]!.info.photo, undefined, "missing file skipped");
assert.equal(calls.length, 2, "one Wikidata call and one Commons call");

// Failures never break an import
const n = await attachWikimediaPhotos(pubs as never, els, (async () => new Response("down", { status: 503 })) as never);
assert.equal(n, 0);
console.log("wikimedia tests passed");
