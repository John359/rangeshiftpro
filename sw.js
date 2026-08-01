// v3 - force clear all old caches
const CACHE = 'coinwatch-v3';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => {
        console.log('Deleting cache:', k);
        return caches.delete(k);
      }))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Binance API - always network
  if (e.request.url.includes('binance.com')) {
    e.respondWith(fetch(e.request).catch(() =>
      new Response('{"error":"offline"}', { headers: { 'Content-Type': 'application/json' } })
    ));
    return;
  }
  // Everything else - network first, no caching
  e.respondWith(
    fetch(e.request).then(resp => resp).catch(() => caches.match(e.request))
  );
});

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(data.title || 'CoinWatch Alert', {
    body: data.body || 'New signal detected',
    icon: '/rangeshiftpro/icon-192.png',
    badge: '/rangeshiftpro/icon-192.png',
    vibrate: [200, 100, 200],
    tag: 'coinwatch-alert',
    renotify: true
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/rangeshiftpro/'));
});
