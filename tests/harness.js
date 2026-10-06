// Shared test plumbing: static server for the repo, browser contexts with mocked network, and a tiny check() log.
// Let page.route() mocks also see service-worker fetches (Leaflet from the CDN, tiles).
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { install } = require('./mocks');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.wasm': 'application/wasm', '.css': 'text/css', '.pdf': 'application/pdf' };

function serve(){
  return new Promise(res => {
    const srv = http.createServer((q, s) => {
      let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ s.writeHead(404); return s.end(); }
      s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s);
    }).listen(0, () => res({ url: `http://localhost:${srv.address().port}/`, close: () => srv.close() }));
  });
}

const results = [];
function check(suite, name, ok, info = ''){ results.push({ suite, name, ok: !!ok, info: String(info ?? '') }); }

const BASE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  timezoneId: 'America/Los_Angeles', serviceWorkers: 'block', acceptDownloads: true,
  geolocation: { latitude: 37.80, longitude: -122.45 }, permissions: ['geolocation'] };

async function launch(){
  const opts = {};
  try{ await chromium.launch().then(b => b.close()); }catch{ opts.executablePath = '/opt/pw-browsers/chromium'; }
  return chromium.launch(opts);
}
// New context + page. ctxOpts override BASE, mockOpts go to mocks.install.
async function open(browser, url, ctxOpts = {}, mockOpts = {}){
  const ctx = await browser.newContext({ ...BASE, ...ctxOpts }); await install(ctx, mockOpts);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.type() === 'prompt' ? d.accept(page.promptAnswer ?? 'Test') : d.accept());
  page.text = sel => page.locator(sel).innerText();
  return { ctx, page, errors };
}
const waitForecast = page => page.waitForFunction(() => { const b = document.querySelector('#fcBtn'); return b && !b.disabled && b.textContent === 'Get forecast'; }, null, { timeout: 30000 });
// Put a route on the current trip and frame it above the bottom panel.
async function seedRoute(page, route){
  await page.evaluate(r => { trip.route = r; changed(); map.fitBounds(L.latLngBounds(r), { paddingTopLeft: [30, 70], paddingBottomRight: [30, 380] }); }, route);
  await page.waitForTimeout(400);
}
const ready = page => page.waitForFunction(() => typeof trip !== 'undefined' && trip);
// Switch view by tab: 0 = Trips, 1 = Trip, 2 = Map
async function view(page, i){ await page.click(`#tabs [data-view="${i}"]`); await page.waitForFunction(i => state.view === i, i); await page.waitForTimeout(450); }
// long-press an element (mouse down, wait, up)
async function hold(page, sel, ms = 800){ const b = await page.locator(sel).boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up(); await page.waitForTimeout(150); }
module.exports = { hold, serve, launch, open, check, results, waitForecast, seedRoute, ready, view, OUT };
