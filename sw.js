// The phone app's offline helper (only registered in the published, standalone copy).
// It keeps a copy of every app file so the planner opens with no connection, and when a new
// version is published it downloads it in the background; the page then swaps it in when
// she isn't in the middle of something. publish.ps1 stamps BUILD and FILES.
const BUILD = "20261019-072551";
const FILES = ["./", "animals.js", "app.js", "checkin.js", "config.js", "fitness.js", "focus.js", "funfacts.js", "google.js", "health.js", "holidays.js", "home.js", "icon-512.png", "icon-maskable.png", "icon.png", "index.html", "manifest.webmanifest", "microsoft.js", "phone.js", "phoneapi.js", "recap.js", "signin.js", "store.js", "style.css", "themes.css", "themes.js", "todo.js", "wellness.js", "animals/husky.json", "animals/parrot.json", "syncs/drive.js", "syncs/gcal.js", "syncs/google-auth.js", "syncs/merge.js", "syncs/mstodo.js", "syncs/phoneapp.js", "syncs/tz.js", "vendor/lottie.min.js"];
const CACHE = "arp-" + BUILD;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" })))));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

// The page says when it's a good moment to switch to the new version.
self.addEventListener("message", e => { if (e.data === "update") self.skipWaiting(); });

self.addEventListener("fetch", e => {
  const req = e.request;
  // Only the app's own files. Google, Microsoft and Drive calls go straight to the network.
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Sign-ins come back as "./?code=…": that's still the app page.
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch {
      return req.mode === "navigate" ? (await cache.match("./")) || Response.error() : Response.error();
    }
  })());
});
