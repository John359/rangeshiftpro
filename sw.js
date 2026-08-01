const CACHE = 'rangeshiftpro-v2';
const ASSETS = [
  '/rangeshiftpro/',
  '/rangeshiftpro/index.html',
  '/rangeshiftpro/manifest.json',
  '/rangeshiftpro/icon-192.png',
  '/rangeshiftpro/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('binance.com')) {
    e.respondWith(fetch(e.request).catch(() =>
      new Response('{"error":"offline"}', { headers: { 'Content-Type': 'application/json' } })
    ));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
      const clone = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return resp;
    }))
  );
});

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(data.title || 'RangeShift Alert', {
    body: data.body || 'New range shift detected',
    icon: '/rangeshiftpro/icon-192.png',
    badge: '/rangeshiftpro/icon-192.png',
    vibrate: [200, 100, 200],
    tag: 'range-alert',
    renotify: true
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/rangeshiftpro/'));
});
