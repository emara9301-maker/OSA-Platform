// Offline reading for families and students. Pages in OFFLINE_PAGES are kept from the last time they loaded.
// Payments, bookings and changes always need the network. Sign-out clears the saved pages (see sign-out form).
const PAGES = "osa-pages-v1";
const STATIC = "osa-static-v2";
const OFFLINE_PAGES = ["/portal", "/me", "/card"];
const OFFLINE_FALLBACK = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((cache) => cache.add(OFFLINE_FALLBACK)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // Network first, so a changed stylesheet or script is never replaced by an old copy. The saved copy is used offline.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(networkFirst(request, request, STATIC));
    return;
  }

  if (OFFLINE_PAGES.includes(url.pathname)) {
    const isRsc = request.headers.has("RSC");
    event.respondWith(networkFirst(request, savedKey(url.pathname, isRsc), PAGES));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_FALLBACK)));
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "clear-offline") {
    event.waitUntil(caches.delete(PAGES));
  }
});

function savedKey(pathname, isRsc) {
  return new Request(`${self.location.origin}/__saved${pathname}${isRsc ? "--rsc" : ""}`);
}

async function networkFirst(request, key, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      await cache.put(key, response.clone());
    }
    return response;
  } catch {
    const saved = await caches.match(key);
    if (saved) {
      return saved;
    }
    return caches.match(OFFLINE_FALLBACK);
  }
}
