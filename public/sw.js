// ============================================================
// /public/sw.js — Service worker para PWA
// Cache básico: arranca offline aunque no haya conexión
// ============================================================

const VERSION = 'lente-v1';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/config.js',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nunca cacheamos las llamadas a la API de Supabase/backend
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase')) {
    return;
  }

  // Estrategia cache-first para assets estáticos
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        // Guardamos en caché en segundo plano
        const copy = response.clone();
        caches.open(VERSION).then(cache => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match('/'));
    })
  );
});
