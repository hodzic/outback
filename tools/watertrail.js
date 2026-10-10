// Snapshot of the San Francisco Bay Area Water Trail launch sites ("trailheads") for the 🛶 layer.
// Source: the Water Trail's public WordPress API. Usage: node tools/watertrail.js [saved-api-pages.json]
// Keeps the practical fields (launch type, facilities, parking, restrooms, safety) and links back to each page.
const fs = require('fs'), path = require('path');
const API = 'https://sfbaywatertrail.org/wp-json/wp/v2/crb_trailhead?per_page=10&_fields=id,slug,link,title,acf,modified';
const clean = h => String(h || '').replace(/<\/p>\s*<p>/g, '\n').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')
  .replace(/&#8211;/g, '–').replace(/&#8217;/g, '’').replace(/&#8220;|&#8221;/g, '"').replace(/&nbsp;| /g, ' ').replace(/&amp;/g, '&').replace(/&#038;/g, '&')
  .replace(/[ \t]+/g, ' ').replace(/\n\s*/g, '\n').trim();
const sec = (acc, re) => clean((acc || []).filter(t => re.test(t.title)).map(t => t.content).join('\n'));
(async () => {
  let raw = [];
  if (process.argv[2]) raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  else for (let p = 1; ; p++){ const r = await fetch(`${API}&page=${p}`); if (!r.ok) break; const d = await r.json(); if (!d.length) break; raw.push(...d); }
  const sites = raw.filter(x => x.acf?.location?.lat).map(x => {
    const a = x.acf;
    return { id: 'wt-' + x.slug, name: clean(x.title.rendered), sub: clean(a.crb_subtitle), manager: clean(a.crb_manager), county: clean(a.county),
      lat: +(+a.location.lat).toFixed(6), lon: +(+a.location.lng).toFixed(6), about: clean(a.crb_excerpt), launch: clean(a.launch_type),
      facilities: clean(a.crb_facilities).replace(/;\s*$/, ''), boat: sec(a.crb_accordion, /^Boat Facilities$/), parking: sec(a.crb_accordion, /Parking/),
      restrooms: sec(a.crb_accordion, /^Restrooms$/), hours: sec(a.crb_accordion, /^Hours$/), safety: sec(a.crb_accordion, /^Safety Tips$/), link: x.link };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const out = { source: 'San Francisco Bay Area Water Trail', url: 'https://sfbaywatertrail.org/plan-your-trip/trailheads/', at: new Date().toISOString().slice(0, 10), sites };
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'watertrail.json'), JSON.stringify(out));
  console.log(`${sites.length} sites`);
})();
