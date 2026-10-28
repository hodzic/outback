// Map library: placed overlay maps listed from hodzic.github.io/outback-maps (faked in mocks.js), added with one tap.
const { open, ready, view } = require('./harness');

module.exports = async (browser, url, check) => {
  const c = (n, ok, i) => check('lib', n, ok, i);
  const { ctx, page, errors } = await open(browser, url);
  await page.goto(url); await ready(page); await view(page, 2);
  await page.evaluate(() => map.setView([37.64, -121.77], 11));
  await page.click('#mapsBtn'); await page.waitForSelector('#libBtn');
  c('the PDF maps sheet offers the map library', /Map library/.test(await page.text('#libBtn')));
  await page.click('#libBtn'); await page.waitForSelector('[data-libadd]');
  const rows = await page.locator('#libList .item b').allInnerTexts();
  c('library maps listed nearest first', rows.join('|') === 'Test Lake trails|Tomales Bay boat-in camping (NPS)', rows.join('|'));
  c('each shows distance, size and source', /^Here · .*KB · Test Parks/.test(await page.locator('#libList .item small').first().innerText()), await page.locator('#libList .item small').first().innerText());
  c('thumbnails come from the library', await page.evaluate(() => [...document.querySelectorAll('#libList img')].every(i => i.src.startsWith(LIB + 'thumbs/'))));
  c('the catalog is fetched fresh, not from the app cache', ctx.libHits.includes('catalog.json'));
  c('the sheet links to the library on the web', await page.getAttribute('#libWeb', 'href') === 'https://hodzic.github.io/outback-maps/' && await page.getAttribute('#libWeb', 'target') === '_blank');
  c('About credits the library with its address', await page.evaluate(() => [...document.querySelectorAll('#vList a, details a')].some(a => a.href === 'https://hodzic.github.io/outback-maps/' && /hodzic\.github\.io\/outback-maps/.test(a.parentElement.textContent))));
  await page.click('[data-libadd="test-lake"]');
  await page.waitForFunction(() => shownMaps.has('lib-test-lake'), null, { timeout: 15000 });
  const m = await page.evaluate(async () => { const m = await idb.get('trailMaps', 'lib-test-lake'); return { ...m, size: m.imageBlob.size, imageBlob: null }; });
  c('Add saves it on the phone, placed', m.name === 'Test Lake trails' && m.topLeft[0] === 37.66 && m.imageWidth === 1189 && m.size > 100000 && /map library, Test Parks/.test(m.method), JSON.stringify({ ...m, controlPoints: null }));
  c('and shows it on the map', await page.locator('img.leaflet-image-layer').count() === 1);
  await page.click('#mapsBtn'); await page.waitForSelector('#libBtn'); await page.click('#libBtn'); await page.waitForSelector('#libList .item');
  c('an added map shows as Added', !(await page.locator('[data-libadd="test-lake"]').count()) && /Added/.test(await page.locator('#libList .item').first().innerText()));
  // a library map that also ships with the app: added from the app's own copy
  const hits = ctx.libHits.length;
  await page.click('[data-libadd="tomales-bay"]');
  await page.waitForFunction(() => shownMaps.has('builtin-tomales-bay'), null, { timeout: 15000 });
  c('a map that ships with the app is added from the app, as the built-in', !ctx.libHits.slice(hits).includes('maps/tomales-bay.jpg') && await page.evaluate(async () => !(await idb.get('trailMaps', 'lib-tomales-bay'))));
  await page.click('#mapsBtn'); await page.waitForSelector('#libBtn'); await page.click('#libBtn'); await page.waitForSelector('#libList .item');
  await page.click('#libBack'); await page.waitForSelector('#addPdf');
  c('Back returns to the PDF maps sheet', await page.isVisible('#addPdf'));
  await page.click('#sheet [data-close]');
  c('no page errors', !errors.length, errors.join(' | '));
  await ctx.close();

  { // offline: says so
    const { ctx, page } = await open(browser, url, {}, { libDown: true });
    await page.goto(url); await ready(page); await view(page, 2);
    await page.click('#mapsBtn'); await page.waitForSelector('#libBtn'); await page.click('#libBtn');
    await page.waitForFunction(() => /Can’t reach/.test(document.querySelector('#libList')?.textContent || ''));
    c('no connection: the library says so', true);
    await ctx.close();
  }
};
