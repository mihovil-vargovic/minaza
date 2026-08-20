// Deliberately no caching — the app always re-fetches live data by design
// (two devices, no live sync; see PROGRESS.md). This SW exists only to
// satisfy Chrome's installability requirement (a fetch handler present).
self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  event.respondWith(fetch(event.request));
});
