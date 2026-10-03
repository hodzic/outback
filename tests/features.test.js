// Outback features: activity and terrain, elevation, track recording, out-and-back,
// legacy migration, PDF map overlays, GPS Map import, live location, cache sharing.
const fs = require('fs'), path = require('path');
const { open, waitForecast, seedRoute, ready, view, OUT } = require('./harness');
require('./make-pdf')(OUT);
// New trip from the Trips view; it lands on the map in draw mode, so finish drawing.
const newTrip = async (page, kind) => { await view(page, 0); await page.click(kind === 'hike' ? '#newHike' : '#newPaddle'); await page.waitForTimeout(500); await page.click('#doneBtn'); };
const DIABLO = [[37.870, -121.930], [37.880, -121.915], [37.882, -121.900]];
const GG = [[37.80, -122.45], [37.81, -122.42], [37.82, -122.40]];

module.exports = async (browser, url, check) => {
  const c = (n, ok, i) => check('feat', n, ok, i);

  { // hiking trip: miles, topo, elevation profile, Naismith time, wind in mph
    const { ctx, page, errors } = await open(browser, url);
    await page.goto(url); await ready(page);
    await newTrip(page, 'hike');
    c('new hike trip', await page.evaluate(() => trip.activity === 'hike' && trip.name === 'New hike'));
    c('hike uses the topo map', (await page.text('#layerBtn')) === 'Topo', await page.text('#layerBtn'));
    await seedRoute(page, DIABLO);
    await view(page, 1);
    c('hike activity selected', (await page.text('#actSel .on')) === 'Hike');
    c('terrain choices', (await page.locator('#envSel button').allInnerTexts()).join() === 'Auto,Trail,Coast');
    c('hike distances in miles', (await page.text('#dist')).endsWith(' mi'), await page.text('#dist'));
    c('speed in mph', /mph/.test(await page.text('#spdK')) && await page.inputValue('#speed') === '2.5');
    await page.click('#fcBtn'); await waitForecast(page);
    c('inland hike detected as trail', await page.evaluate(() => trip.env) === 'trail');
    c('no tide cells on a trail', !(await page.isVisible('#tideV')) && !(await page.isVisible('#curV')));
    c('elevation gain shown', /^\+[\d,]+ ft/.test(await page.text('#elevV')), await page.text('#elevV'));
    c('climb included in duration', /climb \+[\d,]+ ft/.test(await page.text('#legs')), await page.text('#legs'));
    c('graph offers Elevation and Wind', (await page.locator('#graphSel button').allInnerTexts()).join() === 'Elevation,Wind');
    c('wind shown in mph', /mph/.test(await page.text('#windV')), await page.text('#windV'));
    await page.screenshot({ path: path.join(OUT, 'feat-hike.png') });
    c('no page errors (hike)', errors.length === 0, errors.join(' | ')); await ctx.close(); }

  { // coastal hike gets tides but no currents; paddle water choices in the Trip view
    const { ctx, page } = await open(browser, url);
    await page.goto(url); await ready(page);
    await newTrip(page, 'hike');
    await seedRoute(page, [[37.8063, -122.4659], [37.8070, -122.4600]]);
    await view(page, 1); await page.click('#fcBtn'); await waitForecast(page);
    c('hike next to a tide station is coast', await page.evaluate(() => trip.env) === 'coast');
    c('coast shows tides', /ft$/.test(await page.text('#tideV')));
    c('coast hides currents', !(await page.isVisible('#curV')));
    await page.click('#actSel [data-act=paddle]');
    c('switching activity in place', await page.evaluate(() => trip.activity === 'paddle' && trip.env === null));
    c('paddle water choices', (await page.locator('#envSel button').allInnerTexts()).join() === 'Auto,Ocean,Bay,Slough,River,Lake');
    await page.click('#envSel [data-env=river]');
    c('river hides tides', await page.evaluate(() => trip.env === 'river' && trip.envSet) && !(await page.isVisible('#tideV')));
    await page.click('#envSel [data-env=slough]');
    c('slough shows tides and currents', await page.isVisible('#tideV') && await page.isVisible('#curV'));
    await page.click('#envSel [data-env=""]');
    c('back to auto-detect', await page.evaluate(() => trip.envSet) === false);
    await ctx.close(); }

  { // record a track with no route, then reuse it
    const { ctx, page, errors } = await open(browser, url, { geolocation: { latitude: 37.80, longitude: -122.45 } });
    await page.goto(url); await ready(page); await view(page, 2);
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
    await view(page, 1);
    c('Trip view lists the track', await page.locator('#trackList [data-trackroute]').count() === 1);
    await page.click('#trackList [data-trackroute]');
    c('track becomes a route', await page.evaluate(() => trip.route.length >= 2 && trip.route.length <= 60), await page.evaluate(() => trip.route.length));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportGpx')]);
    const gpx = fs.readFileSync(await dl.path(), 'utf8');
    c('GPX has route and timed track', /<rte>/.test(gpx) && (gpx.match(/<trkpt/g) || []).length >= 8 && /<time>/.test(gpx));
    fs.writeFileSync(path.join(OUT, 'with-track.gpx'), gpx);
    await page.setInputFiles('#file', path.join(OUT, 'with-track.gpx')); await page.waitForTimeout(500);
    c('GPX import keeps the timed track', await page.evaluate(() => trip.tracks.length === 1 && trip.tracks[0].pts[0][2] > 0));
    await page.click('#trackList [data-showtrack]'); await page.waitForTimeout(600);
    c('track Map button shows it on the map', await page.evaluate(() => state.view) === 2);
    c('no page errors (tracks)', errors.length === 0, errors.join(' | ')); await ctx.close(); }

  { // out-and-back, reverse, Go with a route
    const { ctx, page } = await open(browser, url);
    await page.goto(url); await ready(page); await seedRoute(page, GG); await view(page, 1);
    await page.click('#outBack');
    c('out-and-back adds return legs', await page.evaluate(() => trip.route.length === 5 && trip.route[4].join() === trip.route[0].join()));
    await page.click('#reverse');
    c('reverse route', await page.evaluate(() => trip.route[1].join()) === GG[1].join());
    await page.click('#editRoute'); await page.waitForTimeout(500);
    c('Edit route opens the map in draw mode', await page.evaluate(() => state.view === 2 && state.drawing));
    await page.click('#doneBtn');
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
    c('legacy trip opens', (await page.text('#tabTrip')) === 'Old paddle');
    c('legacy tidal water -> bay', await page.evaluate(() => trip.activity === 'paddle' && trip.env === 'bay' && trip.envSet === true && Array.isArray(trip.tracks)));
    c('legacy speed setting migrated', await page.evaluate(() => settings.speeds.paddle) === 3.5);
    await ctx.close(); }

  { // settings live in the Trips view
    const { ctx, page } = await open(browser, url);
    await page.goto(url); await ready(page); await view(page, 0);
    await page.click('#vTrips details summary >> text=Settings');
    await page.fill('#sVar', '14'); await page.dispatchEvent('#sVar', 'change');
    await page.fill('#sGust', '20'); await page.dispatchEvent('#sGust', 'change');
    c('settings saved', await page.evaluate(() => settings.variation === 14 && settings.gust === 20));
    await ctx.close(); }

  { // PDF maps from the map view: auto-placement from printed GPS labels, adjust, persistence, opacity
    const { ctx, page, errors } = await open(browser, url);
    page.promptAnswer = 'Test brochure';
    await page.goto(url); await ready(page); await view(page, 2);
    await page.click('#mapsBtn'); await page.waitForSelector('#addPdf');
    c('PDF button opens the maps sheet', /PDF maps/.test(await page.text('#sheet')) && /None yet/.test(await page.text('#sheet')));
    await page.click('#sheet [data-close]');
    await page.setInputFiles('#pdfFile', path.join(OUT, 'brochure.pdf'));
    await page.waitForSelector('#nSave', { timeout: 60000 });
    c('PDF labels detected', /Found 3 GPS labels/.test(await page.text('#toast')), await page.text('#toast'));
    c('4 handles + centre while placing', await page.locator('.nudge').count() === 4 && await page.locator('.nudge-c').count() === 1);
    c('opacity control visible', await page.isVisible('#opBar'));
    await page.screenshot({ path: path.join(OUT, 'feat-pdf-nudge.png') });
    await page.click('#nSave'); await page.waitForTimeout(300);
    const m = await page.evaluate(async () => (await idb.all('trailMaps'))[0]);
    // page top-left (0,792) maps to about lat 37.946, lon -122.55; labels are drawn from their baseline, so allow some slack
    c('PDF map placed from labels', m && Math.abs(m.topLeft[0] - 37.946) < 0.03 && Math.abs(m.topLeft[1] + 122.55) < 0.03, m && JSON.stringify(m.topLeft));
    c('PDF map shown after save', await page.evaluate(() => shownMaps.size) === 1 && await page.locator('img.leaflet-image-layer').count() === 1);
    c('PDF button marked on', await page.evaluate(() => document.querySelector('#mapsBtn').classList.contains('on')));
    await page.evaluate(() => { const o = document.querySelector('#opacity'); o.value = 0.4; o.dispatchEvent(new Event('input')); });
    c('opacity applies', await page.evaluate(() => [...shownMaps.values()][0].layer.options.opacity) === 0.4);
    await page.reload(); await ready(page); await page.waitForTimeout(500);
    c('shown PDF map restored on reload', await page.locator('img.leaflet-image-layer').count() === 1);
    await page.click('#mapsBtn'); await page.waitForSelector('#sheet [data-adjust]');
    await page.click('#sheet [data-adjust]'); await page.waitForSelector('#nSave');
    const h = await page.locator('.nudge-c').boundingBox();
    await page.mouse.move(h.x + 17, h.y + 17); await page.mouse.down(); await page.mouse.move(h.x + 60, h.y + 17, { steps: 5 }); await page.mouse.up();
    await page.click('#nSave'); await page.waitForTimeout(300);
    const m2 = await page.evaluate(async () => (await idb.all('trailMaps'))[0]);
    c('adjust moves and saves', m2.topLeft[1] > m.topLeft[1] && /adjusted/.test(m2.method), `${m.topLeft[1]} -> ${m2.topLeft[1]} ${m2.method}`);
    await page.click('#mapsBtn'); await page.waitForSelector('#sheet [data-pdfmap]');
    await page.click('#sheet [data-pdfmap]'); await page.waitForTimeout(300);
    c('Hide removes the overlay', await page.locator('img.leaflet-image-layer').count() === 0 && await page.isHidden('#opBar'));
    await page.click('#sheet [data-close]');
    page.promptAnswer = 'Plain';
    await page.setInputFiles('#pdfFile', path.join(OUT, 'plain.pdf'));
    await page.waitForSelector('#nSave', { timeout: 60000 });
    c('PDF without position data: manual placement', /Drag the points/.test(await page.text('#toast')), await page.text('#toast'));
    await page.click('#nCancel');
    c('cancel discards it', await page.evaluate(async () => (await idb.all('trailMaps')).length) === 1);
    await page.click('#mapsBtn'); await page.waitForSelector('#sheet [data-rmpdf]');
    await page.click('#sheet [data-rmpdf]'); await page.waitForTimeout(300);
    c('delete PDF map', await page.evaluate(async () => (await idb.all('trailMaps')).length) === 0);
    c('no page errors (pdf)', errors.length === 0, errors.join(' | ')); await ctx.close(); }

  { // copy PDF maps from the GPS Map app on the same origin
    const { ctx, page } = await open(browser, url);
    await page.goto(url); await ready(page); await view(page, 2);
    await page.evaluate(() => new Promise(res => {
      const r = indexedDB.open('gpsmapdb3', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('regions', { keyPath: 'id' }); r.result.createObjectStore('trailMaps', { keyPath: 'id' }); };
      r.onsuccess = () => { const t = r.result.transaction(['trailMaps'], 'readwrite');
        t.objectStore('trailMaps').put({ id: 'g2', name: 'Pleasanton Ridge', imageBlob: new Blob(['x'], { type: 'image/jpeg' }), imageWidth: 10, imageHeight: 10, topLeft: [37.7, -121.9], topRight: [37.7, -121.8], bottomLeft: [37.6, -121.9], method: 'manual placement', createdAt: 1 });
        t.oncomplete = () => { r.result.close(); res(); }; };
    }));
    await page.click('#mapsBtn'); await page.waitForSelector('#addPdf');
    c('GPS Map copy offered', await page.isVisible('#copyGps'));
    await page.click('#copyGps'); await page.waitForTimeout(400);
    c('GPS Map PDF maps copied', /Pleasanton Ridge/.test(await page.text('#sheet')));
    await ctx.close(); }

  { // live location: follow, pan away, re-centre, stop
    const { ctx, page } = await open(browser, url, { geolocation: { latitude: 37.79, longitude: -122.40 } });
    await page.goto(url); await ready(page); await view(page, 2);
    await page.click('#locBtn'); await page.waitForTimeout(600);
    c('location shown and followed', await page.locator('.me').count() === 1 && await page.evaluate(() => state.follow) && await page.isVisible('#coords'));
    await page.mouse.move(200, 400); await page.mouse.down(); await page.mouse.move(260, 460, { steps: 5 }); await page.mouse.up();
    c('panning stops following', await page.evaluate(() => !state.follow && state.watch != null));
    await page.click('#locBtn'); await page.waitForTimeout(300);
    c('tap re-centres', await page.evaluate(() => state.follow && map.getBounds().contains([37.79, -122.40])));
    await page.click('#locBtn');
    c('tap again stops location', await page.evaluate(() => state.watch == null) && await page.locator('.me').count() === 0);
    c('map drag does not switch views', await page.evaluate(() => state.view) === 2);
    await ctx.close(); }

  { // service worker must not delete other apps' caches on the shared origin
    const { ctx, page } = await open(browser, url, { serviceWorkers: 'allow' });
    await page.goto(url + 'tests/out/'); // any page on the origin, before Outback's worker exists
    await page.evaluate(async () => { await caches.open('map-tiles'); await caches.open('my-location-shell-v8'); await caches.open('paddle-shell-v4'); await caches.open('outback-shell-v1'); });
    await page.goto(url); await ready(page);
    await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(800);
    const keys = await page.evaluate(() => caches.keys());
    c('other apps\' caches survive', keys.includes('map-tiles') && keys.includes('my-location-shell-v8'), keys.join(', '));
    c('old shell caches removed', !keys.includes('paddle-shell-v4') && !keys.includes('outback-shell-v1') && keys.some(k => /^outback-shell-v\d+$/.test(k)), keys.join(', '));
    await ctx.close(); }
};
