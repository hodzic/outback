// Trip links: a trip shared through a secret GitHub gist. Alice plans and shares; Bob opens the link
// and gets her updates; Alice's second phone edits the same trip. GitHub is faked in mocks.js.
const { open, seedRoute, ready, view, waitForecast } = require('./harness');
const GG = [[37.80, -122.45], [37.81, -122.42], [37.82, -122.40]];

module.exports = async (browser, url, check) => {
  const c = (n, ok, i) => check('share', n, ok, i);
  const github = {}, phone = async () => { const p = await open(browser, url, {}, { github }); await p.page.goto(url); await ready(p.page); return p; };
  const ev = (page, f, a) => page.evaluate(f, a);
  const A = await phone(), a = A.page;

  // Alice: plan, then Share link; the first time asks for a GitHub token
  await ev(a, () => { trip.name = 'Angel Island'; trip.start = 540; });
  await seedRoute(a, GG);
  await view(a, 1);
  c('a trip that is not shared says nothing about links', !(await a.isVisible('#shareInfo')));
  await a.click('#sharePlan'); await a.waitForSelector('#planLink');
  c('Share or print offers a live link', (await a.text('#planLink')) === 'Share link');
  await a.click('#planLink'); await a.waitForSelector('#ghTok');
  c('first link asks for a GitHub token, with a link to make one', /scopes=gist/.test(await a.getAttribute('#sheet a[href*="github.com/settings/tokens"]', 'href')));
  await a.fill('#ghTok', 'nope'); await a.click('#ghSave'); await a.waitForTimeout(400);
  c('a bad token is refused and not kept', await ev(a, () => !settings.ghToken && !!document.querySelector('#ghTok')));
  await a.fill('#ghTok', 'tok-alice'); await a.click('#ghSave');
  await a.waitForSelector('#linkTxt');
  const link = await a.inputValue('#linkTxt'), id = link.split('#trip=')[1];
  c('the token is checked and the link made', await ev(a, () => settings.ghUser === 'alice' && trip.share?.own === true) && github.gists.has(id), link);
  c('the gist is secret and holds the trip, without link bookkeeping', (() => { const g = github.gists.get(id), j = JSON.parse(g.content); return g.owner === 'alice' && j.app === 'Outback' && j.trip.name === 'Angel Island' && j.trip.route.length === 3 && !j.trip.share; })());
  c('the gist request was secret', github.calls.some(x => x.startsWith('POST /gists tok-alice')));
  await a.click('#sheet [data-close]');
  c('the trip says it is shared', /Shared by link/.test(await a.text('#shareInfo')));
  c('Settings shows the GitHub account', /@alice/.test(await ev(a, () => $('#ghSet').textContent)));
  c('backups never carry the token', await ev(a, () => SKIP_SETTINGS.includes('ghToken')));

  // Bob opens the link: the trip is copied to his phone
  const B = await phone(), b = B.page;
  await b.goto(link); await b.waitForFunction(id => trip.share?.id === id, id);
  c('opening the link adds the trip', await ev(b, () => trip.name === 'Angel Island' && trip.route.length === 3 && trip.share.own === false && trip.share.owner === 'alice'));
  c('the address no longer holds the link', !(await ev(b, () => location.hash)));
  c('his copy says where it came from', /@alice’s link/.test(await b.text('#shareInfo')));
  c('Bob needs no GitHub account to read it', github.calls.filter(x => x.startsWith('GET /gists/' + id)).every(x => !x.includes('tok-')));

  // Alice changes the start: it goes to the link by itself a moment after the edit
  await ev(a, () => { trip.start = 600; changed(); });
  await a.waitForTimeout(3600);
  c('her change reaches the link on its own', JSON.parse(github.gists.get(id).content).trip.start === 600);
  // Bob's copy is unchanged: the update comes in with a list of what changed
  await ev(b, () => syncShare(trip)); await b.waitForSelector('#sheet h2');
  c('his unchanged copy takes the update', await ev(b, () => trip.start === 600));
  c('and shows what changed', /updated/.test(await b.text('#sheet h2')) && /Start: 9:00\sAM → 10:00\sAM/.test(await b.text('#sheet')), await b.text('#sheet'));
  await b.click('#sheet [data-close]');

  // Bob renames his copy: the name is his; updates still come in without asking
  await ev(b, () => { trip.name = 'Angel Island (Bob)'; changed(); });
  await b.waitForTimeout(400);
  c('his changes never go to the link', JSON.parse(github.gists.get(id).content).trip.name === 'Angel Island');
  await ev(a, () => { trip.route.push([37.83, -122.43]); changed(); return syncShare(trip); });
  await ev(b, () => syncShare(trip)); await b.waitForSelector('#sheet h2');
  c('a renamed copy still takes updates without asking, and keeps its name', await ev(b, () => trip.route.length === 4 && trip.name === 'Angel Island (Bob)') && !(await b.isVisible('#syncKeep')));
  await b.click('#sheet [data-close]');
  // Bob changes the plan; Alice changes hers: Bob chooses
  await ev(b, () => { trip.start = 660; changed(); });
  await ev(a, () => { trip.route.push([37.84, -122.44]); changed(); return syncShare(trip); });
  await ev(b, () => syncShare(trip)); await b.waitForSelector('#syncKeep');
  c('both changed: he is asked, with her changes and his listed', /@alice updated/.test(await b.text('#sheet h2')) && /From @alice\s*Route: 5 waypoints/.test(await b.text('#sheet')) && /Yours, kept[\s\S]*Start: 11:00/.test(await b.text('#sheet')) && await b.isVisible('#syncMerge'), await b.text('#sheet'));
  await b.click('#syncKeep'); await b.waitForTimeout(300);
  c('Keep mine keeps his copy', await ev(b, () => trip.start === 660 && trip.route.length === 4));
  await ev(b, () => syncShare(trip)); await b.waitForTimeout(300);
  c('and he is not asked again for the same update', !(await b.isVisible('#syncKeep')));
  await ev(a, () => { trip.start = 630; changed(); return syncShare(trip); });
  await ev(b, () => { trip.tracks.push({ id: 'bobtrack', start: 1, end: 2, pts: [[37.8, -122.4, 1], [37.81, -122.41, 2]] }); return syncShare(trip); });
  await b.waitForSelector('#syncTake');
  await b.click('#syncTake'); await b.waitForTimeout(400);
  c('Take their update replaces his changes, not his name', await ev(b, () => trip.name === 'Angel Island (Bob)' && trip.route.length === 5 && trip.start === 630));
  c('and keeps the track he recorded', await ev(b, () => trip.tracks.some(k => k.id === 'bobtrack')));

  // Merge: her changes come in, his stay; markers merge one by one; where both changed one thing he picks
  const mk = (page, id, name, lat) => ev(page, ([id, name, lat]) => { trip.marks.push({ id, name, lat, lng: -122.43 }); changed(); }, [id, name, lat]);
  await mk(a, 'm-a1', 'Beach', 37.86); await ev(a, () => syncShare(trip)); await ev(b, () => syncShare(trip)); await b.waitForTimeout(300); await ev(b, () => sheet.open && sheet.close());
  await ev(b, () => { trip.start = 690; changed(); }); await mk(b, 'm-b1', 'Lunch', 37.87);
  await ev(a, () => { trip.route.push([37.85, -122.45]); trip.marks = trip.marks.filter(k => k.id !== 'm-a1'); changed(); }); await mk(a, 'm-a2', 'Camp', 37.88); await ev(a, () => syncShare(trip));
  await ev(b, () => syncShare(trip)); await b.waitForSelector('#syncMerge');
  c('merge lists her route and markers, and his start and marker', await b.text('#sheet').then(t => /From @alice[\s\S]*Route: 6 waypoints[\s\S]*Yours/.test(t) && /Marker “Beach”: removed[\s\S]*Yours/.test(t) && /Marker “Camp”[\s\S]*Yours/.test(t) && /Yours, kept[\s\S]*Start: 11:30[\s\S]*Marker “Lunch”/.test(t) && !/Both changed/.test(t)), JSON.stringify(await b.text('#sheet')));
  await b.click('#syncMerge'); await b.waitForTimeout(400);
  c('Merge: her route and marker changes in, his start and marker kept', await ev(b, () => trip.route.length === 6 && trip.start === 690 && trip.marks.map(k => k.id).sort().join() === 'm-a2,m-b1' && trip.name === 'Angel Island (Bob)'), JSON.stringify(await ev(b, () => [trip.route.length, trip.start, trip.marks.map(k => k.id)])));
  c('his merged copy never goes to the link', JSON.parse(github.gists.get(id).content).trip.start === 630);
  // both change the start: he picks
  await ev(b, () => { trip.start = 700; changed(); });
  await ev(a, () => { trip.start = 640; trip.date = '2030-06-01'; changed(); return syncShare(trip); });
  await ev(b, () => syncShare(trip)); await b.waitForSelector('[data-pick="start"]');
  c('both changed the start: he is shown both', await b.text('#sheet').then(t => /Both changed[\s\S]*Start[\s\S]*Theirs: 10:40[\s\S]*Mine: 11:40/.test(t) && /From @alice[\s\S]*Day/.test(t)), await b.text('#sheet'));
  await b.click('[data-pick="start"][data-v="mine"]'); await b.click('#syncMerge'); await b.waitForTimeout(400);
  c('his pick wins, and her other change still comes in', await ev(b, () => trip.start === 700 && trip.date === '2030-06-01'));
  // a later update merges against what he merged last
  await ev(a, () => { trip.marks.push({ id: 'm-a3', name: 'Rocks', lat: 37.89, lng: -122.43 }); changed(); return syncShare(trip); });
  await ev(b, () => syncShare(trip)); await b.waitForSelector('#syncMerge');
  c('the next update asks again, listing only what is new', await b.text('#sheet').then(t => /From @alice[\s\S]*Marker “Rocks”/.test(t) && !/Day/.test(t.split('Yours, kept')[0])), await b.text('#sheet'));
  await b.click('#syncMerge'); await b.waitForTimeout(400);
  c('and merges it', await ev(b, () => trip.marks.some(k => k.id === 'm-a3') && trip.start === 700));

  // Alice's second phone: her token makes it her own copy, and its changes go to the link
  const A2 = await phone(), a2 = A2.page;
  await ev(a2, () => { settings.ghToken = 'tok-alice2'; settings.ghUser = 'alice'; });
  await a2.goto(link); await a2.waitForFunction(id => trip.share?.id === id, id);
  c('her other phone opens it as her own', await ev(a2, () => trip.share.own === true) && /Shared by link/.test(await a2.text('#shareInfo')));
  await ev(a2, () => { trip.name = 'Angel Island loop'; changed(); return syncShare(trip); });
  c('the other phone’s changes reach the link', JSON.parse(github.gists.get(id).content).trip.name === 'Angel Island loop');
  await ev(a, () => syncShare(trip)); await a.waitForSelector('#sheet h2');
  c('the first phone takes them, saying they came from another device', await ev(a, () => trip.name === 'Angel Island loop') && /another device/.test(await a.text('#sheet')));
  await a.click('#sheet [data-close]');
  // both phones change it before syncing: the second to sync is asked
  await ev(a2, () => { trip.start = 480; changed(); return syncShare(trip); });
  await ev(a, () => { trip.start = 720; trip.updated = Date.now(); clearTimeout(pushT); });
  await ev(a, () => syncShare(trip)); await a.waitForSelector('#syncKeep');
  c('changed on both phones: asked which to keep', /changed on another device/.test(await a.text('#sheet h2')));
  await a.click('#syncKeep'); await a.waitForTimeout(400);
  c('Keep this one sends it to the link', JSON.parse(github.gists.get(id).content).trip.start === 720 && await ev(a, () => trip.start === 720));
  // her phones merge too, and the merge goes to the link
  await ev(a2, () => syncShare(trip)); await a2.waitForTimeout(300); await ev(a2, () => sheet.open && sheet.close());
  await ev(a2, () => { trip.route.push([37.86, -122.46]); changed(); return syncShare(trip); });
  await ev(a, () => { trip.start = 735; trip.updated = Date.now(); clearTimeout(pushT); });
  await ev(a, () => syncShare(trip)); await a.waitForSelector('#syncMerge');
  await a.click('#syncMerge'); await a.waitForTimeout(500);
  c('merging on her phone sends both changes to the link', (() => { const t = JSON.parse(github.gists.get(id).content).trip; return t.start === 735 && t.route.length === 7; })(), github.gists.get(id).content.slice(0, 80));
  // a copy from before merging existed (no base): the two-way choice
  await ev(a, () => { delete trip.share.base; trip.start = 740; trip.updated = Date.now(); clearTimeout(pushT); });
  await ev(a2, () => syncShare(trip)); await a2.waitForTimeout(300); await ev(a2, () => sheet.open && sheet.close());
  await ev(a2, () => { trip.start = 745; changed(); return syncShare(trip); });
  await ev(a, () => syncShare(trip)); await a.waitForSelector('#syncKeep');
  c('a copy without a merge base gets the two-way choice', !(await a.isVisible('#syncMerge')));
  await a.click('#syncKeep'); await a.waitForTimeout(400);

  // the link opened again on a phone that has it: no second copy
  await b.goto(link); await b.waitForFunction(id => trip.share?.id === id, id); await b.waitForTimeout(500);
  c('opening the link again opens the copy already there', await ev(b, async () => (await idb.all('trips')).filter(t => t.share?.id).length === 1));

  // offline: nothing breaks, nothing is lost
  github.down = true;
  await ev(a, () => { trip.start = 750; changed(); });
  await ev(a, () => syncShare(trip)); await a.waitForTimeout(300);
  c('no connection: the change waits on the phone', await ev(a, () => trip.start === 750 && fullSig(trip) !== trip.share.sent));
  github.down = false;
  await ev(a, () => syncShare(trip));
  c('and goes out once GitHub is back', JSON.parse(github.gists.get(id).content).trip.start === 750);

  // token expired: the link keeps working, her change waits, she is told once and can paste a new one
  delete github.users['tok-alice'];
  await ev(a, () => { trip.start = 765; changed(); return syncShare(trip, true); }); await a.waitForTimeout(200);
  c('an expired token: she is told, even on a background save', /token expired/.test(await a.text('#toast')) && await ev(a, () => $('#toast').dataset.help === 'ghToken'));
  c('the change waits on the phone', JSON.parse(github.gists.get(id).content).trip.start === 750 && await ev(a, () => trip.start === 765));
  github.users['tok-alice3'] = 'alice';
  await a.click('#toast'); await a.waitForSelector('#ghTok');
  c('the toast opens the token sheet, not Help', await ev(a, () => $('#helpPage').hidden)); await a.fill('#ghTok', 'tok-alice3'); await a.click('#ghSave'); await a.waitForTimeout(600);
  c('tapping it takes a new token, and the change goes out', JSON.parse(github.gists.get(id).content).trip.start === 765 && await ev(a, () => settings.ghToken === 'tok-alice3'));

  // Duplicate: a copy of his own, without the link
  await ev(b, () => { if (sheet.open) sheet.close(); showView(1, false); }); await b.waitForTimeout(300);
  await b.click('#dupTrip'); await b.waitForTimeout(400);
  c('Duplicate makes an unlinked copy', await ev(b, () => trip.name === 'Angel Island (Bob) (copy)' && !trip.share && trip.route.length > 3) && !(await b.isVisible('#shareInfo')));
  c('and the original stays linked', await ev(b, async () => (await idb.all('trips')).filter(t => t.share?.id).length === 1));
  await ev(b, async () => openTrip((await idb.all('trips')).find(t => t.share)));
  // Stop updates: his copy, no more updates; opening the link again links it back
  c('a copy from a link offers Stop updates', await b.isVisible('#unlinkBtn'));
  await b.click('#unlinkBtn'); await b.waitForTimeout(300);
  c('Stop updates unlinks his copy and keeps it', await ev(b, () => !trip.share && trip.name === 'Angel Island (Bob)') && !(await b.isVisible('#shareInfo')));
  await ev(a, () => { trip.start = 780; changed(); return syncShare(trip); });
  await b.goto(link); await b.waitForFunction(id => trip.share?.id === id, id); await b.waitForTimeout(500);
  c('opening the link again links the same copy back, with what changed', await ev(b, async () => trip.start === 780 && (await idb.all('trips')).length === 3 && trip.name === 'Angel Island (Bob)') && /updated/.test(await b.text('#sheet h2')), JSON.stringify(await ev(b, async () => [trip.start, trip.name, (await idb.all('trips')).map(t => t.name)])));
  await b.click('#sheet [data-close]');

  // Stop sharing: the link goes away; Bob keeps his copy
  await view(a, 1); await a.click('#sharePlan'); await a.waitForSelector('#planLink');
  c('a shared trip offers its link', (await a.text('#planLink')) === 'Link');
  await a.click('#planLink'); await a.waitForSelector('#linkStop');
  await a.click('#linkStop'); await a.waitForTimeout(400);
  c('Stop sharing deletes the gist', !github.gists.has(id) && await ev(a, () => !trip.share) && !(await a.isVisible('#shareInfo')));
  await ev(b, () => syncShare(trip)); await b.waitForTimeout(300);
  c('his copy stays, no longer linked', await ev(b, () => !trip.share && trip.name === 'Angel Island (Bob)'));
  await b.goto(link); await b.waitForTimeout(800);
  c('a dead link says so', /no longer works/.test(await b.text('#toast')));

  // the Outback file never carries link bookkeeping
  await ev(a2, () => { shareFile = async (name, data) => { window.__file = data; return true; }; });
  await view(a2, 1); await a2.click('#sharePlan'); await a2.waitForSelector('#planJson'); await a2.click('#planJson'); await a2.waitForFunction(() => window.__file);
  c('the Outback file leaves the link out', await ev(a2, () => { const j = JSON.parse(window.__file); return !!j.trip.route && !('share' in j.trip); }));
  c('no page errors', !A.errors.length && !B.errors.length && !A2.errors.length, [...A.errors, ...B.errors, ...A2.errors].join(' | '));
  for (const p of [A, B, A2]) await p.ctx.close();

  { // what Get forecast fills in on a copy (water type, stations, time zone) is not an edit: a later change comes in by itself
    const S = await phone(), s = S.page, R = await phone(), r = R.page;
    await seedRoute(s, GG); await view(s, 1);
    await ev(s, () => { settings.ghToken = 'tok-alice3'; settings.ghUser = 'alice'; trip.name = 'Ride'; changed(); });
    await s.click('#sharePlan'); await s.waitForSelector('#planLink'); await s.click('#planLink'); await s.waitForSelector('#linkTxt');
    const link = await s.inputValue('#linkTxt'), id = link.split('#trip=')[1]; await s.click('#sheet [data-close]');
    await r.goto(link); await r.waitForFunction(id => trip?.share?.id === id, id); await r.waitForTimeout(300);
    await r.click('#fcBtn'); await waitForecast(r);
    c('a forecast on a copy does not count as changing it', await ev(r, () => !!trip.tide && planSig(trip) === trip.share.sig));
    await s.click('#actSel [data-act="bike"]'); await ev(s, () => syncShare(trip));
    await ev(r, () => syncShare(trip)); await r.waitForSelector('#sheet h2');
    c('so the sender’s switch to Bike comes in without a merge', await ev(r, () => trip.activity === 'bike') && !(await r.isVisible('#syncMerge')), await r.text('#sheet'));
    await r.click('#sheet [data-close]');
    // a copy he did change: the forecast's fill-ins still are not his, so only his own edit is kept
    await ev(r, () => { trip.start = 480; changed(); });
    await r.click('#fcBtn'); await waitForecast(r);
    await ev(s, () => { trip.date = shiftDay(trip.date, 1); changed(); return syncShare(trip); });
    await ev(r, () => syncShare(trip)); await r.waitForSelector('#syncMerge');
    const t = await r.text('#sheet');
    c('an edited copy merges with only his own edit kept, nothing to pick', !/Both changed/.test(t) && /Start/.test(t) && !/Activity|stations|Other trip/i.test(t.split(/kept/)[1] || ''), t);
    await r.click('#syncMerge'); await r.waitForTimeout(400);
    c('and the merge keeps his start and takes the new day and Bike', await ev(r, (d) => trip.start === 480 && trip.activity === 'bike' && trip.date === d, await ev(s, () => trip.date)));
    c('no page errors (forecast on a copy)', !S.errors.length && !R.errors.length, [...S.errors, ...R.errors].join(' | '));
    for (const p of [S, R]) await p.ctx.close();
  }

  { // the map Get forecast saves is on that phone only: a copy gets the forecast but never claims the sender's map
    const S = await phone(), s = S.page, R = await phone(), r = R.page;
    await seedRoute(s, GG); await view(s, 1);
    await s.click('#fcBtn'); await waitForecast(s);
    c('the sender’s status says the map is saved, with its size', /map saved offline \(\d+ tiles, \d+(\.\d)? [KM]B\)/.test(await s.text('#status')), await s.text('#status'));
    await ev(s, () => { settings.ghToken = 'tok-alice3'; settings.ghUser = 'alice'; trip.name = 'Mapped'; changed(); });
    await s.click('#sharePlan'); await s.waitForSelector('#planLink'); await s.click('#planLink'); await s.waitForSelector('#linkTxt');
    const link = await s.inputValue('#linkTxt'), id = link.split('#trip=')[1]; await s.click('#sheet [data-close]');
    const g = JSON.parse(github.gists.get(id).content).trip;
    c('the link carries the forecast but not the saved map', !!g.fetchedAt && !('mapTiles' in g), Object.keys(g).join());
    await r.goto(link); await r.waitForFunction(id => trip?.share?.id === id, id); await view(r, 1);
    c('the copy has the forecast and says nothing about a saved map', !!(await ev(r, () => trip.fetchedAt)) && !/map saved/.test(await r.text('#status')), await r.text('#status'));
    await r.click('#fcBtn'); await waitForecast(r);
    c('Get forecast on the copy saves its own map', /map saved offline/.test(await r.text('#status')));
    await ev(s, () => { trip.start = 660; changed(); return syncShare(trip); });
    await ev(r, () => syncShare(trip)); await r.waitForSelector('#sheet h2'); await r.click('#sheet [data-close]');
    c('an update from the link keeps the copy’s own map', await ev(r, () => trip.start === 660 && offlineMaps[trip.id]?.tiles > 0) && /map saved offline/.test(await r.text('#status')));
    await view(r, 0);
    c('the trips list shows what each trip takes on the phone', /· \d+(\.\d)? [KM]B/.test(await r.text('#tripList')), await r.text('#tripList'));
    c('no page errors (saved map)', !S.errors.length && !R.errors.length, [...S.errors, ...R.errors].join(' | '));
    for (const p of [S, R]) await p.ctx.close();
  }

  { // older versions kept the tile count in the trip: kept for your own trips, dropped from one that came by link
    const P = await phone(), p = P.page;
    await ev(p, async () => {
      const t = id => ({ ...newTrip(), id, name: id });
      await idb.put('trips', { ...t('mine'), mapTiles: 321 });
      await idb.put('trips', { ...t('theirs'), mapTiles: 654, share: { id: 'g1', own: false, owner: 'bob' } });
    });
    await p.reload(); await ready(p);
    const r = await ev(p, async () => { await offlineReady; const all = await idb.all('trips');
      return { mine: offlineMaps.mine?.tiles, theirs: offlineMaps.theirs, left: all.filter(t => 'mapTiles' in t).length }; });
    c('an older saved-map count moves to this phone, only for your own trips', r.mine === 321 && !r.theirs && r.left === 0, JSON.stringify(r));
    await P.ctx.close();
  }
};
