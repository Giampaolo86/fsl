const CACHE = "fsl-shell-v27";
const SHELL = ["/manifest.json", "/icon.svg", "/brand/logo.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("push", (e) => {
  let d = { title: "Future Stars League", body: "Novità dal campo", url: "/" };
  try { d = { ...d, ...(e.data ? e.data.json() : {}) }; } catch { /* payload testuale */ }
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: "/brand/logo.png", badge: "/brand/logo.png", tag: d.tag || undefined, renotify: !!d.tag, data: { url: d.url || "/" } }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || "/", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ws) => {
    const w = ws.find((x) => x.url.startsWith(self.location.origin));
    if (w) { w.focus(); return w.navigate ? w.navigate(target) : null; }
    return self.clients.openWindow(target);
  }));
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
