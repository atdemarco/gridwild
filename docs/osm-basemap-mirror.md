# OSM Basemap Mirror

This is the dependency-light path for getting roads, parks, labels, water, and
other OSM-derived context onto GridWild's own Cloudflare R2/CDN origin.

Use a Protomaps basemap PMTiles archive as the source, extract a broad
Mid-Atlantic cutout, then upload the resulting PMTiles archive with the
`pmtiles` CLI. This avoids hotlinking OpenStreetMap-operated raster tile
servers and avoids adding another Node uploader dependency.

References:

- Protomaps basemap downloads: https://docs.protomaps.com/basemaps/downloads
- Protomaps `pmtiles` CLI: https://docs.protomaps.com/pmtiles/cli
- Protomaps cloud storage notes: https://docs.protomaps.com/pmtiles/cloud-storage
- OpenStreetMap tile-use policy: https://operations.osmfoundation.org/policies/tiles/
- OpenStreetMap copyright and attribution: https://www.openstreetmap.org/copyright

## Region

The default region is `mid_atlantic_broad`.

```text
-83.8,35.6,-71.2,42.8
```

That intentionally over-covers the first production footprint: DC, Virginia,
Maryland, Delaware, Pennsylvania, New Jersey, West Virginia, the NYC/Long Island
edge, and nearby North Carolina/Ohio/New York context.

The default `--maxzoom` is `15`, matching the Protomaps planet archive's normal
z0-z15 basemap detail.

## Tools

Install the Protomaps `pmtiles` CLI as a single binary and make it available on
PATH, or set `PMTILES_BIN` to the binary path.

The script does not require `@aws-sdk/client-s3`. For R2 upload it maps the
existing GridWild-style R2 environment variables into the AWS variable names
that the `pmtiles` CLI/go-cloud uploader expects.

```powershell
$env:CLOUDFLARE_ACCOUNT_ID="YOUR_ACCOUNT_ID"
$env:R2_ACCESS_KEY_ID="YOUR_R2_ACCESS_KEY_ID"
$env:R2_SECRET_ACCESS_KEY="YOUR_R2_SECRET_ACCESS_KEY"
$env:GRIDWILD_R2_BUCKET="gridwild-assets"
$env:GRIDWILD_ASSET_PUBLIC_BASE="https://assets.gridwild.com"
```

You can also set a full bucket URL directly:

```powershell
$env:GRIDWILD_PMTILES_BUCKET_URL="s3://gridwild-assets?region=auto&endpoint=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com&use_path_style=true"
```

## Dry Run

Pick the current Protomaps PMTiles source URL from the Protomaps builds page or
use a local downloaded planet file. URLs may change, so keep the exact source in
your local notes or shell history rather than baking it into app code.

```powershell
$env:GRIDWILD_OSM_BASEMAP_SOURCE="https://SOURCE-PROTOMAPS-BUILD/planet.pmtiles"
npm.cmd run build:osm-basemap -- --dry-run
```

The dry run prints the exact extract command, PMTiles upload command, and a small
manifest upload command.

## Extract

```powershell
npm.cmd run build:osm-basemap -- --source "$env:GRIDWILD_OSM_BASEMAP_SOURCE"
```

By default, output goes outside the repo:

```text
C:\Users\<you>\Desktop\gridwild\osm\basemaps\mid_atlantic_broad\<build_id>\
```

The script writes:

- `<build_id>.pmtiles`
- `manifest.json`

The manifest records the source, bounding box, R2 keys, public URLs, PMTiles
header/metadata, attribution, and rerunnable commands.

## Upload

Upload the PMTiles archive through the `pmtiles` CLI:

```powershell
npm.cmd run build:osm-basemap -- --skip-extract --upload
```

This writes the archive to:

```text
osm/protomaps/mid_atlantic_broad/<build_id>/<build_id>.pmtiles
```

The public URL will be:

```text
https://assets.gridwild.com/osm/protomaps/mid_atlantic_broad/<build_id>/<build_id>.pmtiles
```

`pmtiles upload` is convenient for large PMTiles archives, but it may not set
long-lived object cache metadata. The PMTiles archive URL is build-versioned, so
it should be immutable-cacheable. If the response is missing `Cache-Control`,
upload or replace the PMTiles object with Wrangler:

```powershell
wrangler r2 object put gridwild-assets/osm/protomaps/mid_atlantic_broad/<build_id>/<build_id>.pmtiles --file C:\path\to\<build_id>.pmtiles --content-type application/vnd.pmtiles --cache-control "public, max-age=31536000, immutable"
```

Upload the tiny manifest with Wrangler or the R2 dashboard:

```powershell
wrangler r2 object put gridwild-assets/osm/protomaps/mid_atlantic_broad/<build_id>/manifest.json --file C:\path\to\manifest.json --content-type application/json --cache-control "public, max-age=31536000, immutable"
```

Verify the PMTiles archive is range-friendly and cacheable:

```powershell
curl.exe -I https://assets.gridwild.com/osm/protomaps/mid_atlantic_broad/<build_id>/<build_id>.pmtiles
curl.exe -I -H "Range: bytes=0-16383" https://assets.gridwild.com/osm/protomaps/mid_atlantic_broad/<build_id>/<build_id>.pmtiles
```

The full response should include `Accept-Ranges: bytes`, `Content-Length`, and
`Cache-Control: public, max-age=31536000, immutable`. The range response should
return `206 Partial Content` with `Content-Range`.

## Runtime Wiring

GridWild's main `street` basemap is wired to the hosted PMTiles archive through
the locally vendored `protomaps-leaflet` browser bundle:

```text
https://assets.gridwild.com/osm/protomaps/mid_atlantic_broad/<build_id>/<build_id>.pmtiles
```

Use the blank local fallback when debugging or when you want to prove the app is
not touching public raster tile servers:

```text
?gwBasemap=blank
```

Test another PMTiles archive without editing source:

```text
?gwBasemapUrl=https://assets.gridwild.com/path/to/other.pmtiles
```

Keep PMTiles archive URLs queryless. The R2/custom-domain path currently serves
byte ranges correctly for the plain object URL, but query-string variants can
fall back to a full-file `200 OK` response, which breaks Protomaps byte-range
loading.

If `protomaps-leaflet` is unavailable, GridWild now returns a blank local layer
instead of falling back to Carto, OpenTopoMap, or OpenStreetMap raster tiles.

## Runtime Dependencies

The static map runtime is self-hosted by the app:

- Leaflet CSS, JavaScript, and marker images are served from `vendor/leaflet/`.
- Protomaps Leaflet is served from `vendor/protomaps-leaflet/`.
- The heat PMTiles decoder modules are served from `vendor/pmtiles/`.
- Street, terrain, overview, location picker, campaign designer, playlist, and
  party recap maps use the R2-hosted PMTiles basemap or the blank local fallback.

This does not mirror live product APIs. iNaturalist, Nominatim, Overpass,
Open-Meteo, QR image generation, and outbound Google Maps links still need their
own proxy/cache/mirror strategy if the deployment must be fully independent of
third-party runtime services.

## OSM Service Switches

GridWild defaults to not calling public Overpass or Nominatim endpoints. The app
will still render the R2-hosted PMTiles basemap, use cached OSM context when it
exists, and accept typed coordinates in the location picker.

Temporarily allow public OSM APIs for local debugging:

```text
?gwPublicOsm=1
```

Point the browser at your own Overpass/Nominatim-compatible services:

```text
?gwOverpassUrl=https://osm.gridwild.com/api/interpreter
?gwNominatimSearchUrl=https://osm.gridwild.com/search
?gwNominatimReverseUrl=https://osm.gridwild.com/reverse
```

Or configure the same thing before `js/mapinit.js` loads:

```html
<script>
  window.GridWildExternalServices = {
    publicOsmApis: false,
    osm: {
      overpassUrl: "https://osm.gridwild.com/api/interpreter",
      nominatimSearchUrl: "https://osm.gridwild.com/search",
      nominatimReverseUrl: "https://osm.gridwild.com/reverse"
    }
  };
</script>
```
