/* GapirAI PWA service worker — minimal, dependensiyasiz.
 *  - app-shell / offline fallback
 *  - static assetlar: cache-first
 *  - sahifalar (navigatsiya): network-first, uzilganda /offline
 *  - push / notificationclick: 2-bosqich (backend push qo'shilganda faollashadi)
 */
const VERSION = 'gapirai-v1';
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll([OFFLINE_URL, '/icons/icon-192.png'])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // API va auth so'rovlari hech qachon keshlanmaydi
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  // Next static chunklar / rasm / shrift — cache-first (immutable)
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(?:png|jpg|jpeg|webp|svg|ico|woff2?)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // Sahifa navigatsiyasi — network-first, uzilganda oxirgi kesh yoki /offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(PAGE_CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match(OFFLINE_URL))),
    );
  }
});

// ── Push (2-bosqich) ──────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'GapirAI', body: event.data && event.data.text() };
  }
  const title = data.title || 'GapirAI.uz';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'Dublyajingiz tayyor!',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/dashboard' },
      tag: data.tag || 'gapirai',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(target) && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
