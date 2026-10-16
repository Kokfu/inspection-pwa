// Test harness only. Cache static shell/modules, never API responses or business data.
self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith((async () => {
    const cache = await caches.open('b3-harness-static');
    try { const r = await fetch(e.request); if (r.ok) await cache.put(e.request, r.clone()); return r; }
    catch { return await cache.match(e.request) || Response.error(); }
  })());
});
