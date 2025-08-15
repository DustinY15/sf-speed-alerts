// sw.js
const SCOPE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const V = new URL(self.location.href).searchParams.get('v') || 'v1';
const VERSION = `${V}-${SCOPE_PATH || 'root'}`;
const STATIC = `static-${VERSION}`;

self.addEventListener('install', (event) => {
  const basePath = SCOPE_PATH;
  event.waitUntil(
    caches.open(STATIC).then((c) =>
      c.addAll([`${basePath}/`, `${basePath}/index.html`]).catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('static-') && k !== STATIC)
          .map((k) => caches.delete(k))
      )
    )
  );
  // (Optional perf: enable nav preload)
  self.registration.navigationPreload?.enable?.().catch(() => {});
  self.clients.claim();
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Don’t intercept media range requests (audio/video streaming)
  if (req.headers.has('range')) {
    event.respondWith(fetch(req));
    return;
  }

  // Navigations: network-first, fallback to cached index.html
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        // If nav preload is on, prefer it
        const pre = await event.preloadResponse;
        if (pre) return pre;
      } catch {}
      try {
        return await fetch(req);
      } catch {
        const c = await caches.open(STATIC);
        const basePath = SCOPE_PATH;
        return (await c.match(`${basePath}/index.html`)) || Response.error();
      }
    })());
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
