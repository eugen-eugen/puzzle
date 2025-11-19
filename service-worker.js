/* Service Worker for Puzzle Lab PWA */
/* eslint-disable no-restricted-globals */
const SW_VERSION = "v1.1.0"; // bumped for i18n assets
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
  "/js/game-engine.js",
  "/js/jigsaw-generator.js",
  "/js/piece-renderer.js",
  "/js/connection-manager.js",
  "/js/spatial-index.js",
  "/js/persistence.js",
  "/js/image-processor.js",
  "/js/i18n.js",
  "/i18n/en.json",
  "/i18n/de.json",
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

  // Special handling for index.html: always try network first, cache as fallback
  if (url.pathname === "/" || url.pathname === "/index.html") {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          // Update cache with fresh version
          const copy = resp.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          return resp;
        })
        .catch(() => caches.match(request)) // Fallback to cache if network fails
    );
    return;
  }

  // Strategy: Cache-first for other same-origin static assets; network-first for images user loads.
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
