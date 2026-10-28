// Trip links: a trip shared through a secret GitHub gist. Alice plans and shares; Bob opens the link
// and gets her updates; Alice's second phone edits the same trip. GitHub is faked in mocks.js.
const { open, seedRoute, ready, view } = require('./harness');
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

  // Bob changes his copy; Alice changes hers: Bob chooses
  await ev(b, () => { trip.name = 'Angel Island (Bob)'; changed(); });
  await b.waitForTimeout(400);
  c('his changes never go to the link', JSON.parse(github.gists.get(id).content).trip.name === 'Angel Island');
  await ev(a, () => { trip.route.push([37.83, -122.43]); changed(); return syncShare(trip); });
  await ev(b, () => syncShare(trip)); await b.waitForSelector('#syncKeep');
  c('both changed: he is asked, with her changes listed', /@alice updated/.test(await b.text('#sheet h2')) && /Route: 3 → 4 waypoints/.test(await b.text('#sheet')), await b.text('#sheet'));
  await b.click('#syncKeep'); await b.waitForTimeout(300);
  c('Keep mine keeps his copy', await ev(b, () => trip.name === 'Angel Island (Bob)' && trip.route.length === 3));
  await ev(b, () => syncShare(trip)); await b.waitForTimeout(300);
  c('and he is not asked again for the same update', !(await b.isVisible('#syncKeep')));
  await ev(a, () => { trip.start = 630; changed(); return syncShare(trip); });
  await ev(b, () => { trip.tracks.push({ id: 'bobtrack', start: 1, end: 2, pts: [[37.8, -122.4, 1], [37.81, -122.41, 2]] }); return syncShare(trip); });
  await b.waitForSelector('#syncTake');
  await b.click('#syncTake'); await b.waitForTimeout(400);
  c('Take their update replaces his changes', await ev(b, () => trip.name === 'Angel Island' && trip.route.length === 4 && trip.start === 630));
  c('and keeps the track he recorded', await ev(b, () => trip.tracks.some(k => k.id === 'bobtrack')));

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

  // Stop sharing: the link goes away; Bob keeps his copy
  await view(a, 1); await a.click('#sharePlan'); await a.waitForSelector('#planLink');
  c('a shared trip offers its link', (await a.text('#planLink')) === 'Link');
  await a.click('#planLink'); await a.waitForSelector('#linkStop');
  await a.click('#linkStop'); await a.waitForTimeout(400);
  c('Stop sharing deletes the gist', !github.gists.has(id) && await ev(a, () => !trip.share) && !(await a.isVisible('#shareInfo')));
  await ev(b, () => syncShare(trip)); await b.waitForTimeout(300);
  c('his copy stays, no longer linked', await ev(b, () => !trip.share && trip.name === 'Angel Island loop'));
  await b.goto(link); await b.waitForTimeout(800);
  c('a dead link says so', /no longer works/.test(await b.text('#toast')));

  // the Outback file never carries link bookkeeping
  await ev(a2, () => { shareFile = async (name, data) => { window.__file = data; return true; }; });
  await view(a2, 1); await a2.click('#sharePlan'); await a2.waitForSelector('#planJson'); await a2.click('#planJson'); await a2.waitForFunction(() => window.__file);
  c('the Outback file leaves the link out', await ev(a2, () => { const j = JSON.parse(window.__file); return !!j.trip.route && !('share' in j.trip); }));
  c('no page errors', !A.errors.length && !B.errors.length && !A2.errors.length, [...A.errors, ...B.errors, ...A2.errors].join(' | '));
  for (const p of [A, B, A2]) await p.ctx.close();
};
