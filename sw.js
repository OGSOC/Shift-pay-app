const CACHE_NAME = 'shift-pay-v1';
// Relative (no leading slash) - resolved against this script's own URL,
// so this works whether the app sits at a domain root or, as on GitHub
// Pages for a project repo, at a subpath like /Shift-pay-app/. An
// absolute, '/'-prefixed path here would silently resolve to the wrong
// place in that second case.
const SHELL_FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/dateutils.js',
  './js/config.js',
  './js/bankHolidays.js',
  './js/ukTax.js',
  './js/localStore.js',
  './js/shiftSchedule.js',
  './js/payCalc.js',
  './js/app.js',
  './js/native.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first everywhere: always prefer a fresh response so a push to
// GitHub Pages reaches the app immediately, falling back to the cache
// only when there's no network - which is the actual point of a service
// worker for a fully static, no-backend app like this one: it keeps
// working (read-only for anything not yet cached, fully for anything
// that is) with no connection at all, not just fast-but-always-online.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
