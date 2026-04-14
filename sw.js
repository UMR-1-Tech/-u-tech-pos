/* ================================================
   U-Tech-POS — Service Worker
   NAWAB BAKERS AND MOBILE
   Version: 2.0
   ================================================ */

const CACHE_NAME = 'utpos-v2';

// Core assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  'https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&display=swap',
];

/* ── INSTALL ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── FETCH ── */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // 1. Supabase API — always network, fallback to empty array
  if (url.hostname.includes('supabase.co')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // 2. External CDN (fonts, ZXing) — cache first, then network
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdn.jsdelivr.net')
  ) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return res;
        });
      })
    );
    return;
  }

  // 3. App HTML & assets — network first, cache fallback (offline support)
  if (e.request.method === 'GET') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          // Only cache successful responses
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  }
});

/* ── MESSAGES ── */
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
