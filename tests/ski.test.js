// Ski day: Kirkwood, Heavenly and Northstar compared for a day, with snow depth, weather, chain controls and crowds.
const { open, ready, view } = require('./harness');
module.exports = async (browser, url, check) => {
  const c = (n, ok, i) => check('ski', n, ok, i);
  const sheetFor = async (mock = {}, ctxOpts = {}) => {
    const o = await open(browser, url, ctxOpts, mock); await o.page.goto(url); await ready(o.page); await view(o.page, 0);
    await o.page.click('#skiBtn'); await o.page.waitForFunction(() => !ski.busy && ski.data && document.querySelectorAll('#skiSheet .ski').length === 3);
    return o;
  };
  {
    const { ctx, page, errors } = await sheetFor();
    const txt = await page.text('#skiSheet');
    c('ski day lists the three resorts', ['Kirkwood', 'Heavenly', 'Northstar'].every(n => txt.includes(n)), txt.slice(0, 200));
    c('snow depth from SNOTEL with the week’s change', /40 in at Carson Pass \(8,360 ft\), \+\d+ in this week/.test(txt), txt);
    c('chain controls read from Caltrans', /No chain controls now on SR-88/.test(txt));
    c('8 days to pick from', (await page.locator('[data-skiday]').count()) === 8);
    c('a best bet is named', /Best bet: /.test(txt));
    c('crowds: Saturday busy, Tuesday light, Thanksgiving Friday and Presidents’ week busy', await page.evaluate(() => {
      const K = SKI[1]; return skiCrowd(K, '2026-11-28', null).lvl >= 2 && skiCrowd(K, '2026-12-01', null).lvl === 0 && skiCrowd(K, '2026-11-27', null).lvl >= 2
        && skiHoliday('2027-02-17') && skiHoliday('2027-01-16') && skiHoliday('2026-12-24') && !skiHoliday('2027-01-12') && skiHoliday('2026-11-26') === 'Thanksgiving'; }));
    c('closed before opening day, open after', await page.evaluate(() => skiOpens(SKI[0], '2026-11-22') === '2026-11-23' && !skiOpens(SKI[0], '2026-11-23') && !skiOpens(SKI[1], '2026-11-21')
      && skiVerdict(SKI[0], '2026-11-22').bad.some(b => /closed: opens/.test(b))));
    c('Epic Local blackouts only with the Local pass', await page.evaluate(() => { const a = skiBlackout('2026-12-27'); settings.skiPass = 'local';
      const r = skiBlackout('2026-12-27') && skiBlackout('2027-01-16') && !skiBlackout('2027-01-17') && skiVerdict(SKI[1], '2026-11-28').v === 2; settings.skiPass = 'epic'; return !a && r; }));
    await page.click('[data-skipass="local"]');
    c('pass picked in the sheet is kept', await page.evaluate(() => settings.skiPass === 'local') && (await page.text('#skiPass .on')) === 'Epic Local');
    await page.click('[data-skipass="epic"]');
    c('a powder day draws a crowd', await page.evaluate(() => skiCrowd(SKI[0], '2026-12-01', { newIn: 10 }).why.includes('powder')));
    await page.click('[data-skiday]:nth-child(4)');
    c('picking a day redraws for that day', (await page.getAttribute('[data-skiday].on', 'data-skiday')) === (await page.evaluate(() => shiftDay(skiToday(), 3))));
    c('later days use the forecast for the road', /snow forecast on the drive/i.test(await page.text('#skiSheet')));
    c('saved for offline use', !!(await page.evaluate(() => idb.get('kv', 'ski'))));
    c('drive time from where you are', /≈\d h( \d+ min)?, \d+ mi from where you are/.test(txt), txt.match(/.*from where.*/)?.[0]);
    c('location kept for next time', await page.evaluate(() => settings.skiFrom?.ll?.[0] === 37.8));
    { const hits = ctx.osrmHits; await page.click('#skiRefresh'); await page.waitForFunction(() => !ski.busy);
      c('routes reused while you stay put', ctx.osrmHits === hits, `${hits} → ${ctx.osrmHits}`); }
    c('no page errors (ski)', !errors.length, errors.join('; '));
    await ctx.close();
  }
  {
    const { ctx, page } = await sheetFor({ snowIn: 8, chains: 'R-2' });
    const k = await page.locator('#skiSheet .ski').first().innerText();
    c('thin snow means Skip', /Skip/.test(k) && /thin snow/.test(k), k);
    c('chain control R-2 named', /R-2/.test(await page.text('#skiSheet')));
    await ctx.close();
  }
  {
    const { ctx, page } = await sheetFor({ chains: 'ROAD CLOSED' });
    c('a closed road means Skip', (await page.locator('#skiSheet .skiV').allInnerTexts()).every(v => v === 'Skip'));
    await ctx.close();
  }
  { // far away (Seattle): only how far each resort is
    const o = await open(browser, url, { geolocation: { latitude: 47.61, longitude: -122.33 } }); const { ctx, page } = o;
    await page.goto(url); await ready(page); await view(page, 0); await page.click('#skiBtn');
    await page.waitForFunction(() => !ski.busy && ski.data && /too far/.test(document.querySelector('#skiSheet').innerText));
    const t = await page.text('#skiSheet');
    c('too far: says so and lists the distance to each resort', /too far away for a ski day trip/.test(t) && (t.match(/mi, about \d+ h/g) || []).length === 3 && !(await page.isVisible('.skiDays')), t);
    await ctx.close();
  }
  { // weather down: retried once, the reason shown
    const { ctx, page } = await sheetFor({ wxDown: true });
    c('weather failure says why', /Couldn’t load weather \(HTTP 503\)/.test(await page.text('#skiSheet')), (await page.text('#skiSheet')).slice(0, 200));
    await ctx.close();
  }
  { // no location: works, asks for it
    const { ctx, page } = await sheetFor({}, { permissions: [] });
    c('without location: still compares, asks for location for the drive', /Allow location for the drive time/.test(await page.text('#skiSheet')) && /No chain controls now on SR-88/.test(await page.text('#skiSheet')));
    await ctx.close();
  }
  {
    const { ctx, page } = await sheetFor({ skiDown: true });
    c('a feed down is reported, the rest still shows', /Couldn’t load snow depth, chain controls/.test(await page.text('#skiSheet')) && /Weather/.test(await page.text('#skiSheet')));
    await ctx.close();
  }
};
