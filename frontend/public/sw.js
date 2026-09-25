const CACHE = "fsl-shell-v2";
const SHELL = ["/manifest.json", "/icon.svg", "/brand/logo.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const isAsset = (url) => url.pathname.startsWith("/static/") || /\.(png|jpe?g|webp|svg|woff2?|ico)$/.test(url.pathname);

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (e.request.mode === "navigate") {
    // HTML: sempre dalla rete; la copia in cache serve solo offline
    e.respondWith(fetch(e.request).then((res) => { caches.open(CACHE).then((c) => c.put("/", res.clone())); return res; }).catch(() => caches.match("/")));
    return;
  }
  if (isAsset(url)) {
    // asset con hash: cache-first, mai fallback HTML
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => { if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone())); return res; })));
  }
});
