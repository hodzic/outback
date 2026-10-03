// Outback service worker: app shell + offline map tiles.
// hodzic.github.io hosts several apps on one origin and they share Cache Storage,
// so only ever delete caches this app owns (old Paddle/Outback shell versions).
const SHELL = 'outback-shell-v5';
const TILES = 'paddle-tiles'; // name kept so tiles saved before the rename stay usable
const OWN = k => /^(paddle|outback)-shell-/.test(k);
const LOCAL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './pdfmap.js', './vendor/Leaflet.ImageOverlay.Rotated.js'];
const REMOTE = [
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
];
const TILE_HOSTS = ['gis.charttools.noaa.gov', 'tile.openstreetmap.org', 'basemap.nationalmap.gov'];
const STATIC_HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await c.addAll(LOCAL);
    await Promise.all(REMOTE.map(u => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (OWN(k) && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Map tiles: cache first (any cache on this origin, so GPS Map's saved tiles count too), store what we see
  if (TILE_HOSTS.includes(url.hostname)){
    e.respondWith((async () => {
      const hit = await caches.match(req.url);
      if (hit) return hit;
      try{
        const r = await fetch(req);
        if (r.ok || r.type === 'opaque') (await caches.open(TILES)).put(req.url, r.clone());
        return r;
      }catch{ return new Response('', { status: 504 }); }
    })());
    return;
  }

  // App shell + libraries + fonts: cache first, refresh in background.
  // Only this app's own folder: other apps on the origin have their own workers.
  const scope = new URL(self.registration.scope);
  if ((url.origin === location.origin && url.pathname.startsWith(scope.pathname)) || STATIC_HOSTS.includes(url.hostname)){
    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      const hit = await c.match(req, { ignoreSearch: url.origin === location.origin });
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => null);
      if (hit){ e.waitUntil(net); return hit; }
      const r = await net;
      if (r) return r;
      if (req.mode === 'navigate') return (await c.match('./index.html')) || new Response('Offline', { status: 503 });
      return new Response('', { status: 504 });
    })());
  }
  // Forecast APIs: network only (data is stored with each trip)
});
