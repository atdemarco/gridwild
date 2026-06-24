# Coarse PMTiles Build Path

This is the canonical GridWild coarse heat build path after the DC + VA hybrid
PMTiles migration.

## Product Contract

- Fine PMTiles carry the 20 ft heat/detail layer.
- Coarse PMTiles carry summary heat at `x4,x8,x16,x32,x64,x128`.
- Coarse PMTiles are built at `maximum-zoom=16`; higher map zooms may overzoom
  the transport tiles, but the data stays coarse.
- The JSON coarse pyramid is local validation/debug output only. It should not
  be uploaded as the production coarse product.

## Build

```powershell
$assetDir = "C:\Users\ad1470\Desktop\gridwild\world\gold\dc_va_hybrid_served_v002"
$stageDir = "C:\Users\ad1470\Desktop\gridwild\world\gold_stage\dc_va_hybrid_served_v002"

npm.cmd run build:coarse-pmtiles -- --asset-dir "$assetDir" --stage-dir "$stageDir" --levels 4,8,16,32,64,128 --shard-cell-span 8192 --maximum-zoom 16 --jobs 3 --tippecanoe-threads 3
```

Then run the generated Tippecanoe script:

```powershell
powershell -ExecutionPolicy Bypass -File "$assetDir\coarse_pmtiles\build-coarse-shard-pmtiles.ps1"
```

Refresh PMTiles byte counts in the shard manifest and main manifest:

```powershell
npm.cmd run build:coarse-pmtiles -- --asset-dir "$assetDir" --refresh-sizes
```

## Publish

```powershell
npm.cmd run publish:grid-assets -- --asset-dir "$assetDir" --dry-run
npm.cmd run publish:grid-assets -- --asset-dir "$assetDir" --no-promote
```

Test with a cache-busted direct build URL, then promote:

```powershell
npm.cmd run publish:grid-assets -- --asset-dir "$assetDir" --promote-only
```

## Live Check

```js
(() => {
  const s = window.getGridWildHeatDataStats();
  return {
    levels: s.coarsePMTiles?.levels,
    coarsePMTiles: s.coarsePMTiles?.lastRender,
    oldJsonCoarse: s.coarse?.lastRender
  };
})()
```

Expected:

```js
{
  levels: [4, 8, 16, 32, 64, 128],
  coarsePMTiles: { status: "painted" },
  oldJsonCoarse: null
}
```

## Why Not JSON To PMTiles?

The JSON pyramid remains useful for validation, but it is not the production
intermediate. The production path streams Gold stage CSV summaries directly to
GeoJSONSeq shards, then Tippecanoe builds PMTiles. This avoids writing and
parsing hundreds of thousands of JSON tile files before tiling.

## Why Maxzoom 16?

Coarse cells are not 20 ft cells. Asking Tippecanoe to encode coarse x4+ data at
z19 makes the coarse product pretend to be finer than it is, increasing build
time and file size without adding biological resolution. Fine PMTiles own the
20 ft layer.
