// ─── Tax Nitro Service Worker ──────────────────────────────────────────────────
// Strategy:
//   Static assets  → Cache-first (versioned, long-lived)
//   App shell      → Stale-while-revalidate
//   Supabase API   → Network-only (never cache auth/data)
//   Everything else → Network-first with cache fallback
// ──────────────────────────────────────────────────────────────────────────────

const APP_VERSION  = 'ftg-v5';
const STATIC_CACHE = `${APP_VERSION}-static`;
const PAGE_CACHE   = `${APP_VERSION}-pages`;
const FONT_CACHE   = `${APP_VERSION}-fonts`;
const ALL_CACHES   = [STATIC_CACHE, PAGE_CACHE, FONT_CACHE];

// Files to precache on install
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/apple-touch-icon-180.png',
  '/offline.html',
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS.filter(url => url !== '/offline.html')
        .concat('/offline.html').filter(Boolean)))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => !ALL_CACHES.includes(k))
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const isSupabase  = url => url.includes('supabase.co') || url.includes('supabase.io');
const isStaticAsset = url => /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot)(\?.*)?$/.test(url);
const isFont      = url => url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com');
const isNavigation = req => req.mode === 'navigate';

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = request.url;

  // Only handle GET
  if (request.method !== 'GET') return;

  // 1. Supabase → network-only (auth, data, storage — never cache)
  if (isSupabase(url)) return;

  // 2. Google Fonts → cache-first
  if (isFont(url)) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  // 3. Static assets (JS/CSS/images) → cache-first
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // 4. Navigation (HTML pages) → network-first with offline fallback
  if (isNavigation(request)) {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // 5. Everything else → stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request, PAGE_CACHE));
});

// ── Strategies ────────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return cached || new Response('Offline', { status: 503 });
  }
}

async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(PAGE_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Return the offline page as fallback
    const offlinePage = await caches.match('/offline.html');
    return offlinePage || new Response(
      '<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#3A3131"><div style="text-align:center;color:#fff"><h1 style="color:#E8B923">FTG</h1><p>You\'re offline. Please check your connection.</p></div></body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || networkPromise;
}

// ── Background Sync ───────────────────────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  // Placeholder for future background sync logic (e.g. offline uploads queue)
  console.log('[SW] Background sync triggered');
}

// ── Push Notifications ────────────────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'FTG', body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Finance Therapy Group', {
      body:    data.body    || 'You have a new notification.',
      icon:    data.icon    || '/icon-192.png',
      badge:   data.badge   || '/icon-192.png',
      tag:     data.tag     || 'ftg-notification',
      data:    data.url     ? { url: data.url } : {},
      actions: data.actions || [],
      vibrate: [100, 50, 100],
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ── Message handler (skip waiting on demand) ─────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
