const SHELL_CACHE_NAME = 'ripple99-shell-v1';
const PRECACHE_URLS = ['/', '/favicon.svg'];

function shouldHandleSameOriginUrl(url) {
  if (url.origin !== self.location.origin) return false;
  const path = url.pathname;
  if (
    path.startsWith('/data/') ||
    path.startsWith('/api/') ||
    path.startsWith('/__/') ||
    path.startsWith('/cdn-cgi/') ||
    path === '/sw.js'
  ) {
    return false;
  }
  return true;
}

async function cacheUrlsSafely(cache, urls) {
  await Promise.allSettled(
    urls.map(async (rawUrl) => {
      try {
        const url = new URL(rawUrl, self.location.origin);
        if (!shouldHandleSameOriginUrl(url)) return;
        const existing = await cache.match(url.href);
        if (existing) return;
        const response = await fetch(url.href);
        if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
          await cache.put(url.href, response.clone());
        }
      } catch {
        // Ignore individual precache misses while offline or aborted
      }
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE_NAME)
      .then((cache) => cacheUrlsSafely(cache, PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('ripple99-shell-') && key !== SHELL_CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'CACHE_SHELL_URLS' || !Array.isArray(data.urls)) {
    return;
  }
  const urls = data.urls.filter((u) => typeof u === 'string');
  event.waitUntil(
    caches.open(SHELL_CACHE_NAME).then((cache) => cacheUrlsSafely(cache, urls)),
  );
});

async function handleNavigationRequest(request) {
  const cache = await caches.open(SHELL_CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      await cache.put('/', response.clone());
    }
    return response;
  } catch {
    const cachedRoot = (await cache.match('/')) || (await cache.match('/index.html'));
    if (cachedRoot) return cachedRoot;
    return Response.error();
  }
}

async function handleImmutableAssetRequest(request) {
  const cache = await caches.open(SHELL_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function handleStaticFileRequest(request) {
  const cache = await caches.open(SHELL_CACHE_NAME);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then(async (response) => {
      if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }

  const networkResponse = await networkPromise;
  return networkResponse || Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!shouldHandleSameOriginUrl(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(handleImmutableAssetRequest(request));
    return;
  }

  event.respondWith(handleStaticFileRequest(request));
});
