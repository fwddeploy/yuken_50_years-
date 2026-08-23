export function renderServiceWorker(releaseId: string) {
  const release = releaseId.replace(/[^a-zA-Z0-9._-]/gu, "-");
  return `const CACHE = ${JSON.stringify(`yil-event-shell-${release}`)};
const SHELL = ["/", "/offline", "/manifest.webmanifest", "/favicon.svg", "/icon-192.png", "/icon-512.png", "/yuken-50-badge.webp"];
self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))); });
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("yil-event-shell-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener("message", event => { if (event.data?.type === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("fetch", event => {
  const request = event.request; const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") { event.respondWith(fetch(request).catch(async () => (url.pathname === "/" ? (await caches.match("/")) ?? (await caches.match("/offline")) : await caches.match("/offline")))); return; }
  if (url.pathname.startsWith("/_next/static/") || ["/favicon.svg", "/icon-192.png", "/icon-512.png", "/yuken-50-badge.webp", "/invitation-card.jpg"].includes(url.pathname)) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(request, copy)); return response; })));
  }
});\n`;
}
