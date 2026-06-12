# Gold Lake Builder Inventory

This records the existing local Gold Lake pilot so it can contribute to the
GridWild map-data migration instead of remaining mystery scratchwork.

## Local Location

The current local pipeline lives outside this repo at:

```text
C:\Users\ad1470\Desktop\gridwild\world
```

The doubled path:

```text
C:\Users\ad1470\Desktop\gridwild\worldC:\Users\ad1470\Desktop\gridwild\world
```

was not found as a real directory. `C:\Users\ad1470\Desktop\gridwild\world`
exists; the doubled string is most likely a pasted/concatenated path from a
command, prompt, or config value.

## Existing Pipeline Pieces

The `world` folder already contains the core of an automatic Gold Lake builder:

- `duckdb.exe`
- `gbif-observations-dwca.zip`
- `parquet\occurrence_silver_v001\...`
- `run_build_silver.bat`
- `run_validate_silver.bat`
- `run_gold_pipeline.ps1`
- `run_gold_pipeline.bat`
- `gold_locations.json`
- `scripts\build_occurrence_silver.sql`
- `scripts\validate_occurrence_silver.sql`
- `scripts\build_gold_stage_dc_va.sql`
- `scripts\package_gold_assets.cjs`
- `scripts\setup_pmtiles_tools.ps1`

The shape is good: raw occurrence data becomes a DuckDB/Parquet silver lake, then
a region-scoped gold output.

## Existing Gold Output

The current pilot output is:

```text
C:\Users\ad1470\Desktop\gridwild\world\gold\dc_va_v001
```

It contains:

- `manifest.json`
- `dc_heat.csv`
- `observer_dictionary.json`
- `squares_genus_summary.json`
- `square_genera_superchunks\super_*.json`
- `validation_report.json`
- empty `pmtiles\` directory

Observed validation summary:

- Region: `dc_va`
- Label: District of Columbia + Virginia
- Build ID: `gridwild_gold_dc_va_v001_20260523_224241`
- Grid size: 20 ft
- Superchunk size: 1024 fine cells
- Retained region observations: 904,186
- Observations with genus/date: 903,882
- Occupied 20 ft squares: 656,048
- Square taxon records: 843,797
- Superchunks: 4,071
- Observers: 39,687
- PMTiles status: `tool_missing`

The generated JSON superchunks are much larger than the current local 32-cell
superchunks:

- 4,071 JSON superchunks
- About 613 MB uncompressed total
- About 154 KB average per superchunk
- Largest observed superchunk about 15 MB

This is a successful pilot build, but not yet a shippable data product.

## Playable Taxonomy Connection

The next builder upgrade should hydrate playable taxonomy before expanding
storage. See [Playable Taxonomy Hydration](playable-taxonomy-hydration.md).

The current Gold builder writes `gw_gold_square_taxa` from raw lineage rows and
then packages those rows directly into served JSON superchunks. The promoted
builder should insert a playable rollup step:

```text
gw_gold_obs
  -> gw_gold_square_taxa_raw
  -> playable taxonomy rollup rules
  -> gw_gold_square_taxa_served
  -> JSON/PMTiles/coarse products
```

That gives 1024-cell superchunks a fighting chance: obscure, low-count, or
cryptic branches can be collapsed or kept offline before they become CDN payload.

## Repo-Owned Served Gold Builder

The first repo-owned builder adapter is:

```text
scripts\build-gold-served-taxonomy.js
```

Run it through npm:

```powershell
npm.cmd run build:gold-served-taxonomy -- --check-inputs
```

By default it reads:

```text
C:\Users\ad1470\Desktop\gridwild\world\parquet\occurrence_silver_v001
assets\playable_taxonomy\scored_playable_taxa.json
```

and writes a playable-served DC+VA product to:

```text
C:\Users\ad1470\Desktop\gridwild\world\gold\dc_va_served_v001
```

The served builder joins scored playable taxonomy into the silver occurrence
lake before square aggregation. That means birds and other strong species-level
groups can stay species-level, while obscure or cryptic rows still contribute
heatmap credit through a broader served parent.

Use a smoke run before a full regional build:

```powershell
npm.cmd run build:gold-served-taxonomy -- --max-observations 5000 --stage-dir $env:TEMP\gridwild-gold-served-stage-smoke --out-dir $env:TEMP\gridwild-gold-served-output-smoke --version served_smoke --threads 4
```

Then run the default DC+VA build intentionally outside Codex:

```powershell
npm.cmd run build:gold-served-taxonomy -- --threads 4
```

For a future world-scale build, use explicit broad selectors and a separate
output version. This can be much slower and larger than the regional build:

```powershell
npm.cmd run build:gold-served-taxonomy -- --country all --states all --region world --label "World" --version served_world_v001 --threads 4
```

The output manifest uses `superchunk.v4.playable-served-gold` and records the
scored taxonomy version, source occurrence path, policy semantics, JSON
superchunk sizes, and validation checks.

## Coarse Summary Pyramid

After a served Gold build exists, generate precomputed coarse heat layers from
the Gold stage CSVs:

```powershell
npm.cmd run build:coarse-pyramid -- --check-inputs
$buildId = "gridwild_gold_dc_va_served_v001_coarse_v001_$(Get-Date -Format yyyyMMdd_HHmmss)"
npm.cmd run build:coarse-pyramid -- --build-id $buildId
```

The default input/output pair is:

```text
Stage: C:\Users\ad1470\Desktop\gridwild\world\gold_stage\dc_va_served_v001
Gold:  C:\Users\ad1470\Desktop\gridwild\world\gold\dc_va_served_v001
```

The builder writes:

```text
coarse_pyramid\manifest.json
coarse_pyramid\summary.csv
coarse_pyramid\bin_2\tile_*.json
coarse_pyramid\bin_4\tile_*.json
coarse_pyramid\bin_6\tile_*.json
coarse_pyramid\bin_8\tile_*.json
coarse_pyramid\bin_10\tile_*.json
coarse_pyramid\bin_16\tile_*.json
coarse_pyramid\bin_32\tile_*.json
coarse_pyramid\bin_64\tile_*.json
```

Each coarse cell stores lens-ready display metrics plus richer summaries:

- observation totals and occupied fine-square coverage
- unique served taxa and top served taxa
- top observers from per-square top-observer rows
- monthly activity totals
- iconic/lifeform counts
- served-rank, policy-action, and playable-group counts
- latest and median recent-observation dates

Smoke-test a slice before a full build:

```powershell
npm.cmd run build:coarse-pyramid -- --levels 8,32 --limit-squares 5000 --tile-bins 16 --top-taxa 8 --top-observers 6 --asset-dir $env:TEMP\gridwild-coarse-pyramid-smoke --source-asset-dir C:\Users\ad1470\Desktop\gridwild\world\gold\dc_va_served_v001
```

The full build updates the Gold `manifest.json` with
`coarse_pyramid_manifest_file`, `coarse_pyramid_summary_file`, and a
`biodiversity-coarse` product entry. Republish the asset folder after generating
the pyramid so the app can discover it from the CDN manifest. Use a fresh
`--build-id` for the coarse-enabled product because CDN object paths are cached
as immutable under `builds/<build_id>/`.

## What It Proves

The existing builder already proves several important migration pieces:

1. The local machine can build a silver occurrence lake without MATLAB.
2. DuckDB can aggregate DC+VA into GridWild 20 ft cells.
3. The builder can emit the current HUD-compatible JSON assets.
4. The builder can emit a manifest and validation report.
5. The builder already has region configuration via `gold_locations.json`.
6. The PMTiles path is designed, but currently blocked by missing `tippecanoe`.

## Promotion Blockers

Before this becomes canonical, it needs to satisfy the
[GridWild Data Product Contract](grid-data-product-contract.md):

1. Keep the repo-owned served builder aligned with the external silver lake.
2. Keep raw archives, Parquet lakes, generated gold outputs, and PMTiles out of
   git.
3. Convert the manifest from `superchunk.v3.gold-pilot` into a product manifest
   with `biodiversity-fine`, `biodiversity-coarse`, and future `osm-context`
   entries.
4. Add source metadata: dataset name, archive date/version, region filter, and
   taxonomy policy.
5. Add product size measurements to the manifest or validation report.
6. Fix UTF-8 BOM handling in generated JSON validation/report files.
7. Hydrate playable taxonomy and use builder rollup rules before publishing
   broader 1024-cell superchunks.
8. Decide whether 1024-cell JSON superchunks are acceptable after playable
   pruning and compression.
9. Generate precomputed coarse pyramids from the same fine build.
10. Make PMTiles optional-but-validated: `created`, `skipped`, `tool_missing`, or
    `failed` must be explicit.
11. Add a small reproducible AOI build that can run quickly as a smoke test.

## Next Migration Step

Promote the builder in three small steps:

1. Rebuild the DC+VA pilot with `build:gold-served-taxonomy` and compare served
   payload size against `dc_va_v001`.
2. Add precomputed coarse products from the served square/taxon/observer stage
   summaries.
3. Publish the served output folder to the CDN as the first Gold Lake migration
   candidate.

That lets GridWild move toward CDN/world coverage while keeping raw detail in the
offline lake and making the served layer reversible.
