// Steward service worker — makes the app installable and gives it an offline
// shell. Deliberately network-first so the frequently-redeployed demo never
// serves a stale build; the cache is only a fallback when offline.
//
// Bump CACHE on any release that must not be served from an old cache. The
// activate handler deletes every cache that isn't the current name, so a bump
// is what evicts a stale shell from browsers that already installed the app.
// v3: the wcs-spaces -> steward rename + real Entra sign-in. An old cached
// shell here still has the fake demo gate, which lets someone straight in.
// v4: evict any shell poisoned by auth.html before it was excluded below.
const CACHE = 'steward-v4';

self.addEventListener('install', (event) => {
  // Cache the app shell so a cold offline launch still boots.
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './apple-touch-icon.png', './manifest.webmanifest'])).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // The Microsoft sign-in bridge (auth.html) is not the app: it must always
  // come from the network, and must never be stored as the app shell — the
  // navigation handler below caches whatever it fetches as './index.html',
  // which would leave "Signing you in..." as the offline Steward.
  if (new URL(req.url).pathname.endsWith('/auth.html')) return;

  // SPA navigations (HashRouter) → network first, fall back to cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(CACHE).then((c) => c.put('./index.html', res.clone()));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    );
    return;
  }

  // Other assets → network first, cache the result, fall back to cache offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req)),
  );
});
