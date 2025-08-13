// sw.js
const VERSION = 'v1.0.0';
const STATIC = `static-${VERSION}`;

self.addEventListener('install', (event) => {
  const basePath = new URL(self.registration.scope).pathname.replace(/\/$/, '');
  event.waitUntil(
    caches.open(STATIC).then((c) => c.addAll([
      `${basePath}/`,
      `${basePath}/index.html`
    ]).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys
      .filter((k) => k.startsWith('static-') && k !== STATIC)
      .map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Navigations: network-first, fallback to cached index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const c = await caches.open(STATIC);
        const basePath = new URL(self.registration.scope).pathname.replace(/\/$/, '');
        return (await c.match(`${basePath}/index.html`)) || Response.error();
      })
    );
    return;
  }

  const url = new URL(req.url);

  // Same-origin: stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Cross-origin (CDNs): network, fall back to cache
  event.respondWith(
    fetch(req).then((res) => {
      caches.open(STATIC).then((c) => c.put(req, res.clone())).catch(() => {});
      return res;
    }).catch(() => caches.match(req))
  );
});

async function staleWhileRevalidate(req) {
  const c = await caches.open(STATIC);
  const hit = await c.match(req);
  const net = fetch(req).then((res) => {
    c.put(req, res.clone()).catch(() => {});
    return res;
  }).catch(() => hit);
  return hit || net;
}