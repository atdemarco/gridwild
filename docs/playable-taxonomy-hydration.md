# Playable Taxonomy Hydration

Playable taxonomy must be hydrated before GridWild expands Gold Lake storage.

The reason is practical: taxonomy policy changes what the builder stores. If the
Gold builder writes every genus and branch into every served 1024-cell
superchunk, the CDN layer gets large before the game has decided which biological
distinctions are actually playable.

## Current Status

GridWild already has a curated MVP in `js/gw-playable-taxonomy.js`:

- 18 seeded endpoint profiles.
- Beginner, developer, and expert endpoint ranks.
- Species modes such as `required`, `optional`, `bonus`, and `discouraged`.
- Playability score components: identifiability, observability,
  distinctiveness, local data support, and validation reliability.
- Alias lookup for groups such as birds, beetles, fungi, grasses, mosses, and
  lichens.

That browser module is the seed policy. It should become an override input to a
generated playable taxonomy artifact, not remain the only source of truth.

Current seed export artifacts live at:

```text
assets\playable_taxonomy\playable_taxonomy_manifest.json
assets\playable_taxonomy\playable_taxon_profiles.json
assets\playable_taxonomy\playable_taxon_rollup_rules.json
```

Regenerate them with:

```powershell
npm.cmd run export:playable-taxonomy
```

Hydrate the playable taxonomy with the local GBIF Backbone and the DuckDB binary
from the existing Desktop Gold Lake workspace:

```powershell
npm.cmd run hydrate:playable-taxonomy -- --check-inputs
npm.cmd run hydrate:playable-taxonomy
```

The hydrator defaults to:

```text
GBIF Backbone: C:\Users\ad1470\Downloads\backbone
DuckDB:        C:\Users\ad1470\Desktop\gridwild\world\duckdb.exe
Output:        assets\playable_taxonomy
```

Use explicit paths when the local machine changes:

```powershell
npm.cmd run hydrate:playable-taxonomy -- --gbif-dir C:\path\to\backbone --duckdb C:\path\to\duckdb.exe
```

By default, the hydrator reads the curated 18-profile seed from
`js\gw-playable-taxonomy.js`. Use `--profile-input` when a future curated
override JSON should become the seed policy instead:

```powershell
npm.cmd run hydrate:playable-taxonomy -- --profile-input taxonomy\curated_playable_profiles.json
```

Use `--out-dir` for a smoke-test artifact folder before replacing the GUI-loaded
artifact:

```powershell
npm.cmd run hydrate:playable-taxonomy -- --out-dir $env:TEMP\gridwild-playable-taxonomy-smoke
```

Generate expanded playable taxon candidates as a separate manual step:

```powershell
npm.cmd run generate:playable-taxa -- --check-inputs
npm.cmd run generate:playable-taxa
```

This walks descendants under the hydrated GBIF anchors and emits endpoint-rank
candidate taxa for each playable group. It can be slow because it scans the GBIF
Backbone and recursively expands clades, so run it intentionally outside Codex
when you are ready.

The generated candidates are currently an expanded taxonomy catalog, not a
fully individualized playability model. Each child taxon inherits its playable
group score as `beginnerPlayabilityScore`, while `individualPlayabilityScore`
stays `null` and `playabilityScoreBasis` is `inherited_playable_group`. A later
local-evidence pass should score children with observation count, occupied
square count, observer count, seasonality, validation reliability, and manual
identifiability overrides.

By default, generation also joins `VernacularName.tsv` and adds `commonName` and
`commonNames` to generated taxa when GBIF has vernacular names. Use
`--no-common-names` to skip that join.

Smoke-test a small slice first:

```powershell
npm.cmd run generate:playable-taxa -- --profiles birds --limit 100 --out-dir $env:TEMP\gridwild-playable-taxa-smoke
```

The full command writes:

```text
assets\playable_taxonomy\generated_playable_taxa_manifest.json
assets\playable_taxonomy\generated_playable_taxa.json
```

The Explorer reads the generated manifest when it exists and shows its generated
taxon count in the top stats strip. Until that file is generated, the GUI will
show `Generated taxa: Not built`.

Useful generation options:

- `--rank-mode beginner|developer|expert`: choose which endpoint rank to expand.
- `--profiles birds,mammals`: limit generation to specific playable groups.
- `--exclude-profiles trees,lichens`: skip broad or noisy groups during a run.
- `--limit 1000`: cap emitted rows for smoke tests.
- `--no-common-names`: skip the GBIF vernacular/common-name join.
- `--out-dir C:\path\to\folder`: write somewhere other than the GUI asset folder.

Score lower taxa with local or downloaded GBIF occurrence evidence as a later,
manual pass:

```powershell
npm.cmd run score:playable-taxa -- --check-inputs
npm.cmd run score:playable-taxa
```

The scorer defaults to the existing local silver lake when present:

```text
C:\Users\ad1470\Desktop\gridwild\world\parquet\occurrence_silver_v001
```

Use an explicit occurrence table when scoring another AOI or a fresh GBIF
download:

```powershell
npm.cmd run score:playable-taxa -- --occurrence C:\path\to\occurrence.txt
npm.cmd run score:playable-taxa -- --occurrence C:\path\to\silver_parquet_folder
```

Smoke-test a small group before running the whole catalog:

```powershell
npm.cmd run score:playable-taxa -- --profiles birds --limit 500 --out-dir $env:TEMP\gridwild-playable-score-smoke
```

This writes:

```text
assets\playable_taxonomy\scored_playable_taxa_manifest.json
assets\playable_taxonomy\scored_playable_taxa.json
```

The scoring model is `taxon_level_playability_heuristic_v001`. It uses the same
five conceptual components as the curated playable profiles, but computes them
per lower taxon:

- `identifiability`: profile prior plus common-name signal, rank fit, sibling
  crowding, validation reliability, species-mode policy, and broad-filter
  penalties.
- `observability`: profile prior plus occurrence support, occupied spatial bins,
  observer support, recency, and seasonality.
- `localDataSupport`: occurrence count, occupied cells, observer count, region
  count, recency, and month coverage.
- `validationReliability`: coordinate quality, issue flags, basis of record,
  observer/dataset support, recency, and seasonality.
- `distinctiveness`: profile prior plus common-name signal, rank fit, local
  sibling crowding, observer support, validation reliability, and species-mode
  policy.

It also emits a draft Gold Lake action per taxon:

- `keep`: suitable for beginner served chunks.
- `developer_only`: useful but not beginner-stable yet.
- `collapse`: retain evidence, but serve at genus, family, or playable-group
  level.
- `drop`: keep offline only unless another policy override restores it.

GBIF backbone taxonomy alone cannot score this. The scorer needs occurrence
evidence. Prefer a GBIF occurrence download or the existing local silver lake
over repeated iNaturalist API calls; iNaturalist-specific enrichment should be a
small cached later pass for ambiguous/high-value taxa.

## Principle

Use GBIF for canonical taxonomy. Use GridWild policy and local evidence for
playability.

GBIF backbone can answer:

- What is the accepted name?
- What rank is this?
- What synonyms point here?
- What parent lineage does this taxon belong to?
- What stable key should the builder use?

GBIF backbone cannot answer by itself:

- Is this group beginner-playable?
- Should beginners stop at family, genus, or species?
- Is this group locally common enough to support gameplay?
- Is this group visually/behaviorally distinct enough for a quest endpoint?
- Should rare or cryptic branches be collapsed before serving HUD chunks?

## Pipeline Position

Playable taxonomy sits between silver occurrence data and served Gold products:

```text
GBIF backbone + curated overrides + local silver stats
  -> playable taxonomy artifact
  -> Gold builder rollup rules
  -> biodiversity-fine served chunks
  -> biodiversity-coarse pyramids
```

This means the Gold builder should not write served `square_taxa` directly from
raw genus rows. It should first join each taxon row to a playable rollup rule.

## Inputs

The hydration step should consume:

- GBIF backbone taxonomy archive or an extracted canonical taxonomy table.
- Current curated profiles from `js/gw-playable-taxonomy.js` or an equivalent
  JSON override file.
- Local occurrence silver/gold stats from the DuckDB pipeline.
- Optional future evidence from iNaturalist validation behavior, field-guide
  curation, or manual GridWild review.

Minimum GBIF-derived fields:

- `taxon_key`
- `accepted_taxon_key`
- `scientific_name`
- `canonical_name`
- `rank`
- `taxonomic_status`
- `parent_key`
- `kingdom`, `phylum`, `class`, `order`, `family`, `genus`, `species`
- synonym keys mapped to accepted keys

Minimum local evidence fields:

- observation count
- occupied 20 ft square count
- observer count
- region count
- month distribution
- last observed date
- lineage-level counts at order, family, and genus

## Generated Artifacts

The hydration step should emit a versioned folder such as:

```text
taxonomy\playable_taxonomy_v001\
  playable_taxonomy_manifest.json
  playable_taxon_profiles.json
  playable_taxon_aliases.json
  playable_taxon_rollup_rules.json
  playable_taxon_lineage_index.json
  generated_playable_taxa_manifest.json
  generated_playable_taxa.json
  validation_report.json
```

### `playable_taxonomy_manifest.json`

Declares:

- `playable_taxonomy_version`
- GBIF backbone source/version/date
- local evidence build ID
- curated override source/version
- score weights
- generated artifact files
- validation summary

### `playable_taxon_profiles.json`

The generated successor to the 18 curated browser profiles. Each profile should
preserve the existing shape where possible:

- `taxonKey`
- `displayName`
- `broadParentGroup`
- `beginnerEndpointRank`
- `developerEndpointRank`
- `expertEndpointRank`
- `minimumConfidenceRank`
- `speciesMode`
- `metrics`
- `beginnerPlayabilityScore`
- `notesFlags`
- `source`
- `aliases`
- GBIF keys for canonical anchoring

### `playable_taxon_rollup_rules.json`

This is the builder-facing artifact. Each rule tells the Gold builder how to
store served taxonomy:

- `match_rank`
- `match_taxon_key`
- `accepted_taxon_key`
- `playable_group_key`
- `served_rank`
- `served_taxon_key`
- `served_display_name`
- `endpoint_rank`
- `species_mode`
- `prune_mode`: `keep`, `collapse`, `drop`, or `developer_only`
- `reason`

Examples:

- Birds may keep species-level endpoints when evidence supports them.
- Beetles may collapse many species/genus rows to family for beginner play.
- Lichens may collapse many rows to family or broad playable group.
- Very low-count cryptic branches may be kept offline but omitted from served
  HUD chunks.

## Builder Integration

The existing local Gold builder currently produces raw-ish `gw_gold_square_taxa`
inside `run_gold_pipeline.ps1`, then `package_gold_assets.cjs` writes those rows
into JSON superchunks.

The next version should insert a playable rollup step:

```text
gw_gold_obs
  -> gw_gold_square_taxa_raw
  -> join playable_taxon_rollup_rules
  -> gw_gold_square_taxa_served
  -> package served JSON/PMTiles/coarse products
```

Served square taxon records should include:

- raw lineage fields needed for explanation
- canonical GBIF key when available
- playable group key
- served rank
- served display name
- count
- month counts
- recency fields
- pruning/collapse reason when the served record differs from raw detail

The raw full-detail table can remain in the offline Gold Lake. The browser should
receive the served playable layer by default.

The current repo-owned adapter for this step is:

```powershell
npm.cmd run build:gold-served-taxonomy -- --check-inputs
npm.cmd run build:gold-served-taxonomy -- --threads 4
```

It consumes `scored_playable_taxa.json`, writes `served_taxonomy_policy.csv`,
joins that policy into the silver occurrence lake, and packages
`superchunk.v4.playable-served-gold` output. The important semantics are:

- `keep`: serve the exact taxon, including species for groups such as birds when
  the score says species-level play is appropriate.
- `developer_only`: serve exact detail only on the developer layer; collapse to a
  parent on the beginner layer.
- `collapse`: credit the observation to the configured broader rank.
- `drop`: keep the raw detail offline, but credit heatmap evidence to a served
  parent instead of deleting the signal.

The default DC+VA output is:

```text
C:\Users\ad1470\Desktop\gridwild\world\gold\dc_va_served_v001
```

World coverage should use an explicit world version so it cannot be confused
with the regional pilot:

```powershell
npm.cmd run build:gold-served-taxonomy -- --country all --states all --region world --label "World" --version served_world_v001 --threads 4
```

## Connection To Gold Lake Builder

The existing Gold builder inventory is in
[Gold Lake Builder Inventory](gold-lake-builder-inventory.md). That builder is
already good enough to prove the silver-to-gold path. Its next contract upgrade
is not "make bigger superchunks." Its next upgrade is:

1. Hydrate playable taxonomy.
2. Generate rollup rules.
3. Rebuild or adapt `dc_va_v001` so served chunks use those rules.
4. Measure file sizes again.
5. Only then decide whether 1024-cell JSON superchunks, PMTiles, or smaller tile
   families are the right served format.

## Acceptance Gates

Playable taxonomy is ready to feed Gold Lake when:

1. Curated 18 profiles can be exported or mirrored as override data.
2. GBIF canonical keys and accepted-name mappings are available to the builder.
3. Each served taxon row can explain its raw-to-playable rollup.
4. Every fallback/collapse/drop decision has a rule reason.
5. A pilot AOI can compare raw versus served payload sizes.
6. The product manifest records `playable_taxonomy_version`.
7. Existing HUD behavior can still load legacy unpruned superchunks when needed.

## First Implementation Step

Start with an adapter, not a full rewrite:

1. Export the current curated profiles to a JSON override artifact.
2. Generate local lineage counts from the existing DC+VA Gold stage CSVs.
3. Build a first `playable_taxon_rollup_rules.json` that covers the seeded 18
   groups and falls back to family/genus for unknown groups.
4. Run the packager twice for the pilot: raw-compatible and playable-served.
5. Compare largest chunk size, average chunk size, total payload, and visual HUD
   behavior.

This lets the current successful Gold builder become the test bench for playable
taxonomy instead of waiting for a perfect world-scale lake.
