# Hybrid Bootstrap Gold Lake

This build gets GridWild deployable before the slower iNaturalist API/export
harvest exists.

## Source Policy

The bootstrap occurrence stage combines:

- GBIF iNaturalist research-grade rows from the local silver lake.
- AWS iNaturalist Licensed Observation Images rows for `needs_id` and `casual`.

The AWS default intentionally excludes `research` rows because the local GBIF
silver lake is already the research-grade iNaturalist backbone. This avoids most
double-counting while still adding non-research gameplay heat where AWS has open
media coverage.

The generated stage keeps identity fields for the later canonical iNaturalist
API/export layer:

```text
canonical_observation_key
inat_observation_id
inat_observation_uuid
source_seen_gbif
source_seen_aws
source_seen_inat_api
source_priority
```

Without a UUID-to-iNat-ID crosswalk, GBIF rows use `inat:<id>` and AWS rows use
`inat_uuid:<uuid>`. Future API/export rows should populate the numeric iNat ID
and supersede both.

## Build

Check inputs:

```powershell
npm.cmd run build:hybrid-occurrence-stage -- --check-inputs
```

Build the occurrence stage:

```powershell
npm.cmd run build:hybrid-occurrence-stage -- --region dc_va --season-id gridwild_2026_summer --overwrite --threads 4
```

Then feed the printed `gold_served_taxonomy` command into the existing Gold
builder. The default product is:

```text
C:\Users\ad1470\Desktop\gridwild\world\gold\dc_va_hybrid_served_v002
```

Generate the practical coarse pyramid first:

```powershell
npm.cmd run build:coarse-pyramid -- --product dc_va_hybrid_served_v002 --levels 16,32,64,128 --source-asset-dir "C:\Users\ad1470\Desktop\gridwild\world\gold\dc_va_hybrid_served_v002" --stage-dir "C:\Users\ad1470\Desktop\gridwild\world\gold_stage\dc_va_hybrid_served_v002" --threads 4
```

## x4 and x8

The x4 and x8 coarse levels are probably needed for good mid-zoom feel. They
should be deferred until we package coarse levels into PMTiles or another
larger-object format. In JSON tile form, x4/x8 create many small CDN objects.

## Later API/Export Gold

The full iNaturalist API/export build should arrive as a later source stage,
not as a blocker for the bootstrap deployment. It should run as a checkpointed
regional/time-window queue and produce a canonical source where
`canonical_observation_key = inat:<observation_id>`.
