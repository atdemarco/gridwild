# GridWild Data Product Contract

This is the pre-migration commitment for GridWild map data. Before the Gold Lake,
coarse heat, OSM hosting, or playable taxonomy migrations grow larger, every
artifact must fit this contract.

The existing local Gold Lake pilot is inventoried in
[Gold Lake Builder Inventory](gold-lake-builder-inventory.md).

The rule is simple:

> The HUD consumes versioned data products, not whatever shape the latest builder
> happened to emit.

If a change cannot say which product it belongs to, which manifest field proves it
exists, how the browser falls back when it is missing, and how to roll it back,
the change is not ready to become the canonical map-data path.

## Products

GridWild map data is three product families:

1. `biodiversity-fine`
   The playable 20 ft cell layer. This is the close-range source of truth for
   heat, cell evidence, local taxonomy, seasons, observers, and niche hydration.

2. `biodiversity-coarse`
   Precomputed zoom-out pyramids. This replaces expensive browser-side binning
   for high-coverage views. It may aggregate, prune, and simplify, but it must
   declare which fine build it came from.

3. `osm-context`
   Hosted OSM-derived context for gameplay. This is filtered map context, not a
   raw full OSM clone at first: paths, roads, buildings, water, parks, landuse,
   named places, and any derived priors GridWild actually uses.

These products may be stored as JSON, PMTiles, vector tiles, CSV, or another
format, but the browser should discover them through one manifest contract.

## Manifest

Every published build needs a manifest with these top-level fields:

```json
{
  "schema_version": "gridwild-map-products-v1",
  "build_id": "2026-06-10-gold-lake-va-aoi",
  "generated_at": "2026-06-10T00:00:00Z",
  "generator": {
    "name": "gridwild-gold-lake-builder",
    "version": "0.1.0",
    "runtime": "windows|wsl|docker|ci"
  },
  "coverage": {
    "label": "Gold Lake VA pilot",
    "bbox_wgs84": [-78.0, 37.0, -77.0, 38.0],
    "grid_size_ft": 20,
    "crs": "EPSG:3857"
  },
  "sources": {
    "biodiversity": [],
    "taxonomy": [],
    "osm": []
  },
  "taxonomy_policy": {
    "playable_taxonomy_version": "playable-taxonomy-v1",
    "canonical_backbone": "GBIF backbone",
    "served_resolution": "playable",
    "raw_resolution_retained_offline": true
  },
  "products": {},
  "fallbacks": {},
  "quality_gates": {}
}
```

The exact storage paths can evolve, but the meaning of these sections should not.

## Product Entries

Each product entry must declare:

- `product_type`: one of `biodiversity-fine`, `biodiversity-coarse`, or
  `osm-context`.
- `format`: for example `json-superchunks`, `pmtiles`, `mvt`, `csv`, or
  `parquet-offline`.
- `schema_version`: product-local schema, separate from the manifest schema.
- `asset_base` or `files`: CDN paths under the build root.
- `coverage`: product coverage if narrower than the build coverage.
- `depends_on`: source product/build IDs when derived from another product.
- `cache_policy`: intended browser/CDN cache behavior.
- `fallback`: what the HUD does if the product is missing.

## Biodiversity Fine

`biodiversity-fine` must preserve close-range gameplay fidelity:

- Cell size remains 20 ft unless a future schema version explicitly changes it.
- Fine cells carry enough metrics for heat, fog, niches, quests, and local
  taxonomy hydration.
- Served taxonomy should use playable pruning/binning. Raw or obscure detail can
  remain offline in the Gold Lake, but it should not leak into every HUD chunk by
  default.
- Each chunk must declare the playable taxonomy policy that shaped it.
- Large 1024x1024 superchunks are allowed only if size gates pass. Bigger chunks
  are not automatically better.

Minimum size gates for a pilot:

- Median fine chunk payload: under 256 KB compressed.
- Dense fine chunk payload: under 2 MB compressed unless justified.
- No mandatory startup download of the full fine layer.

## Biodiversity Coarse

`biodiversity-coarse` exists to stop browser-side binning from becoming the game.

The coarse product should be a pyramid generated from a known fine build:

- Bin sizes should match HUD zoom needs, for example 2, 4, 8, 16, 32, and 64
  fine cells.
- Coarse values must declare aggregation semantics: median, sum, max, top taxon,
  month totals, dominant iconic group, active-cell count, or other fields.
- Coarse tiles must be downloadable independently by viewport.
- If a coarse tile is missing, the HUD may fall back to existing runtime binning
  for that view, but missing coarse coverage should be visible in diagnostics.

Minimum size gates for a pilot:

- Coarse viewport fetches should be smaller than equivalent fine fetches.
- A zoomed-out pan should not trigger per-cell taxonomy hydration.
- Coarse products must include a coverage index or tile matrix declaration.

## OSM Context

`osm-context` is a hosted gameplay extract first, a full OSM mirror later only if
needed.

The first hosted product should include the feature classes GridWild already uses:

- Trails and pedestrian ways.
- Roads and barriers relevant to niche subdivision.
- Building footprints.
- Water lines and polygons.
- Parks, protected areas, woods, wetlands, grasslands, cemeteries, gardens, and
  other habitat-like polygons.
- Named places used for readable local context.

Runtime Overpass queries should become fallback/dev behavior, not the primary
gameplay path.

Minimum size gates for a pilot:

- OSM context must be tile/viewport addressable.
- The HUD can render cached OSM context without waiting on Overpass.
- Each OSM product declares extract date, OSM license attribution, and tag filter
  policy.

## Playable Taxonomy

Playable taxonomy is part of the data contract, not just UI copy.

The hydration plan is in
[Playable Taxonomy Hydration](playable-taxonomy-hydration.md).

The builder should generate or consume a versioned playable taxonomy artifact
before broad coverage expansion. GBIF backbone is the right canonical backbone
for names, ranks, synonym handling, and parentage. Playability still needs
GridWild-specific policy: beginner endpoint rank, local support, observability,
validation reliability, and pruning rules.

The served map layer should prefer:

- High-signal groups players can reasonably act on.
- Collapsing difficult or obscure branches to family/order where that is the
  beginner-friendly endpoint.
- Retaining enough lineage to explain why a cell is interesting.
- Keeping raw detail offline or in optional developer products.

## Migration Gates

Do not make a new map-data path canonical until these are true:

1. A manifest exists and validates.
2. Current HUD behavior can fall back to the previous asset path.
3. A pilot AOI build can be regenerated without MATLAB.
4. Fine and coarse products share one build ID lineage.
5. Product sizes are measured and written to the manifest.
6. Playable taxonomy version is declared.
7. OSM context source date and tag policy are declared.
8. Rollback is one build flip, not a code revert.

## Rollback Rule

Every migration step should be reversible by changing which build is current.
Code changes can teach the HUD to read a new product, but production risk should
live in the build pointer.

This is the promise: build boldly, but keep the old map alive until the new map
has earned the right to carry the HUD.
