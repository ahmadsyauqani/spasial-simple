const CACHE_NAME = "sakagis-v2";
const APP_SHELL = ["/", "/manifest.json", "/logo-sakagis.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isTileRequest = url.pathname.includes("/main/wms/") ||
    url.hostname.includes("basemap") ||
    url.hostname.includes("tile") ||
    url.hostname.includes("cartocdn") ||
    url.hostname.includes("openstreetmap");

  // Never intercept Supabase, API, fonts, or arbitrary third-party requests.
  // Let the browser handle them normally so authentication and data loading
  // cannot be served from an unrelated cache entry.
  if (!isSameOrigin && !isTileRequest) return;

  // Navigations: network-first, fallback to cached shell (offline app load)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("/")))
    );
    return;
  }

  // Tiles & images: network-first, fallback to cache (offline basemap)
  if (url.pathname.match(/\.(png|jpe?g|webp|gif|svg)$/i) || isTileRequest) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && (response.ok || response.type === "opaque")) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Static assets (JS/CSS/fonts): stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
