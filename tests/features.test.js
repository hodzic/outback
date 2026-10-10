// Outback features: activity and terrain, elevation, imported tracks, navigation,
// legacy migration, PDF map overlays, GPS Map import, live location, cache sharing.
const fs = require('fs'), path = require('path');
const { hold, open, waitForecast, seedRoute, ready, view, OUT } = require('./harness');
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
    { await page.evaluate(() => { settings.graph = 'elev'; render(); });
      const got = await page.evaluate(() => { const P = CanvasRenderingContext2D.prototype, f = P.fillText, out = [];
        P.fillText = function(t, ...a){ if (this.canvas === cv) out.push(t); return f.call(this, t, ...a); };
        try{ const r = cv.getBoundingClientRect(); cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + r.width / 2, clientY: r.top + 30, pointerId: 1, bubbles: true })); } finally{ P.fillText = f; }
        return { f: state.elevF, out }; });
      c('elevation graph reads elevation, distance and time at the picked spot', Math.abs(got.f - .5) < .02 && got.out.some(t => /^[\d,]+ ft · \d+\.\d mi · \d/.test(t)), got.out.join(' | '));
      c('elevation hint says to drag along the route', /elevation along the route/.test(await page.text('#chartHint'))); }
    c('graph offers Elevation and Wind', (await page.locator('#graphSel button').allInnerTexts()).join() === 'Elevation,Wind');
    c('wind shown in mph', (await page.text('#windK')) === 'Wind · mph' && /mph/.test(await page.text('#atWind')), await page.text('#windK'));
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
    c('route card is one line plus waypoints, no buttons', await page.locator('#vTrip .rt button').count() === 0 && await page.isVisible('#wpDetails summary')
      && await page.evaluate(() => document.querySelector('.rline').getBoundingClientRect().height < 30));
    await view(page, 2); await page.click('#drawBtn');
    c('Clear sits in the map route editor', await page.isVisible('#drawBar #clearRoute'));
    await page.click('#clearRoute'); await page.waitForTimeout(200);
    c('clear waypoints empties the route', await page.evaluate(() => trip.route.length) === 0 && await page.locator('.wp').count() === 0);
    c('clear is disabled with no waypoints', await page.isDisabled('#clearRoute'));
    await page.click('#doneBtn'); await view(page, 1);
    c('empty route says to draw it on the map', /none yet/.test(await page.text('#dist')) && !(await page.isVisible('#dur')), await page.text('#dist'));
    await view(page, 0);
    c('paddle trips show a kayak with a double-bladed paddle', await page.locator('#tripList .trip .ic svg ellipse[transform]').count() >= 2 && await page.locator('#tripList .trip', { hasText: '🛶' }).count() === 0);
    await seedRoute(page, GG); await view(page, 1);
    await view(page, 2); await page.click('#drawBtn');
    c('route button opens draw mode', await page.evaluate(() => state.view === 2 && state.drawing));
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
    await hold(page, '#locBtn');
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
    c('markers fold out in the route card, after waypoints', (await page.text('#mkSum')) === 'Markers (2)' && await page.evaluate(() => document.querySelector('#wpDetails').nextElementSibling.id === 'mkDetails' && !!document.querySelector('.rt #mkDetails')));
    await page.click('#mkSum');
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
    c('wind follows the unit', (await page.text('#windK')) === 'Wind · km/h' || (await page.text('#windV')) === '–');
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

  { // Help: its own page from the ? buttons
    const { ctx, page } = await open(browser, url);
    await page.goto(url); await ready(page); await view(page, 0);
    c('help is not on the Trips page any more', await page.evaluate(() => !document.querySelector('#vTrips .help') && document.querySelectorAll('#helpPage .help').length === 6));
    c('? button at the top of Trips and Trip', await page.evaluate(() => ['#vTrips', '#vTrip'].every(v => document.querySelector(v + ' [data-help]'))));
    for (const v of [1, 0]){
      await view(page, v); await page.locator(['#vTrips', '#vTrip'][v] + ' [data-help]').click();
      c(`? opens the help page (tab ${v})`, await page.isVisible('#helpPage') && /Install on your phone/.test(await page.text('#helpPage')));
      if (v === 1){ await page.goBack(); await page.waitForTimeout(200); c('phone back button closes help', await page.isHidden('#helpPage') && await page.evaluate(() => state.view === 1)); }
      else { await page.click('#helpClose'); await page.waitForTimeout(200); c(`Close returns to the tab (${v})`, await page.isHidden('#helpPage') && await page.evaluate(v => state.view === v, v)); }
    }
    await page.screenshot({ path: path.join(OUT, 'feat-help-btn.png') });
    await page.locator('#vTrips [data-help]').click();
    await page.screenshot({ path: path.join(OUT, 'feat-help.png') });
    c('install help is collapsed at first', !(await page.isVisible('#helpInstall ol')));
    await page.click('#helpInstall summary');
    const t = await page.text('#helpInstall');
    c('install help covers Android and iPhone', /Android \(Chrome\)/.test(t) && /Install app/.test(t) && /iPhone and iPad \(Safari\)/.test(t) && /Add to Home Screen/.test(t), t.slice(0, 80));
    c('install help comes before offline help', await page.evaluate(() => document.querySelector('#helpInstall').nextElementSibling.id === 'helpOffline'));
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    c('Escape closes help', await page.isHidden('#helpPage'));
    c('iPhone home-screen icon and name set', await page.evaluate(() => !!document.querySelector('link[rel=apple-touch-icon]') && document.querySelector('meta[name=apple-mobile-web-app-title]').content === 'Outback'));
    await ctx.close(); }

  { // offline help
    const { ctx, page } = await open(browser, url);
    await page.goto(url); await ready(page); await view(page, 0); await page.locator('#vTrips [data-help]').click();
    c('offline help is collapsed at first', !(await page.isVisible('#helpOffline ol')));
    await page.click('#helpOffline summary');
    const t = await page.text('#helpOffline');
    c('offline help explains preparing, offline and online parts', /Before you leave/.test(t) && /Works offline/.test(t) && /Needs a connection/.test(t) && /Get forecast/.test(t), t.slice(0, 80));
    c('AIS help follows offline help, collapsed', await page.evaluate(() => document.querySelector('#helpOffline').nextElementSibling.id === 'helpAis') && !(await page.isVisible('#helpAis ol')));
    await page.click('#helpAis summary');
    const a = await page.text('#helpAis');
    c('AIS help explains the key, the map and the limits', /aisstream\.io/.test(a) && /API Keys/.test(a) && /demo/.test(a) && /0\.5 nm/.test(a) && /lookout/.test(a), a.slice(0, 80));
    await ctx.close(); }

  { // settings live in the Trips view
    const { ctx, page } = await open(browser, url);
    await page.goto(url); await ready(page); await view(page, 0);
    await page.click('#vTrips details summary >> text=Settings');
    await page.fill('#sVar', '14'); await page.dispatchEvent('#sVar', 'change');
    c('settings saved', await page.evaluate(() => settings.variation === 14));
    await ctx.close(); }

  { // Share plan (text for a forum, plus GPX) and the printable trip sheet
    const { ctx, page, errors } = await open(browser, url, { permissions: ['geolocation', 'clipboard-read', 'clipboard-write'] });
    await page.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
    await page.goto(url); await ready(page); await view(page, 2);
    await seedRoute(page, [[37.8321, -122.4762, 'Horseshoe Cove'], [37.8270, -122.4400], [37.8110, -122.4200, 'Aquatic Park']]);
    await page.evaluate(() => { trip.marks.push({ id: 'k1', lat: 37.826, lng: -122.4228, name: 'Alcatraz' }); trip.name = 'Club paddle'; changed(); });
    await view(page, 1);
    await page.click('#sharePlan'); await page.waitForSelector('#planTxt');
    let t = await page.inputValue('#planTxt');
    c('plan text without a forecast: name, day, start, route, waypoints, markers, app link', /^Club paddle\nPaddle · .*start 9:00 AM/.test(t) && /Route: [\d.]+ nm/.test(t) && /1 Horseshoe Cove  37\.83210, -122\.47620  leave 9:00 AM/.test(t)
      && /3 Aquatic Park  37\.81100, -122\.42000  [\d.]+ nm, \d{3}°M, \d+:\d\d [AP]M/.test(t) && /Alcatraz  37\.82600, -122\.42280/.test(t) && /google\.com\/maps\/search\/\?api=1&query=37\.83210,-122\.47620/.test(t)
      && /Planned with Outback: http/.test(t) && !/Forecast for the day/.test(t), t);
    await page.click('#sheet [data-close]');
    await page.click('#fcBtn'); await waitForecast(page);
    await page.click('#sharePlan'); await page.waitForSelector('#planTxt'); t = await page.inputValue('#planTxt');
    c('plan text includes the day forecast', /Forecast for the day \(as of/.test(t) && /Tide · San Francisco: [\d.]+ – [\d.]+ ft; \d+:\d\d[ap] (Low|High)/.test(t) && /Wind · kt: AM \d+ G\d+ \w+; PM/.test(t) && /Sun: Rise \d/.test(t), t);
    await page.click('#planCopy'); await page.waitForTimeout(150);
    c('Copy text puts the plan on the clipboard', (await page.evaluate(() => navigator.clipboard.readText())) === t && /copied/.test(await page.text('#toast')));
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click('#planGpx')]);
    c('GPX file from the share sheet', dl && /^Club-paddle_\d{4}-\d\d-\d\d\.gpx$/.test(dl.suggestedFilename()), dl && dl.suggestedFilename());
    await page.click('#sheet [data-close]');
    await page.click('#printPlan'); await page.waitForTimeout(1200);
    c('Print opens a preview with title, map, waypoints, forecast and graphs', await page.isVisible('#printView') && /Club paddle/.test(await page.text('#printDoc h1'))
      && await page.locator('#pMap .leaflet-tile').count() > 0 && await page.locator('#pMap .wp').count() === 3 && await page.locator('#printDoc table tr').count() >= 4
      && /Tide · San Francisco/.test(await page.text('#printDoc dl')) && await page.locator('#printDoc canvas[data-kind]').count() === 2);
    c('graphs drawn sharp for paper', await page.evaluate(() => [...document.querySelectorAll('#printDoc canvas')].every(c => c.width >= c.clientWidth * 3 - 1)));
    await page.click('#pPrint');
    c('Print button prints', await page.evaluate(() => window.__printed === 1));
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({ format: 'Letter' });
    c('trip sheet fits on one Letter page', (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length === 1);
    await page.emulateMedia({ media: 'screen' });
    await page.goBack(); await page.waitForTimeout(200);
    c('back closes the print preview', await page.isHidden('#printView') && await page.evaluate(() => state.view === 1 && !pMap));
    c('no page errors (share, print)', errors.length === 0, errors.join(' | ')); await ctx.close(); }

  { // Restrooms: 🚻 shows OpenStreetMap toilets in view, with details and directions; kept for offline
    const { ctx, page, errors } = await open(browser, url);
    await page.goto(url); await ready(page); await view(page, 2);
    await page.evaluate(() => map.setView([37.82, -122.45], 13, { animate: false })); await page.waitForTimeout(300);
    c('🚻 button on the map, off at first', await page.isVisible('#wcBtn') && !(await page.evaluate(() => settings.toilets)) && await page.locator('.poi.wc').count() === 0);
    await page.click('#wcBtn'); await page.waitForFunction(() => document.querySelectorAll('.poi.wc').length === 2, null, { timeout: 5000 }).catch(() => {});
    c('🚻 shows restrooms from OpenStreetMap (nodes and areas)', await page.locator('.poi.wc').count() === 2 && ctx.toiletHits === 1, ctx.toiletHits);
    await page.locator('.poi.wc').first().click(); await page.waitForTimeout(300);
    const pop = await page.text('.leaflet-popup-content');
    c('restroom details: name, free, flush, hours, wheelchair, directions', /Horseshoe Cove restroom/.test(pop) && /Free/.test(pop) && /Flush/.test(pop) && /Open 24\/7/.test(pop) && /Wheelchair accessible/.test(pop)
      && await page.locator('.leaflet-popup-content a[href^="https://www.google.com/maps/dir/?api=1&destination=37.8326,-122.4766"]').count() === 1, pop);
    await page.evaluate(() => map.closePopup());
    await page.locator('.poi.wc').nth(1).click(); await page.waitForTimeout(300);
    c('customers-only vault toilet labelled', /Customers only/.test(await page.text('.leaflet-popup-content')) && /Vault or pit toilet/.test(await page.text('.leaflet-popup-content')));
    await page.evaluate(() => { map.closePopup(); map.panBy([40, 0], { animate: false }); }); await page.waitForTimeout(1200);
    c('panning within fetched cells does not ask again', ctx.toiletHits === 1, ctx.toiletHits);
    await page.screenshot({ path: path.join(OUT, 'feat-restrooms.png') });
    // later, with OpenStreetMap out of reach: the saved restrooms still show
    await page.route(/overpass/, r => r.abort()); const hits = ctx.toiletHits;
    await page.reload(); await ready(page); await view(page, 2);
    await page.evaluate(() => map.setView([37.82, -122.45], 13, { animate: false })); await page.waitForTimeout(1800);
    c('restrooms remembered and shown without OpenStreetMap', await page.locator('.poi.wc').count() === 2 && await page.evaluate(() => settings.toilets) && ctx.toiletHits === hits);
    await page.unroute(/overpass/);
    await page.evaluate(() => map.setView([37.5, -122.0], 8, { animate: false })); await page.waitForTimeout(1200);
    c('zoomed far out: asks to zoom in instead of fetching a huge area', /Zoom in to see restrooms/.test(await page.text('#toast')) && ctx.toiletHits === 1, await page.text('#toast'));
    // parking: P shows lots with fees, hours, capacity and directions
    await page.evaluate(() => map.setView([37.82, -122.45], 13, { animate: false })); await page.waitForTimeout(300);
    c('P button on the map, off at first', await page.isVisible('#pkBtn') && await page.locator('.poi.pk').count() === 0);
    await page.click('#pkBtn'); await page.waitForFunction(() => document.querySelectorAll('.poi.pk').length === 2, null, { timeout: 5000 }).catch(() => {});
    c('P shows parking from OpenStreetMap', await page.locator('.poi.pk').count() === 2 && ctx.parkingHits === 1 && /Parking © OpenStreetMap/.test(await page.text('.leaflet-control-attribution')));
    const openPk = i => page.evaluate(i => POI.parking.layer.getLayers().find(m => m.getLatLng().lat === [37.8331, 37.8065][i]).openPopup(), i);
    await openPk(0); await page.waitForTimeout(300);
    let pp = await page.text('.leaflet-popup-content');
    c('parking details: name, operator, fee with charge, hours, spaces, directions', /Horseshoe Cove lot/.test(pp) && /National Park Service/.test(pp) && /Fee: \$5\/day/.test(pp) && /Hours: 05:00-22:00/.test(pp) && /40 spaces/.test(pp)
      && await page.locator('.leaflet-popup-content a[href*="destination=37.8331,-122.4772"]').count() === 1, pp);
    await page.evaluate(() => map.closePopup()); await openPk(1); await page.waitForTimeout(300); pp = await page.text('.leaflet-popup-content');
    c('free customers-only parking with a time limit, greyed', /Free/.test(pp) && /Customers only/.test(pp) && /Max stay 2 hours/.test(pp) && await page.locator('.poi.pk.closed').count() === 1, pp);
    await page.evaluate(() => map.closePopup());
    await page.click('#pkBtn'); await page.waitForTimeout(200);
    c('P again hides parking', await page.locator('.poi.pk').count() === 0 && !(await page.evaluate(() => settings.parking)));
    await page.click('#wcBtn'); await page.waitForTimeout(200);
    c('🚻 again hides restrooms', await page.locator('.poi.wc').count() === 0 && !(await page.evaluate(() => settings.toilets)));
    c('no page errors (restrooms)', errors.length === 0, errors.join(' | ')); await ctx.close(); }

  { // Boat launches: SF Bay Area Water Trail sites (shipped) plus OSM ramps and put-ins
    const { ctx, page, errors } = await open(browser, url);
    await page.goto(url); await ready(page); await view(page, 2);
    await page.evaluate(() => map.setView([37.87, -122.31], 13, { animate: false })); await page.waitForTimeout(300);
    c('🛶 launches button on paddle trips', await page.isVisible('#lnBtn'));
    await page.click('#lnBtn'); await page.waitForFunction(() => document.querySelectorAll('.poi.ln').length > 1, null, { timeout: 5000 }).catch(() => {});
    const n = await page.evaluate(() => ({ wt: document.querySelectorAll('.poi.ln.wt').length, osm: document.querySelectorAll('.poi.ln:not(.wt)').length, all: waterTrail.sites?.length }));
    c('🛶 shows Water Trail sites (48 shipped) and OSM put-ins, without duplicating a Water Trail site', n.all === 48 && n.wt >= 2 && n.osm === 1, JSON.stringify(n));
    await page.evaluate(() => POI.launch.layer.getLayers().find(m => Math.abs(m.getLatLng().lat - waterTrail.sites.find(s => s.id === 'wt-albany-beach').lat) < 1e-6).openPopup()); await page.waitForTimeout(300);
    const pop = await page.text('.leaflet-popup-content');
    c('Water Trail popup: name, manager, launch, facilities, parking and links', /Albany Beach/.test(pop) && /Launch:/.test(pop) && /Facilities:/.test(pop) && /Parking/.test(pop)
      && await page.locator('.leaflet-popup-content a[href^="https://sfbaywatertrail.org/trailhead/"]').count() === 1 && await page.locator('.leaflet-popup-content a[href*="google.com/maps/dir"]').count() === 1, pop.slice(0, 200));
    await page.click('.leaflet-popup-content [data-wtstart]'); await page.waitForTimeout(200);
    c('Start route here puts the launch at the start of the route', await page.evaluate(() => trip.route.length === 1 && trip.route[0][2] === 'Albany Beach'));
    await page.screenshot({ path: path.join(OUT, 'feat-launches.png') });
    await page.click('#tabs [data-view="0"]'); await page.click('#newHike'); await page.waitForTimeout(500);
    c('no launches on a hike', await page.isHidden('#lnBtn') && await page.evaluate(() => !map.hasLayer(POI.launch.layer)));
    c('no page errors (launches)', errors.length === 0, errors.join(' | ')); await ctx.close(); }

  { // Satellite layer and scale bar
    const { ctx, page, errors } = await open(browser, url);
    const tiles = []; page.on('request', r => { if (r.url().includes('USGSImageryOnly')) tiles.push(r.url()); });
    await page.goto(url); await ready(page); await view(page, 2);
    const names = [];
    for (let i = 0; i < 4; i++){ names.push(await page.text('#layerBtn')); await page.click('#layerBtn'); await page.waitForTimeout(150); }
    c('layer button cycles Chart, Street, Topo, Sat (satellite)', names.join() === 'Chart,Street,Topo,Sat' && (await page.text('#layerBtn')) === 'Chart', names.join());
    await page.click('#layerBtn'); await page.click('#layerBtn'); await page.click('#layerBtn'); await page.waitForTimeout(500);
    c('Satellite loads USGS imagery tiles and is remembered', (await page.text('#layerBtn')) === 'Sat' && tiles.length > 0 && /\/tile\/\d+\/\d+\/\d+$/.test(tiles[0])
      && await page.evaluate(() => settings.layer === 'sat'), tiles[0]);
    c('Satellite credited', /USGS The National Map: imagery/.test(await page.text('.leaflet-control-attribution')));
    await page.screenshot({ path: path.join(OUT, 'feat-satellite.png') });
    const scale = () => page.text('.leaflet-control-scale-line');
    c('scale bar on the map in nautical miles or feet for a paddle', await page.isVisible('.leaflet-control-scale') && /^\d+ (nm|ft)$/.test(await scale()), await scale());
    await page.evaluate(() => map.setZoom(9, { animate: false })); await page.waitForTimeout(200);
    c('zoomed out the scale reads nm', /^\d+ nm$/.test(await scale()), await scale());
    await page.evaluate(() => { settings.units.paddle = 'km'; changed(); }); await page.waitForTimeout(100);
    c('scale follows the unit setting (km)', /^\d+ km$/.test(await scale()), await scale());
    await page.evaluate(() => map.setZoom(17, { animate: false })); await page.waitForTimeout(200);
    c('zoomed in it reads metres', /^\d+ m$/.test(await scale()), await scale());
    // sea marks: ⚓ on paddle trips toggles OpenSeaMap over the base map, remembered
    const sea = []; page.on('request', r => { if (r.url().includes('tiles.openseamap.org/seamark/')) sea.push(r.url()); });
    await page.evaluate(() => map.setZoom(13, { animate: false }));
    c('⚓ sea marks button on paddle trips, off at first', await page.isVisible('#seaBtn') && !(await page.evaluate(() => document.querySelector('#seaBtn').classList.contains('on'))));
    await page.click('#seaBtn'); await page.waitForTimeout(400);
    c('⚓ shows OpenSeaMap sea marks and is remembered', sea.length > 0 && await page.evaluate(() => settings.seamarks === true && map.hasLayer(seaLayer) && document.querySelector('#seaBtn').classList.contains('on'))
      && /OpenSeaMap/.test(await page.text('.leaflet-control-attribution')), sea[0]);
    await page.click('#layerBtn'); await page.waitForTimeout(200);
    c('sea marks stay on when the base layer changes', await page.evaluate(() => map.hasLayer(seaLayer)));
    await page.screenshot({ path: path.join(OUT, 'feat-seamarks.png') });
    await page.click('#seaBtn'); await page.waitForTimeout(200);
    c('⚓ again turns sea marks off', await page.evaluate(() => !settings.seamarks && !seaLayer));
    await page.click('#seaBtn');
    await page.click('#tabs [data-view="0"]'); await page.click('#newHike'); await page.waitForTimeout(500);
    c('no sea marks on a hike', await page.isHidden('#seaBtn') && await page.evaluate(() => !seaLayer));
    c('no page errors (satellite, scale)', errors.length === 0, errors.join(' | ')); await ctx.close(); }

  { // PDF maps from the map view: auto-placement from printed GPS labels, adjust, persistence, opacity
    const { ctx, page, errors } = await open(browser, url);
    page.promptAnswer = 'Test brochure';
    await page.goto(url); await ready(page); await view(page, 2);
    await page.click('#mapsBtn'); await page.waitForSelector('#addPdf');
    c('PDF button opens the maps sheet', /Overlay PDF maps/.test(await page.text('#sheet')) && /None yet/.test(await page.text('#sheet')));
    await page.click('#pdfHelp'); await page.waitForTimeout(700);
    c('PDF list links to PDF help, which covers Auto-align', await page.evaluate(() => !document.querySelector('#helpPage').hidden && !document.querySelector('#sheet').open && document.querySelector('#helpPdf').open)
      && /Auto-align/.test(await page.text('#helpPdf')) && /Undo align/.test(await page.text('#helpPdf')));
    c('Tomales Bay and SF Bay help follows PDF help, links open in a new tab', await page.evaluate(() => { const h = document.querySelector('#helpWaters'), l = [...h.querySelectorAll('a')];
      return h.previousElementSibling.id === 'helpPdf' && l.length >= 8 && l.every(a => a.target === '_blank' && a.rel === 'noopener' && a.href.startsWith('https://')) && l.some(a => a.href.includes('nps.gov/pore')) && l.some(a => a.href.includes('sfbaywatertrail.org')); }));
    await page.click('#helpClose'); await page.waitForTimeout(200);
    c('closing PDF help returns to the map', await page.evaluate(() => state.view === 2) && await page.isHidden('#helpPage'));
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

  { // Built-in overlay maps: Tomales Bay (NPS), already placed
    const { ctx, page, errors } = await open(browser, url);
    await page.goto(url); await ready(page); await view(page, 2);
    await page.click('#mapsBtn'); await page.waitForSelector('#sheet [data-builtin]');
    c('PDF list offers the built-in Tomales Bay map', /Built-in maps/.test(await page.text('#sheet')) && /Tomales Bay boat-in camping \(NPS\)/.test(await page.text('#sheet'))
      && await page.evaluate(() => document.querySelector('#sheet .item img').naturalWidth > 0));
    await page.click('#sheet [data-builtin="builtin-tomales-bay"]');
    await page.waitForFunction(() => shownMaps.has('builtin-tomales-bay'), null, { timeout: 15000 });
    const m = await page.evaluate(async () => { const m = await idb.get('trailMaps', 'builtin-tomales-bay'); return { ...m, size: m.imageBlob.size, imageBlob: null }; });
    c('Add copies it to the phone, placed over Tomales Bay', m.size === 559295 && m.method === 'built-in, National Park Service' && Math.abs(m.topLeft[0] - 38.27) < 0.01 && Math.abs(m.topLeft[1] + 123.04) < 0.01, JSON.stringify(m.topLeft));
    c('built-in map shown and the map zooms to it', await page.locator('img.leaflet-image-layer').count() === 1 && await page.evaluate(() => map.getBounds().contains([38.18, -122.94])));
    await page.click('#mapsBtn'); await page.waitForSelector('#sheet [data-rmpdf]');
    c('added built-in moves to your maps, no longer offered', !(await page.locator('#sheet [data-builtin="builtin-tomales-bay"]').count()) && /Tomales Bay boat-in camping/.test(await page.text('#sheet')));
    await page.click('#sheet [data-rmpdf]'); await page.waitForSelector('#sheet [data-builtin="builtin-tomales-bay"]');
    c('deleting it offers it again', await page.evaluate(async () => !(await idb.get('trailMaps', 'builtin-tomales-bay')) && shownMaps.size === 0));
    // Del Valle and the Delta: each image loads and lands where it belongs
    for (const [id, lat, lon, name] of [['builtin-del-valle', 37.59, -121.71, 'Del Valle Regional Park'], ['builtin-delta', 38.05, -121.55, 'Sacramento–San Joaquin Delta boating']]){
      c(`built-in offered: ${name}`, (await page.text('#sheet')).includes(name));
      await page.click(`#sheet [data-builtin="${id}"]`); await page.waitForFunction(id => shownMaps.has(id), id, { timeout: 15000 });
      const ok = await page.evaluate(async ([id, lat, lon]) => { const m = await idb.get('trailMaps', id), b = BUILTIN_MAPS.find(x => x.id === id);
        const img = await createImageBitmap(m.imageBlob); return m.imageBlob.size === b.size && Math.abs(img.width - b.imageWidth) < 1 && Math.abs(img.height - b.imageHeight) < 1
          && shownMaps.get(id).layer.getBounds().contains([lat, lon]); }, [id, lat, lon]);
      c(`built-in ${name}: image and placement`, ok);
      await page.click('#mapsBtn'); await page.waitForSelector('#sheet [data-rmpdf]');
    }
    await page.click('#sheet [data-close]');
    c('no page errors (built-in maps)', errors.length === 0, errors.join(' | ')); await ctx.close(); }

  { // Auto-align: match the lake drawn on the PDF to OpenStreetMap water
    const { LAKE, lakeGeo } = require('./make-pdf');
    const ring = [...LAKE, LAKE[0]].map(([x, y]) => { const [lat, lon] = lakeGeo(x, y); return { lat, lon }; });
    const { ctx, page, errors } = await open(browser, url, {}, { overpass: [{ type: 'way', id: 1, geometry: ring }] });
    page.promptAnswer = 'Lake park';
    await page.goto(url); await ready(page); await view(page, 2);
    await page.setInputFiles('#pdfFile', path.join(OUT, 'lake.pdf'));
    await page.waitForSelector('#nAlign', { timeout: 60000 });
    c('Auto-align button in the placing bar', await page.isVisible('#nAlign') && (await page.text('#nAlign')) === 'Auto-align');
    // knock it off by dragging the centre, as a rough hand placement would be
    const h = await page.locator('.nudge-c').boundingBox();
    await page.mouse.move(h.x + 17, h.y + 17); await page.mouse.down(); await page.mouse.move(h.x + 29, h.y + 7, { steps: 5 }); await page.mouse.up();
    // true top-left corner: image (0,0) is page point (0, 792)
    const [tLat, tLon] = lakeGeo(0, 792), M = 111000, err = p => Math.hypot((p.lat - tLat) * M, (p.lng - tLon) * M * Math.cos(tLat * Math.PI / 180));
    const corner = () => page.evaluate(() => state.nudge.layer._topLeft);
    const e0 = err(await corner());
    const t0 = Date.now(); await page.click('#nAlign');
    await page.waitForFunction(() => /Lined up|failed|No water|not near|Could not/.test(document.querySelector('#toast').textContent), null, { timeout: 30000 });
    const ms = Date.now() - t0, toast = await page.text('#toast'), e1 = err(await corner());
    c('Auto-align lines the lake up with OSM water', /Lined up with OpenStreetMap water/.test(toast) && e1 < 15 && e0 > 100, `${e0.toFixed(0)} m -> ${e1.toFixed(0)} m; ${toast}`);
    c('Auto-align reports the shoreline mismatch before and after', /off by \d+ ft → \d+ ft/.test(toast), toast);
    c('Auto-align takes under 5 s', ms < 5000, ms + ' ms');
    c('OSM water drawn while placing', await page.locator('path.leaflet-interactive, path').count() > 0 && await page.evaluate(() => { let n = 0; map.eachLayer(l => { if (l instanceof L.Polyline && l.options.dashArray === '4 4') n++; }); return n === 1; }));
    await page.screenshot({ path: path.join(OUT, 'feat-pdf-align.png') });
    c('Undo align offered', (await page.text('#nAlign')) === 'Undo align');
    await page.click('#nAlign'); await page.waitForTimeout(200);
    c('Undo align puts the placement back', Math.abs(err(await corner()) - e0) < 1 && (await page.text('#nAlign')) === 'Auto-align');
    await page.click('#nAlign');
    await page.waitForFunction(() => document.querySelector('#nAlign').textContent === 'Undo align', null, { timeout: 30000 });
    await page.click('#nSave'); await page.waitForTimeout(300);
    const m = await page.evaluate(async () => (await idb.all('trailMaps'))[0]);
    c('aligned placement saved', err({ lat: m.topLeft[0], lng: m.topLeft[1] }) < 15, JSON.stringify(m.topLeft));
    c('OSM water kept with the map', m.water?.lines?.length === 1 && m.water.bbox.length === 4);
    // offline later: re-align from the saved water, no new lookup
    const hits = ctx.overpassHits;
    await ctx.setOffline(true);
    await page.click('#mapsBtn'); await page.waitForSelector('#sheet [data-adjust]');
    await page.click('#sheet [data-adjust]'); await page.waitForSelector('#nAlign');
    const h2 = await page.locator('.nudge-c').boundingBox();
    await page.mouse.move(h2.x + 17, h2.y + 17); await page.mouse.down(); await page.mouse.move(h2.x + 5, h2.y + 28, { steps: 5 }); await page.mouse.up();
    await page.click('#nAlign');
    await page.waitForFunction(() => /Lined up|failed|No water|not near|Could not|connection/.test(document.querySelector('#toast').textContent), null, { timeout: 30000 });
    c('Auto-align works offline from the saved water', /Lined up/.test(await page.text('#toast')) && err(await corner()) < 15 && ctx.overpassHits === hits, await page.text('#toast'));
    await page.click('#nCancel'); await ctx.setOffline(false);
    // a map with no water says so
    page.promptAnswer = 'No water';
    await page.setInputFiles('#pdfFile', path.join(OUT, 'brochure.pdf'));
    await page.waitForSelector('#nAlign', { timeout: 60000 });
    await page.click('#nAlign');
    await page.waitForFunction(() => /No water found/.test(document.querySelector('#toast').textContent), null, { timeout: 30000 }).catch(() => {});
    c('map without water: Auto-align says no water found', /No water found on this map/.test(await page.text('#toast')), await page.text('#toast'));
    await page.click('#nCancel');
    c('no page errors (align)', errors.length === 0, errors.join(' | ')); await ctx.close(); }

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
    await hold(page, '#locBtn');
    c('cycling to off turns location off, map stays', await page.evaluate(() => state.watch == null) && await page.locator('.me').count() === 0 && near(await at(), panned));
    await page.evaluate(() => map.setView([37.705, -122.59], 13)); await page.waitForTimeout(300);
    await view(page, 1); await page.click('#fcBtn'); await waitForecast(page);
    c('Get forecast saves the current map view as the trip view', await page.evaluate(() => trip.anchor && trip.anchor.z === 13 && Math.abs(trip.anchor.c[0] - 37.705) < 1e-3), await page.evaluate(() => JSON.stringify([trip.anchor, state.view])));
    await page.evaluate(() => map.setView([37.79, -122.40], 15));
    await page.evaluate(async () => { await saveNow(); await openTrip(await idb.get('trips', trip.id)); }); await page.waitForTimeout(300);
    c('opening the trip returns to its saved view', await page.evaluate(() => { const c = map.getCenter(); return map.getZoom() === trip.anchor.z && Math.abs(c.lat - trip.anchor.c[0]) < 1e-6 && Math.abs(c.lng - trip.anchor.c[1]) < 1e-6; }));
    await page.evaluate(() => map.setView([37.0, -121.0], 9)); await view(page, 2); await page.click('#homeBtn'); await page.waitForTimeout(300);
    c('↩ goes back to the trip view', await page.evaluate(() => { const c = map.getCenter(); return map.getZoom() === trip.anchor.z && Math.abs(c.lat - trip.anchor.c[0]) < 1e-6; }));
    await page.evaluate(() => map.setView([37.79, -122.40], 15));
    await view(page, 1);
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
    c('old shell caches removed', !keys.includes('paddle-shell-v4') && !keys.includes('outback-shell-v1') && keys.some(k => /^outback-shell-\d{4}-\d\d-\d\d[a-z]$/.test(k)), keys.join(', '));
    await ctx.close(); }
};
