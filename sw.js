// Renew Home Exteriors — Service Worker
// Network-first for HTML, cache-first for CDN assets

const CACHE = 'rhe-estimator-v17';

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
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always network-only for Supabase API calls
  if (url.hostname.includes('supabase.co')) {
    return; // let browser handle it natively
  }

  // Network-first for HTML — use URL string (not e.request) to force redirect:follow
  if (url.pathname.endsWith('.html') || url.pathname === '/') {
    e.respondWith(
      fetch(url.href)          // plain URL string = redirect:follow by default
        .then(res => {
          if (res.ok) {
            const clone = res.clone(); // clone BEFORE returning
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for CDN / static assets
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(url.href).then(res => {
        if (res.ok) {
          const clone = res.clone(); // clone BEFORE returning
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
