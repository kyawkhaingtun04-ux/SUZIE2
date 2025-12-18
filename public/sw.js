/* sw.js – SUZI PWA Service Worker */

const CACHE_NAME = "suzi-cache-v1";

/* Files safe to cache */
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./sw.js",
  "./suzi-profile.png"
];

/* =========================
   INSTALL
========================= */
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

/* =========================
   ACTIVATE
========================= */
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* =========================
   FETCH (VERY IMPORTANT)
========================= */
self.addEventListener("fetch", event => {
  const req = event.request;

  // 🚫 DO NOT cache API calls
  if (
    req.url.includes("/api/") ||
    req.url.includes("firebase") ||
    req.url.includes("googleapis") ||
    req.url.includes("onrender.com")
  ) {
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      return (
        cached ||
        fetch(req).then(res => {
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(req, res.clone());
            return res;
          });
        })
      );
    })
  );
});