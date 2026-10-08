# Outback

Plan an out-and-back paddle or hike while you have a connection, then take it offline:
route, forecast, maps and imported tracks all live on the phone.

Formerly **Paddle**. Trips, settings and saved map tiles from Paddle carry over (same storage names).

## How it's laid out

Three views; swipe between them or use the tabs at the bottom.

1. **Trips**: *Share Outback* (sends the app's link), your trips (newest date first), *+ Paddle* / *+ Hike* / *+ Bike*, import a trip or GPX,
   settings (distance unit, speed and gust warning per activity; magnetic variation), install and offline help, and about.
2. **Trip**: everything about the selected trip:
   - name, date (with the weekday), activity (Paddle / Hike / Bike), water or terrain (auto-detected, or pick one)
   - route: length, duration, speed, waypoint table, *Edit route on map*, *Clear waypoints*
   - forecast for the day: low and high temperature (large, at the top), tide/wind graph (tap or drag it to pick a time; *Now* jumps to now), wind, pressure, lightning, sun, elevation for hikes.
     *Get forecast* also saves the map around the route for offline use.
   - tracks from imported GPX files (show on map, use as route, delete), export GPX or trip file, delete trip
3. **Map**: the route, and a top bar with the map layer (Chart / Street / Topo), *Route* (edit the route), **PDF** map overlays
   and live location ◎ (with distance and magnetic bearing to the next waypoint).
   On the map a horizontal swipe pans the map; use the tabs or the trip name to leave it.

## What it does

- **Activities**: *Paddle* (NOAA chart), *Hike* (USGS topo) and *Bike* (street map). Each has its own
  distance unit (nautical miles, miles or kilometres), speed and gust warning in Settings; wind uses the same unit.
  Defaults: paddle 3 kt, hike 2.5 mph, bike 10 mph.
- **Water / terrain / surface**: ocean, bay, slough, river, lake for paddling; trail or coast for hiking;
  road, gravel or mountain bike for biking.
  Tides for ocean, bay, slough and coast; currents for ocean, bay and slough.
- **Currents on the map** (≈ button, paddle trips on tidal water): an arrow at every NOAA current station in
  view (up to 40, zoom 9 or closer), blue for flood, green for ebb, labelled in knots; tap one for details or to use
  it for the trip. A time slider on the map moves them through the day. Predictions are kept on the phone per day,
  so stations you've looked at work offline.
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
  the Trip view lists them. GPX export and import keep both (`<wpt>` for markers).
- **GPX import**: route points become the trip's route (simplified to at most 100 waypoints, keeping the shape
  within a few metres); a timed track is kept as a recorded track.
- **PDF maps** (from the GPS Map app): import a park brochure PDF; it is placed from GeoPDF metadata or
  printed "GPS Coordinates" labels when present, then you drag 4 points (or the centre) to line it up.
  Opacity slider on the right. PDF maps saved in GPS Map (same origin) can be copied in.

Not for navigation. Check official forecasts and conditions before you set out.

## Installing on your phone

**Android (Chrome):** open https://hodzic.github.io/outback/ in Chrome, tap the ⋮ menu, then *Install app*
(or *Add to Home screen*), then *Install*.

**iPhone and iPad (Safari):** open https://hodzic.github.io/outback/ in Safari, tap the *Share* button
(square with an arrow), then *Add to Home Screen*, then *Add*.

Then open Outback from its home screen icon: it runs full screen and keeps its offline data.

## Using it offline

The app works offline once each trip has been prepared while you still have a connection.

**Works offline**

- **The app itself.** Once you have opened it online, it opens with no connection.
- **Your trips.** Routes, settings, recorded tracks and PDF maps are stored on the phone.
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
- Importing your first PDF map, because the 10 MB PDF reader downloads on first use.
  PDF maps you have already imported show fine offline.

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
