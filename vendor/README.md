# Vendored Browser Assets

These files are checked in so GridWild can boot and render maps without relying
on public JavaScript CDNs during demos or production traffic.

- `leaflet/`: Leaflet 1.9.4 CSS, JavaScript, and default marker images from
  `https://unpkg.com/leaflet@1.9.4/dist/`.
- `protomaps-leaflet/`: Protomaps Leaflet browser bundle from
  `https://unpkg.com/protomaps-leaflet/dist/protomaps-leaflet.js`.
- `pmtiles/`: PMTiles 3.2.1, Mapbox Vector Tile 1.3.1, PBF 3.3.0,
  Point Geometry 0.1.0, and IEEE754 1.2.1 ESM bundles from jsDelivr.

The PMTiles support modules have local relative imports where the CDN bundle
originally referenced other jsDelivr package URLs. Refresh these files from
upstream as a deliberate maintenance task rather than editing the minified
bundles by hand.
