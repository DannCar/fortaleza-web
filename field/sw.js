/* Fortaleza Field · Service Worker
   Objetivo: que la PWA CARGUE sin conexión (app shell) sin romper la sincronización.
   - HTML / navegación: network-first  → siempre fresco con red, cae al cache si no hay.
   - CDN estático (mapbox, fonts): cache-first → la app abre offline.
   - Webhooks de n8n: NUNCA se interceptan → fallan natural y la cola IndexedDB los reintenta.
   - POST: se ignoran (la Cache API solo guarda GET).
   ⚠️ Sube el número de versión (CACHE) cada vez que cambies index.html para forzar refresco. */
const CACHE = 'fortaleza-field-v1';
const SHELL = ['./', './index.html', './manifest.json'];
const RUNTIME_HOSTS = ['api.mapbox.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // tolerante: no falla la instalación si algún recurso del shell no responde
    await Promise.allSettled(SHELL.map((u) => c.add(u)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // POST a n8n: pasa directo, lo maneja la cola IndexedDB

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // Webhooks de n8n: jamás cachear; que la red mande (y falle natural si no hay)
  if (url.hostname.includes('n8n.') || url.pathname.includes('/webhook/')) return;

  // Navegaciones / HTML: network-first con respaldo al shell cacheado
  const accept = req.headers.get('accept') || '';
  if (req.mode === 'navigate' || accept.includes('text/html')) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(CACHE);
        c.put('./index.html', fresh.clone());
        return fresh;
      } catch (_) {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // CDN estático (mapbox, fuentes): cache-first
  if (RUNTIME_HOSTS.includes(url.hostname)) {
    // Mapbox sirve librería Y tiles desde el mismo host: solo cacheamos la librería,
    // los tiles del mapa pasan directo (si no hay red, el mapa degrada con su fallback).
    if (url.hostname === 'api.mapbox.com' && !url.pathname.includes('/mapbox-gl-js/')) return;
    e.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const r = await fetch(req);
        if (r && r.ok) { const c = await caches.open(CACHE); c.put(req, r.clone()); }
        return r;
      } catch (_) { return cached || Response.error(); }
    })());
    return;
  }

  // Mismo origen (otros assets): cache-first con relleno
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const r = await fetch(req);
        if (r && r.ok) { const c = await caches.open(CACHE); c.put(req, r.clone()); }
        return r;
      } catch (_) { return cached || Response.error(); }
    })());
  }
});
