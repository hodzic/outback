# Outback

Plan a paddle, hike or bike ride while you have a connection, then take it offline:
route, forecast, maps and imported tracks all live on the phone.

Formerly **Paddle**. Trips, settings and saved map tiles from Paddle carry over (same storage names).

## How it's laid out

Three views; swipe between them or use the tabs at the bottom.

1. **Trips**: *Share Outback* (sends the app's link), your trips (newest date first), *+ Paddle* / *+ Hike* / *+ Bike*, import a trip or GPX,
   backup and restore of everything in one file,
   settings (distance unit, speed and gust warning per activity; magnetic variation), install and offline help, and about.
2. **Trip**: everything about the selected trip:
   - name, date (with the weekday) and planned start time (tap it for hour, minute and AM/PM rollers; 9:00 by default; new trips take the last one set; the graph opens there and the waypoint table times from it), activity (Paddle / Hike / Bike), water or terrain (auto-detected, or pick one)
   - route: one line with length, duration, speed and legs; the waypoint table and the markers fold out below it. Draw, undo and clear the route on the map; while editing, long-press a leg to insert a waypoint on it, and Undo steps back through each edit.
   - forecast: first the whole day, which stays put as the time changes: low and high temperature (large, at the top) with daylight sky and rain, tide range with every high and low, and every max flood, max ebb and slack, one per line in time order, wind and gusts for morning and afternoon, pressure over daylight, the day's thunder chance, sun, elevation for hikes. At the bottom: the picked time with *Now*, a fixed-size box with everything at that time (tide, current, wind and gusts, temperature and sky, pressure, lightning), then the tide/wind graph with every high and low tide and every max flood and ebb labelled, and the strongest wind and gust in daylight (plus the night's when stronger); tap or drag it to pick a time. The Tide / Wind / Elevation buttons sit right under the graph; on the elevation graph, tap or drag for the elevation, distance and time from the start at that spot.
     *Get forecast* also saves the map around the route for offline use.
   - tracks from imported GPX files (show on map, use as route, delete), export GPX or trip file, delete trip
3. **Map**: the route, and a top bar with the map layer (Chart / Street / Topo), *Route* (edit the route), **PDF** map overlays
   and live location ◎ (with distance and magnetic bearing to the next waypoint).
   On the map a horizontal swipe pans the map; use the tabs or the trip name to leave it.

## What it does

- **Activities**: *Paddle* (NOAA chart, drawn from the current ENCs by the NOAA Chart Display Service), *Hike* (USGS topo) and *Bike* (street map). Each has its own
  distance unit (nautical miles, miles or kilometres), speed and gust warning in Settings; wind uses the same unit.
  Defaults: paddle 3 kt, hike 2.5 mph, bike 10 mph.
- **Water / terrain / surface**: ocean, bay, slough, river, lake for paddling; trail or coast for hiking;
  road, gravel or mountain bike for biking.
  Tides for ocean, bay, slough and coast; currents for ocean, bay and slough.
- **Tides and currents on the map** (≈ button, paddle trips on tidal water): every NOAA station in view (up to 40
  of each, zoom 9 or closer). Currents are arrows, blue flood / green ebb, labelled in knots; tides are labels in feet
  with ↑ rising / ↓ falling. A tap cycles tides and currents → currents → tides; a long press turns it off and the
  next tap comes back in the same mode. The trip's own stations are outlined; tap any station for details or to use
  it for the trip. A small tide and current graph under the map's summary line (following the button's mode) moves them through the day: drag it to pick a time. Predictions are kept on
  the phone per day, so stations you've looked at work offline.
- **Times** are in the trip location's time zone.
- **Hiking and biking**: elevation profile and total climb (Open-Meteo); time estimates add 1 hour per
  2000 ft of climb for hiking (Naismith) and per 3000 ft for biking.
- **Map view**: each trip opens at its saved view. *Get forecast* saves the current map view (or fits the
  trip if the map isn't showing it); nothing else changes it. ↩ on the map goes back to it.
- **Location ◎** never moves the map (zoom out if you're off screen). A tap cycles through:
  1. blue dot, plus the next waypoint (the end of the leg you're closest to) with distance and magnetic bearing,
     highlighted and joined to you by a dashed line;
  2. blue dot and large coordinates (decimal degrees and accuracy) for an emergency call; tap them to copy;
  3. blue dot only.

  Hold the button to turn location off; the next tap brings back the mode you had.
- **AIS ships** (button at the bottom right of the map): live vessels around the map view from
  [aisstream.io](https://aisstream.io) (free API key, stored only on the device; Settings, or the first tap).
  Ships are coloured by type (cargo green, tanker red, passenger blue, tug/pilot teal, high-speed orange)
  and sized by length, with a dashed 15-minute projected track (dots every 5 minutes). Tap one for name, type,
  size, speed, course, destination, distance from you and photo links (VesselFinder, MarineTraffic).
  With location on, a ship that will pass within 0.5 nm in the next 20 minutes turns the button red,
  vibrates and shows a warning. Needs a connection; not every boat sends AIS. Key `demo` shows made-up ships.
  Name, type and size (sent only every ~6 minutes) are remembered on the device, so known ships show them at once.
- **Names**: tap a waypoint to name it; names show on the map, in the waypoint table and in the next-waypoint line.
  **Markers** are named points saved with the trip (long-press the map, or *Marker* while editing the route);
  the Trip view lists them under the route. GPX export and import keep both (`<wpt>` for markers).
- **GPX import**: route points become the trip's route (simplified to at most 100 waypoints, keeping the shape
  within a few metres); a timed track is kept as a recorded track.
- **Overlay PDF maps** (from the GPS Map app): import a park brochure PDF; it is placed from GeoPDF metadata or
  printed "GPS Coordinates" labels when present, then you drag 4 points (or the centre) to line it up.
  **Auto-align** refines a rough placement from the water drawn on the map: it finds the map's light-blue water,
  gets OpenStreetMap water for the area (Overpass API; kept with the map, so re-aligning works offline) and fits a
  shift, turn and scale that lays one shoreline on the other (`align.js`, all on the phone). The OSM water shows as a
  dashed blue line, the toast gives the mismatch before and after, and *Undo align* puts the points back. It needs
  the map placed within a few hundred metres first; maps without water say so. *Help: overlay PDF maps* on the Trips tab
  (linked from the PDF list) explains placing and Auto-align.
  Opacity slider on the right. Overlay PDF maps saved in GPS Map (same origin) can be copied in.
  **Built-in maps** ship already placed (`maps/`, listed in `BUILTIN_MAPS`): *Add* in the PDF list copies one into the
  phone's maps, where it works like an imported one. Now: NPS Tomales Bay boat-in camping (public domain),
  Del Valle Regional Park (EBRPD, GeoPDF placement refined by Auto-align: shoreline median 8 m) and the
  Sacramento–San Joaquin Delta boating map (California Coastal Commission, 2005; placed from its GeoPDF data).
- **Help: Tomales Bay and San Francisco Bay** (Trips tab) links the official info: NPS boat-in camping, map and
  kayaking pages for Tomales Bay; the SF Bay Water Trail, its web map and conditions page, and the Dolphin Club's Bay guide.

**Not for navigation or safety decisions.** Forecasts, tides, currents, maps, elevation, ship positions and time
estimates come from free public services and simple calculations; they can be wrong, late, incomplete or missing,
and saved data goes out of date offline. Small boats, many hazards, and trail or road closures don't show at all.
Before any paddle, hike or ride, check official forecasts, warnings and local conditions, carry proper charts or maps,
a compass and the safety gear your trip needs, tell someone your plan, and turn back when in doubt.

## Installing on your phone

**Android (Chrome):** open https://hodzic.github.io/outback/ in Chrome, tap the ⋮ menu, then *Install app*
(or *Add to Home screen*), then *Install*.

**iPhone and iPad (Safari):** open https://hodzic.github.io/outback/ in Safari, tap the *Share* button
(square with an arrow), then *Add to Home Screen*, then *Add*.

Then open Outback from its home screen icon: it runs full screen and keeps its offline data.

## Backup

Trips, tracks, overlay PDF maps and settings are stored only in the browser on your phone. Clearing the browser's site data
(on Android, Chrome's *Clear browsing data → Cookies and site data*) or deleting the app erases them.
Outback asks the browser for persistent storage, so it isn't cleared automatically when space runs low,
but that doesn't stop a manual clear.

*Trips → Backup → Back up everything* saves one file with all of it; keep it in Files, iCloud Drive or Google Drive.
*Restore backup…* (or *Import trip or GPX…*) merges a backup back in: missing trips and overlay PDF maps are added,
and a trip that is newer in the backup replaces the older copy on the phone. On a phone with no trips, the backup's
settings come back too. If trips have changed and there has been no backup for 2 weeks, the Trips view reminds you.

## Using it offline

The app works offline once each trip has been prepared while you still have a connection.

**Works offline**

- **The app itself.** Once you have opened it online, it opens with no connection.
- **Your trips.** Routes, settings, recorded tracks and overlay PDF maps are stored on the phone.
- **The forecast you already fetched.** *Get forecast* saves tides, currents, wind, pressure, lightning and
  elevation with the trip. Offline you see that saved copy; it can't refresh, and the status line says when
  it was fetched.
- **GPS.** Your location on the map (◎) uses satellites, not data.
- **Map tiles:**
  - *Get forecast* saves the map around the route (a few miles beyond it), from region-wide down to fairly close zoom.
  - Areas you have already looked at while online are kept too.

**Needs a connection**

- Getting or refreshing a forecast, or changing tide stations.
- Map areas you haven't saved or viewed.
- Map layers you didn't save: *Get forecast* only saves the layer selected at the time (Chart, Street or Topo).
- Importing your first overlay PDF map, because the 10 MB PDF reader downloads on first use.
  Overlay PDF maps you have already imported show fine offline.

**Before you leave**

1. Open the trip, choose the map layer you'll use, then tap *Get forecast*.
   Wait until the status says the map was saved offline.
2. Open the Map view once and zoom in to the detail you'll want.
3. Add the app to your home screen. iPhones can clear saved data for websites that aren't installed and
   haven't been used for a while.

## Files

| File | |
|---|---|
| `index.html` | The whole app (Leaflet from cdnjs) |
| `pdfmap.js` | PDF trail map parsing, loaded only when importing a PDF |
| `vendor/` | MuPDF WebAssembly (AGPL, loaded on demand) and `Leaflet.ImageOverlay.Rotated` |
| `tools/bump.js` | Sets the next version (`npm run bump`) |
| `sw.js` | Service worker: app shell and map tiles for offline use |
| `manifest.webmanifest`, `icon-*.png` | Installable app |

## Deploying

GitHub Pages from the repo root: https://hodzic.github.io/outback/ (the repo was renamed from `paddle`).
Trips made at the old /paddle/ address still load, because storage is per origin.

## Versions

The version (shown next to *About*) is the release date in US Pacific time plus a letter for each release
that day: `2026-10-05a`, `2026-10-05b`, then `2026-10-06a`. Before each release run `npm run bump`; it
updates `APP_VERSION` in `index.html` and the service worker cache name in `sw.js`, which makes installed
copies pick up the update.

## Tests

End-to-end tests drive the app in headless Chromium with every external service mocked
(NOAA, Open-Meteo, NWS, map tiles, cdnjs), so they run offline and give the same result every time.

```sh
npm install
npm test                       # all suites
node tests/run-all.js edge     # only suites whose file name contains "edge"
```

Screenshots and generated fixtures land in `tests/out/` (git-ignored).
