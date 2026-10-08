// Currents on the map: arrows at every NOAA current station in view, following the map's own time slider.
const { open, ready, view } = require('./harness');
module.exports = async (browser, url, check) => {
  const c = (n, ok, i) => check('currents', n, ok, i);
  const { page, errors } = await open(browser, url);
  const asked = [];
  page.on('request', r => { const u = r.url(); if (u.includes('currents_predictions')) asked.push(new URL(u).searchParams.get('station')); });
  await page.goto(url); await ready(page); await view(page, 2);
  await page.evaluate(() => map.setView([37.82, -122.45], 12)); await page.waitForTimeout(400);
  c('currents button on a paddle trip', await page.isVisible('#curBtn'));
  c('no time bar until currents are on', !(await page.isVisible('#timeBar')));
  await page.click('#curBtn'); await page.waitForTimeout(1200);
  c('one arrow per station in view', await page.locator('.cm').count() === 2, await page.locator('.cm').count());
  c('each station asked once', asked.length === 2 && new Set(asked).size === 2, asked.join());
  c('time bar shown', await page.isVisible('#timeBar'));
  // mock: slack 01:00Z, flood max 04:06Z (2.4 kt, 070°), slack 07:12Z, ebb max 10:18Z (3.1 kt, 250°) of the day before, repeating every 12.4 h
  const at = async iso => page.evaluate(iso => { const m = Math.round((Date.parse(iso) - dayStart()) / 6e4 / 5) * 5; const r = $('#tMap'); r.value = m; r.dispatchEvent(new Event('input')); return m; }, iso);
  const date = await page.evaluate(() => trip.date);
  const base = Date.parse(date + 'T00:00Z') - 864e5 + 36e5, maxEbb = new Date(base + 3 * 3.1 * 36e5 + 2 * 12.4 * 36e5).toISOString();
  await at(maxEbb); await page.waitForTimeout(200);
  const ebb = await page.evaluate(() => [...document.querySelectorAll('.cm')].map(e => [e.className, e.textContent.trim(), e.querySelector('svg')?.style.transform]));
  c('slider moves arrows to max ebb', ebb.every(x => x[0].includes('ebb') && x[1] === '3.1' && x[2].includes('250')), JSON.stringify(ebb));
  c('slider moves the trip time too', await page.evaluate(() => $('#mini').textContent.includes(hm(tAt())) && +$('#tMap').value === state.tMin));
  c('slider sits in the summary bar', await page.evaluate(() => $('#miniBox').contains($('#timeBar'))));
  await at(new Date(base + 2 * 3.1 * 36e5 + 2 * 12.4 * 36e5).toISOString()); await page.waitForTimeout(200);
  c('slack shows no arrow', await page.evaluate(() => [...document.querySelectorAll('.cm')].every(e => e.classList.contains('slack') && !e.querySelector('svg'))));
  await at(new Date(base + 3.1 * 36e5 + 3 * 12.4 * 36e5).toISOString()); await page.waitForTimeout(200);
  c('flood arrows point 070', await page.evaluate(() => [...document.querySelectorAll('.cm')].every(e => e.classList.contains('flood') && e.querySelector('svg').style.transform.includes('70deg'))));
  await page.locator('.cm span').first().click(); await page.waitForTimeout(300);
  const pop = await page.textContent('.leaflet-popup-content');
  c('tap an arrow: station, speed, next', /flood toward 070°T/.test(pop) && /Next:/.test(pop), pop);
  c('popup offers the station for the trip', await page.isVisible('.leaflet-popup-content [data-use=current]'));
  await page.click('.leaflet-popup-content [data-use=current]'); await page.waitForTimeout(500);
  c('station chosen for the trip', await page.evaluate(() => !!trip.current));
  c('trip arrow not doubled while currents are on', await page.evaluate(() => !curArrow));
  // pan away and back: cached, no new requests
  const n = asked.length;
  await page.evaluate(() => map.setView([37.5, -122.0], 12)); await page.waitForTimeout(700);
  c('no stations, no arrows', await page.locator('.cm').count() === 0);
  await page.evaluate(() => map.setView([37.82, -122.45], 12)); await page.waitForTimeout(900);
  c('back: arrows from cache', await page.locator('.cm').count() === 2 && asked.length === n, asked.length - n);
  await page.evaluate(() => map.setView([37.82, -122.45], 7)); await page.waitForTimeout(700);
  c('zoomed far out: asks to zoom in', await page.locator('.cm').count() === 0 && /Zoom in/.test(await page.textContent('#toast')));
  await page.evaluate(() => map.setView([37.82, -122.45], 12)); await page.waitForTimeout(700);
  // other day: new predictions
  await page.evaluate(() => { const d = $('#date'); d.value = shiftDay(trip.date, 1); d.dispatchEvent(new Event('change')); }); await page.waitForTimeout(900);
  c('another day fetches that day', asked.length === n + 2, asked.length - n);
  // off
  await page.click('#curBtn'); await page.waitForTimeout(300);
  c('off: arrows and time bar gone', await page.locator('.cm').count() === 0 && !(await page.isVisible('#timeBar')));
  c('remembered off', await page.evaluate(() => !settings.curMap));
  // hike, lake
  await page.evaluate(() => { trip.activity = 'hike'; render(); });
  c('hidden on a hike', !(await page.isVisible('#curBtn')));
  await page.evaluate(() => { trip.activity = 'paddle'; trip.env = 'lake'; trip.envSet = true; render(); });
  c('hidden on a lake', !(await page.isVisible('#curBtn')));
  c('no page errors', !errors.length, errors.join(' | '));
  await page.context().close();
};
