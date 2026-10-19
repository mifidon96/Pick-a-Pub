// Emergency off switch for the service worker. To use it, copy this file over
// sw.js and deploy. Every browser that has the app drops its caches, removes the
// service worker and reloads, and from then on the site behaves like a plain website.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: "window" })) client.navigate(client.url);
  })());
});
