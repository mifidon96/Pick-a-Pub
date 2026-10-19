// Pick-a-Pub service worker: makes the site installable and usable offline.
//
// Rules, so a deploy is never hidden behind an old copy:
//   - Pages: network first. The cache is only used when offline.
//   - /_next/static/: cache first. Filenames change every build, so never stale.
//   - Photos (/public/...): cache, refreshed in the background.
//   - Everything else (API, sign-in, other sites): not touched at all.
//
// Emergency off switch: replace this whole file with sw-kill.js and deploy.
const VERSION = "v1";
const PAGES = `pages-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const PHOTOS = `photos-${VERSION}`;
const OFFLINE = "/offline/";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.addAll([OFFLINE, "/"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  const keep = [PAGES, ASSETS, PHOTOS];
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) ?? (await cache.match(OFFLINE)) ?? Response.error();
  }
}

async function cacheFirst(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  const fresh = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => hit);
  return hit ?? fresh;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API, Cognito, map tiles: straight to the network
  if (url.pathname.startsWith("/auth/")) return;    // sign-in callback must never come from a cache

  if (req.mode === "navigate") event.respondWith(networkFirst(req));
  else if (url.pathname.startsWith("/_next/static/")) event.respondWith(cacheFirst(req, ASSETS));
  else if (url.pathname.startsWith("/public/") || url.pathname.startsWith("/icons/")) event.respondWith(staleWhileRevalidate(req, PHOTOS));
});
