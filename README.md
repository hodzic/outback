# Outback

Plan an out-and-back paddle or hike while you have a connection, then take it offline:
route, forecast, maps and your recorded tracks all live on the phone.

Formerly **Paddle**. Trips, settings and saved map tiles from Paddle carry over (same storage names).

## What it does

- **Activities**: *Paddle* (nautical miles, knots, NOAA chart) and *Hike* (miles, mph, USGS topo).
- **Water / terrain**: ocean, bay, slough/estuary, river, lake for paddling; trail or coast/beach for hiking.
  Auto-detected from the nearest NOAA tide station on *Get forecast*, or set it under ☰.
  - Tides: ocean, bay, slough, coast. Currents: ocean, bay, slough.
- **Forecast for the trip day**: tide and current curves, wind and gusts, pressure trend, lightning
  (NWS thunder probability, else estimated), sunrise/sunset. Times are in the trip location's time zone.
- **Hiking**: elevation profile along the route (Open-Meteo), total climb, and time estimates that add
  1 hour per 2000 ft of climb (Naismith).
- **Routes**: tap to draw, drag to move, leg distance/bearing (magnetic)/time, *Make it out-and-back*
  (adds return legs), *Reverse route*.
- **Go**: navigate waypoint to waypoint (distance, bearing, speed, finish time) and **record a GPS track**,
  saved with the trip. Go without a route just records. A track can become a route (*Use as route*).
  Tracks export in the GPX; timed GPX tracks import as tracks.
- **Live location**: ◎ shows and follows you; pan away to stop following, tap again to re-centre,
  tap while following to turn location off.
- **Offline maps** (from the GPS Map app):
  - *Get forecast* saves the map around your route automatically.
  - *Save the map area on screen*: name it, pick a detail level, see the tile estimate first.
  - *PDF trail maps*: import a park brochure PDF; it is placed from GeoPDF metadata or printed
    "GPS Coordinates" labels when present, then you drag 4 points (or the centre) to line it up.
    Opacity slider on the right. *Adjust* any time later.
  - *Copy from GPS Map*: GPS Map runs on the same origin (`hodzic.github.io`), so its saved areas and
    trail maps can be copied in with one tap.

Not for navigation. Check official forecasts and conditions before you set out.

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
