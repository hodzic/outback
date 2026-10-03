// Shared test plumbing: static server for the repo, browser contexts with mocked network, and a tiny check() log.
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
module.exports = { serve, launch, open, check, results, waitForecast, seedRoute, OUT };
