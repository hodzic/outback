// Edge cases and regressions found in testing.
const { hold, open, waitForecast, seedRoute, ready, view } = require('./harness');
const GG = [[37.80, -122.45], [37.81, -122.42], [37.82, -122.40]];
module.exports = async (browser, url, check) => {
  const c = (n, ok, i) => check('edge', n, ok, i);

  { // resize while the saved trip is still loading used to throw
    const { ctx, page, errors } = await open(browser, url);
    await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => dispatchEvent(new Event('resize'))));
    await page.goto(url); await ready(page); await page.waitForTimeout(300);
    c('resize during startup does not throw', errors.length === 0, errors.join(' | ')); await ctx.close(); }

  { // phone screens only request ~8 tiles; fallback must still trigger
    const { ctx, page } = await open(browser, url, {}, { tilesFail: true });
    await page.goto(url); await ready(page); await view(page, 2);
    await page.waitForFunction(() => document.querySelector('#layerBtn').textContent !== 'Chart', null, { timeout: 8000 }).catch(() => {});
    c('failing chart tiles fall back to Street', (await page.text('#layerBtn')) === 'Street', await page.text('#layerBtn')); await ctx.close(); }

  { // NOAA retired the raster chart tiles: charts come from the NOAA Chart Display Service, one box per tile
    const { ctx, page } = await open(browser, url), got = [];
    page.on('request', r => { if (r.url().includes('charttools')) got.push(r.url()); });
    await page.goto(url); await ready(page); await view(page, 2);
    await page.evaluate(() => map.setView([37.81, -122.45], 13)); await page.waitForTimeout(800);
    const W13 = 2 * 20037508.342789244 / 2 ** 13, box = x => new URL(x).searchParams.get('bbox').split(',').map(Number);
    const u = got.filter(x => x.includes('/MCS/NOAAChartDisplay/')).find(x => Math.abs(box(x)[2] - box(x)[0] - W13) < 0.1), q = u && new URL(u).searchParams, b = u && box(u);
    c('chart tiles come from the NOAA Chart Display Service', !!u && !got.some(x => x.includes('NOAACharts')) && q.get('f') === 'image' && q.get('bboxSR') === '3857', u);
    c('each chart request is one square map tile on the tile grid', b && Math.abs((b[2] - b[0]) - (b[3] - b[1])) < 0.1 && Math.abs((b[0] + 20037508.342789244) / W13 % 1) < 1e-6, b);
    c('chart drawn sharp on phone screens', q && q.get('size') === '512,512' && q.get('dpi') === '192');
    await ctx.close(); }

  { const { ctx, page } = await open(browser, url, {}, { noaaErr: true });
    await page.goto(url); await ready(page); await seedRoute(page, GG);
    await page.click('#fcBtn'); await waitForecast(page);
    c('NOAA errors are reported', (await page.text('#toast')).includes('Missing: tides'), await page.text('#toast'));
    c('wind still shown when NOAA fails', /kt/.test(await page.text('#windV'))); await ctx.close(); }

  { // planning an SF trip from New York: times must be SF local
    const { ctx, page } = await open(browser, url, { timezoneId: 'America/New_York' });
    await page.goto(url); await ready(page); await seedRoute(page, GG);
    await page.click('#fcBtn'); await waitForecast(page);
    const sun = await page.text('#sunV');
    c('times shown in trip time zone', /^(6|7):\d\d AM/.test(sun), sun);
    await page.evaluate(() => { const r = cv.getBoundingClientRect(); cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + r.width * 0.5, clientY: r.top + 30, pointerId: 1, bubbles: true })); });
    c('graph time is trip-local', (await page.text('#timeOut')).startsWith('12:00'), await page.text('#timeOut'));
    c('wind sample matches trip-local hour', await page.evaluate(() => trip.data.wx.t.includes(tAt())));
    await ctx.close(); }

  { // location button: moving position updates the dot, no navigation side effects
    const { ctx, page, errors } = await open(browser, url);
    await page.goto(url); await ready(page); await seedRoute(page, GG); await view(page, 2);
    await page.click('#locBtn'); await page.waitForTimeout(600);
    await ctx.setGeolocation({ latitude: 37.8101, longitude: -122.4201 }); await page.waitForTimeout(800);
    c('location follows position updates', await page.evaluate(() => Math.abs(state.pos[0] - 37.8101) < 1e-6) && /37\.81010/.test(await page.text('#coords')), await page.text('#coords'));
    c('route unchanged by moving', await page.evaluate(() => trip.route.length) === 3 && await page.evaluate(() => trip.tracks.length) === 0);
    // distance and bearing to the next waypoint, shown with the location
    await ctx.setGeolocation({ latitude: 37.8001, longitude: -122.4497 }); await page.waitForTimeout(700);
    const want = await page.evaluate(() => `→ 2 · ${fmtShort(distNm(state.pos, trip.route[1]))} · ${magB(brgT(state.pos, trip.route[1]))}`);
    c('location shows distance and bearing to the next waypoint', (await page.text('#toNext')) === want, await page.text('#toNext') + ' vs ' + want);
    c('bearing is magnetic', /°M$/.test(await page.text('#toNext')));
    c('next waypoint highlighted on the map', (await page.locator('.wp.next').innerText()) === '2');
    c('dashed line from you to the next waypoint', await page.evaluate(() => { const l = toLine.getLayers(); if (l.length !== 1) return false; const ll = l[0].getLatLngs();
      return l[0].options.dashArray && ll[0].equals(state.pos) && ll[1].equals(ll2(trip.route[1])); }));
    await ctx.setGeolocation({ latitude: 37.81005, longitude: -122.42005 }); await page.waitForTimeout(700);
    c('reaching a waypoint moves on to the next', (await page.text('#toNext')).startsWith('→ Finish'), await page.text('#toNext'));
    await ctx.setGeolocation({ latitude: 37.8150, longitude: -122.4100 }); await page.waitForTimeout(700);
    c('closest leg decides the next waypoint', (await page.text('#toNext')).startsWith('→ Finish') && (await page.locator('.wp.next').innerText()) === '3');
    await ctx.setGeolocation({ latitude: 37.82001, longitude: -122.40001 }); await page.waitForTimeout(700);
    c('at the finish', (await page.text('#toNext')) === 'At the finish', await page.text('#toNext'));
    await page.evaluate(() => { trip.route = []; changed(); }); await page.waitForTimeout(200);
    c('no line without a route', await page.isHidden('#toNext') && await page.evaluate(() => toLine.getLayers().length === 0));
    await page.evaluate(() => { trip.route = [[37.80, -122.45], [37.81, -122.42], [37.82, -122.40]]; changed(); }); await page.waitForTimeout(200);
    c('line returns when a route is drawn', await page.isVisible('#toNext'));
    // ◎ cycles: next waypoint → large coordinates → dot only → off
    await page.click('#locBtn'); await page.waitForTimeout(300);
    c('second tap: large coordinates', await page.evaluate(() => state.locMode === 2) && await page.isVisible('#coords.big .cbig')
      && /^37\.\d{5}, -122\.\d{5}$/.test(await page.text('#coords .cbig')), await page.text('#coords'));
    c('decimal numbers only, plus accuracy', !/°/.test(await page.text('#coords')) && /^±\d+ m$/.test(await page.text('#coords .cacc')), await page.text('#coords'));
    c('large coordinates mode hides the line and highlight', await page.evaluate(() => toLine.getLayers().length === 0) && await page.locator('.wp.next').count() === 0 && await page.isHidden('#toNext'));
    await ctx.setGeolocation({ latitude: 37.8050, longitude: -122.4300 }); await page.waitForTimeout(600);
    c('large coordinates update with position', (await page.text('#coords .cbig')) === '37.80500, -122.43000', await page.text('#coords .cbig'));
    await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => { window.__copied = t; } }, configurable: true }); });
    await page.click('#coords'); await page.waitForTimeout(200);
    c('tap the coordinates to copy them', /^37\.80500, -122\.43000 ±\d+ m$/.test(await page.evaluate(() => window.__copied)), await page.evaluate(() => window.__copied));
    await page.click('#locBtn'); await page.waitForTimeout(300);
    c('third tap: dot only', await page.evaluate(() => state.locMode === 3) && await page.isHidden('#coords') && await page.locator('.me').count() === 1 && await page.evaluate(() => toLine.getLayers().length === 0));
    await page.click('#locBtn'); await page.waitForTimeout(300);
    c('fourth tap cycles back to next waypoint, not off', await page.evaluate(() => state.locMode === 1) && await page.isVisible('#toNext'));
    await page.click('#locBtn'); await page.waitForTimeout(300);
    await hold(page, '#locBtn');
    c('long-press turns location off', await page.evaluate(() => state.locMode === 0 && state.watch == null) && await page.locator('.me').count() === 0);
    c('long-press selects no button text', await page.evaluate(() => getSelection().toString() === '' && getComputedStyle($('#locBtn')).userSelect === 'none' && getComputedStyle($('#curBtn')).userSelect === 'none'));
    c('turning location off hides the line and highlight', await page.evaluate(() => !state.locating && toLine.getLayers().length === 0) && await page.locator('.wp.next').count() === 0);
    await page.click('#locBtn'); await page.waitForTimeout(500);
    c('next tap comes back in the mode it had', await page.evaluate(() => state.locMode === 2) && await page.isVisible('#coords.big'));
    await page.reload(); await ready(page); await view(page, 2); await page.click('#locBtn'); await page.waitForTimeout(500);
    c('the last mode is remembered after a restart', await page.evaluate(() => state.locMode === 2));
    c('no errors with location on', errors.length === 0, errors.join(' | ')); await ctx.close(); }

  { const { ctx, page } = await open(browser, url);
    await page.goto(url); await ready(page); await view(page, 2); await seedRoute(page, GG);
    await page.locator('.wp').nth(1).click(); await page.waitForTimeout(300);
    await page.click('.leaflet-popup [data-del]'); await page.waitForTimeout(200);
    c('delete waypoint from popup', await page.locator('.wp').count() === 2);
    const p = await page.evaluate(() => { const a = map.latLngToContainerPoint(trip.route[0]), b = map.latLngToContainerPoint(trip.route[1]); return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; });
    const off = await page.locator('#map').boundingBox();
    await page.mouse.click(off.x + p.x, off.y + p.y); await page.waitForTimeout(200);
    c('tap a leg shows its label', await page.locator('.leg').count() === 1); await ctx.close(); }

  { // waypoints shrink when zoomed out, but not while drawing
    const { ctx, page } = await open(browser, url);
    await page.goto(url); await ready(page); await view(page, 2); await seedRoute(page, [[37.80, -122.45, 'Start'], ...GG.slice(1)]);
    // visible size of a waypoint: the dot drawn by ::after when small, else the marker itself
    const size = () => page.evaluate(() => { const e = document.querySelector('.wp'), c = map.getContainer().classList;
      return c.contains('wp-far') || c.contains('wp-mid') ? parseFloat(getComputedStyle(e, '::after').width) : e.getBoundingClientRect().width; });
    const hit = () => page.evaluate(() => document.querySelector('.wp').getBoundingClientRect().width);
    await page.evaluate(() => map.setZoom(15, { animate: false })); await page.waitForTimeout(300);
    const full = await size();
    await page.evaluate(() => map.setZoom(13, { animate: false })); await page.waitForTimeout(300);
    const mid = await size();
    await page.evaluate(() => map.setZoom(11, { animate: false })); await page.waitForTimeout(300);
    const far = await size();
    c('waypoints shrink as you zoom out', full > mid && mid > far && far < full * 0.5, `${full} > ${mid} > ${far}`);
    c('small waypoints keep a full-size tap area', await hit() >= 26, await hit());
    await page.locator('.wp').nth(1).click(); await page.waitForTimeout(200);
    c('small waypoint still opens its popup', await page.locator('.leaflet-popup [data-move]').count() === 1);
    await page.evaluate(() => map.closePopup());
    c('zoomed out: no numbers or name labels', await page.evaluate(() => getComputedStyle(document.querySelector('.wp')).color === 'rgba(0, 0, 0, 0)' && getComputedStyle(document.querySelector('.wpname')).display === 'none'));
    await page.click('#drawBtn'); await page.waitForTimeout(300);
    c('full size while drawing', Math.abs(await size() - full) < 1, await size());
    await page.click('#doneBtn'); await page.waitForTimeout(300);
    c('small again after drawing', Math.abs(await size() - far) < 1, await size());
    await page.evaluate(() => { trip.route = Array.from({ length: 40 }, (_, i) => [37.80 + i * 0.0004, -122.45 + i * 0.0004]); changed(); map.setView([37.808, -122.442], 14, { animate: false }); });
    await page.waitForTimeout(300);
    c('crowded waypoints are small even zoomed in', await page.evaluate(() => map.getContainer().classList.contains('wp-far')) && await size() < full * 0.5, await size());
    await ctx.close(); }

  { // an edit made right before switching trips used to be dropped by the save debounce
    const { ctx, page } = await open(browser, url);
    await page.goto(url); await ready(page);
    const id = await page.evaluate(() => trip.id);
    await page.evaluate(async () => { trip.route.push([37.8, -122.4]); changed(); const t = newTrip(); await idb.put('trips', t); await openTrip(t); });
    await page.waitForTimeout(500);
    c('edit before switching trip is saved', await page.evaluate(async id => (await idb.get('trips', id)).route.length, id) === 1); await ctx.close(); }

  { // big GPX routes (thousands of <rtept>) used to make every redraw take over a second
    const fs = require('fs'), path = require('path'), { OUT } = require('./harness');
    const N = 3000, pts = Array.from({ length: N }, (_, i) => { const a = i / (N - 1) * Math.PI; return [37.80 + 0.03 * Math.sin(a), -122.45 + 0.08 * i / (N - 1)]; });
    fs.writeFileSync(path.join(OUT, 'big-route.gpx'), `<gpx><rte><name>Big route</name>${pts.map(p => `<rtept lat="${p[0]}" lon="${p[1]}"/>`).join('')}</rte></gpx>`);
    const { ctx, page, errors } = await open(browser, url);
    await page.goto(url); await ready(page);
    const t0 = Date.now();
    await page.setInputFiles('#file', path.join(OUT, 'big-route.gpx'));
    await page.waitForFunction(() => trip.name === 'Big route', null, { timeout: 20000 });
    c('big route imports quickly', Date.now() - t0 < 3000, (Date.now() - t0) + ' ms');
    const r = await page.evaluate(pts => ({ n: trip.route.length, first: trip.route[0].join(), last: trip.route[trip.route.length - 1].join(),
      ratio: routeNm(trip.route) / routeNm(pts),
      dev: Math.max(...pts.map(p => Math.min(...trip.route.slice(1).map((b, i) => { const a = trip.route[i], k = Math.cos(p[0] * Math.PI / 180);
        const ax = a[1] * k, ay = a[0], bx = b[1] * k, by = b[0], px = p[1] * k, py = p[0], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
        const f = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0; return Math.hypot(px - ax - f * dx, py - ay - f * dy) * 60 * 1852; })))) }), pts);
    c('big route simplified to at most 100 waypoints', r.n <= 100 && r.n >= 10, r.n);
    c('start and finish kept', r.first === pts[0].map(v => +v.toFixed(6)).join() && r.last === pts[N - 1].map(v => +v.toFixed(6)).join());
    c('shape kept within 10 m', r.dev < 10, r.dev.toFixed(1) + ' m');
    c('length kept within 1%', Math.abs(r.ratio - 1) < 0.01, r.ratio.toFixed(4));
    c('import says it simplified', /3,000 route points simplified/.test(await page.text('#toast')), await page.text('#toast'));
    const ms = await page.evaluate(() => { const s = performance.now(); for (let i = 0; i < 10; i++) render(); return (performance.now() - s) / 10; });
    c('redraw stays fast', ms < 50, ms.toFixed(1) + ' ms');
    c('waypoint table only built when opened', await page.locator('#routeTable tr').count() === 0);
    await page.click('#wpDetails summary'); await page.waitForFunction(() => document.querySelectorAll('#routeTable tr').length > 0);
    c('waypoint table fills when opened', await page.locator('#routeTable tr').count() === r.n + 1);
    // a trip saved with a huge route before this fix is simplified when opened
    await page.evaluate(async pts => { await idb.put('trips', { id: 'huge', name: 'Huge', activity: 'paddle', env: null, envSet: false, date: '2026-10-04', route: pts, tracks: [], data: null, fetchedAt: null, updated: 1 }); }, pts);
    await page.evaluate(async () => openTrip(await idb.get('trips', 'huge'))); await page.waitForTimeout(600);
    c('old huge route simplified on open and saved', await page.evaluate(async () => trip.route.length <= 100 && (await idb.get('trips', 'huge')).route.length <= 100));
    c('says it simplified the old route', /3,000 points; simplified/.test(await page.text('#toast')), await page.text('#toast'));
    c('no errors with big routes', errors.length === 0, errors.join(' | '));
    await ctx.close(); }

  { // saving the map offline keeps only real tiles
    const { ctx, page } = await open(browser, url, {}, { tilesFail: true });
    await page.goto(url); await ready(page); await seedRoute(page, GG);
    await page.evaluate(() => { settings.layer = 'chart'; }); // the map may already have fallen back to Street
    await page.click('#fcBtn'); await waitForecast(page);
    const saved = await page.evaluate(async () => (await (await caches.open('paddle-tiles')).keys()).filter(r => r.url.includes('charttools')).length);
    c('failed chart tiles are not saved for offline', saved === 0 && await page.evaluate(() => !trip.mapTiles), saved);
    c('says the map could not be saved', /map could not be saved/.test(await page.text('#toast')), await page.text('#toast'));
    await ctx.close(); }

  { // service worker: error tiles are not kept, so the area loads again once the server is back
    const { ctx, page } = await open(browser, url, { serviceWorkers: 'allow' });
    let down = true;
    await ctx.route('https://gis.charttools.noaa.gov/**', r => down ? r.fulfill({ status: 503, body: 'down', contentType: 'text/html', headers: { 'access-control-allow-origin': '*' } })
      : r.fulfill({ body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'), contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } }));
    await ctx.route('https://tile.openstreetmap.org/**', r => r.fulfill({ body: 'png', contentType: 'image/png' })); // no CORS header
    await page.goto(url); await ready(page);
    await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await ready(page);
    await page.evaluate(() => setLayer('chart')); await view(page, 2); await page.waitForTimeout(1200);
    const tiles = () => page.evaluate(async () => (await (await caches.open('paddle-tiles')).keys()).map(r => r.url));
    c('chart outage tiles not saved', !(await tiles()).some(u => u.includes('charttools')), (await tiles()).length);
    down = false; await page.evaluate(() => { setLayer('street'); setLayer('chart'); }); await page.waitForTimeout(1500);
    c('tiles saved once the server is back', (await tiles()).some(u => u.includes('charttools')));
    await page.evaluate(() => setLayer('street')); await page.waitForTimeout(1200);
    c('servers without CORS still saved', (await tiles()).some(u => u.includes('openstreetmap')));
    await ctx.close(); }

  { // service worker: shell + Leaflet cached, app opens offline
    const { ctx, page, errors } = await open(browser, url, { serviceWorkers: 'allow' });
    await page.goto(url); await ready(page);
    await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(800);
    const keys = await page.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(r.url); return out; });
    c('service worker caches Leaflet', keys.some(u => u.includes('leaflet.min.js')), keys.length + ' entries');
    await ctx.setOffline(true); await page.reload().catch(e => errors.push(e.message)); await ready(page);
    c('app opens offline', errors.length === 0, errors.join(' | ')); await ctx.close(); }
};
