// Fake responses for every external host the app talks to, so tests run offline and deterministically.
const fs = require('fs'), path = require('path');
const LEAF = path.dirname(require.resolve('leaflet/dist/leaflet.js'));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };
const pad = n => String(n).padStart(2, '0');
const gmtStr = ms => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
const ymdToMs = s => Date.UTC(+s.slice(0,4), +s.slice(4,6)-1, +s.slice(6,8));
const TILE_HOSTS = ['gis.charttools.noaa.gov', 'tile.openstreetmap.org', 'basemap.nationalmap.gov', 'server.arcgisonline.com', 'tile.opentopomap.org', 'tiles.openseamap.org'];

// opts: { tilesFail: bool, noaaErr: bool, tz: IANA zone reported by Open-Meteo (default America/Los_Angeles), tzOffset: seconds }
async function install(ctx, opts = {}){
  const json = (r, b) => r.fulfill({ body: JSON.stringify(b), contentType: 'application/json', headers: CORS });
  await ctx.route('https://cdnjs.cloudflare.com/**', r => {
    const u = r.request().url();
    const f = u.endsWith('.css') ? 'leaflet.css' : u.includes('/leaflet/') ? 'leaflet.js' : null;
    if (!f) return r.fulfill({ status: 404, headers: CORS });
    r.fulfill({ body: fs.readFileSync(path.join(LEAF, f)), contentType: f.endsWith('css') ? 'text/css' : 'application/javascript', headers: CORS });
  });
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  // Map library (hodzic.github.io/outback-maps): two maps, images from tests/fixtures. opts.libDown: unreachable
  const FIX = path.join(__dirname, 'fixtures'), libHits = ctx.libHits = [];
  await ctx.route('https://hodzic.github.io/outback-maps/**', r => {
    const p = new URL(r.request().url()).pathname.replace('/outback-maps/', ''); libHits.push(p);
    if (opts.libDown) return r.abort();
    const corners = { topLeft: [37.66, -121.80], topRight: [37.66, -121.74], bottomLeft: [37.62, -121.80] };
    if (p === 'catalog.json') return r.fulfill({ contentType: 'application/json', headers: CORS, body: JSON.stringify({ app: 'Outback', kind: 'map-library', version: 1, maps: [
      { id: 'tomales-bay', name: 'Tomales Bay boat-in camping (NPS)', image: 'maps/tomales-bay.jpg', thumb: 'thumbs/tomales-bay.jpg', size: 559295, width: 1760, height: 2000,
        topLeft: [38.2717311, -123.0365281], topRight: [38.2685383, -122.8404896], bottomLeft: [38.0984544, -123.0369001], source: 'National Park Service', license: 'Public domain (US federal work)' },
      { id: 'test-lake', name: 'Test Lake trails', image: 'maps/test-lake.jpg', thumb: 'thumbs/test-lake.jpg', size: fs.statSync(path.join(FIX, 'tomales-bay.jpg')).size, width: 1760, height: 2000, ...corners, source: 'Test Parks' }] }) });
    const f = { 'maps/test-lake.jpg': 'tomales-bay.jpg', 'thumbs/test-lake.jpg': 'tomales-bay-thumb.jpg', 'thumbs/tomales-bay.jpg': 'tomales-bay-thumb.jpg', 'maps/tomales-bay.jpg': 'tomales-bay.jpg' }[p];
    return f ? r.fulfill({ body: fs.readFileSync(path.join(FIX, f)), contentType: 'image/jpeg', headers: CORS }) : r.fulfill({ status: 404, headers: CORS });
  });
  // GitHub gists for trip links. opts.github is shared between contexts (two phones, one GitHub):
  // { users: { token: login }, gists: Map, down: bool }; each change gets a new version id.
  const gh = opts.github || (opts.github = {});
  gh.users = gh.users || { 'tok-alice': 'alice', 'tok-alice2': 'alice', 'tok-bob': 'bob' }; gh.gists = gh.gists || new Map(); gh.n = gh.n || 0; gh.calls = gh.calls || [];
  await ctx.route('https://api.github.com/**', r => {
    const q = r.request(), u = new URL(q.url()), m = q.method(), tok = (q.headers().authorization || '').replace(/^Bearer /, '');
    gh.calls.push(`${m} ${u.pathname}${tok ? ' ' + tok : ''}`);
    const out = (status, b) => r.fulfill({ status, body: b === undefined ? '' : JSON.stringify(b), contentType: 'application/json', headers: CORS });
    if (gh.down) return r.abort();
    const login = tok ? gh.users[tok] : null;
    if (tok && !login) return out(401, { message: 'Bad credentials' });
    const view = (id, g) => ({ id, owner: { login: g.owner }, updated_at: g.at, history: [{ version: g.ver }], files: { [g.name]: { content: g.content, truncated: false, raw_url: 'https://gist.githubusercontent.com/x' } } });
    const save = (g, files) => { for (const [name, f] of Object.entries(files)){ g.name = name; g.content = f.content; } g.ver = 'v' + (++gh.n); g.at = new Date().toISOString(); };
    if (u.pathname === '/user') return login ? out(200, { login }) : out(401, { message: 'Requires authentication' });
    if (u.pathname === '/gists' && m === 'POST'){
      if (!login) return out(401, { message: 'Requires authentication' });
      const id = 'abc' + (100000 + gh.gists.size), g = { owner: login }; save(g, JSON.parse(q.postData()).files); gh.gists.set(id, g); return out(201, view(id, g));
    }
    const id = u.pathname.split('/')[2], g = gh.gists.get(id);
    if (!g) return out(404, { message: 'Not Found' });
    if (m === 'GET') return out(200, view(id, g));
    if (login !== g.owner) return out(404, { message: 'Not Found' });
    if (m === 'PATCH'){ save(g, JSON.parse(q.postData()).files); return out(200, view(id, g)); }
    if (m === 'DELETE'){ gh.gists.delete(id); return out(204); }
    return out(405, {});
  });
  for (const h of TILE_HOSTS)
    await ctx.route(`https://${h}/**`, r => opts.tilesFail && h === 'gis.charttools.noaa.gov' ? r.fulfill({ status: 500 }) : r.fulfill({ body: PNG, contentType: 'image/png', headers: CORS }));

  await ctx.route('https://api.tidesandcurrents.noaa.gov/**', r => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith('stations.json')){
      if (u.searchParams.get('type') === 'tidepredictions') return json(r, { stations: [
        { id: 9414290, name: 'San Francisco', lat: 37.8063, lng: -122.4659 },
        { id: 9414750, name: 'Alameda', lat: 37.7717, lng: -122.3 }] });
      if (u.searchParams.get('type') === 'watertemp') return json(r, { stations: opts.water === 'model' || opts.water === 'none' ? [] : [{ id: 9414290, name: 'San Francisco', lat: 37.8063, lng: -122.4659 }] });
      return json(r, { stations: [
        { id: 'SFB1201', name: 'Golden Gate Bridge', lat: 37.8117, lng: -122.4717, currbin: 1, depth: 30 },
        { id: 'SFB1201', name: 'Golden Gate Bridge', lat: 37.8117, lng: -122.4717, currbin: 2, depth: 10 },
        { id: 'SFB1203', name: 'Alcatraz N', lat: 37.83, lng: -122.42, currbin: 1, depth: 15 }] });
    }
    if (opts.noaaErr) return json(r, { error: { message: 'No data was found' } });
    const p = u.searchParams;
    if (p.get('product') === 'water_temperature'){ // 56–58 °F through the day, 6-minute readings; or just the latest
      ctx.waterHits = (ctx.waterHits || 0) + 1;
      if (p.get('date') === 'latest') return json(r, { data: [{ t: gmtStr(Date.now() - 2 * 36e5), v: '57.2', f: '0,0,0' }] });
      const out = [], b0 = ymdToMs(p.get('begin_date')), e0 = Math.min(ymdToMs(p.get('end_date')) + 864e5, Date.now());
      for (let t = b0; t < e0; t += 6 * 6e4) out.push({ t: gmtStr(t), v: (57 + Math.sin(t / 864e5 * 2 * Math.PI)).toFixed(1), f: '0,0,0' });
      return json(r, { data: out });
    }
    const b = ymdToMs(p.get('begin_date')), e = ymdToMs(p.get('end_date')) + 864e5;
    if (p.get('product') === 'predictions'){
      const out = []; let hi = true;
      for (let t = b + 2*36e5; t < e; t += 6.2*36e5, hi = !hi) out.push({ t: gmtStr(t), v: (hi ? 5.8 : 0.4).toFixed(3), type: hi ? 'H' : 'L' });
      return json(r, { predictions: out });
    }
    const cp = [], seq = ['slack', 'flood', 'slack', 'ebb'];
    for (let t = b + 36e5, k = 0; t < e; t += 3.1*36e5, k++){ const ty = seq[k % 4]; cp.push({ Time: gmtStr(t), Velocity_Major: ty === 'flood' ? 2.4 : ty === 'ebb' ? -3.1 : 0, Type: ty, meanFloodDir: 70, meanEbbDir: 250, Bin: '1' }); }
    return json(r, { current_predictions: { units: 'knots', cp } });
  });

  await ctx.route('https://api.open-meteo.com/**', r => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith('/elevation')){ // a single hill: 200 m up to 500 m and back down
      const n = u.searchParams.get('latitude').split(',').length;
      return json(r, { elevation: Array.from({ length: n }, (_, i) => 200 + 300 * Math.sin(Math.PI * i / Math.max(1, n - 1))) });
    }
    const auto = u.searchParams.get('timezone') === 'auto';
    const zone = auto ? (opts.tz || 'America/Los_Angeles') : 'GMT', off = auto ? (opts.tzOffset ?? -25200) : 0;
    const s = Date.parse(u.searchParams.get('start_date') + 'T00:00Z'), e = Date.parse(u.searchParams.get('end_date') + 'T23:00Z');
    const h = { time: [], temperature_2m: [], precipitation_probability: [], weather_code: [], wind_speed_10m: [], wind_direction_10m: [], wind_gusts_10m: [], pressure_msl: [], cape: [] };
    for (let t = s, i = 0; t <= e; t += 36e5, i++){
      h.time.push(new Date(t).toISOString().slice(0, 16)); // local wall-clock time when timezone=auto
      h.temperature_2m.push(60 + 5*Math.sin(i/4)); h.precipitation_probability.push(10); h.weather_code.push(2);
      h.wind_speed_10m.push(8 + 6*Math.sin(i/6)); h.wind_direction_10m.push(270); h.wind_gusts_10m.push(12 + 8*Math.sin(i/6));
      h.pressure_msl.push(1015 + 3*Math.sin(i/10)); h.cape.push(50);
    }
    json(r, { timezone: zone, utc_offset_seconds: off, hourly: h });
  });

  // Open-Meteo Marine: sea surface 61–63 °F (opts.water 'none' or 'nomodel': no data, as in a slough; 'model': no NOAA water station)
  await ctx.route('https://marine-api.open-meteo.com/**', r => {
    const u = new URL(r.request().url()), s = Date.parse(u.searchParams.get('start_date') + 'T00:00Z'), e = Date.parse(u.searchParams.get('end_date') + 'T23:00Z');
    const h = { time: [], sea_surface_temperature: [], wave_height: [], swell_wave_height: [], swell_wave_period: [], swell_wave_direction: [] };
    const none = opts.water === 'none' || opts.water === 'nomodel';
    for (let t = s, i = 0; t <= e; t += 36e5, i++){ h.time.push(new Date(t).toISOString().slice(0, 16)); h.sea_surface_temperature.push(none ? null : 62 + Math.sin(i / 4));
      // swell 1.2–1.6 m at 12 s from the WNW, waves a bit higher with wind chop (none: no data, as in a slough)
      h.swell_wave_height.push(none ? null : 1.4 + .2 * Math.sin(i / 5)); h.wave_height.push(none ? null : 1.7 + .2 * Math.sin(i / 5)); h.swell_wave_period.push(none ? null : 12); h.swell_wave_direction.push(none ? null : 290); }
    json(r, { timezone: 'GMT', hourly: h });
  });
  await ctx.route('https://api.weather.gov/**', r => {
    const u = r.request().url();
    if (u.includes('/points/')) return json(r, { properties: { forecastGridData: 'https://api.weather.gov/gridpoints/MTR/85,105' } });
    const start = Date.now() - 2*864e5, values = [];
    for (let i = 0; i < 40; i++) values.push({ validTime: new Date(start + i*3*36e5).toISOString().replace('.000', '') + '/PT3H', value: i % 5 === 0 ? 30 : 0 });
    json(r, { properties: { probabilityOfThunder: { values } } });
  });
  // Overpass (OpenStreetMap): restrooms for the 🚻 button (two near the Golden Gate unless opts.toilets),
  // and water for PDF map Auto-align (none unless opts.overpass)
  const TOILETS = [{ type: 'node', id: 1, lat: 37.8326, lon: -122.4766, tags: { amenity: 'toilets', name: 'Horseshoe Cove restroom', fee: 'no', wheelchair: 'yes', 'toilets:disposal': 'flush', opening_hours: '24/7' } },
    { type: 'way', id: 2, center: { lat: 37.8072, lon: -122.4236 }, tags: { amenity: 'toilets', access: 'customers', 'toilets:disposal': 'pitlatrine' } }];
  const PARKING = [{ type: 'way', id: 3, center: { lat: 37.8331, lon: -122.4772 }, tags: { amenity: 'parking', name: 'Horseshoe Cove lot', fee: 'yes', charge: '$5/day', capacity: '40', opening_hours: '05:00-22:00', operator: 'National Park Service' } },
    { type: 'node', id: 4, lat: 37.8065, lon: -122.4225, tags: { amenity: 'parking', fee: 'no', access: 'customers', maxstay: '2 hours' } }];
  for (const h of ['overpass-api.de', 'overpass.kumi.systems'])
    await ctx.route(`https://${h}/**`, r => {
      const q = decodeURIComponent((r.request().postData() || '').replace(/^data=/, ''));
      if (/slipway/.test(q)){ ctx.launchHits = (ctx.launchHits || 0) + 1; return json(r, { elements: opts.launches || [
        { type: 'node', id: 5, lat: 37.8689, lon: -122.3179, tags: { leisure: 'slipway', name: 'Berkeley Marina ramp (OSM)', fee: 'yes' } },
        { type: 'node', id: 6, lat: 37.8790, lon: -122.3060, tags: { canoe: 'put_in', name: 'Gilman put-in (OSM)' } }] }); }
      if (/amenity"="parking/.test(q)){ ctx.parkingHits = (ctx.parkingHits || 0) + 1; return json(r, { elements: opts.parking || PARKING }); }
      if (/amenity"="toilets/.test(q)){ ctx.toiletHits = (ctx.toiletHits || 0) + 1; return json(r, { elements: opts.toilets || TOILETS }); }
      ctx.overpassHits = (ctx.overpassHits || 0) + 1; json(r, { elements: opts.overpass || [] });
    });
}
module.exports = { install };
