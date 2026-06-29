// Renew Home Exteriors — Service Worker
// Only caches CDN assets. Never intercepts HTML navigation.

const CACHE = 'rhe-estimator-v18';

const CDN_SHELL = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(CDN_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Never intercept navigation requests (page loads) — let the browser handle
  // them directly so Netlify's cache headers and redirects work correctly
  if (e.request.mode === 'navigate') return;

  // Never intercept Supabase API calls
  if (new URL(e.request.url).hostname.includes('supabase.co')) return;

  // Cache-first for CDN assets only
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
