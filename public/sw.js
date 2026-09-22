// The 380 -- service worker
//
// Kept deliberately light. This site's whole point is showing what's
// happening *right now* (tonight's picks, happy hours, event dates), so an
// aggressive cache would actively work against that by serving yesterday's
// listings. This worker exists to (a) satisfy installability so the site
// can be added to a home screen, (b) show a small offline fallback instead
// of a browser error when there's truly no connection, and (c) receive and
// display Web Push notifications for things like new DMs.

const OFFLINE_URL = '/offline.html';
const PRECACHE = 'the380-shell-v1';
const PRECACHE_URLS = [OFFLINE_URL, '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== PRECACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first for page navigations, so a signed-in visitor always gets
// fresh content when they have a connection; only fall back to the offline
// page when the network request fails outright.
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }
  // Everything else (JS, CSS, images, API calls): pass straight through to
  // the network as normal. The browser's own HTTP cache already handles
  // static-asset caching via the site's cache-control headers; duplicating
  // that here would just risk staleness for no real benefit.
});

// ---- Web Push -------------------------------------------------------------

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try { data = event.data.json(); } catch (e) { data = { body: event.data.text() }; }
  }
  const title = data.title || 'The 380';
  const options = {
    body: data.body || 'You have a new message.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'the380-message',
    data: { url: data.url || '/messages/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/messages/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
