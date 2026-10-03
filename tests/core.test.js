// Main happy path: draw, forecast, slider, sheets, settings, export, reload, nav mode, import.
const fs = require('fs'), path = require('path');
const { open, waitForecast, OUT } = require('./harness');
module.exports = async (browser, url, check) => {
  const c = (n, ok, i) => check('core', n, ok, i);
  const { ctx, page, errors } = await open(browser, url, { serviceWorkers: 'block', geolocation: { latitude: 37.808, longitude: -122.41 } });
  page.promptAnswer = 'Golden Gate loop';
  await page.goto(url); await page.waitForFunction(() => typeof trip !== 'undefined' && trip);
  c('loads with a new trip', (await page.text('#tripBtn')) === 'New trip');
  c('app is named Outback', (await page.title()) === 'Outback');
  c('status asks for a forecast', /no forecast/i.test(await page.text('#status')));
  c('sun times computed offline', /\d.*–.*\d/.test(await page.text('#sunV')), await page.text('#sunV'));

  await page.click('#drawBtn');
  c('draw bar visible', await page.isVisible('#drawBar'));
  for (const [x, y] of [[120, 300], [200, 260], [280, 320], [300, 400]]){ await page.mouse.click(x, y); await page.waitForTimeout(120); }
  c('tapping map adds waypoints', await page.locator('.wp').count() === 4);
  await page.click('#undoBtn');
  c('undo removes last waypoint', await page.locator('.wp').count() === 3);
  await page.screenshot({ path: path.join(OUT, 'core-drawing.png') });
  await page.click('#doneBtn');
  c('panel minimized while drawing', await page.evaluate(() => document.querySelector('#panel').classList.contains('min')));
  await page.click('#mini');
  c('legs summary', (await page.text('#legs')).startsWith('2 legs'), await page.text('#legs'));
  c('paddle distances in nm', (await page.text('#dist')).endsWith(' nm'));
  c('distance > 0', parseFloat(await page.text('#dist')) > 0, await page.text('#dist'));

  await page.click('#fcBtn'); await waitForecast(page); await page.waitForTimeout(200);
  c('forecast saved toast', /Forecast saved/.test(await page.text('#toast')), await page.text('#toast'));
  c('tide value', /ft$/.test(await page.text('#tideV')), await page.text('#tideV'));
  c('nearest tide station', (await page.text('#tideK')).includes('San Francisco'), await page.text('#tideK'));
  c('current station deduped to shallowest bin', await page.evaluate(() => state.nearby.current.find(s => s.id === 'SFB1201')?.bin === 2));
  c('current value', /kt|Slack/.test(await page.text('#curV')), await page.text('#curV'));
  c('wind value', /kt/.test(await page.text('#windV')), await page.text('#windV'));
  c('pressure value', /mb/.test(await page.text('#presV')), await page.text('#presV'));
  c('lightning from NWS', /%/.test(await page.text('#ltgV')), await page.text('#ltgV'));
  c('tidal water detected as bay', await page.evaluate(() => trip.env) === 'bay');
  c('trip time zone learned', await page.evaluate(() => trip.tz) === 'America/Los_Angeles');
  await page.screenshot({ path: path.join(OUT, 'core-forecast.png') });

  const before = await page.text('#tideV');
  await page.evaluate(() => { const s = document.querySelector('#time'); s.value = 900; s.dispatchEvent(new Event('input')); });
  c('slider sets time', (await page.text('#timeOut')).includes('3:00'), await page.text('#timeOut'));
  c('slider updates tide', (await page.text('#tideV')) !== before);
  const box = await page.locator('#chart').boundingBox();
  await page.mouse.click(box.x + box.width * 0.25, box.y + 30);
  c('chart tap sets time', (await page.text('#timeOut')).includes('6:00'), await page.text('#timeOut'));
  await page.click('#graphSel button[data-g=wind]'); await page.click('#graphSel button[data-g=tide]');

  await page.click('#routeBtn');
  c('route sheet lists waypoints', await page.locator('#sheet tr').count() === 4);
  await page.click('#sheet [data-close]');

  await page.click('#menuBtn'); await page.click('#mSettings');
  await page.fill('#sSpeed', '4'); await page.click('#sSave');
  c('speed setting applied', (await page.text('#legs')).includes('4 kt'), await page.text('#legs'));
  await page.click('#menuBtn'); await page.click('#mRename');
  c('rename trip', (await page.text('#tripBtn')) === 'Golden Gate loop');

  for (const [id, ext] of [['mJson', 'json'], ['mGpx', 'gpx']]){
    await page.click('#menuBtn');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click('#' + id)]);
    c('export ' + ext, !!dl, dl?.suggestedFilename());
    if (dl) await dl.saveAs(path.join(OUT, 'export.' + ext));
  }

  await page.waitForTimeout(400); await page.reload(); await page.waitForFunction(() => typeof trip !== 'undefined' && trip);
  c('reload keeps trip', (await page.text('#tripBtn')) === 'Golden Gate loop' && await page.locator('.wp').count() === 3);
  c('reload keeps forecast', /ft$/.test(await page.text('#tideV')));

  await page.click('#goBtn'); await page.waitForTimeout(1000);
  c('nav strip shown', await page.isVisible('#nav'));
  c('nav distance and bearing', /\d/.test(await page.text('#navDist')) && /°/.test(await page.text('#navBrg')), await page.text('#navDist') + ' ' + await page.text('#navBrg'));
  await page.click('#drawBtn');
  c('drawing blocked while underway', /Stop/.test(await page.text('#toast')), await page.text('#toast'));
  await page.click('#stopBtn');
  c('nav hidden after stop', !(await page.isVisible('#nav')));

  fs.writeFileSync(path.join(OUT, 'tahoe.gpx'), `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Tahoe test</name><trkseg>
    <trkpt lat="39.10" lon="-120.03"/><trkpt lat="39.12" lon="-120.02"/><trkpt lat="39.14" lon="-120.04"/></trkseg></trk></gpx>`);
  await page.setInputFiles('#file', path.join(OUT, 'tahoe.gpx')); await page.waitForTimeout(600);
  c('GPX import', (await page.text('#tripBtn')) === 'Tahoe test' && await page.locator('.wp').count() === 3, await page.text('#tripBtn'));
  await page.click('#fcBtn'); await waitForecast(page);
  c('no tide stations nearby -> lake', await page.evaluate(() => trip.env) === 'lake');
  c('tidal cells hidden on a lake', !(await page.isVisible('#tideV')));
  c('lake switches chart layer to topo', (await page.text('#layerBtn')) === 'Topo', await page.text('#layerBtn'));

  await page.setInputFiles('#file', path.join(OUT, 'export.json')); await page.waitForTimeout(600);
  c('JSON import adds a copy', (await page.text('#tripBtn')) === 'Golden Gate loop' && await page.evaluate(async () => (await idb.all('trips')).length) === 3);
  fs.writeFileSync(path.join(OUT, 'bad.json'), '{"foo":1}');
  await page.setInputFiles('#file', path.join(OUT, 'bad.json')); await page.waitForTimeout(300);
  c('bad import rejected', (await page.text('#toast')).includes('Import failed'), await page.text('#toast'));

  await page.evaluate(() => { trip.name = '<img src=x onerror=window.__x=1>'; changed(); });
  await page.click('#menuBtn'); await page.click('#mTrips'); await page.waitForSelector('#sheet .item');
  c('trip names are escaped', !(await page.evaluate(() => window.__x)));
  await page.click('#sheet [data-close]');

  await page.fill('#date', '2026-12-10'); await page.dispatchEvent('#date', 'change');
  c('date change clears forecast', /no forecast/i.test(await page.text('#status')));
  c('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
};
