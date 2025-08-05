const CACHE_NAME = 'trueman-cache-v1';

const ASSETS_TO_CACHE = [
  '/', // May need adjusting if site is in subdir
  '/index.html',
  '/assets/js/app.js',
  '/assets/css/style.css',
  '/assets/TrueManLogo.jpg',
  '/assets/TrueManLogoDark.jpg',
  '/assets/favicon.png',
  '/assets/pages/connect.html',
  '/assets/pages/control.html',
  '/assets/pages/console.html',
  '/assets/pages/dashboard.html',
    '/assets/pages/modbus/stencil.html',
  '/manifest.json',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js'
];

// Install and pre-cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
  self.skipWaiting();
});

// Serve cached files
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then((cached) => {
        return cached || fetch(event.request);
      })
      .catch(() => {
        //offline fallback logic here

      })
  );
});

// Cleanup old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME)
              .map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});
