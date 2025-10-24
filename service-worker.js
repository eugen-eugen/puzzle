/* Service Worker for Puzzle Lab PWA */
/* eslint-disable no-restricted-globals */
const SW_VERSION = "v1.0.0";
const STATIC_CACHE = `puzzle-static-${SW_VERSION}`;
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/css/main.css",
  "/css/piece-box.css",
  "/css/animations.css",
  "/css/game-table.css",
  "/js/app.js",
  "/js/gameEngine.js",
  "/js/jigsawGenerator.js",
  "/js/pieceRenderer.js",
  "/js/pieceRendererWorker.js",
  "/js/connectionManager.js",
  "/js/spatialIndex.js",
  "/js/persistence.js",
  "/js/imageProcessor.js",
  "/js/windowManager.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("puzzle-static-") && k !== STATIC_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET
  if (request.method !== "GET") return;

  // Strategy: Cache-first for same-origin static assets; network-first for images user loads.
  const isStatic = CORE_ASSETS.includes(url.pathname);
  if (isStatic) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request)
            .then((resp) => {
              // Refresh cache in background (stale-while-revalidate lite)
              const copy = resp.clone();
              caches
                .open(STATIC_CACHE)
                .then((cache) => cache.put(request, copy));
              return resp;
            })
            .catch(() => cached)
      )
    );
    return;
  }

  // For other same-origin requests: try network then cache fallback
  if (url.origin === location.origin) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  // Cross-origin: just go to network (could be refined)
});
