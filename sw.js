const C = 'raftul-meu-v12';
const SHELL = ['./', 'index.html', 'app.js', 'i18n.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'favicon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return;   // catalogul extern merge mereu la internet
  // fișierele aplicației se cer mereu proaspete de pe GitHub (fără memoria cache a browserului); fără internet, din cache
  const req = new Request(u.href, { cache: 'no-cache', credentials: 'same-origin' });
  e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
