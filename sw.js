// The phone app's offline helper (only registered in the published, standalone copy).
// It keeps a copy of every app file so the planner opens with no connection, and when a new
// version is published it downloads it in the background; the page then swaps it in when
// she isn't in the middle of something. publish.ps1 stamps BUILD and FILES.
const BUILD = "20261028-074533";
const FILES = ["./", "adventure-worlds.js", "adventure.js", "animals.js", "app.js", "assistant.js", "awards.js", "breather.js", "care.js", "checkin.js", "config.js", "emotions.js", "fidgets.js", "fitness.js", "focus.js", "funfacts.js", "game.js", "google.js", "health.js", "holidays.js", "home.js", "icon-512.png", "icon-maskable.png", "icon.png", "index.html", "joy.js", "logan.js", "manifest.webmanifest", "microsoft.js", "phone.js", "phoneapi.js", "privacy.html", "recap.js", "signin.js", "sounds.js", "store.js", "style.css", "terms.html", "themes.css", "themes.js", "todo.js", "wellness.js", "workhelp.js", "animals/husky.json", "animals/parrot.json", "chaos-icons/chaos-0.png", "chaos-icons/chaos-1.png", "chaos-icons/chaos-2.png", "chaos-icons/chaos-3.png", "chaos-icons/chaos-4.png", "molly/molly-1.webp", "molly/molly-10.webp", "molly/molly-11.webp", "molly/molly-2.webp", "molly/molly-3.webp", "molly/molly-4.webp", "molly/molly-5.webp", "molly/molly-6.webp", "molly/molly-7.webp", "molly/molly-8.webp", "molly/molly-9.webp", "ori/ori-1.webp", "ori/ori-10.webp", "ori/ori-11.webp", "ori/ori-12.webp", "ori/ori-13.webp", "ori/ori-14.webp", "ori/ori-15.webp", "ori/ori-16.webp", "ori/ori-17.webp", "ori/ori-18.webp", "ori/ori-19.webp", "ori/ori-2.webp", "ori/ori-20.webp", "ori/ori-21.webp", "ori/ori-22.webp", "ori/ori-23.webp", "ori/ori-24.webp", "ori/ori-25.webp", "ori/ori-26.webp", "ori/ori-27.webp", "ori/ori-28.webp", "ori/ori-29.webp", "ori/ori-3.webp", "ori/ori-30.webp", "ori/ori-31.webp", "ori/ori-32.webp", "ori/ori-33.webp", "ori/ori-34.webp", "ori/ori-35.webp", "ori/ori-36.webp", "ori/ori-37.webp", "ori/ori-38.webp", "ori/ori-39.webp", "ori/ori-4.webp", "ori/ori-40.webp", "ori/ori-5.webp", "ori/ori-6.webp", "ori/ori-7.webp", "ori/ori-8.webp", "ori/ori-9.webp", "syncs/drive.js", "syncs/gcal.js", "syncs/google-auth.js", "syncs/merge.js", "syncs/mstodo.js", "syncs/phoneapp.js", "syncs/tz.js", "vendor/lottie.min.js"];
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

// Tapping a calm-timer notice opens the planner.
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (all.length) return all[0].focus();
    return self.clients.openWindow("./");
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
