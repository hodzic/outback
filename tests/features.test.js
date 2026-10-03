// Outback features: activities and terrain, elevation, track recording, out-and-back,
// legacy migration, offline map areas, PDF trail maps, GPS Map import, live location.
const fs = require('fs'), path = require('path');
const { open, waitForecast, seedRoute, OUT } = require('./harness');
require('./make-pdf')(OUT);
const ready = page => page.waitForFunction(() => typeof trip !== 'undefined' && trip);
const newTrip = async (page, kind) => { await page.click('#menuBtn'); await page.click('#mNew'); await page.click(`[data-newact=${kind}]`); await page.waitForTimeout(200); await page.click('#doneBtn'); };
const DIABLO = [[37.870, -121.930], [37.880, -121.915], [37.882, -121.900]];
const GG = [[37.80, -122.45], [37.81, -122.42], [37.82, -122.40]];

module.exports = async (browser, url, check) => {
  const c = (n, ok, i) => check('feat', n, ok, i);

  { // hiking trip: miles, topo, elevation profile, Naismith time, wind in mph
    const { ctx, page, errors } = await open(browser, url);
    await page.goto(url); await ready(page);
    await newTrip(page, 'hike');
    c('new hike trip', await page.evaluate(() => trip.activity) === 'hike');
    c('hike defaults to topo map', (await page.text('#layerBtn')) === 'Topo', await page.text('#layerBtn'));
    await seedRoute(page, DIABLO);
    await page.evaluate(() => document.querySelector('#panel').classList.remove('min'));
    c('hike distances in miles', (await page.text('#dist')).endsWith(' mi'), await page.text('#dist'));
    await page.click('#fcBtn'); await waitForecast(page);
    c('inland hike detected as trail', await page.evaluate(() => trip.env) === 'trail');
    c('no tide cells on a trail', !(await page.isVisible('#tideV')) && !(await page.isVisible('#curV')));
    c('elevation gain shown', /^\+[\d,]+ ft/.test(await page.text('#elevV')), await page.text('#elevV'));
    c('climb included in time estimate', /\+[\d,]+ ft/.test(await page.text('#legs')), await page.text('#legs'));
    c('graph offers Elev and Wind', (await page.locator('#graphSel button').allInnerTexts()).join() === 'Elev,Wind');
    c('wind shown in mph', /mph/.test(await page.text('#windV')), await page.text('#windV'));
    await page.screenshot({ path: path.join(OUT, 'feat-hike.png') });
    await page.click('#routeBtn');
    c('route sheet in miles with climb note', /Leg mi/.test(await page.text('#sheet')) && /Total climb/.test(await page.text('#sheet')));
    await page.click('#sheet [data-close]');
    c('no page errors (hike)', errors.length === 0, errors.join(' | ')); await ctx.close(); }

  { // coastal hike gets tides but no currents; paddle water type picker
    const { ctx, page } = await open(browser, url);
    await page.goto(url); await ready(page);
    await newTrip(page, 'hike');
    await seedRoute(page, [[37.8063, -122.4659], [37.8070, -122.4600]]);
    await page.click('#fcBtn'); await waitForecast(page);
    c('hike next to a tide station is coast', await page.evaluate(() => trip.env) === 'coast');
    c('coast shows tides', /ft$/.test(await page.text('#tideV')));
    c('coast hides currents', !(await page.isVisible('#curV')));
    await newTrip(page, 'paddle');
    await page.click('#menuBtn'); await page.click('#mWater');
    c('paddle water choices', (await page.locator('[data-env]').allInnerTexts()).map(s => s.split('\n')[0]).join() === 'Ocean,Bay,Slough / estuary,River,Lake');
    await page.click('[data-env=river]');
    c('river hides tides', await page.evaluate(() => trip.env) === 'river' && !(await page.isVisible('#tideV')));
    c('status names the water', /River/.test(await page.text('#status')), await page.text('#status'));
    await page.click('#menuBtn'); await page.click('#mWater'); await page.click('[data-env=slough]');
    await page.evaluate(() => document.querySelector('#panel').classList.remove('min'));
    c('slough shows tides and currents', await page.isVisible('#tideV') && await page.isVisible('#curV'));
    await ctx.close(); }

  { // record a track with no route, then reuse it
    const { ctx, page, errors } = await open(browser, url, { geolocation: { latitude: 37.80, longitude: -122.45 } });
    await page.goto(url); await ready(page);
    await page.click('#goBtn'); await page.waitForTimeout(600);
    c('Go without a route records', await page.isVisible('#nav') && (await page.text('#navTo')) === 'Track', await page.text('#navTo'));
    for (let i = 1; i <= 8; i++){ await ctx.setGeolocation({ latitude: 37.80 + i * 0.001, longitude: -122.45 + i * 0.0012, accuracy: 8 }); await page.waitForTimeout(250); }
    const pts = await page.evaluate(() => state.rec?.pts.length);
    c('track points recorded', pts >= 8, pts);
    c('REC indicator', /REC/.test(await page.text('#navLeft')), await page.text('#navLeft'));
    c('recorded line drawn', await page.evaluate(() => !!recLine && recLine.getLatLngs().length >= 8));
    await page.click('#stopBtn');
    c('track saved on stop', /Track saved/.test(await page.text('#toast')), await page.text('#toast'));
    await page.waitForTimeout(500); await page.reload(); await ready(page);
    c('track persists across reload', await page.evaluate(() => trip.tracks.length === 1 && trip.tracks[0].pts.length >= 8 && !!trip.tracks[0].end));
    await page.click('#menuBtn'); await page.click('#mTracks');
    c('tracks sheet lists it', await page.locator('#sheet [data-trackroute]').count() === 1);
    await page.click('#sheet [data-trackroute]');
    c('track becomes a route', await page.evaluate(() => trip.route.length >= 2 && trip.route.length <= 60), await page.evaluate(() => trip.route.length));
    await page.click('#menuBtn');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#mGpx')]);
    const gpx = fs.readFileSync(await dl.path(), 'utf8');
    c('GPX has route and timed track', /<rte>/.test(gpx) && (gpx.match(/<trkpt/g) || []).length >= 8 && /<time>/.test(gpx));
    fs.writeFileSync(path.join(OUT, 'with-track.gpx'), gpx);
    await page.setInputFiles('#file', path.join(OUT, 'with-track.gpx')); await page.waitForTimeout(500);
    c('GPX import keeps the timed track', await page.evaluate(() => trip.tracks.length === 1 && trip.tracks[0].pts[0][2] > 0));
    c('no page errors (tracks)', errors.length === 0, errors.join(' | ')); await ctx.close(); }

  { // route with recording, out-and-back, reverse
    const { ctx, page } = await open(browser, url);
    await page.goto(url); await ready(page); await seedRoute(page, GG);
    await page.click('#menuBtn'); await page.click('#mBack');
    c('out-and-back adds return legs', await page.evaluate(() => trip.route.length === 5 && trip.route[4].join() === trip.route[0].join()));
    await page.click('#menuBtn'); await page.click('#mReverse');
    c('reverse route', await page.evaluate(() => trip.route[1].join()) === GG[2].join() || await page.evaluate(() => trip.route[1].join()) === GG[1].join());
    await page.click('#goBtn'); await page.waitForTimeout(500);
    c('Go with a route navigates and records', (await page.text('#navTo')) === 'To 2' && await page.evaluate(() => !!state.rec));
    await page.click('#stopBtn'); await ctx.close(); }

  { // trips saved by the old Paddle app still open
    const { ctx, page } = await open(browser, url);
    await page.goto(url); await ready(page);
    await page.evaluate(async () => {
      await idb.put('trips', { id: 'old1', name: 'Old paddle', date: '2026-09-01', route: [[37.8, -122.4], [37.81, -122.41]], water: 'tidal', waterSet: true, tide: null, current: null, data: null, fetchedAt: null, updated: 1 });
      localStorage.setItem('paddle.lastTrip', '"old1"');
      localStorage.setItem('paddle.settings', JSON.stringify({ speed: 3.5, variation: 13, layer: 'chart', gust: 15 }));
    });
    await page.reload(); await ready(page);
    c('legacy trip opens', (await page.text('#tripBtn')) === 'Old paddle');
    c('legacy tidal water -> bay', await page.evaluate(() => trip.activity === 'paddle' && trip.env === 'bay' && trip.envSet === true && Array.isArray(trip.tracks)));
    c('legacy speed setting migrated', await page.evaluate(() => settings.speeds.paddle) === 3.5);
    await ctx.close(); }

  { // offline map area
    const { ctx, page, errors } = await open(browser, url);
    await page.goto(url); await ready(page);
    await page.evaluate(() => map.setView([37.80, -122.42], 14)); await page.waitForTimeout(300);
    await page.click('#menuBtn'); await page.click('#mOffline'); await page.click('#oArea');
    c('save-area bar estimates tiles', /tiles/.test(await page.text('#aEst')), await page.text('#aEst'));
    await page.click('#aSave');
    c('area needs a name', /name/.test(await page.text('#aEst')));
    await page.fill('#aName', 'Crissy Field'); await page.selectOption('#aDepth', '0');
    await page.click('#aSave');
    await page.waitForFunction(() => document.querySelector('#mapBar').hidden, null, { timeout: 20000 });
    const regions = await page.evaluate(() => idb.all('regions'));
    c('area saved', regions.length === 1 && regions[0].name === 'Crissy Field' && regions[0].tileCount > 0, JSON.stringify(regions[0] || {}).slice(0, 120));
    c('area tiles are in the cache', await page.evaluate(async () => (await (await caches.open('paddle-tiles')).keys()).length) >= regions[0]?.tileCount);
    await page.evaluate(() => map.setView([40, -100], 5));
    await page.click('#menuBtn'); await page.click('#mOffline'); await page.waitForSelector('#sheet [data-region]');
    c('offline sheet lists the area', /Crissy Field/.test(await page.text('#sheet')));
    await page.click('#sheet [data-region]'); await page.waitForTimeout(300);
    c('Show jumps to the area', await page.evaluate(() => map.getBounds().contains([37.80, -122.42])));
    c('no page errors (areas)', errors.length === 0, errors.join(' | ')); await ctx.close(); }

  { // PDF trail maps: auto-placement from printed GPS labels, adjust, persistence, opacity
    const { ctx, page, errors } = await open(browser, url);
    page.promptAnswer = 'Test brochure';
    await page.goto(url); await ready(page);
    await page.setInputFiles('#pdfFile', path.join(OUT, 'brochure.pdf'));
    await page.waitForSelector('#nSave', { timeout: 60000 });
    c('PDF labels detected', /Found 3 GPS labels/.test(await page.text('#toast')), await page.text('#toast'));
    c('4 handles + centre while placing', await page.locator('.nudge').count() === 4 && await page.locator('.nudge-c').count() === 1);
    c('opacity control visible', await page.isVisible('#opBar'));
    await page.screenshot({ path: path.join(OUT, 'feat-pdf-nudge.png') });
    await page.click('#nSave'); await page.waitForTimeout(300);
    const m = await page.evaluate(async () => (await idb.all('trailMaps'))[0]);
    // page top-left (0,792) maps to about lat 37.946, lon -122.55; labels are drawn from their baseline, so allow some slack
    c('trail map placed from labels', m && Math.abs(m.topLeft[0] - 37.946) < 0.03 && Math.abs(m.topLeft[1] + 122.55) < 0.03, m && JSON.stringify(m.topLeft));
    c('trail map shown after save', await page.evaluate(() => shownMaps.size) === 1 && await page.locator('img.leaflet-image-layer').count() === 1);
    await page.evaluate(() => { const o = document.querySelector('#opacity'); o.value = 0.4; o.dispatchEvent(new Event('input')); });
    c('opacity applies', await page.evaluate(() => [...shownMaps.values()][0].layer.options.opacity) === 0.4);
    await page.reload(); await ready(page); await page.waitForTimeout(500);
    c('shown trail map restored on reload', await page.locator('img.leaflet-image-layer').count() === 1);
    await page.click('#menuBtn'); await page.click('#mOffline');
    await page.click('#sheet [data-adjust]'); await page.waitForSelector('#nSave');
    const h = await page.locator('.nudge-c').boundingBox();
    await page.mouse.move(h.x + 17, h.y + 17); await page.mouse.down(); await page.mouse.move(h.x + 60, h.y + 17, { steps: 5 }); await page.mouse.up();
    await page.click('#nSave'); await page.waitForTimeout(300);
    const m2 = await page.evaluate(async () => (await idb.all('trailMaps'))[0]);
    c('adjust moves and saves', m2.topLeft[1] > m.topLeft[1] && /adjusted/.test(m2.method), `${m.topLeft[1]} -> ${m2.topLeft[1]} ${m2.method}`);
    page.promptAnswer = 'Plain';
    await page.setInputFiles('#pdfFile', path.join(OUT, 'plain.pdf'));
    await page.waitForSelector('#nSave', { timeout: 60000 });
    c('PDF without position data: manual placement', /Drag the points/.test(await page.text('#toast')), await page.text('#toast'));
    await page.click('#nCancel');
    c('cancel discards it', await page.evaluate(async () => (await idb.all('trailMaps')).length) === 1);
    await page.click('#menuBtn'); await page.click('#mOffline'); await page.click('#sheet [data-rmtmap]'); await page.waitForTimeout(300);
    c('delete trail map', await page.evaluate(async () => (await idb.all('trailMaps')).length) === 0 && await page.locator('img.leaflet-image-layer').count() === 0);
    c('no page errors (pdf)', errors.length === 0, errors.join(' | ')); await ctx.close(); }

  { // copy saved areas + trail maps from the GPS Map app on the same origin
    const { ctx, page } = await open(browser, url);
    await page.goto(url); await ready(page);
    await page.evaluate(() => new Promise(res => {
      const r = indexedDB.open('gpsmapdb3', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('regions', { keyPath: 'id' }); r.result.createObjectStore('trailMaps', { keyPath: 'id' }); };
      r.onsuccess = () => { const t = r.result.transaction(['regions', 'trailMaps'], 'readwrite');
        t.objectStore('regions').put({ id: 'g1', name: 'Pleasanton', bounds: { n: 37.7, s: 37.6, e: -121.8, w: -121.9 }, minZoom: 12, maxZoom: 14, tileCount: 40, sizeBytes: 600000, createdAt: 1 });
        t.objectStore('trailMaps').put({ id: 'g2', name: 'Pleasanton Ridge', imageBlob: new Blob(['x'], { type: 'image/jpeg' }), imageWidth: 10, imageHeight: 10, topLeft: [37.7, -121.9], topRight: [37.7, -121.8], bottomLeft: [37.6, -121.9], method: 'manual placement', createdAt: 1 });
        t.oncomplete = () => { r.result.close(); res(); }; };
    }));
    await page.click('#menuBtn'); await page.click('#mOffline'); await page.waitForSelector('#oArea');
    c('GPS Map import offered', await page.isVisible('#oGps'));
    await page.click('#oGps'); await page.waitForTimeout(400);
    c('GPS Map items copied', /Pleasanton/.test(await page.text('#sheet')) && /Pleasanton Ridge/.test(await page.text('#sheet')));
    await ctx.close(); }

  { // live location: follow, pan away, re-center, stop
    const { ctx, page } = await open(browser, url, { geolocation: { latitude: 37.79, longitude: -122.40 } });
    await page.goto(url); await ready(page);
    await page.click('#locBtn'); await page.waitForTimeout(600);
    c('location shown and followed', await page.locator('.me').count() === 1 && await page.evaluate(() => state.follow) && await page.isVisible('#coords'), await page.text('#coords').catch(() => ''));
    await page.mouse.move(200, 300); await page.mouse.down(); await page.mouse.move(260, 360, { steps: 5 }); await page.mouse.up();
    c('panning stops following', await page.evaluate(() => !state.follow && state.watch != null));
    await page.click('#locBtn'); await page.waitForTimeout(300);
    c('tap re-centres', await page.evaluate(() => state.follow && map.getBounds().contains([37.79, -122.40])));
    await page.click('#locBtn');
    c('tap again stops location', await page.evaluate(() => state.watch == null) && await page.locator('.me').count() === 0);
    await ctx.close(); }

  { // service worker must not delete other apps' caches on the shared origin
    const { ctx, page } = await open(browser, url, { serviceWorkers: 'allow' });
    await page.goto(url + 'tests/out/'); // any page on the origin, before Outback's worker exists
    await page.evaluate(async () => { await caches.open('map-tiles'); await caches.open('my-location-shell-v8'); await caches.open('paddle-shell-v4'); });
    await page.goto(url); await ready(page);
    await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(800);
    const keys = await page.evaluate(() => caches.keys());
    c('other apps\' caches survive', keys.includes('map-tiles') && keys.includes('my-location-shell-v8'), keys.join(', '));
    c('old Paddle shell cache removed', !keys.includes('paddle-shell-v4') && keys.includes('outback-shell-v1'), keys.join(', '));
    await ctx.close(); }
};
