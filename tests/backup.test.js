// Backup and restore: one file with every trip, PDF map and setting; persistent storage; the reminder.
const fs = require('fs'), path = require('path');
const { open, seedRoute, ready, view, OUT } = require('./harness');
const GG = [[37.80, -122.45], [37.81, -122.42], [37.82, -122.40]];
const DAY = 864e5;

module.exports = async (browser, url, check) => {
  const c = (n, ok, i) => check('backup', n, ok, i);
  const file = path.join(OUT, 'backup.json');

  { // back up: trips, a PDF map and settings go into one file
    const { ctx, page, errors } = await open(browser, url);
    await ctx.addInitScript(() => { window.persistCalls = 0; const s = navigator.storage;
      if (s){ s.persisted = async () => false; s.persist = async () => { window.persistCalls++; return true; }; } });
    await page.goto(url); await ready(page);
    c('asks the browser to keep the data', await page.evaluate(() => window.persistCalls) === 1);
    await seedRoute(page, GG);
    await page.evaluate(async () => {
      trip.name = 'Bay loop'; changed(); settings.speedsKt.paddle = 3.5; settings.aisKey = 'k123'; saveSettings();
      const t = newTrip('hike'); t.name = 'Mt Diablo'; t.route = [[37.87, -121.93], [37.88, -121.91]]; await idb.put('trips', t);
      await idb.put('trailMaps', { id: 'm1', name: 'Park map', imageBlob: new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3, 250])], { type: 'image/png' }), imageWidth: 10, imageHeight: 10, topLeft: [37.9, -122], topRight: [37.9, -121.9], bottomLeft: [37.8, -122] });
    });
    await view(page, 0);
    c('backup card on the Trips view', await page.isVisible('#backupCard summary'));
    await page.click('#backupCard summary');
    c('says not backed up yet', /Not backed up yet/.test(await page.text('#backupInfo')), await page.text('#backupInfo'));
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click('#backupBtn')]);
    c('backup downloads one file', !!dl && /^Outback-backup_\d{4}-\d\d-\d\d\.json$/.test(dl.suggestedFilename()), dl?.suggestedFilename());
    if (dl) await dl.saveAs(file);
    const j = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    c('file holds every trip', j.kind === 'backup' && j.trips?.length === 2 && j.trips.some(t => t.name === 'Bay loop' && t.route.length === 3), j.trips?.map(t => t.name).join());
    c('file holds the PDF map image', j.maps?.length === 1 && /^data:image\/png;base64,/.test(j.maps[0].imageBlob));
    c('file holds settings but not view state', j.settings?.speedsKt?.paddle === 3.5 && j.settings.aisKey === 'k123' && !('view' in j.settings) && !('lastBackup' in j.settings));
    c('backup date shown', /Last backup: /.test(await page.text('#backupInfo')), await page.text('#backupInfo'));
    c('storage status shown', /may clear/.test(await page.text('#backupInfo')), await page.text('#backupInfo'));
    c('toast counts what was saved', /Backed up 2 trips and 1 PDF map/.test(await page.text('#toast')), await page.text('#toast'));
    c('no page errors (backup)', errors.length === 0, errors.join(' | ')); await ctx.close(); }

  { // restore on a wiped phone
    const { ctx, page, errors } = await open(browser, url);
    await page.goto(url); await ready(page);
    await view(page, 0); await page.click('#backupCard summary');
    await page.setInputFiles('#file', file); await page.waitForTimeout(800);
    c('restore toast', /Restored: 2 trips added, 1 PDF map added/.test(await page.text('#toast')), await page.text('#toast'));
    c('trips listed', await page.locator('#tripList .trip', { hasText: 'Bay loop' }).count() === 1 && await page.locator('#tripList .trip', { hasText: 'Mt Diablo' }).count() === 1);
    c('PDF map image restored', await page.evaluate(async () => { const m = await idb.get('trailMaps', 'm1'); const b = new Uint8Array(await m.imageBlob.arrayBuffer());
      return m.imageBlob.type === 'image/png' && b.length === 8 && b[7] === 250; }));
    c('settings restored on a fresh phone', await page.evaluate(() => settings.speedsKt.paddle === 3.5 && settings.aisKey === 'k123') && (await page.inputValue('#sAis')) === 'k123');
    await page.setInputFiles('#file', file); await page.waitForTimeout(500);
    c('restoring twice adds nothing', /Nothing new/.test(await page.text('#toast')) && await page.evaluate(async () => (await idb.all('trips')).length) === 3, await page.text('#toast'));
    // a newer local edit wins; an older local copy is replaced
    await page.evaluate(async () => { const all = await idb.all('trips');
      const a = all.find(t => t.name === 'Bay loop'); a.name = 'Bay loop edited'; a.updated = Date.now() + 1000; await idb.put('trips', a);
      const b = all.find(t => t.name === 'Mt Diablo'); b.name = 'Old Diablo'; b.updated = 1; await idb.put('trips', b);
      settings.speedsKt.paddle = 2.5; saveSettings(); });
    await page.setInputFiles('#file', file); await page.waitForTimeout(500);
    c('newer local trip kept, older one updated', await page.evaluate(async () => { const n = (await idb.all('trips')).map(t => t.name); return n.includes('Bay loop edited') && n.includes('Mt Diablo') && !n.includes('Old Diablo'); }));
    c('settings set on this phone are kept', await page.evaluate(() => settings.speedsKt.paddle) === 2.5);
    c('toast says 1 updated', /1 updated/.test(await page.text('#toast')), await page.text('#toast'));
    fs.writeFileSync(path.join(OUT, 'bad-backup.json'), '{"kind":"backup"}');
    await page.setInputFiles('#file', path.join(OUT, 'bad-backup.json')); await page.waitForTimeout(300);
    c('bad backup rejected', /Import failed: Not an Outback backup/.test(await page.text('#toast')), await page.text('#toast'));
    c('restore button opens the file picker', await page.evaluate(() => { let hit = false; const f = document.querySelector('#file'), o = f.click; f.click = () => { hit = true; }; document.querySelector('#restoreBtn').click(); f.click = o; return hit; }));
    c('no page errors (restore)', errors.length === 0, errors.join(' | ')); await ctx.close(); }

  { // reminder after two weeks with unsaved changes
    const { ctx, page, errors } = await open(browser, url);
    await page.goto(url); await ready(page);
    await view(page, 0);
    c('no reminder for a new user', !(await page.isVisible('#backupNag')));
    await seedRoute(page, GG);
    await page.evaluate(d => { settings.firstRun = Date.now() - 15 * d; saveSettings(); }, DAY);
    await page.waitForTimeout(400); await page.reload(); await ready(page); await view(page, 0);
    c('reminder after 2 weeks without a backup', await page.isVisible('#backupNag') && /only on this phone/.test(await page.text('#nagTxt')), await page.text('#nagTxt'));
    await page.click('#nagLater');
    await page.reload(); await ready(page); await view(page, 0);
    c('Later hides it for 2 weeks', !(await page.isVisible('#backupNag')));
    await page.evaluate(d => { settings.backupNag = 0; settings.lastBackup = Date.now() - 20 * d; saveSettings(); }, DAY);
    await page.reload(); await ready(page); await view(page, 0);
    c('reminder names the days since the last backup', /20 days ago/.test(await page.text('#nagTxt')), await page.text('#nagTxt'));
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click('#nagBack')]);
    await page.waitForTimeout(200);
    c('Back up from the reminder saves and hides it', !!dl && !(await page.isVisible('#backupNag')));
    await page.evaluate(d => { settings.lastBackup = Date.now() - 20 * d; saveSettings(); }, DAY);
    await page.evaluate(async () => { for (const t of await idb.all('trips')){ t.updated = 1; await idb.put('trips', t); } });
    await page.reload(); await ready(page); await view(page, 0);
    c('no reminder when nothing changed since the backup', !(await page.isVisible('#backupNag')));
    c('no page errors (reminder)', errors.length === 0, errors.join(' | ')); await ctx.close(); }
};
