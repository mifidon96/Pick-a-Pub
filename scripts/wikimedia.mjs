// Free photos for pubs from Wikimedia Commons, found through OpenStreetMap tags:
//   wikimedia_commons=File:...   a Commons file
//   image=https://commons...     a link to a Commons file
//   wikidata=Q123                the pub's Wikidata entry, using its "image" (P18)
// Only freely licensed photos are kept, with author and licence for the credit line.
// Used by scripts/import-osm-pubs.mjs and the importer Lambda.

const UA = "pick-a-pub/0.4 (pub photo import; https://github.com/mifidon96/Pick-a-Pub)";
const BATCH = 50;
// CC0, CC BY, CC BY-SA (any version) and public domain. Not NC or ND.
const FREE = /^(cc0|cc[ -]by(-sa)?([ -]\d(\.\d)?)?(\s|$)|public domain|pd)/i;
const NOT_FREE = /\b(nc|nd)\b/i;

const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

// "File:The_bedford.jpg" -> "File:The bedford.jpg" (how the API names it)
export function normaliseTitle(name) {
  const bare = decodeURIComponent(String(name)).replace(/^(file|image):/i, "").replace(/_/g, " ").trim();
  return bare ? `File:${bare.charAt(0).toUpperCase()}${bare.slice(1)}` : null;
}

export function commonsFileFromTags(tags = {}) {
  const wc = tags.wikimedia_commons;
  if (wc && /^file:/i.test(wc)) return normaliseTitle(wc);
  const img = tags.image ?? "";
  let m = img.match(/^https?:\/\/commons\.(?:m\.)?wikimedia\.org\/wiki\/(File:[^?#]+)/i);
  if (m) return normaliseTitle(m[1]);
  m = img.match(/^https?:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/i);
  if (m) return normaliseTitle(m[1]);
  return null;
}

const stripHtml = (s) => String(s ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One API call. With retries, a "slow down" (429) or a server error waits and
// tries again: as long as Retry-After asks, or 5 s, 10 s, 15 s ... otherwise.
async function getJson(fetchFn, url, { retries = 0, pauseMs = 0 } = {}) {
  for (let attempt = 0; ; attempt++) {
    if (pauseMs) await sleep(pauseMs);
    const res = await fetchFn(url, { headers: { "user-agent": UA, "api-user-agent": UA } });
    if (res.ok) return res.json();
    const busy = res.status === 429 || res.status >= 500;
    if (!busy || attempt >= retries) throw new Error(`${new URL(url).host} returned ${res.status}`);
    const wait = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(wait) && wait > 0 ? Math.min(wait, 120) * 1000 : 5000 * (attempt + 1));
  }
}

// Adds info.photo to pubs that have a usable Commons photo. elements[i] is the
// OpenStreetMap element pubs[i] came from. Never throws: photos are a bonus.
// The monthly UK load makes hundreds of calls, so it passes { retries, pauseMs }
// to go gently; Wikimedia answers 429 to bursts. The on-demand import makes a
// few calls inside a Lambda time limit, so by default there is no waiting.
export async function attachWikimediaPhotos(pubs, elements, fetchFn = fetch, opts = {}) {
  try {
    const fileFor = new Map(); // index -> "File:..."
    const wikidataFor = new Map(); // index -> "Q123"
    elements.forEach((e, i) => {
      const f = commonsFileFromTags(e.tags);
      if (f) fileFor.set(i, f);
      else if (/^Q\d+$/.test(e.tags?.wikidata ?? "")) wikidataFor.set(i, e.tags.wikidata);
    });

    // Wikidata "image" property for pubs without a direct file
    const qids = [...new Set(wikidataFor.values())];
    const p18 = new Map();
    for (const ids of chunks(qids, BATCH)) {
      const d = await getJson(fetchFn, `https://www.wikidata.org/w/api.php?action=wbgetentities&props=claims&format=json&ids=${ids.join("|")}`, opts);
      for (const [q, ent] of Object.entries(d.entities ?? {})) {
        const v = ent?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
        if (typeof v === "string") p18.set(q, normaliseTitle(v));
      }
    }
    for (const [i, q] of wikidataFor) if (p18.get(q)) fileFor.set(i, p18.get(q));

    // Licence, author and an 800px thumbnail for each file
    const titles = [...new Set(fileFor.values())];
    const info = new Map();
    for (const batch of chunks(titles, BATCH)) {
      const d = await getJson(
        fetchFn,
        `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&titles=${encodeURIComponent(batch.join("|"))}`,
        opts,
      );
      const renamed = new Map((d.query?.normalized ?? []).map((n) => [n.to, n.from]));
      for (const page of Object.values(d.query?.pages ?? {})) {
        const ii = page?.imageinfo?.[0];
        if (!ii || page.missing !== undefined) continue;
        const meta = ii.extmetadata ?? {};
        const licence = stripHtml(meta.LicenseShortName?.value);
        if (!FREE.test(licence) || NOT_FREE.test(licence)) continue;
        const url = ii.thumburl ?? ii.url;
        if (!/^https:\/\/upload\.wikimedia\.org\//.test(url ?? "")) continue;
        const photo = {
          url,
          page: ii.descriptionurl,
          author: stripHtml(meta.Artist?.value).slice(0, 120) || "Unknown",
          licence: licence.slice(0, 40),
          licence_url: /^https?:\/\//.test(meta.LicenseUrl?.value ?? "") ? meta.LicenseUrl.value : undefined,
        };
        info.set(page.title, photo);
        if (renamed.has(page.title)) info.set(renamed.get(page.title), photo);
      }
    }

    let added = 0;
    for (const [i, title] of fileFor) {
      const photo = info.get(title);
      if (photo && pubs[i]) {
        pubs[i].info = { ...pubs[i].info, photo };
        added++;
      }
    }
    return added;
  } catch (e) {
    console.warn(`Wikimedia photos skipped: ${e.message}`);
    return 0;
  }
}
