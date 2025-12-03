/* Service Worker for Puzzle Lab PWA */
/* eslint-disable no-restricted-globals */
const SW_VERSION = "v1.2.0"; // bumped for dynamic asset loading
const STATIC_CACHE = `puzzle-static-${SW_VERSION}`;
const MANIFEST_CACHE = `puzzle-manifest-${SW_VERSION}`;

// BASE will be set dynamically from asset-manifest.json (always ends with /)
let BASE = "/puzzle/";

// Check and update manifest with version comparison
async function checkAndUpdateManifest() {
  try {
    // Step 1: Get cached manifest version
    const cache = await caches.open(MANIFEST_CACHE);
    const cachedResponse = await cache.match("asset-manifest.json");
    let cachedVersion = null;

    if (cachedResponse) {
      const cachedManifest = await cachedResponse.json();
      cachedVersion = cachedManifest.version;
      console.log("[SW] Cached manifest version:", cachedVersion);
    }

    // Step 2: Fetch new manifest from network (network-first)
    const response = await fetch("asset-manifest.json", { cache: "no-cache" });
    const newManifest = await response.json();
    const newVersion = newManifest.version;

    console.log("[SW] New manifest version:", newVersion);

    // Step 3: Compare versions and invalidate cache if needed
    const shouldInvalidate =
      cachedVersion !== newVersion || newVersion === "dev";

    if (shouldInvalidate) {
      console.log(
        "[SW] Version changed or dev mode detected - invalidating cache"
      );

      // Delete all caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith("puzzle-"))
          .map((name) => {
            console.log("[SW] Deleting cache:", name);
            return caches.delete(name);
          })
      );

      // Recreate manifest cache with new version
      const newCache = await caches.open(MANIFEST_CACHE);
      await newCache.put(
        "asset-manifest.json",
        new Response(JSON.stringify(newManifest))
      );

      console.log("[SW] Cache invalidated, new manifest cached");
    } else {
      console.log("[SW] Version unchanged - keeping existing cache");

      // Update manifest cache even if version is same (might have other changes)
      await cache.put(
        "asset-manifest.json",
        new Response(JSON.stringify(newManifest))
      );
    }

    return { manifest: newManifest, cacheInvalidated: shouldInvalidate };
  } catch (error) {
    console.warn("[SW] Failed to check manifest version:", error);

    // Try to load from cache as fallback
    const cache = await caches.open(MANIFEST_CACHE);
    const cachedResponse = await cache.match("asset-manifest.json");

    if (cachedResponse) {
      const manifest = await cachedResponse.json();
      return { manifest, cacheInvalidated: false };
    }

    throw error;
  }
}

// Load manifest and get base path + hashed assets
async function loadAssetManifest() {
  try {
    // Check version and get manifest
    const { manifest, cacheInvalidated } = await checkAndUpdateManifest();

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
    Promise.all([
      // Check for manifest updates and invalidate cache if needed
      checkAndUpdateManifest().catch((err) => {
        console.warn("[SW] Failed to check manifest on activate:", err);
      }),
      // Clean up old static caches
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("puzzle-static-") && k !== STATIC_CACHE)
            .map((k) => {
              console.log("[SW] Removing old static cache:", k);
              return caches.delete(k);
            })
        )
      ),
    ]).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", function (event) {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle GET
  if (request.method !== "GET") return;

  // Create URL without query parameters for cache matching
  const urlWithoutParams = url.origin + url.pathname;

  // Special handling for asset-manifest.json: network-first with version checking
  if (
    url.pathname.endsWith("/asset-manifest.json") ||
    url.pathname === `${BASE}asset-manifest.json`
  ) {
    event.respondWith(
      checkAndUpdateManifest()
        .then(({ manifest }) => {
          return new Response(JSON.stringify(manifest), {
            headers: { "Content-Type": "application/json" },
          });
        })
        .catch(function (err) {
          console.error("[SW] Failed to fetch manifest:", err);
          // Fallback to cached version
          return caches.match("asset-manifest.json", {
            cacheName: MANIFEST_CACHE,
          });
        })
    );
    return;
  }

  // Special handling for index.html: check manifest version, then try network first, cache as fallback
  if (url.pathname === BASE || url.pathname === `${BASE}index.html`) {
    event.respondWith(
      // Check manifest version before serving index.html
      checkAndUpdateManifest()
        .then(function () {
          // After version check, fetch fresh index.html
          return fetch(request);
        })
        .then(function (resp) {
          // Update cache with fresh version (without params)
          const copy = resp.clone();
          caches.open(STATIC_CACHE).then(function (cache) {
            cache.put(urlWithoutParams, copy);
          });
          return resp;
        })
        .catch(function (err) {
          console.warn("[SW] Failed to fetch index.html, using cache:", err);
          return caches.match(urlWithoutParams);
        })
    );
    return;
  }

  // Cache-first strategy for all same-origin assets (ignore URL parameters)
  if (url.origin === location.origin) {
    event.respondWith(
      caches
        .match(urlWithoutParams, { ignoreSearch: true })
        .then(function (cached) {
          return (
            cached ||
            fetch(request).then(function (resp) {
              // Cache dynamically if successful (without params)
              if (resp.status === 200) {
                const copy = resp.clone();
                caches.open(STATIC_CACHE).then(function (cache) {
                  cache.put(urlWithoutParams, copy);
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
