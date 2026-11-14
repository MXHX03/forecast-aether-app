/**
 * Aether service worker.
 * Shell: cache-first (instant repeat loads). Data: network-first with a
 * short-lived cache fallback so the app still renders on a dead connection.
 */

const VERSION = 'aether-v1';
const SHELL = `${VERSION}-shell`;
const DATA  = `${VERSION}-data`;

const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './css/style.css',
  './js/main.js', './js/api.js', './js/render.js', './js/store.js',
  './js/sky.js', './js/format.js', './js/wmo.js',
  './font/Rimouski.css', './font/rimouski_sb-webfont.woff2',
  './icons/unknown.png', './icons/01d.png', './icons/01n.png',
  './icons/02d.png', './icons/02n.png', './icons/03d.png', './icons/03n.png',
  './icons/04d.png', './icons/04n.png', './icons/09d.png', './icons/09n.png',
  './icons/10d.png', './icons/10n.png', './icons/11d.png', './icons/11n.png',
  './icons/13d.png', './icons/13n.png', './icons/50d.png', './icons/50n.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL)
      // addAll is all-or-nothing; tolerate one missing asset
      .then(c => Promise.allSettled(ASSETS.map(a => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL && k !== DATA).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isApi = /open-meteo\.com$/.test(url.hostname);

  if (isApi) {
    e.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone();
          caches.open(DATA).then(c => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(request).then(hit => hit ?? Response.error()))
    );
    return;
  }

  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.match(request).then(hit => {
      if (hit) {
        // refresh in the background for next time
        fetch(request)
          .then(res => caches.open(SHELL).then(c => c.put(request, res)))
          .catch(() => {});
        return hit;
      }
      return fetch(request).catch(() =>
        request.mode === 'navigate' ? caches.match('./index.html') : Response.error()
      );
    })
  );
});
