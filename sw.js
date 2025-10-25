// sw.js — SipSip Service Worker
const CACHE = "sipsip-v5";

// Core files to cache
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest"
];
// Install event — cache everything
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
});

// Activate event — remove old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch event — serve cached content when offline
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Serve index.html for navigation requests (refresh / direct URL)
  const isNavigation =
    req.mode === "navigate" ||
    (req.method === "GET" && req.headers.get("accept")?.includes("text/html"));

  if (isNavigation) {
    event.respondWith(
      caches.match("./index.html").then((cached) => cached || fetch(req))
    );
    return;
  }

  // Cache-first strategy for everything else
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});