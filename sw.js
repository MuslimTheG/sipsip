// sw.js — SipSip Service Worker (GitHub Pages friendly)
const CACHE = "sipsip-v8"; // bump when assets change

// Only files that definitely exist at https://muslimtheg.github.io/sipsip/
const ASSETS = [
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/192.png",
  "./icons/512.png"
];

// Install — cache core assets individually (more resilient)
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const url of ASSETS) {
      try { await cache.add(url); } catch (err) { /* ignore missing */ }
    }
  })());
});

// Activate — delete old caches
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
  })());
  self.clients.claim();
});

// Fetch — cache-first for navigations to avoid GitHub Pages 404
self.addEventListener("fetch", (event) => {
  const req = event.request;

  const isNavigation =
    req.mode === "navigate" ||
    (req.method === "GET" && req.headers.get("accept")?.includes("text/html"));

  if (isNavigation) {
    event.respondWith((async () => {
      // Serve cached index first; if not cached yet, try network.
      const cached = await caches.match("./index.html");
      try {
        const netRes = await fetch(req);
        // If GitHub Pages returns a 404 for subpath weirdness, fall back to cached index.
        if (!netRes || netRes.status === 404) return cached || netRes;
        return netRes;
      } catch {
        return cached || Response.error();
      }
    })());
    return;
  }

  // Non-navigation: cache-first
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});