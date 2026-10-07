// AIS ships: key sheet, demo fleet, live feed over a mocked aisstream.io WebSocket, collision warning, popup.
const { open, ready, view } = require('./harness');
const ME = { latitude: 37.80, longitude: -122.45 };
const pos = (mmsi, name, lat, lng, sog, cog, b) => JSON.stringify({ MessageType: 'x', MetaData: { MMSI: mmsi, ShipName: name, latitude: lat, longitude: lng },
  Message: { [b ? 'StandardClassBPositionReport' : 'PositionReport']: { Latitude: lat, Longitude: lng, Sog: sog, Cog: cog, TrueHeading: 511, NavigationalStatus: 0 } } });
const stat = (mmsi, name, type, A, B, C, D, dest) => JSON.stringify({ MessageType: 'ShipStaticData', MetaData: { MMSI: mmsi, ShipName: name },
  Message: { ShipStaticData: { Name: name, Type: type, ImoNumber: 9312345, CallSign: 'WDX1', Destination: dest, Dimension: { A, B, C, D }, Eta: { Month: 10, Day: 7, Hour: 21, Minute: 30 } } } });
module.exports = async (browser, url, check) => {
  const c = (n, ok, i) => check('ais', n, ok, i);
  { const { ctx, page, errors } = await open(browser, url, { geolocation: ME });
    const subs = []; let sock, onlyPos = false;
    await ctx.routeWebSocket('wss://stream.aisstream.io/**', ws => {
      sock = ws;
      ws.onMessage(m => {
        const s = JSON.parse(m); subs.push(s);
        if (s.APIKey === 'bad'){ ws.send(JSON.stringify({ error: 'Api Key Is Not Valid' })); return ws.close(); }
        // 1.6 nm north, heading south at 12 kt: straight at us
        ws.send(pos(367000001, 'BIG CARGO', 37.8267, -122.45, 12, 180));
        if (!onlyPos) ws.send(stat(367000001, 'BIG CARGO', 70, 200, 28, 16, 16, 'OAKLAND'));
        ws.send(pos(367000002, 'SMALL SLOOP', 37.79, -122.44, 4, 90, true));
        ws.send(pos(367000003, 'ANCHORED TANKER', 37.81, -122.40, 0, 360));
      });
    });
    await page.goto(url); await ready(page); await view(page, 2);
    await page.evaluate(() => map.setView([37.80, -122.45], 13)); await page.waitForTimeout(300);
    c('AIS button on the map', await page.isVisible('#aisBtn'));
    await page.click('#aisBtn');
    c('first tap asks for an API key', await page.isVisible('#aisKey'));
    await page.click('#aisDemo'); await page.waitForTimeout(900);
    c('demo shows five ships', await page.locator('.ship').count() === 5, await page.locator('.ship').count());
    c('badge counts ships', await page.getAttribute('#aisBtn', 'data-n') === '5');
    c('moving ships get projected tracks', await page.evaluate(() => [...ais.ships.values()].filter(s => s.tr.getLayers().length).length) === 4);
    await page.click('#aisBtn'); await page.waitForTimeout(600);
    c('tap again turns ships off', await page.locator('.ship').count() === 0 && !(await page.getAttribute('#aisBtn', 'data-n')));

    // live feed with a real-looking key
    await view(page, 0); await page.click('#vTrips details summary >> text=Settings');
    await page.fill('#sAis', 'KEY123'); await page.press('#sAis', 'Tab');
    c('key saved in settings', await page.evaluate(() => settings.aisKey) === 'KEY123');
    await view(page, 2);
    await page.click('#locBtn'); await page.waitForTimeout(300);
    await page.click('#aisBtn'); await page.waitForTimeout(1200);
    const sub = subs[0] || {};
    c('subscribes with the key and message types', sub.APIKey === 'KEY123' && sub.FilterMessageTypes.includes('PositionReport'), JSON.stringify(sub).slice(0, 120));
    const bb = sub.BoundingBoxes?.[0] || [[0, 0], [0, 0]];
    c('bounding box covers the map view', bb[0][0] < 37.80 && bb[1][0] > 37.80 && bb[0][1] < -122.45 && bb[1][1] > -122.45, JSON.stringify(bb));
    c('live ships drawn', await page.locator('.ship').count() === 3, await page.locator('.ship').count());
    c('ship on a collision course flagged', await page.locator('.ship.warn').count() === 1 && await page.evaluate(() => document.querySelector('#aisBtn').classList.contains('warn')));
    c('collision warning toast', /BIG CARGO passes .* in \d+ min/.test(await page.text('#toast')), await page.text('#toast'));
    c('static data parsed', await page.evaluate(() => { const s = ais.ships.get(367000001); return s.type === 70 && s.dim.join() === '200,28,16,16' && s.dest === 'OAKLAND'; }));
    c('class B and anchored ships have no track', await page.evaluate(() => ais.ships.get(367000003).tr.getLayers().length === 0 && ais.ships.get(367000002).cls === 'B'));
    await page.evaluate(() => ais.ships.get(367000001).mk.openPopup()); await page.waitForTimeout(300);
    const pop = await page.text('.shipPop');
    c('popup: name, type, size, speed', /BIG CARGO/.test(pop) && /Cargo · 228 × 32 m/.test(pop) && /12\.0 kt · course 180°T/.test(pop), pop);
    c('popup: destination and passing distance', /→ OAKLAND · ETA/.test(pop) && /Passes .* from you in \d+ min/.test(pop), pop);
    c('popup links to vessel photos', (await page.getAttribute('.shipPop a', 'href')).endsWith('/367000001'));
    await page.evaluate(() => map.closePopup());
    await page.evaluate(() => map.setView([37.5, -122.0], 13)); await page.waitForTimeout(1000);
    c('panning far resubscribes to the new area', subs.length === 2 && subs[1].BoundingBoxes[0][0][0] < 37.5 && subs[1].BoundingBoxes[0][1][0] > 37.5, subs.length);
    await page.click('#aisBtn'); await page.waitForTimeout(300);
    c('off clears ships and closes the feed', await page.locator('.ship').count() === 0 && await page.evaluate(() => !ais.ws));

    await page.evaluate(() => { settings.aisKey = 'bad'; });
    await page.click('#aisBtn'); await page.waitForTimeout(800);
    c('invalid key reported and AIS turned off', /AIS: Api Key Is Not Valid/.test(await page.text('#toast')) && await page.evaluate(() => !ais.on), await page.text('#toast'));
    await page.waitForTimeout(3200);
    c('ship details remembered on the device', await page.evaluate(() => { const o = JSON.parse(localStorage.getItem('paddle.aisInfo'))[367000001]; return o.type === 70 && o.dim.join() === '200,28,16,16' && !o.dest; }));
    // next session: only position reports so far, details come from the device
    onlyPos = true;
    await page.reload(); await ready(page); await view(page, 2);
    await page.evaluate(() => map.setView([37.80, -122.45], 13)); await page.waitForTimeout(300);
    await page.click('#aisBtn'); await page.waitForTimeout(1200);
    c('remembered type and size used before static data arrives', await page.evaluate(() => { const s = ais.ships.get(367000001); return s && s.type === 70 && s.dim.join() === '200,28,16,16' && !s.dest && s.lat > 37.8; }));
    c('no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close(); }
};
