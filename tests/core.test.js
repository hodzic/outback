// Main path through the three views: Trips list -> Trip details -> Map, and back.
const fs = require('fs'), path = require('path');
const { open, waitForecast, ready, view, OUT } = require('./harness');
module.exports = async (browser, url, check) => {
  const c = (n, ok, i) => check('core', n, ok, i);
  const { ctx, page, errors } = await open(browser, url, { geolocation: { latitude: 37.808, longitude: -122.41 } });
  await page.goto(url); await ready(page);
  c('app is named Outback', (await page.title()) === 'Outback');
  c('opens on the Trip view', await page.evaluate(() => state.view) === 1 && await page.isVisible('#tripName'));
  c('tab shows the trip name', (await page.text('#tabTrip')) === 'New paddle', await page.text('#tabTrip'));
  c('status asks for a forecast', /no forecast/i.test(await page.text('#status')));
  c('sun times computed offline', /\d.*–.*\d/.test(await page.text('#sunV')), await page.text('#sunV'));

  // Trips view: new paddle trip goes straight to the map in draw mode
  await view(page, 0);
  c('trips list shows the trip', await page.locator('#tripList .trip').count() === 1);
  await page.click('#newPaddle'); await page.waitForTimeout(500);
  c('new trip opens the map in draw mode', await page.evaluate(() => state.view === 2 && state.drawing) && await page.isVisible('#drawBar'));
  for (const [x, y] of [[120, 300], [200, 260], [280, 320], [300, 400]]){ await page.mouse.click(x, y); await page.waitForTimeout(120); }
  c('tapping the map adds waypoints', await page.locator('.wp').count() === 4);
  await page.click('#undoBtn');
  c('undo removes the last waypoint', await page.locator('.wp').count() === 3);
  await page.screenshot({ path: path.join(OUT, 'core-drawing.png') });
  await page.click('#doneBtn');
  c('done leaves draw mode', !(await page.isVisible('#drawBar')));
  c('map summary shows distance', / nm$/.test(await page.text('#mini')), await page.text('#mini'));

  // Trip view: details, forecast, tides
  await page.click('#tripChip'); await page.waitForFunction(() => state.view === 1);
  c('trip chip opens details', await page.evaluate(() => state.view) === 1);
  c('route length in nm', / nm$/.test(await page.text('#dist')) && parseFloat(await page.text('#dist')) > 0, await page.text('#dist'));
  c('duration shown', /min|h/.test(await page.text('#dur')), await page.text('#dur'));
  c('legs summary', (await page.text('#legs')).startsWith('2 legs'), await page.text('#legs'));
  await page.click('#fcBtn'); await waitForecast(page); await page.waitForTimeout(200);
  c('forecast saved toast', /Forecast saved/.test(await page.text('#toast')), await page.text('#toast'));
  c('tidal water detected as bay (auto)', await page.evaluate(() => trip.env === 'bay' && !trip.envSet) && /Auto: Bay/.test(await page.text('#envSel')));
  c('tide value', /ft$/.test(await page.text('#tideV')), await page.text('#tideV'));
  c('nearest tide station', (await page.text('#tideK')).includes('San Francisco'), await page.text('#tideK'));
  c('current station deduped to shallowest bin', await page.evaluate(() => state.nearby.current.find(s => s.id === 'SFB1201')?.bin === 2));
  c('current value', /kt|Slack/.test(await page.text('#curV')), await page.text('#curV'));
  c('wind value', /kt/.test(await page.text('#windV')), await page.text('#windV'));
  c('pressure value', /mb/.test(await page.text('#presV')), await page.text('#presV'));
  c('lightning from NWS', /%/.test(await page.text('#ltgV')), await page.text('#ltgV'));
  c('trip time zone learned', await page.evaluate(() => trip.tz) === 'America/Los_Angeles');
  c('status says the map is saved offline', /map saved offline/.test(await page.text('#status')), await page.text('#status'));
  await page.screenshot({ path: path.join(OUT, 'core-trip.png') });

  const before = await page.text('#tideV');
  c('no time slider; time and Now sit by the graph buttons', await page.locator('#time').count() === 0 && await page.evaluate(() => document.querySelector('#graphSel').parentElement.contains(document.querySelector('#nowBtn'))));
  await page.evaluate(() => { const r = cv.getBoundingClientRect(); cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + r.width * 0.625, clientY: r.top + 30, pointerId: 1, bubbles: true })); });
  c('graph tap sets time', (await page.text('#timeOut')).includes('3:00'), await page.text('#timeOut'));
  c('time change updates tide', (await page.text('#tideV')) !== before);
  await page.locator('#chart').scrollIntoViewIfNeeded();
  const box = await page.locator('#chart').boundingBox();
  await page.mouse.click(box.x + box.width * 0.25, box.y + 30);
  c('chart tap sets time', (await page.text('#timeOut')).includes('6:00'), await page.text('#timeOut'));
  await page.click('#graphSel button[data-g=wind]'); await page.click('#graphSel button[data-g=tide]');

  await page.click('#wpDetails summary');
  c('waypoint table', await page.locator('#routeTable tr').count() === 4);
  c('speed shown in the Trip view', (await page.text('#spd')) === '3 kt', await page.text('#spd'));
  await page.fill('#tripName', 'Golden Gate loop'); await page.press('#tripName', 'Enter');
  c('rename inline', await page.evaluate(() => trip.name) === 'Golden Gate loop' && (await page.text('#tabTrip')) === 'Golden Gate loop');

  for (const [id, ext] of [['#exportJson', 'json'], ['#exportGpx', 'gpx']]){
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click(id)]);
    c('export ' + ext, !!dl, dl?.suggestedFilename());
    if (dl) await dl.saveAs(path.join(OUT, 'export.' + ext));
  }

  await page.waitForTimeout(400); await page.reload(); await ready(page);
  c('reload restores trip and view', (await page.text('#tabTrip')) === 'Golden Gate loop' && await page.evaluate(() => state.view) === 1 && await page.locator('.wp').count() === 3);
  c('reload keeps forecast', /ft$/.test(await page.text('#tideV')));

  // Map view: Go
  await view(page, 2);
  await page.click('#goBtn'); await page.waitForTimeout(1000);
  c('nav strip shown', await page.isVisible('#nav'));
  c('nav distance and bearing', /\d/.test(await page.text('#navDist')) && /°/.test(await page.text('#navBrg')), await page.text('#navDist') + ' ' + await page.text('#navBrg'));
  await page.click('#drawBtn');
  c('drawing blocked while underway', /Stop/.test(await page.text('#toast')), await page.text('#toast'));
  await page.click('#stopBtn');
  c('nav hidden after stop', !(await page.isVisible('#nav')));

  // Trips view: import
  await view(page, 0);
  fs.writeFileSync(path.join(OUT, 'tahoe.gpx'), `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Tahoe test</name><trkseg>
    <trkpt lat="39.10" lon="-120.03"/><trkpt lat="39.12" lon="-120.02"/><trkpt lat="39.14" lon="-120.04"/></trkseg></trk></gpx>`);
  await page.setInputFiles('#file', path.join(OUT, 'tahoe.gpx')); await page.waitForTimeout(700);
  c('GPX import opens the trip', (await page.text('#tabTrip')) === 'Tahoe test' && await page.evaluate(() => state.view) === 1 && await page.locator('.wp').count() === 3);
  await page.click('#fcBtn'); await waitForecast(page);
  c('no tide stations nearby -> lake', await page.evaluate(() => trip.env) === 'lake');
  c('tidal cells hidden on a lake', !(await page.isVisible('#tideV')) && !(await page.isVisible('#stationsBtn')));
  c('lake switches chart layer to topo', (await page.text('#layerBtn')) === 'Topo', await page.text('#layerBtn'));
  await page.setInputFiles('#file', path.join(OUT, 'export.json')); await page.waitForTimeout(600);
  c('JSON import adds a copy', (await page.text('#tabTrip')) === 'Golden Gate loop' && await page.evaluate(async () => (await idb.all('trips')).length) === 4);
  fs.writeFileSync(path.join(OUT, 'bad.json'), '{"foo":1}');
  await page.setInputFiles('#file', path.join(OUT, 'bad.json')); await page.waitForTimeout(300);
  c('bad import rejected', (await page.text('#toast')).includes('Import failed'), await page.text('#toast'));

  await view(page, 0);
  c('list shows all trips, current highlighted', await page.locator('#tripList .trip').count() === 4 && await page.locator('#tripList .trip.cur').count() === 1);
  await page.locator('#tripList .trip', { hasText: 'Tahoe test' }).click(); await page.waitForTimeout(400);
  c('tap a trip opens it in the Trip view', await page.evaluate(() => state.view === 1 && trip.name === 'Tahoe test'));

  await page.evaluate(() => { trip.name = '<img src=x onerror=window.__x=1>'; changed(); });
  await view(page, 0);
  c('trip names are escaped', !(await page.evaluate(() => window.__x)));

  await view(page, 1);
  await page.fill('#date', '2026-12-10'); await page.dispatchEvent('#date', 'change');
  c('date change clears forecast', /no forecast/i.test(await page.text('#status')));
  c('weekday shown before the date', (await page.text('#dow')) === 'Thursday,', await page.text('#dow'));
  c('date sits above the activity buttons', await page.evaluate(() => document.querySelector('#date').getBoundingClientRect().bottom <= document.querySelector('#actSel').getBoundingClientRect().top));
  const n0 = await page.evaluate(async () => (await idb.all('trips')).length);
  await page.click('#deleteTrip'); await page.waitForTimeout(500);
  c('delete trip returns to the list', await page.evaluate(() => state.view) === 0 && await page.evaluate(async () => (await idb.all('trips')).length) === n0 - 1);

  // swiping: scrolling the views container changes view
  await page.evaluate(() => views.scrollTo({ left: views.clientWidth, behavior: 'instant' })); await page.waitForTimeout(300);
  c('swipe (scroll) to the Trip view', await page.evaluate(() => state.view) === 1 && await page.locator('#tabs button.on').innerText() !== 'Trips');
  c('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
};
