self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((clients) =>
        clients.forEach((client) => {
          client.postMessage({ type: "APP_UPDATED" });
        }),
      ),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(fetch(event.request));
});
