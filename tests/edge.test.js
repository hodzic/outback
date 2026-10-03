// Edge cases and regressions found in testing.
const { open, waitForecast, seedRoute } = require('./harness');
const GG = [[37.80, -122.45], [37.81, -122.42], [37.82, -122.40]];
const ready = page => page.waitForFunction(() => typeof trip !== 'undefined' && trip);
module.exports = async (browser, url, check) => {
  const c = (n, ok, i) => check('edge', n, ok, i);

  { // resize while the saved trip is still loading used to throw
    const { ctx, page, errors } = await open(browser, url);
    await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => dispatchEvent(new Event('resize'))));
    await page.goto(url); await ready(page); await page.waitForTimeout(300);
    c('resize during startup does not throw', errors.length === 0, errors.join(' | ')); await ctx.close(); }

  { // phone screens only request ~8 tiles; fallback must still trigger
    const { ctx, page } = await open(browser, url, {}, { tilesFail: true });
    await page.goto(url); await ready(page);
    await page.waitForFunction(() => document.querySelector('#layerBtn').textContent !== 'Chart', null, { timeout: 8000 }).catch(() => {});
    c('failing chart tiles fall back to Street', (await page.text('#layerBtn')) === 'Street', await page.text('#layerBtn')); await ctx.close(); }

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
    await page.evaluate(() => { const s = document.querySelector('#time'); s.value = 720; s.dispatchEvent(new Event('input')); });
    c('slider is trip-local', (await page.text('#timeOut')).startsWith('12:00'), await page.text('#timeOut'));
    c('wind sample matches trip-local hour', await page.evaluate(() => { const w = trip.data.wx, i = w.t.findIndex(t => t === tAt()); return i >= 0; }));
    await ctx.close(); }

  { const { ctx, page, errors } = await open(browser, url);
    await page.goto(url); await ready(page); await seedRoute(page, GG);
    await page.click('#goBtn'); await page.waitForTimeout(800);
    c('nav starts at waypoint 2', (await page.text('#navTo')) === 'To 2');
    await ctx.setGeolocation({ latitude: 37.8101, longitude: -122.4201 }); await page.waitForTimeout(800);
    c('reaching a waypoint advances', (await page.text('#navTo')) === 'To 3', await page.text('#navTo'));
    await ctx.setGeolocation({ latitude: 37.82, longitude: -122.40 }); await page.waitForTimeout(800);
    c('arrival detected', (await page.text('#navLeft')) === 'Arrived', await page.text('#navLeft'));
    await page.click('#stopBtn'); await page.click('#goBtn'); await page.waitForTimeout(600);
    c('restart resets to waypoint 2', (await page.text('#navTo')) === 'To 2');
    await page.click('#stopBtn');
    c('no errors in nav mode', errors.length === 0, errors.join(' | ')); await ctx.close(); }

  { const { ctx, page } = await open(browser, url);
    await page.goto(url); await ready(page); await seedRoute(page, GG);
    await page.locator('.wp').nth(1).click(); await page.waitForTimeout(300);
    await page.click('.leaflet-popup [data-del]'); await page.waitForTimeout(200);
    c('delete waypoint from popup', await page.locator('.wp').count() === 2);
    const p = await page.evaluate(() => { const a = map.latLngToContainerPoint(trip.route[0]), b = map.latLngToContainerPoint(trip.route[1]); return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; });
    await page.mouse.click(p.x, p.y); await page.waitForTimeout(200);
    c('tap a leg shows its label', await page.locator('.leg').count() === 1); await ctx.close(); }

  { const { ctx, page } = await open(browser, url);
    await page.goto(url); await ready(page);
    for (let i = 0; i < 2; i++){ await page.click('#menuBtn'); await page.click('#mNew'); await page.waitForTimeout(200); }
    await page.click('#menuBtn'); await page.click('#mTrips'); await page.waitForSelector('#sheet .item');
    const n0 = await page.locator('#sheet .item').count();
    await page.locator('#sheet [data-rm]').last().click(); await page.waitForTimeout(400);
    c('delete trip from list', await page.locator('#sheet .item').count() === n0 - 1); await ctx.close(); }

  { // an edit made right before switching trips used to be dropped by the save debounce
    const { ctx, page } = await open(browser, url);
    await page.goto(url); await ready(page);
    const id = await page.evaluate(() => trip.id);
    await page.evaluate(async () => { trip.route.push([37.8, -122.4]); changed(); const t = newTrip(); await idb.put('trips', t); await openTrip(t); });
    await page.waitForTimeout(500);
    c('edit before switching trip is saved', await page.evaluate(async id => (await idb.get('trips', id)).route.length, id) === 1); await ctx.close(); }

  { // service worker: shell + Leaflet cached, app opens offline
    const { ctx, page, errors } = await open(browser, url, { serviceWorkers: 'allow' });
    await page.goto(url); await ready(page);
    await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(800);
    const keys = await page.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(r.url); return out; });
    c('service worker caches Leaflet', keys.some(u => u.includes('leaflet.min.js')), keys.length + ' entries');
    await ctx.setOffline(true); await page.reload().catch(e => errors.push(e.message)); await ready(page);
    c('app opens offline', errors.length === 0, errors.join(' | ')); await ctx.close(); }
};
