importScripts('https://storage.googleapis.com/workbox-cdn/releases/4.3.1/workbox-sw.js');

if (workbox) {
  workbox.setConfig({ debug: false });

  workbox.precaching.precacheAndRoute([]);
  workbox.precaching.cleanupOutdatedCaches();

  workbox.routing.registerRoute(
    ({ request }) => request.destination === 'document',
    new workbox.strategies.NetworkFirst({
      cacheName: 'mir-sinn-pages',
    }),
  );

  workbox.routing.registerRoute(
    ({ request }) =>
      ['style', 'script', 'worker'].includes(request.destination),
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'mir-sinn-assets',
    }),
  );

  workbox.routing.registerRoute(
    ({ request }) => request.destination === 'image',
    new workbox.strategies.CacheFirst({
      cacheName: 'mir-sinn-images',
      plugins: [
        new workbox.cacheableResponse.Plugin({ statuses: [0, 200] }),
        new workbox.expiration.Plugin({
          maxEntries: 60,
          maxAgeSeconds: 30 * 24 * 60 * 60,
        }),
      ],
    }),
  );
}

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
