# Outback

Plan an out-and-back paddle or hike while you have a connection, then take it offline:
route, forecast, maps and your recorded tracks all live on the phone.

Formerly **Paddle**. Trips, settings and saved map tiles from Paddle carry over (same storage names).

## How it's laid out

Three views; swipe between them or use the tabs at the bottom.

1. **Trips**: your trips (newest date first), *+ Paddle* / *+ Hike* / *+ Bike*, import a trip or GPX,
   settings (distance unit, speed and gust warning per activity; magnetic variation), offline help and about.
2. **Trip**: everything about the selected trip:
   - name, date (with the weekday), activity (Paddle / Hike / Bike), water or terrain (auto-detected, or pick one)
   - route: length, duration, speed, waypoint table, *Edit route on map*, *Clear waypoints*
   - forecast for the day: low and high temperature (large, at the top), tide/wind graph (tap or drag it to pick a time; *Now* jumps to now), wind, pressure, lightning, sun, elevation for hikes.
     *Get forecast* also saves the map around the route for offline use.
   - recorded tracks (show on map, use as route, delete), export GPX or trip file, delete trip
3. **Map**: the route, *Draw*, *Go* (navigate and record a track), live location ◎,
   map layer (Chart / Street / Topo) and **PDF** map overlays.
   On the map a horizontal swipe pans the map; use the tabs or the trip name to leave it.

## What it does

- **Activities**: *Paddle* (NOAA chart), *Hike* (USGS topo) and *Bike* (street map). Each has its own
  distance unit (nautical miles, miles or kilometres), speed and gust warning in Settings; wind uses the same unit.
  Defaults: paddle 3 kt, hike 2.5 mph, bike 10 mph.
- **Water / terrain / surface**: ocean, bay, slough, river, lake for paddling; trail or coast for hiking;
  road, gravel or mountain bike for biking.
  Tides for ocean, bay, slough and coast; currents for ocean, bay and slough.
- **Times** are in the trip location's time zone.
- **Hiking and biking**: elevation profile and total climb (Open-Meteo); time estimates add 1 hour per
  2000 ft of climb for hiking (Naismith) and per 3000 ft for biking.
- **Go** navigates waypoint to waypoint (distance, bearing, speed, finish time) and records a GPS track,
  saved with the trip. Go without a route just records.
- **PDF maps** (from the GPS Map app): import a park brochure PDF; it is placed from GeoPDF metadata or
  printed "GPS Coordinates" labels when present, then you drag 4 points (or the centre) to line it up.
  Opacity slider on the right. PDF maps saved in GPS Map (same origin) can be copied in.

Not for navigation. Check official forecasts and conditions before you set out.

## Using it offline

The app works offline once each trip has been prepared while you still have a connection.

**Works offline**

- **The app itself.** Once you have opened it online, it opens with no connection.
- **Your trips.** Routes, settings, recorded tracks and PDF maps are stored on the phone.
- **The forecast you already fetched.** *Get forecast* saves tides, currents, wind, pressure, lightning and
  elevation with the trip. Offline you see that saved copy; it can't refresh, and the status line says when
  it was fetched.
- **GPS.** Your location, *Go* and track recording use satellites, not data. Keep the screen on while recording.
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
| `sw.js` | Service worker: app shell and map tiles for offline use |
| `manifest.webmanifest`, `icon-*.png` | Installable app |

## Deploying

GitHub Pages from the repo root. If the repo is renamed (for example to `outback`), the URL becomes
`https://hodzic.github.io/outback/` and existing data still loads, because storage is per origin.

## Tests

End-to-end tests drive the app in headless Chromium with every external service mocked
(NOAA, Open-Meteo, NWS, map tiles, cdnjs), so they run offline and give the same result every time.

```sh
npm install
npm test                       # all suites
node tests/run-all.js edge     # only suites whose file name contains "edge"
```

Screenshots and generated fixtures land in `tests/out/` (git-ignored).
