/* Service worker for reading-materials PWA */

var CACHE_NAME = 'reading-v1';
var STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/terminal.css',
  '/js/app.js',
  '/manifest.json'
];

/* Cache static assets on install */
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

/* Clean old caches on activate */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names
          .filter(function (name) { return name !== CACHE_NAME; })
          .map(function (name) { return caches.delete(name); })
      );
    })
  );
  self.clients.claim();
});

/* Network-first for API calls, cache-first for static assets */
self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);

  /* Never cache API calls or Firebase SDK */
  if (url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/__/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      var fetched = fetch(event.request).then(function (response) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, copy);
        });
        return response;
      }).catch(function () {
        return cached;
      });
      return cached || fetched;
    })
  );
});
