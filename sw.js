const CACHE = 'gta-v2';
const PRE = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRE.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Rede primeiro: apanha sempre a versão publicada (ignora a cache HTTP do alojamento).
// Só usa a cópia guardada se estiver offline ou se a rede demorar demasiado.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.headers.has('range')) return; // áudio/vídeo: deixa o browser tratar
  const isPage = req.mode === 'navigate' || req.destination === 'document' || /\/(index\.html)?$/.test(new URL(req.url).pathname);
  e.respondWith(
    new Promise((resolve) => {
      let done = false;
      const fromCache = () =>
        caches.match(req, { ignoreSearch: true }).then((c) => {
          if (c && !done) { done = true; resolve(c); }
          return c;
        });
      const timer = setTimeout(fromCache, isPage ? 25000 : 3500);
      fetch(req, { cache: 'no-cache' })
        .then((r) => {
          clearTimeout(timer);
          if (r && r.ok) {
            const copy = r.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          if (!done) { done = true; resolve(r); }
        })
        .catch(() => {
          clearTimeout(timer);
          fromCache().then((c) => { if (!c && !done) { done = true; resolve(Response.error()); } });
        });
    })
  );
});
