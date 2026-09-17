/* ══════════════════════════════════════════════════════════════════
   admin-sw.js — Studyria ADMIN service worker (own identity)
   ─────────────────────────────────────────────────────────────────
   • Scope: registered under './' — at the standalone domain
     admin.studyria.qzz.io it covers ONLY the admin app; when staged at
     studyria.qzz.io/admin-app/ it covers ONLY /admin-app/. It can NEVER
     control the public studyria.qzz.io pages (separate origin at the
     final domain, separate scope while staged).
   • Cache namespace: studyria-admin-v* (public site caches untouched).
   • NEVER caches Supabase / auth / CDN API traffic: only same-origin
     GET static assets are handled; everything else passes through to
     the browser untouched. No admin data is ever stored offline.
   • Honest offline behavior: cached shell only; live data always comes
     from the network. Offline + not cached = normal browser error.
   ══════════════════════════════════════════════════════════════════ */
const ADMIN_CACHE = 'studyria-admin-v3';
const ADMIN_SHELL = [
  './',
  './index.html',
  './manifest-admin.json',
  './css/admin-base.css?v=3',
  './css/admin-shell.css?v=3',
  './css/cloud-manager.css?v=3',
  './js/admin-boot.js?v=3',
  './icons/admin-logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './favicon.ico'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(ADMIN_CACHE).then((c) => c.addAll(ADMIN_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('studyria-admin-') && k !== ADMIN_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // never touch writes
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;       // Supabase/CDN/browser handles these
  if (req.mode === 'navigate') {
    // Network-first for the app shell: admins must always run fresh code.
    e.respondWith(
      fetch(req)
        .then((res) => { const cp = res.clone(); caches.open(ADMIN_CACHE).then((c) => c.put('./index.html', cp)); return res; })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }
  // Stale-while-revalidate for same-origin static assets (css/js/icons).
  e.respondWith(
    caches.match(req).then((cached) => {
      const fresh = fetch(req).then((res) => {
        if (res && res.ok) caches.open(ADMIN_CACHE).then((c) => c.put(req, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});
