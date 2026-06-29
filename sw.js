// Renew Home Exteriors — Service Worker
// Network-first for HTML, cache-first for CDN assets

const CACHE = 'rhe-estimator-v16';

const HTML_SHELL = [
  '/PricingEstimator.html',
  '/quotes.html',
  '/property.html',
  '/change-orders.html',
  '/signing.html',
  '/reports.html',
  '/admin.html',
  '/platform.html',
];

const CDN_SHELL = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
];

// Install — only pre-cache CDN assets (not HTML)
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(CDN_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean up old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always network-only for Supabase API calls
  if (url.hostname.includes('supabase.co')) {
    e.respondWith(fetch(e.request, { redirect: 'follow' }).catch(() => new Response('', { status: 503 })));
    return;
  }

  // Network-first for all HTML files — always get the latest version
  const isHtml = HTML_SHELL.includes(url.pathname) || url.pathname.endsWith('.html');
  if (isHtml) {
    e.respondWith(
      fetch(e.request, { redirect: 'follow' })
        .then(res => {
          // Don't cache redirected or non-200 responses
          if (res.ok && !res.redirected) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request)) // offline fallback
    );
    return;
  }

  // Cache-first for CDN assets (supabase-js, etc.)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request, { redirect: 'follow' }).then(res => {
        if (e.request.method === 'GET' && res.ok && !res.redirected) {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      });
    })
  );
});
