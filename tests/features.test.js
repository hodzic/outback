// Outback features: activity and terrain, elevation, imported tracks, navigation,
// legacy migration, PDF map overlays, GPS Map import, live location, cache sharing.
const fs = require('fs'), path = require('path');
const { open, waitForecast, seedRoute, ready, view, OUT } = require('./harness');
require('./make-pdf')(OUT);
// New trip from the Trips view; it lands on the map in draw mode, so finish drawing.
const newTrip = async (page, kind) => { await view(page, 0); await page.click({ hike: '#newHike', bike: '#newBike', paddle: '#newPaddle' }[kind]); await page.waitForTimeout(500); await page.click('#doneBtn'); };
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
    c('hike speed 2.5 mph', (await page.text('#spd')) === '2.5 mph', await page.text('#spd'));
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

  { // tracks come only from GPX import and can be reused
    const { ctx, page, errors } = await open(browser, url, { geolocation: { latitude: 37.80, longitude: -122.45 } });
    await page.goto(url); await ready(page); await view(page, 1);
    c('Tracks section hidden with no tracks', await page.isHidden('#tracksCard'));
    const t0 = Date.parse('2026-09-27T17:00:00Z');
    const pts = Array.from({ length: 12 }, (_, i) => [37.80 + i * 0.001, -122.45 + i * 0.0012]);
    fs.writeFileSync(path.join(OUT, 'watch.gpx'), `<gpx><trk><name>Watch track</name><trkseg>${pts.map((p, i) => `<trkpt lat="${p[0]}" lon="${p[1]}"><ele>3</ele><time>${new Date(t0 + i * 60000).toISOString()}</time></trkpt>`).join('')}</trkseg></trk></gpx>`);
    await page.setInputFiles('#file', path.join(OUT, 'watch.gpx')); await page.waitForTimeout(600);
    c('GPX import keeps the timed track', await page.evaluate(() => trip.tracks.length === 1 && trip.tracks[0].pts.length === 12 && trip.tracks[0].pts[0][2] > 0));
    c('Trip view lists the imported track', await page.isVisible('#tracksCard') && await page.locator('#trackList [data-trackroute]').count() === 1);
    c('track label has distance and time', /in 11 min/.test(await page.text('#trackList')), await page.text('#trackList'));
    await page.click('#trackList [data-trackroute]');
    c('track becomes a route', await page.evaluate(() => trip.route.length >= 2 && trip.route.length <= 60), await page.evaluate(() => trip.route.length));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportGpx')]);
    const gpx = fs.readFileSync(await dl.path(), 'utf8');
    c('GPX export has route and timed track', /<rte>/.test(gpx) && (gpx.match(/<trkpt/g) || []).length === 12 && /<time>/.test(gpx));
    await page.click('#trackList [data-showtrack]'); await page.waitForTimeout(600);
    c('track Map button shows it on the map', await page.evaluate(() => state.view) === 2);
    await page.click('#locBtn'); await page.waitForTimeout(400);
    for (let i = 1; i <= 4; i++){ await ctx.setGeolocation({ latitude: 37.80 + i * 0.001, longitude: -122.45 + i * 0.0012, accuracy: 8 }); await page.waitForTimeout(250); }
    c('location shown; moving records nothing', await page.locator('.me').count() === 1 && await page.evaluate(() => trip.tracks.length) === 1);
    c('no page errors (tracks)', errors.length === 0, errors.join(' | ')); await ctx.close(); }

  { // clear waypoints, kayak icon, edit route
    const { ctx, page } = await open(browser, url);
    await page.goto(url); await ready(page); await seedRoute(page, GG); await view(page, 1);
    c('no out-and-back or reverse buttons', await page.locator('#outBack, #reverse').count() === 0);
    await page.click('#clearRoute'); await page.waitForTimeout(200);
    c('clear waypoints empties the route', await page.evaluate(() => trip.route.length) === 0 && /0\.0 nm/.test(await page.text('#dist')));
    c('clear is disabled with no waypoints', await page.isDisabled('#clearRoute'));
    await view(page, 0);
    c('paddle trips show a kayak with a double-bladed paddle', await page.locator('#tripList .trip .ic svg ellipse[transform]').count() >= 2 && await page.locator('#tripList .trip', { hasText: '🛶' }).count() === 0);
    await seedRoute(page, GG); await view(page, 1);
    await page.click('#editRoute'); await page.waitForTimeout(500);
    c('Edit route opens the map in draw mode', await page.evaluate(() => state.view === 2 && state.drawing));
    await page.click('#doneBtn');
    c('Done leaves draw mode', await page.evaluate(() => !state.drawing));
    await ctx.close(); }

  { // named waypoints and named markers
    const { ctx, page, errors } = await open(browser, url, { geolocation: { latitude: 37.8001, longitude: -122.4497 } });
    await page.goto(url); await ready(page); await view(page, 2); await seedRoute(page, GG);
    const key0 = await page.evaluate(() => routeKey(trip.route));
    page.promptAnswer = 'Bonita';
    await page.locator('.wp', { hasText: /^2$/ }).click(); await page.click('.leaflet-popup [data-name]'); await page.waitForTimeout(200);
    c('name a waypoint from its popup', await page.evaluate(() => trip.route[1][2]) === 'Bonita');
    c('waypoint name shown on the map', (await page.locator('.wpname').allInnerTexts()).join() === 'Bonita');
    c('naming keeps the elevation profile valid', await page.evaluate(() => routeKey(trip.route)) === key0);
    await page.click('#locBtn'); await page.waitForTimeout(700);
    c('next-waypoint line uses the name', (await page.text('#toNext')).startsWith('→ 2 Bonita'), await page.text('#toNext'));
    await page.click('#locBtn');
    page.promptAnswer = 'Kirby Cove';
    const mb = await page.locator('#map').boundingBox();
    await page.mouse.click(mb.x + 120, mb.y + 420, { button: 'right' }); await page.waitForTimeout(300);
    c('long-press / right-click adds a named marker', await page.evaluate(() => trip.marks.length === 1 && trip.marks[0].name === 'Kirby Cove'));
    c('marker name shown on the map', (await page.locator('.mkname').allInnerTexts()).join() === 'Kirby Cove');
    page.promptAnswer = 'Put-in';
    await page.click('#drawBtn'); await page.click('#markBtn');
    await page.mouse.click(mb.x + 200, mb.y + 500); await page.waitForTimeout(300);
    c('Marker button in draw mode adds a marker, not a waypoint', await page.evaluate(() => trip.marks.length === 2 && trip.route.length === 3));
    await page.mouse.click(mb.x + 220, mb.y + 520); await page.waitForTimeout(200);
    c('next tap adds a waypoint again', await page.evaluate(() => trip.route.length) === 4);
    await page.click('#undoBtn'); await page.click('#doneBtn');
    await view(page, 1);
    c('Trip view lists markers', (await page.locator('#markList b').allInnerTexts()).join() === 'Kirby Cove,Put-in');
    page.promptAnswer = 'Kirby Cove beach';
    await page.locator('#markList [data-mkren]').first().click(); await page.waitForTimeout(200);
    c('rename a marker', await page.evaluate(() => trip.marks[0].name) === 'Kirby Cove beach');
    await page.click('#wpDetails summary'); await page.waitForFunction(() => document.querySelectorAll('#routeTable tr').length > 0);
    c('waypoint table shows the name', /2 Bonita/.test(await page.text('#routeTable')));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportGpx')]);
    const gpx = fs.readFileSync(await dl.path(), 'utf8');
    c('GPX export has markers and waypoint names', /<wpt [^>]+><name>Kirby Cove beach<\/name><\/wpt>/.test(gpx) && /<name>Bonita<\/name><\/rtept>/.test(gpx) && /<name>WP1<\/name>/.test(gpx));
    fs.writeFileSync(path.join(OUT, 'named.gpx'), gpx);
    await page.setInputFiles('#file', path.join(OUT, 'named.gpx')); await page.waitForTimeout(600);
    c('GPX import restores markers and names', await page.evaluate(() => trip.marks.map(m => m.name).join() === 'Kirby Cove beach,Put-in' && trip.route[1][2] === 'Bonita' && trip.route[0].length === 2));
    await page.locator('#markList [data-mkrm]').last().click(); await page.waitForTimeout(200);
    c('delete a marker', await page.evaluate(() => trip.marks.length) === 1);
    page.promptAnswer = '';
    await view(page, 2); await page.locator('.wp', { hasText: /^2$/ }).click(); await page.click('.leaflet-popup [data-name]'); await page.waitForTimeout(200);
    c('empty name clears it', await page.evaluate(() => trip.route[1].length) === 2);
    await page.locator('.wp', { hasText: /^2$/ }).click(); await page.click('.leaflet-popup [data-move]'); await page.waitForTimeout(200);
    c('Move in the popup switches on draw mode', await page.evaluate(() => state.drawing) && /Drag waypoint 2/.test(await page.text('#toast')), await page.text('#toast'));
    const before = await page.evaluate(() => trip.route[1].join());
    const wb = await page.locator('.wp', { hasText: /^2$/ }).boundingBox();
    await page.mouse.move(wb.x + 13, wb.y + 13); await page.mouse.down(); await page.mouse.move(wb.x + 70, wb.y + 50, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(300);
    c('then the waypoint can be dragged', await page.evaluate(() => trip.route[1].join()) !== before && await page.evaluate(() => trip.route.length) === 3);
    await page.click('#doneBtn');
    c('no page errors (names)', errors.length === 0, errors.join(' | ')); await ctx.close(); }

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
    c('legacy speed setting migrated', await page.evaluate(() => settings.speedsKt.paddle) === 3.5);
    c('legacy gust warning applies to every activity', await page.evaluate(() => settings.gustKt.paddle === 15 && settings.gustKt.hike === 15 && settings.gustKt.bike === 15 && !('gust' in settings)));
    await ctx.close(); }

  { // biking: street map, surfaces, elevation, mph
    const { ctx, page, errors } = await open(browser, url);
    await page.goto(url); await ready(page);
    await newTrip(page, 'bike');
    c('new bike trip', await page.evaluate(() => trip.activity === 'bike' && trip.name === 'New bike'));
    c('bike uses the street map', (await page.text('#layerBtn')) === 'Street', await page.text('#layerBtn'));
    await seedRoute(page, DIABLO); await view(page, 1);
    c('bike activity selected', (await page.text('#actSel .on')) === 'Bike');
    c('bike surfaces, no auto-detect', (await page.locator('#envSel button').allInnerTexts()).join() === 'Road,Gravel,Mountain bike' && await page.evaluate(() => trip.env) === 'road');
    c('bike speed 10 mph', (await page.text('#spd')) === '10 mph', await page.text('#spd'));
    await page.click('#fcBtn'); await waitForecast(page);
    c('bike gets elevation, no tides', /^\+[\d,]+ ft/.test(await page.text('#elevV')) && !(await page.isVisible('#tideV')));
    c('bike climb adds 1 h per 3000 ft', await page.evaluate(() => { const es = elevStats(); return Math.abs(hoursFor(routeNm(trip.route), es.up) - (routeNm(trip.route) / settings.speedsKt.bike + es.up / 3000)) < 1e-9; }));
    await page.click('#envSel [data-env=gravel]');
    c('pick gravel', await page.evaluate(() => trip.env) === 'gravel');
    await view(page, 0);
    c('bike icon in the list', await page.locator('#tripList .trip', { hasText: 'New bike' }).locator('svg').count() === 1);
    c('no page errors (bike)', errors.length === 0, errors.join(' | ')); await ctx.close(); }

  { // per-activity distance unit and speed in Settings
    const { ctx, page } = await open(browser, url);
    await page.goto(url); await ready(page); await seedRoute(page, GG); await view(page, 0);
    await page.click('#vTrips details summary >> text=Settings');
    c('settings row per activity', await page.locator('#actSettings tr').count() === 3);
    c('bike gust shown in mph', await page.inputValue('[data-gust=bike]') === '17');
    c('defaults nm / mi / mi', (await page.$$eval('#actSettings select', ss => ss.map(s => s.value))).join() === 'nm,mi,mi');
    const nm = await page.evaluate(() => routeNm(trip.route));
    await page.selectOption('[data-unit=paddle]', 'km');
    c('paddle in km', (await page.text('#dist')) === (nm * 1.852).toFixed(1) + ' km', await page.text('#dist'));
    c('speed converts with the unit', await page.inputValue('[data-speed=paddle]') === '5.6' && (await page.text('#spd')) === '5.6 km/h', await page.inputValue('[data-speed=paddle]'));
    c('wind follows the unit', /km\/h|–/.test(await page.text('#windV')));
    await page.fill('[data-speed=paddle]', '7.4'); await page.dispatchEvent('[data-speed=paddle]', 'change');
    c('speed saved in knots', Math.abs(await page.evaluate(() => settings.speedsKt.paddle) - 7.4 / 1.852) < 1e-9);
    await page.selectOption('[data-unit=hike]', 'km');
    c('gust warning shown in km/h', await page.inputValue('[data-gust=paddle]') === '28', await page.inputValue('[data-gust=paddle]'));
    await page.fill('[data-gust=paddle]', '37'); await page.dispatchEvent('[data-gust=paddle]', 'change');
    c('gust saved in knots, per activity', Math.abs(await page.evaluate(() => settings.gustKt.paddle) - 37 / 1.852) < 1e-9 && await page.evaluate(() => settings.gustKt.bike) === 15);
    await page.click('#tabs [data-view="1"]'); await page.waitForTimeout(400);
    c('gust limit drives the wind warning', await page.evaluate(() => gust()) === 37 / 1.852);
    await page.click('#tabs [data-view="0"]'); await page.waitForTimeout(400);
    c('other activities keep their own unit', await page.evaluate(() => settings.units.paddle === 'km' && settings.units.hike === 'km' && settings.units.bike === 'mi'));
    c('list uses each trip\'s unit', / km/.test(await page.text('#tripList')));
    await page.reload(); await ready(page);
    c('units persist', await page.evaluate(() => settings.units.paddle) === 'km' && / km$/.test(await page.text('#dist')));
    await ctx.close(); }

  { // Share Outback: share sheet when available, else copy the link
    const { ctx, page } = await open(browser, url, { permissions: ['geolocation', 'clipboard-read', 'clipboard-write'] });
    await page.addInitScript(() => { navigator.share = d => { window.__shared = d; return Promise.resolve(); }; });
    await page.goto(url); await ready(page); await view(page, 0);
    await page.click('#shareApp');
    const d = await page.evaluate(() => window.__shared);
    c('Share Outback opens the share sheet with the app link', d && d.title === 'Outback' && d.url === url, JSON.stringify(d));
    c('install help shows this address', (await page.locator('.appUrl').first().textContent()) === url.replace(/^https?:\/\//, '').replace(/\/$/, ''), await page.locator('.appUrl').first().textContent());
    await ctx.close(); }
  { const { ctx, page } = await open(browser, url, { permissions: ['geolocation', 'clipboard-read', 'clipboard-write'] });
    await page.addInitScript(() => { delete Navigator.prototype.share; });
    await page.goto(url); await ready(page); await view(page, 0);
    await page.click('#shareApp'); await page.waitForTimeout(200);
    c('without a share sheet the link is copied', (await page.evaluate(() => navigator.clipboard.readText())) === url && /Link copied/.test(await page.text('#toast')), await page.text('#toast'));
    await ctx.close(); }

  { // install help on the Trips view
    const { ctx, page } = await open(browser, url);
    await page.goto(url); await ready(page); await view(page, 0);
    c('install help is collapsed at first', !(await page.isVisible('#helpInstall ol')));
    await page.click('#helpInstall summary');
    const t = await page.text('#helpInstall');
    c('install help covers Android and iPhone', /Android \(Chrome\)/.test(t) && /Install app/.test(t) && /iPhone and iPad \(Safari\)/.test(t) && /Add to Home Screen/.test(t), t.slice(0, 80));
    c('install help comes before offline help', await page.evaluate(() => document.querySelector('#helpInstall').nextElementSibling.id === 'helpOffline'));
    c('iPhone home-screen icon and name set', await page.evaluate(() => !!document.querySelector('link[rel=apple-touch-icon]') && document.querySelector('meta[name=apple-mobile-web-app-title]').content === 'Outback'));
    await ctx.close(); }

  { // offline help on the Trips view
    const { ctx, page } = await open(browser, url);
    await page.goto(url); await ready(page); await view(page, 0);
    c('offline help is collapsed at first', !(await page.isVisible('#helpOffline ol')));
    await page.click('#helpOffline summary');
    const t = await page.text('#helpOffline');
    c('offline help explains preparing, offline and online parts', /Before you leave/.test(t) && /Works offline/.test(t) && /Needs a connection/.test(t) && /Get forecast/.test(t), t.slice(0, 80));
    await ctx.close(); }

  { // settings live in the Trips view
    const { ctx, page } = await open(browser, url);
    await page.goto(url); await ready(page); await view(page, 0);
    await page.click('#vTrips details summary >> text=Settings');
    await page.fill('#sVar', '14'); await page.dispatchEvent('#sVar', 'change');
    c('settings saved', await page.evaluate(() => settings.variation === 14));
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

  { // live location: on/off only, never moves the map; Get forecast saves the trip's map view
    const { ctx, page } = await open(browser, url, { geolocation: { latitude: 37.79, longitude: -122.40 } });
    await page.goto(url); await ready(page); await seedRoute(page, [[37.70, -122.60], [37.71, -122.58]]); await view(page, 2);
    await page.evaluate(() => fitTrip()); await page.waitForTimeout(300);
    const at = () => page.evaluate(() => [map.getCenter().lat, map.getCenter().lng, map.getZoom()]);
    const near = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6 && a[2] === b[2];
    const home = await at();
    await page.click('#locBtn'); await page.waitForTimeout(600);
    c('location on shows the dot without moving the map', await page.locator('.me').count() === 1 && await page.isVisible('#coords') && near(await at(), home));
    await ctx.setGeolocation({ latitude: 37.791, longitude: -122.401 }); await page.waitForTimeout(500);
    c('position updates do not move the map', near(await at(), home));
    await page.mouse.move(200, 400); await page.mouse.down(); await page.mouse.move(260, 460, { steps: 5 }); await page.mouse.up();
    c('panning keeps location on', await page.evaluate(() => state.locating && state.watch != null));
    await page.waitForTimeout(500); const panned = await at();
    c('map drag does not switch views', await page.evaluate(() => state.view) === 2);
    await page.click('#locBtn'); await page.waitForTimeout(300);
    c('tap again turns location off, map stays', await page.evaluate(() => state.watch == null) && await page.locator('.me').count() === 0 && near(await at(), panned));
    await page.evaluate(() => map.setView([37.705, -122.59], 13)); await page.waitForTimeout(300);
    await view(page, 1); await page.click('#fcBtn'); await waitForecast(page);
    c('Get forecast saves the current map view as the trip view', await page.evaluate(() => trip.anchor && trip.anchor.z === 13 && Math.abs(trip.anchor.c[0] - 37.705) < 1e-3), await page.evaluate(() => JSON.stringify([trip.anchor, state.view])));
    await page.evaluate(() => map.setView([37.79, -122.40], 15));
    await page.evaluate(async () => { await saveNow(); await openTrip(await idb.get('trips', trip.id)); }); await page.waitForTimeout(300);
    c('opening the trip returns to its saved view', await page.evaluate(() => { const c = map.getCenter(); return map.getZoom() === trip.anchor.z && Math.abs(c.lat - trip.anchor.c[0]) < 1e-6 && Math.abs(c.lng - trip.anchor.c[1]) < 1e-6; }));
    await page.evaluate(() => map.setView([38.5, -121.0], 12)); await page.click('#fcBtn'); await waitForecast(page);
    c('forecast with the trip off screen fits the trip instead', await page.evaluate(() => L.latLng(trip.anchor.c).distanceTo([37.705, -122.59]) < 5000));
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
