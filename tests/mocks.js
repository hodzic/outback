// Fake responses for every external host the app talks to, so tests run offline and deterministically.
const fs = require('fs'), path = require('path');
const LEAF = path.dirname(require.resolve('leaflet/dist/leaflet.js'));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };
const pad = n => String(n).padStart(2, '0');
const gmtStr = ms => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
const ymdToMs = s => Date.UTC(+s.slice(0,4), +s.slice(4,6)-1, +s.slice(6,8));
const TILE_HOSTS = ['gis.charttools.noaa.gov', 'tile.openstreetmap.org', 'basemap.nationalmap.gov', 'server.arcgisonline.com', 'tile.opentopomap.org'];

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
  for (const h of TILE_HOSTS)
    await ctx.route(`https://${h}/**`, r => opts.tilesFail && h === 'gis.charttools.noaa.gov' ? r.fulfill({ status: 500 }) : r.fulfill({ body: PNG, contentType: 'image/png', headers: CORS }));

  await ctx.route('https://api.tidesandcurrents.noaa.gov/**', r => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith('stations.json')){
      if (u.searchParams.get('type') === 'tidepredictions') return json(r, { stations: [
        { id: 9414290, name: 'San Francisco', lat: 37.8063, lng: -122.4659 },
        { id: 9414750, name: 'Alameda', lat: 37.7717, lng: -122.3 }] });
      return json(r, { stations: [
        { id: 'SFB1201', name: 'Golden Gate Bridge', lat: 37.8117, lng: -122.4717, currbin: 1, depth: 30 },
        { id: 'SFB1201', name: 'Golden Gate Bridge', lat: 37.8117, lng: -122.4717, currbin: 2, depth: 10 },
        { id: 'SFB1203', name: 'Alcatraz N', lat: 37.83, lng: -122.42, currbin: 1, depth: 15 }] });
    }
    if (opts.noaaErr) return json(r, { error: { message: 'No data was found' } });
    const p = u.searchParams, b = ymdToMs(p.get('begin_date')), e = ymdToMs(p.get('end_date')) + 864e5;
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

  await ctx.route('https://api.weather.gov/**', r => {
    const u = r.request().url();
    if (u.includes('/points/')) return json(r, { properties: { forecastGridData: 'https://api.weather.gov/gridpoints/MTR/85,105' } });
    const start = Date.now() - 2*864e5, values = [];
    for (let i = 0; i < 40; i++) values.push({ validTime: new Date(start + i*3*36e5).toISOString().replace('.000', '') + '/PT3H', value: i % 5 === 0 ? 30 : 0 });
    json(r, { properties: { probabilityOfThunder: { values } } });
  });
}
module.exports = { install };
