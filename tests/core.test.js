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
  c('sun times computed offline, Rise and Set lines', /^Rise \d+:\d\d [AP]M\s+Set \d+:\d\d [AP]M$/.test(await page.text('#sunV')), await page.text('#sunV'));

  // Trips view: new paddle trip goes straight to the map in draw mode
  await view(page, 0);
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8').match(/outback-shell-([\w-]+)/)[1];
  c('version shown next to About: date and letter', /^· version \d{4}-\d\d-\d\d[a-z]$/.test(await page.textContent('#appVer')), await page.textContent('#appVer'));
  { const about = await page.evaluate(() => [...document.querySelectorAll('#vTrips details')].find(d => d.querySelector('summary').textContent.startsWith('About')).textContent);
    const m = JSON.parse(require('fs').readFileSync(path.join(__dirname, '..', 'manifest.webmanifest'), 'utf8'));
    c('manifest uses absolute /outback/ paths', m.id === '/outback/' && m.start_url === '/outback/' && m.scope === '/outback/' && m.icons.every(i => i.src.startsWith('/outback/')), JSON.stringify(m));
    c('manifest description has no out-and-back', /biking/.test(m.description) && !/out-and-back/i.test(m.description), m.description);
    c('About covers all activities, no out-and-back', /paddle, hike or bike/.test(about) && !/out-and-back/i.test(about) && /Not for navigation or safety decisions/.test(about) && /responsible for your own safety/.test(about)); }
  c('app version matches the service worker cache', await page.evaluate(() => APP_VERSION) === sw, sw);
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
  c('map summary starts with the day and date', /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) [A-Z][a-z]{2} \d{1,2} \d/.test(await page.text('#mini')), await page.text('#mini'));

  // Trip view: details, forecast, tides
  await page.click('#tripChip'); await page.waitForFunction(() => state.view === 1);
  c('trip chip opens details', await page.evaluate(() => state.view) === 1);
  c('route length in nm', / nm$/.test(await page.text('#dist')) && parseFloat(await page.text('#dist')) > 0, await page.text('#dist'));
  c('duration shown', /min|h/.test(await page.text('#dur')), await page.text('#dur'));
  c('legs summary', (await page.text('#legs')).startsWith('2 legs'), await page.text('#legs'));
  c('start time next to the date, 9:00 by default', await page.inputValue('#start') === '09:00' && await page.evaluate(() => { const i = document.querySelector('#start'); return i.type === 'time' && i.required; }) && await page.evaluate(() => document.querySelector('#date').parentElement.contains(document.querySelector('#start'))));
  await page.fill('#start', '07:30'); await page.dispatchEvent('#start', 'change');
  c('start time is saved and moves the graph time', await page.evaluate(() => trip.start === 450 && state.tMin === 450 && settings.start === 450) && /^7:30/.test(await page.text('#timeOut')), await page.text('#timeOut'));
  await page.click('#wpDetails summary'); await page.waitForTimeout(150);
  c('waypoint times leave at the planned start', /Leaving at 7:30 AM \(the planned start\)/.test(await page.text('#routeTable')), await page.text('#routeTable'));
  await page.click('#wpDetails summary');
  c('new trips take the last start; old trips get 9:00', await page.evaluate(() => newTrip().start === 450 && normTrip({ route: [], tracks: [], marks: [] }).start === 540));
  c('route on one line', /^Route \d+\.\d nm · .+ at 3 kt · 2 legs$/.test(await page.text('.rline')), await page.text('.rline'));
  await page.click('#fcBtn'); await waitForecast(page); await page.waitForTimeout(200);
  c('forecast saved toast', /Forecast saved/.test(await page.text('#toast')), await page.text('#toast'));
  c('tidal water detected as bay (auto)', await page.evaluate(() => trip.env === 'bay' && !trip.envSet) && /Auto: Bay/.test(await page.text('#envSel')));
  c('tide range for the day', /^-?\d+\.\d – -?\d+\.\d ft$/.test(await page.text('#tideV')), await page.text('#tideV'));
  c('every high and low tide, one per line in time order', await page.evaluate(() => { const r = [...document.querySelectorAll('#tideS .tl > span')].map(e => e.textContent);
    return r.length === 8 && r.filter((_, i) => i % 2).every(x => /^(High|Low) -?\d+\.\d ft$/.test(x)) && trip.data.tide.filter(e => e.t >= dayStart() && e.t < dayStart() + 864e5).every((e, i) => r[2 * i] === hmS(e.t)); }), await page.text('#tideS'));
  c('forecast readouts are not truncated', await page.evaluate(() => [...document.querySelectorAll('.read .k, .read .v, .read .s')].every(e => e.scrollWidth <= e.clientWidth + 1 && getComputedStyle(e).textOverflow !== 'ellipsis')));
  c('nearest tide station', (await page.text('#tideK')).includes('San Francisco'), await page.text('#tideK'));
  c('current station deduped to shallowest bin', await page.evaluate(() => state.nearby.current.find(s => s.id === 'SFB1201')?.bin === 2));
  c('strongest flood and ebb, ebb negative', /^\d+\.\d \/ -\d+\.\d kt$/.test(await page.text('#curV')), await page.text('#curV'));
  c('max flood, max ebb and slack, one per line in time order', await page.evaluate(() => { const r = [...document.querySelectorAll('#curS .tl > span')].map(e => e.textContent), ev = trip.data.current.filter(e => e.t >= dayStart() && e.t < dayStart() + 864e5);
    return r.length === ev.length * 2 && ev.every((e, i) => r[2 * i] === hmS(e.t)) && r.some(x => /^Flood \d+\.\d$/.test(x)) && r.some(x => /^Ebb -\d+\.\d$/.test(x)) && r.includes('Slack'); }), await page.text('#curS'));
  c('wind morning and afternoon with gusts', /^AM \d+ G\d+ [NESW]+\s+PM \d+ G\d+ [NESW]+$/.test(await page.text('#windV')), await page.text('#windV'));
  c('wind unit in the title', (await page.text('#windK')) === 'Wind · kt', await page.text('#windK'));
  const tv = await page.text('#tempV'), m = tv.match(/Low (\d+)° · High (\d+)°F/);
  c('day low and high temperature shown', !!m && +m[1] <= +m[2], tv);
  c('low/high is the trip day only', await page.evaluate(() => { const d = dayTemps(), w = trip.data.wx, t0 = dayStart();
    const v = w.temp.filter((_, i) => w.t[i] >= t0 && w.t[i] < t0 + 864e5); return d.lo === Math.min(...v) && d.hi === Math.max(...v); }));
  c('daylight sky and rain', /in daylight$/.test(await page.text('#tempS')), await page.text('#tempS'));
  c('time readout under the graph', /ft [↑↓]$/.test(await page.text('#atTide')) && /kt|Slack/.test(await page.text('#atCur')) && /^\d+ G\d+ kt [NESW]+$/.test(await page.text('#atWind'))
    && /^\d+°F · rain \d+%$/.test(await page.text('#atAir')) && /mb/.test(await page.text('#atPres')) && /%/.test(await page.text('#atLtg')), [await page.text('#atTide'), await page.text('#atCur'), await page.text('#atWind'), await page.text('#atAir')].join(' | '));
  { const day = () => page.evaluate(() => [...document.querySelectorAll('.read .v, .read .s')].map(e => e.textContent).join('|'));
    const at = () => page.evaluate(() => [...document.querySelectorAll('#atRead b')].map(e => e.textContent).join('|'));
    await page.evaluate(() => { state.tMin = 8 * 60; render(); }); const d1 = await day(), a1 = await at();
    await page.evaluate(() => { state.tMin = 16 * 60; render(); }); const d2 = await day(), a2 = await at();
    c('cells stay put when the time changes', d1 === d2, d1 + ' ≠ ' + d2);
    c('readout follows the time', a1 !== a2, a1);
    c('readout sits above the graph with a fixed height', await page.evaluate(() => { const r = document.querySelector('#atRead'), h = r.offsetHeight;
      const ok = r.nextElementSibling === cv && [...r.children].every(e => e.hidden || e.offsetHeight === 38);
      for (const m of [0, 300, 700, 1100]){ state.tMin = m; render(); if (r.offsetHeight !== h) return false; } return ok; })); }
  c('temperature is the first, full-width reading', await page.evaluate(() => document.querySelector('.read').firstElementChild.id === '' && document.querySelector('.read .cell').classList.contains('tempc')));
  c('map summary shows the range', /\d+°–\d+°/.test(await page.text('#mini')), await page.text('#mini'));
  c('pressure over daylight', /^\d+ → \d+$/.test(await page.text('#presV')) && /^(Steady|Rising|Falling) .*in daylight/.test(await page.text('#presS')) && /Pressure · mb/.test(await page.text('.read')), await page.text('#presV') + ' ' + await page.text('#presS'));
  c('lightning from NWS, daylight peak', /%$/.test(await page.text('#ltgV')) && /NWS/.test(await page.text('#ltgS')), await page.text('#ltgV'));
  c('trip time zone learned', await page.evaluate(() => trip.tz) === 'America/Los_Angeles');
  c('status says the map is saved offline', /map saved offline/.test(await page.text('#status')), await page.text('#status'));
  await page.screenshot({ path: path.join(OUT, 'core-trip.png') });

  // the day's highs and lows labelled on the graph; the same graph, smaller, on the map while tides/currents are on
  const texts = fn => page.evaluate(fn => { const P = CanvasRenderingContext2D.prototype, f = P.fillText, got = {};
    P.fillText = function(t, ...a){ (got[this.canvas.id] ||= []).push(t); return f.call(this, t, ...a); };
    try{ new Function(fn)(); for (const k in got) delete got[k]; render(); } finally{ P.fillText = f; } return got; }, fn);
  let tx = await texts("settings.graph = 'tide'");
  const ftT = (tx.chart || []).filter(t => /^-?\d+\.\d ft \d+:\d\d[ap]$/.test(t)), ktT = (tx.chart || []).filter(t => /^-?\d+\.\d kt \d+:\d\d[ap]$/.test(t));
  c('tide graph labels every high and low of the day, with times', ftT.length === 4 && new Set(ftT.map(parseFloat)).size === 2, (tx.chart || []).join(' | '));
  c('tide graph labels every max flood and max ebb, ebb negative', ktT.length === 4 && ktT.filter(t => t.startsWith('-')).length === 2, (tx.chart || []).join(' | '));
  tx = await texts("settings.graph = 'wind'");
  const gT = (tx.chart || []).filter(t => /^G\d+ kt/.test(t));
  c('wind graph labels the daylight peak gust and the night one when stronger', gT.length === 2 && parseInt(gT[1].slice(1)) > parseInt(gT[0].slice(1)), (tx.chart || []).join(' | '));
  c('wind graph labels the strongest gust and wind', (tx.chart || []).some(t => /^G\d+ kt \d+:\d\d[ap]$/.test(t)) && (tx.chart || []).some(t => /^\d+ kt \d+:\d\d[ap]$/.test(t)), (tx.chart || []).join(' | '));
  await view(page, 2);
  tx = await texts("settings.graph = 'tide'; setTcMode(1)");
  c('map shows the tide and current graph in place of a slider', await page.isVisible('#tChart') && (tx.tChart || []).filter(t => /^-?\d+\.\d (ft|kt)$/.test(t)).length === 8, (tx.tChart || []).join(' | '));
  tx = await texts("setTcMode(2)");
  c('currents mode: map graph shows currents only', (tx.tChart || []).filter(t => / ft$/.test(t)).length === 0 && (tx.tChart || []).filter(t => / kt$/.test(t)).length === 4, (tx.tChart || []).join(' | '));
  tx = await texts("setTcMode(3)");
  c('tides mode: map graph shows tides only', (tx.tChart || []).filter(t => / kt$/.test(t)).length === 0 && (tx.tChart || []).filter(t => / ft$/.test(t)).length === 4, (tx.tChart || []).join(' | '));
  await page.evaluate(() => setTcMode(1)); await page.waitForTimeout(300);
  await page.locator('#miniBox').screenshot({ path: path.join(OUT, 'core-map-graph.png') });
  await page.evaluate(() => setTcMode(0)); await view(page, 1); await page.waitForTimeout(3000);
  await page.locator('#chart').screenshot({ path: path.join(OUT, 'core-trip-graph.png') });
  await page.evaluate(() => { settings.graph = 'wind'; render(); }); await page.locator('#chart').screenshot({ path: path.join(OUT, 'core-wind-graph.png') }); await page.evaluate(() => { settings.graph = 'tide'; render(); });

  // start from a fixed time, not 'now' (which could be 3:00 PM itself)
  await page.evaluate(() => { state.tMin = 9 * 60; render(); });
  const before = await page.text('#atTide');
  c('graph at the bottom of the forecast, its buttons right under it', await page.locator('#time').count() === 0 && await page.evaluate(() => cv.nextElementSibling.id === 'graphSel' && !cv.parentElement.lastElementChild.previousElementSibling.compareDocumentPosition(cv) && cv.parentElement.lastElementChild.id === 'graphSel'
    && document.querySelector('.read').compareDocumentPosition(cv) & Node.DOCUMENT_POSITION_FOLLOWING));
  await page.evaluate(() => { const r = cv.getBoundingClientRect(); cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + r.width * 0.625, clientY: r.top + 30, pointerId: 1, bubbles: true })); });
  c('graph tap sets time', (await page.text('#timeOut')).includes('3:00'), await page.text('#timeOut'));
  c('time change updates tide', (await page.text('#atTide')) !== before);
  await page.locator('#chart').scrollIntoViewIfNeeded();
  const box = await page.locator('#chart').boundingBox();
  await page.mouse.click(box.x + box.width * 0.25, box.y + 30);
  c('chart tap sets time', (await page.text('#timeOut')).includes('6:00'), await page.text('#timeOut'));
  await page.click('#graphSel button[data-g=wind]'); await page.click('#graphSel button[data-g=tide]');

  await page.click('#wpDetails summary'); await page.waitForFunction(() => document.querySelectorAll('#routeTable tr').length > 0);
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

  // Map view: Draw in the top bar
  await view(page, 2);
  c('no Go button or navigation strip', await page.locator('#goBtn, #nav, #stopBtn').count() === 0);
  c('Draw sits in the top bar next to PDF and location', await page.evaluate(() => { const top = document.querySelector('.mtop'), d = document.querySelector('#drawBtn');
    return top.contains(d) && d.nextElementSibling.id === 'mapsBtn' && document.querySelector('#mapsBtn').nextElementSibling.id === 'locBtn'; }));
  c('back button sits in the top row after the trip name', await page.evaluate(() => document.querySelector('#tripChip').nextElementSibling.id === 'homeBtn'));
  c('conditions line sits right under the top row', await page.evaluate(() => { const t = document.querySelector('.mtop').getBoundingClientRect(), m = document.querySelector('#mini').getBoundingClientRect();
    return m.top >= t.bottom && m.top - t.bottom < 12 && m.bottom < innerHeight / 4; }));
  c('top bar fits on a phone', await page.evaluate(() => { const r = document.querySelector('#locBtn').getBoundingClientRect(); return r.right <= innerWidth && document.querySelector('.mtop').scrollWidth <= innerWidth; }));
  await page.click('#drawBtn');
  c('the button is labelled Route', (await page.text('#drawBtn')) === 'Route');
  c('route editing bar is one compact row', await page.evaluate(() => document.querySelector('#drawBar').getBoundingClientRect().height <= 48), await page.evaluate(() => document.querySelector('#drawBar').getBoundingClientRect().height));
  c('Draw toggles draw mode and shows as on', await page.evaluate(() => state.drawing && document.querySelector('#drawBtn').classList.contains('on')));
  await page.click('#doneBtn');

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
  c('weekday shown before the date', (await page.text('#dow')) === 'Thu,', await page.text('#dow'));
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
