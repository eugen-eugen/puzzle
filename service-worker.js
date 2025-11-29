/* Service Worker for Puzzle Lab PWA */
/* eslint-disable no-restricted-globals */
const SW_VERSION = "v1.1.0"; // bumped for i18n assets
const STATIC_CACHE = `puzzle-static-${SW_VERSION}`;
const BASE = "/puzzle";
const CORE_ASSETS = [
  `${BASE}/`,
  `${BASE}/index.html`,
  `${BASE}/manifest.json`,
  `${BASE}/css/main.css`,
  `${BASE}/css/piece-box.css`,
  `${BASE}/css/animations.css`,
  `${BASE}/css/game-table.css`,
  `${BASE}/js/app.js`,
  `${BASE}/js/game-engine.js`,
  `${BASE}/js/jigsaw-generator.js`,
  `${BASE}/js/piece-renderer.js`,
  `${BASE}/js/connection-manager.js`,
  `${BASE}/js/spatial-index.js`,
  `${BASE}/js/persistence.js`,
  `${BASE}/js/image-processor.js`,
  `${BASE}/js/i18n.js`,
  `${BASE}/i18n/en.json`,
  `${BASE}/i18n/de.json`,
  // Pictures folder assets
  `${BASE}/pictures/A320.jpg`,
  `${BASE}/pictures/kleidung.png`,
  `${BASE}/pictures/pictures.json`,
  `${BASE}/pictures/remote-pictures.json`,
  `${BASE}/pictures/icon-192.png`,
  `${BASE}/pictures/icon-512.png`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => {
        cache.addAll(CORE_ASSETS);
      })
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
