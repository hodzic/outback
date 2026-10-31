// Outback service worker: app shell + offline map tiles. The shared part (install, update, cache cleanup, serving the app's
// files) is /shared/sw-core.js on hodzic.github.io, used by all the apps there.
importScripts('/shared/sw-core.js');
const SHELL = 'outback-shell-2026-10-31d';
const TILES = 'paddle-tiles'; // name kept so tiles saved before the rename stay usable
const TILE_HOSTS = ['gis.charttools.noaa.gov', 'tile.openstreetmap.org', 'basemap.nationalmap.gov', 'imagery.nationalmap.gov', 'tiles.openseamap.org'];

// Map images are requested without CORS, which hides errors: an outage page would be saved as if it were a map tile.
// Ask with CORS first so the status and type can be checked; hosts that don't allow it fall back to the old way.
const noCors = new Set();
async function tileFetch(req){
  const host = new URL(req.url).hostname;
  if (!noCors.has(host)) try{ return await fetch(req.url, { mode: 'cors', credentials: 'omit' }); }catch{} // no CORS, or offline
  const r = await fetch(req);
  if (r.type === 'opaque') noCors.add(host);
  return r;
}
const goodTile = r => r.type === 'opaque' || (r.ok && /^image\//.test(r.headers.get('content-type') || ''));
// Map tiles: cache first (any cache on this origin, so GPS Map's saved tiles count too), store what we see
function tiles(e, url){
  if (e.request.method !== 'GET' || !TILE_HOSTS.includes(url.hostname)) return false;
  e.respondWith((async () => {
    const hit = await caches.match(e.request.url);
    if (hit) return hit;
    try{
      const r = await tileFetch(e.request);
      if (goodTile(r)) (await caches.open(TILES)).put(e.request.url, r.clone());
      return r;
    }catch{ return new Response('', { status: 504 }); }
  })());
  return true;
}

appWorker({
  cache: SHELL,
  // only this app's shell caches (old Paddle/Outback versions): other apps on hodzic.github.io share Cache Storage
  own: k => /^(paddle|outback)-shell-/.test(k),
  shell: ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './pdfmap.js', './align.js', './data/watertrail.json', './vendor/Leaflet.ImageOverlay.Rotated.js', './vendor/html2canvas.min.js'],
  extra: ['https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css', 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'],
  hosts: ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'],
  index: './index.html',
  // versions up to 2026-10-27b have no update prompt, so an update over one of those takes over by itself
  legacy: k => k.replace(/^(paddle|outback)-shell-/, '') <= '2026-10-27b',
  route: tiles,
  // tiles from NOAA's retired raster chart service are blank or errors: free the space
  async activate(){ const t = await caches.open(TILES); for (const r of await t.keys()) if (r.url.includes('/MarineChart_Services/NOAACharts/')) await t.delete(r); },
});
