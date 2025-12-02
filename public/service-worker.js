/* Service Worker for Puzzle Lab PWA */
/* eslint-disable no-restricted-globals */
const SW_VERSION = "v1.2.0"; // bumped for dynamic asset loading
const STATIC_CACHE = `puzzle-static-${SW_VERSION}`;

// BASE will be set dynamically from asset-manifest.json (always ends with /)
let BASE = "/puzzle/";

// Load manifest and get base path + hashed assets
async function loadAssetManifest() {
  try {
    // Try to fetch from current base first
    const response = await fetch(`asset-manifest.json`);
    const manifest = await response.json();

    // Update BASE from manifest (already has trailing slash)
    if (manifest.base) {
      BASE = manifest.base;
    }

    // Build static assets list with correct base (BASE already ends with /)
    const staticAssets = [
      BASE,
      `${BASE}index.html`,
      `${BASE}manifest.json`,
      // i18n translations
      `${BASE}i18n/en.json`,
      `${BASE}i18n/de.json`,
      `${BASE}i18n/ru.json`,
      `${BASE}i18n/ua.json`,
      // Pictures folder assets
      `${BASE}pictures/A320.jpg`,
      `${BASE}pictures/kleidung.png`,
      `${BASE}pictures/pictures.json`,
      `${BASE}pictures/remote-pictures.json`,
    ];

    // Build hashed assets list
    const hashedAssets = [];

    // Add all JS files
    if (manifest.assets && manifest.assets.js) {
      manifest.assets.js.forEach(function (file) {
        hashedAssets.push(`${BASE}assets/${file}`);
      });
    }

    // Add all CSS files
    if (manifest.assets && manifest.assets.css) {
      manifest.assets.css.forEach(function (file) {
        hashedAssets.push(`${BASE}assets/${file}`);
      });
    }

    return {
      base: BASE,
      allAssets: staticAssets.concat(hashedAssets),
    };
  } catch (e) {
    console.warn("Could not load asset-manifest.json", e);
    return {
      base: BASE,
      allAssets: [],
    };
  }
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    loadAssetManifest()
      .then(function (manifestData) {
        BASE = manifestData.base;
        console.log("Service Worker installing with base:", BASE);
        console.log("Prefetching", manifestData.allAssets.length, "assets...");

        return caches.open(STATIC_CACHE).then(function (cache) {
          // Prefetch all assets in parallel during install
          return cache.addAll(manifestData.allAssets).then(function () {
            console.log("All assets prefetched and cached successfully");
          });
        });
      })
      .then(function () {
        console.log("Service Worker installed, activating...");
        return self.skipWaiting();
      })
      .catch(function (error) {
        console.error("Service Worker install failed:", error);
        throw error;
      })
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

self.addEventListener("fetch", function (event) {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle GET
  if (request.method !== "GET") return;

  // Special handling for index.html: always try network first, cache as fallback
  if (url.pathname === BASE || url.pathname === `${BASE}index.html`) {
    event.respondWith(
      fetch(request)
        .then(function (resp) {
          // Update cache with fresh version
          const copy = resp.clone();
          caches.open(STATIC_CACHE).then(function (cache) {
            cache.put(request, copy);
          });
          return resp;
        })
        .catch(function () {
          return caches.match(request);
        })
    );
    return;
  }

  // Cache-first strategy for all same-origin assets
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(request).then(function (cached) {
        return (
          cached ||
          fetch(request).then(function (resp) {
            // Cache dynamically if successful
            if (resp.status === 200) {
              const copy = resp.clone();
              caches.open(STATIC_CACHE).then(function (cache) {
                cache.put(request, copy);
              });
            }
            return resp;
          })
        );
      })
    );
    return;
  }

  // Cross-origin: just go to network
});
