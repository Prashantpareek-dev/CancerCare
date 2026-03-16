const STATIC_CACHE = 'cancer-static-v2';
const DOC_CACHE = 'cancer-doc-v2';
const IMAGE_CACHE = 'cancer-image-v2';
const ASSET_CACHE = 'cancer-asset-v2';

const CORE_ASSETS = [
  './',
  './index.html',
  './ThankYou.html'
];

const MAX_ENTRIES = {
  [DOC_CACHE]: 20,
  [IMAGE_CACHE]: 120,
  [ASSET_CACHE]: 60
};

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) {
    return;
  }
  const deleteCount = keys.length - maxEntries;
  await Promise.all(keys.slice(0, deleteCount).map(key => cache.delete(key)));
}

function resolveCacheName(destination) {
  if (destination === 'document') return DOC_CACHE;
  if (destination === 'image') return IMAGE_CACHE;
  return ASSET_CACHE;
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      const validCaches = [STATIC_CACHE, DOC_CACHE, IMAGE_CACHE, ASSET_CACHE];
      return Promise.all(keys.filter(key => !validCaches.includes(key)).map(key => caches.delete(key)));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (!sameOrigin) {
    return;
  }

  const cacheableDestinations = ['document', 'image', 'style', 'script', 'font'];
  if (!cacheableDestinations.includes(request.destination)) {
    return;
  }

  const runtimeCacheName = resolveCacheName(request.destination);

  event.respondWith(
    caches.open(runtimeCacheName).then(async runtimeCache => {
      const cachedResponse = await runtimeCache.match(request) || await caches.match(request);

      const networkFetch = fetch(request)
        .then(async networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            await runtimeCache.put(request, networkResponse.clone());
            const maxEntries = MAX_ENTRIES[runtimeCacheName];
            if (maxEntries) {
              await trimCache(runtimeCacheName, maxEntries);
            }
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkFetch;
    })
  );
});
