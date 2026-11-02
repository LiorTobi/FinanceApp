const CACHE_VERSION = 'my-money-shell-v1.0.6';
const APP_SHELL = [
  './', './index.html', './styles.css?v=1.0.6', './manifest.webmanifest', './assets/icon.svg', './assets/icon-192.png', './assets/icon-512.png',
  './assets/icon-maskable-512.png', './assets/apple-touch-icon.png', './js/constants.js', './js/utils.js', './js/finance.js', './js/db.js', './js/charts.js?v=1.0.6', './js/app.js?v=1.0.6'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => { const copy = response.clone(); caches.open(CACHE_VERSION).then(cache => cache.put('./index.html', copy)); return response; }).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_VERSION).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request)));
});
