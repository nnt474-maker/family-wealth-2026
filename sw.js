const CACHE_NAME = "family-wealth-2026-v7.7-cloud-sync";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icon.svg"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // Never intercept POST/PUT/DELETE or external API / Local API calls
  if (
    event.request.method !== "GET" ||
    url.includes("script.google.com") ||
    url.includes("script.googleusercontent.com") ||
    url.includes("generativelanguage.googleapis.com") ||
    url.includes("api.anthropic.com") ||
    url.includes("/api/")
  ) {
    return;
  }

  // Network-First strategy for all app & data files so Web and App are always in sync when online,
  // with seamless offline fallback to Cache when offline.
  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => cached || caches.match("./index.html"))
      )
  );
});
