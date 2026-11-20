const CACHE = 'gta-v5';
const PRE = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
const isMedia = (p) => /\.(mp3|mp4)$/i.test(p);

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRE.map((u) => new Request(u, { cache: 'reload' }))).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Pedidos parciais (áudio/vídeo) de ficheiros já guardados: responde a partir da cache.
async function fromCacheRange(req) {
  const c = await caches.match(req.url, { ignoreSearch: true });
  if (!c) return fetch(req);
  const buf = await c.arrayBuffer();
  const total = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  let start = m && m[1] ? parseInt(m[1], 10) : 0;
  let end = m && m[2] ? parseInt(m[2], 10) : total - 1;
  if (end >= total) end = total - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206, statusText: 'Partial Content',
    headers: {
      'Content-Type': c.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes'
    }
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Áudio e vídeo: cache primeiro; guarda quando descarrega por inteiro.
  if (isMedia(url.pathname)) {
    if (req.headers.has('range')) { e.respondWith(fromCacheRange(req)); return; }
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then((c) => c || fetch(req).then((r) => {
        if (r && r.status === 200) { const copy = r.clone(); caches.open(CACHE).then((ca) => ca.put(req, copy)).catch(() => {}); }
        return r;
      }))
    );
    return;
  }

  // Página e restantes ficheiros: rede primeiro (ignora a cache HTTP do alojamento);
  // se estiver offline ou a rede demorar demasiado, usa a cópia guardada.
  const isPage = req.mode === 'navigate' || req.destination === 'document' || /\/(index\.html)?$/.test(url.pathname);
  e.respondWith(
    new Promise((resolve) => {
      let done = false;
      const fromCache = () =>
        caches.match(req, { ignoreSearch: true }).then((c) => {
          if (c && !done) { done = true; resolve(c); }
          return c;
        });
      const timer = setTimeout(fromCache, isPage ? 15000 : 4000);
      fetch(req, { cache: 'no-cache' })
        .then((r) => {
          clearTimeout(timer);
          if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
          if (!done) { done = true; resolve(r); }
        })
        .catch(() => {
          clearTimeout(timer);
          fromCache().then((c) => { if (!c && !done) { done = true; resolve(Response.error()); } });
        });
    })
  );
});
