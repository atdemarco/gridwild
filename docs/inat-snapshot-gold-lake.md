# iNaturalist Snapshot Gold Lake

GridWild vNext uses the iNaturalist Open Data monthly snapshot as the native
occurrence backbone for Gold Lake evidence.

The first implementation keeps the existing Gold builder contract intact:

```text
iNaturalist observations/taxa/observers
  -> scripts/build-inat-snapshot-stage.js
  -> occurrence.parquet
  -> scripts/build-gold-served-taxonomy.js
  -> served Gold Lake
  -> scripts/build-coarse-pyramid.js
```

## Source Policy

- Include `research`, `needs_id`, and `casual` observations in the main heat
  layer with equal gameplay weight.
- Require `positional_accuracy <= 30` meters for fine 20 ft heat.
- Coarse pyramid levels are pooled from accepted fine observations only.
- Use `inat:<taxon_id>` as the native taxon key.
- Preserve `quality_grade` in the staged occurrence Parquet so future filters can
  distinguish research-grade, needs-ID, and casual evidence.
- The AWS observations snapshot does not expose captive/cultivated status. The
  stage records reserve `captive_cultivated` as `null` and mark the status source
  as unavailable for a future enrichment pass.
- The AWS observations snapshot does not expose a geoprivacy field. The stage
  uses the public coordinates and the <=30 m positional-accuracy filter.

## Build DC/VA iNat Stage

This streams the public AWS snapshot unless `--snapshot-dir` points at local
copies of `observations.csv.gz`, `taxa.csv.gz`, and `observers.csv.gz`.

```powershell
npm.cmd run build:inat-snapshot-stage -- --region dc_va --snapshot-id inat_2026_05 --season-id gridwild_2026_summer --threads 4 --overwrite
```

The default named `dc_va` region resolves to `dc_va_inat` and a DC/VA bounding
box. For future coverage, pass a custom bbox:

```powershell
npm.cmd run build:inat-snapshot-stage -- --region mid_atlantic_inat --label "Mid-Atlantic iNaturalist Snapshot" --bbox -84,35,-73,42 --snapshot-id inat_2026_05 --season-id gridwild_2026_summer --threads 4 --overwrite
```

Outputs are written by default under:

```text
C:\Users\ad1470\Desktop\gridwild\world\parquet\inat_snapshot_v001\<region>\occurrence.parquet
```

## Build Served Gold From The iNat Stage

The stage manifest prints the exact next command. For the default DC/VA stage it
will look like:

```powershell
npm.cmd run build:gold-served-taxonomy -- --occurrence-input "C:\Users\ad1470\Desktop\gridwild\world\parquet\inat_snapshot_v001\dc_va_inat\occurrence.parquet" --region dc_va_inat --label "District of Columbia + Virginia iNaturalist Snapshot" --version served_v001 --country all --states all --threads 4
```

Use `--country all --states all` because geography was already enforced by the
iNat stage bbox.

Then build the coarse pyramid and publish/stage as usual.

For the iNat-backed DC/VA build, skip `bin_size=2` in the coarse pyramid. The
level is extremely dense after adding casual and needs-ID observations, and the
HUD can use fine heat or the first precomputed level at `4`.

```powershell
$buildId = "gridwild_gold_dc_va_inat_served_v001_coarse_v001_$(Get-Date -Format yyyyMMdd_HHmmss)"
npm.cmd run build:coarse-pyramid -- --product dc_va_inat_served_v001 --levels 16,32,64,128 --source-asset-dir "C:\Users\ad1470\Desktop\gridwild\world\gold\dc_va_inat_served_v001" --stage-dir "C:\Users\ad1470\Desktop\gridwild\world\gold_stage\dc_va_inat_served_v001" --build-id $buildId --threads 4
```

## Smoke Test

Validate arguments without touching the large snapshot:

```powershell
npm.cmd run build:inat-snapshot-stage -- --check-inputs --region dc_va
```

For a small live run, add a limit. This still needs to scan the snapshot until
the filtered rows are found, so it is not a pure constant-time sample:

```powershell
npm.cmd run build:inat-snapshot-stage -- --region dc_va --limit 5000 --snapshot-id inat_2026_05 --season-id gridwild_2026_summer --overwrite
```
