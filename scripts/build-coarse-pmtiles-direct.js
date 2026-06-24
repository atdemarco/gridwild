#!/usr/bin/env node

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const readline = require("readline");

const DEFAULT_WORLD_DIR = "C:\\Users\\ad1470\\Desktop\\gridwild\\world";
const DEFAULT_PRODUCT = "dc_va_hybrid_served_v002";
const DEFAULT_LEVELS = [8, 16, 32, 64, 128];
const DEFAULT_LAYER = "gridwild_coarse_cells";
const DEFAULT_SHARD_CELL_SPAN = 8192;
const DEFAULT_MIN_ZOOM = 0;
const DEFAULT_MAX_ZOOM = 16;
const DEFAULT_TOP_TAXA = 8;
const DEFAULT_TOP_OBSERVERS = 8;
const R = 6378137;

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function int(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function splitLevels(value, fallback) {
  return String(value || fallback.join(","))
    .split(",")
    .map((item) => int(item.trim()))
    .filter((value) => value > 1)
    .sort((a, b) => a - b);
}

function normalizeAssetPath(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

function safeSlug(value) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function ensureWithin(parent, child) {
  const parentResolved = path.resolve(parent);
  const childResolved = path.resolve(child);
  if (childResolved === parentResolved || childResolved.startsWith(parentResolved + path.sep)) {
    return childResolved;
  }
  throw new Error(`Refusing to write outside asset directory: ${childResolved}`);
}

async function readJson(file) {
  return JSON.parse(await fsp.readFile(file, "utf8"));
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function parseCsvLine(line) {
  const out = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }

  out.push(field);
  return out;
}

async function readCsv(file) {
  const text = await fsp.readFile(file, "utf8");
  const rows = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (!rows.length) return [];
  const header = parseCsvLine(rows.shift()).map((name) => name.trim());
  return rows.map((line) => {
    const fields = parseCsvLine(line);
    const row = {};
    header.forEach((name, index) => {
      row[name] = fields[index] ?? "";
    });
    return row;
  });
}

function superKey(superIx, superIy) {
  return `${superIx},${superIy}`;
}

function superKeyFromRow(row) {
  return {
    ix: int(row.super_ix),
    iy: int(row.super_iy),
    key: superKey(int(row.super_ix), int(row.super_iy))
  };
}

function compareSuperKeys(a, b) {
  if (a.ix !== b.ix) return a.ix - b.ix;
  return a.iy - b.iy;
}

class CsvSuperGroupCursor {
  constructor(file) {
    this.file = file;
    this.stream = fs.createReadStream(file, { encoding: "utf8" });
    this.rl = readline.createInterface({ input: this.stream, crlfDelay: Infinity });
    this.iterator = this.rl[Symbol.asyncIterator]();
    this.header = null;
    this.pendingRow = null;
    this.pendingGroup = null;
    this.done = false;
  }

  async readRow() {
    if (this.done) return null;
    if (this.pendingRow) {
      const row = this.pendingRow;
      this.pendingRow = null;
      return row;
    }

    for (;;) {
      let next;
      try {
        next = await this.iterator.next();
      } catch (err) {
        if (err?.code === "ERR_USE_AFTER_CLOSE") {
          this.done = true;
          return null;
        }
        throw err;
      }
      if (next.done) {
        this.done = true;
        return null;
      }

      const line = String(next.value || "").replace(/\r$/, "");
      if (!line.trim()) continue;

      if (!this.header) {
        this.header = parseCsvLine(line).map((name) => name.trim());
        continue;
      }

      const fields = parseCsvLine(line);
      const row = {};
      this.header.forEach((name, index) => {
        row[name] = fields[index] ?? "";
      });
      return row;
    }
  }

  async readGroup() {
    const first = await this.readRow();
    if (!first) return null;

    const key = superKeyFromRow(first);
    const rows = [first];

    for (;;) {
      const row = await this.readRow();
      if (!row) break;
      const rowKey = superKeyFromRow(row);
      if (rowKey.key !== key.key) {
        this.pendingRow = row;
        break;
      }
      rows.push(row);
    }

    return { key, rows };
  }

  async groupFor(expectedKey) {
    for (;;) {
      if (!this.pendingGroup) this.pendingGroup = await this.readGroup();
      if (!this.pendingGroup) return [];

      const cmp = compareSuperKeys(this.pendingGroup.key, expectedKey);
      if (cmp < 0) {
        this.pendingGroup = null;
        continue;
      }
      if (cmp > 0) return [];

      const rows = this.pendingGroup.rows;
      this.pendingGroup = null;
      return rows;
    }
  }

  close() {
    this.rl.close();
    this.stream.destroy();
  }
}

function parseDateMs(value) {
  if (!value) return 0;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : 0;
}

function isoDate(ms) {
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString().slice(0, 10) : "";
}

function metricEntropy(values) {
  const total = values.reduce((sum, value) => sum + (Number(value) || 0), 0);
  if (!total) return 0;
  return values.reduce((h, value) => {
    const p = (Number(value) || 0) / total;
    return p > 0 ? h - p * Math.log2(p) : h;
  }, 0);
}

function coarseAnchor(value, binSize) {
  return Math.floor(Number(value) / binSize) * binSize;
}

function cellKey(ix, iy) {
  return `${ix},${iy}`;
}

function makeCell(anchorIx, anchorIy, binSize) {
  return {
    ix: anchorIx,
    iy: anchorIy,
    bin_size: binSize,
    nSquares: binSize * binSize,
    nActiveSquares: 0,
    total_count: 0,
    square_taxa_sum: 0,
    observer_square_sum: 0,
    n_captive_sum: 0,
    count_square_sum: 0,
    min_ix: Number.POSITIVE_INFINITY,
    min_iy: Number.POSITIVE_INFINITY,
    max_ix: Number.NEGATIVE_INFINITY,
    max_iy: Number.NEGATIVE_INFINITY,
    last_observed_ms: 0,
    median_last10_observed_ms_sum: 0,
    median_last10_observed_ms_n: 0,
    taxon_row_count: 0,
    month_totals: Array(12).fill(0),
    iconic_counts: new Map(),
    served_rank_counts: new Map(),
    policy_action_counts: new Map(),
    playable_group_counts: new Map(),
    top_taxa_map: new Map(),
    top_observers_map: new Map()
  };
}

function getCell(cells, ix, iy, binSize) {
  const anchorIx = coarseAnchor(ix, binSize);
  const anchorIy = coarseAnchor(iy, binSize);
  const key = cellKey(anchorIx, anchorIy);
  if (!cells.has(key)) cells.set(key, makeCell(anchorIx, anchorIy, binSize));
  return cells.get(key);
}

function addCount(map, key, count) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + (Number(count) || 0));
}

function taxonKey(row) {
  return (
    row.served_taxon_key ||
    [row.served_rank, row.served_display_name, row.playable_group_key].filter(Boolean).join(":")
  );
}

function updateTopTaxa(cell, row) {
  const key = taxonKey(row);
  if (!key) return;
  const count = int(row.count);
  const rawTaxaCount = int(row.raw_taxa_count);

  if (!cell.top_taxa_map.has(key)) {
    cell.top_taxa_map.set(key, {
      served_taxon_key: key,
      served_rank: row.served_rank || "taxon",
      served_display_name: row.served_display_name || row.genus_name || key,
      playable_group_key: row.playable_group_key || "unmapped",
      playable_group_name: row.playable_group_name || "Unmapped Taxa",
      iconic_taxon_name: row.iconic_taxon_name || "Unknown",
      order_name: row.order_name || "Unknown",
      family_name: row.family_name || "Unknown",
      genus_name: row.genus_name || "Unknown",
      policy_action: row.policy_action || "unknown",
      original_policy_action: row.original_policy_action || row.policy_action || "unknown",
      policy_match_rank: row.policy_match_rank || "",
      playability_score:
        row.playability_score === "" ? null : numberValue(row.playability_score, null),
      count: 0,
      raw_taxa_count: 0,
      month_counts: Array(12).fill(0),
      last_observed_ms: 0,
      median_last10_observed_ms: 0
    });
  }

  const dest = cell.top_taxa_map.get(key);
  dest.count += count;
  dest.raw_taxa_count += rawTaxaCount;
  for (let i = 0; i < 12; i += 1) {
    const value = int(row[`m${String(i + 1).padStart(2, "0")}`]);
    dest.month_counts[i] += value;
  }
  dest.last_observed_ms = Math.max(dest.last_observed_ms, parseDateMs(row.last_observed));
  dest.median_last10_observed_ms = Math.max(
    dest.median_last10_observed_ms,
    parseDateMs(row.median_last10_observed)
  );
}

function updateTopObserver(cell, row) {
  const observerId = int(row.observer_id);
  if (!(observerId > 0)) return;
  const key = String(observerId);
  if (!cell.top_observers_map.has(key)) {
    cell.top_observers_map.set(key, {
      observer_id: observerId,
      count: 0,
      species: 0,
      contributing_square_count: 0
    });
  }
  const dest = cell.top_observers_map.get(key);
  dest.count += int(row.count);
  dest.species += int(row.species);
  dest.contributing_square_count += 1;
}

function finalizeCell(cell, options) {
  const active = Math.max(1, cell.nActiveSquares);
  const peak = Math.max(...cell.month_totals);
  const totalMonths = cell.month_totals.reduce((sum, value) => sum + value, 0);
  const iconicCounts = Object.fromEntries(
    Array.from(cell.iconic_counts.entries()).sort((a, b) => b[1] - a[1])
  );
  const dominantIconic = Object.entries(iconicCounts)[0]?.[0] || "Unknown";
  const topTaxa = Array.from(cell.top_taxa_map.values())
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.raw_taxa_count - a.raw_taxa_count ||
        String(a.served_display_name).localeCompare(String(b.served_display_name))
    )
    .slice(0, options.topTaxa)
    .map((taxon) => ({
      ...taxon,
      last_observed: isoDate(taxon.last_observed_ms),
      median_last10_observed: isoDate(taxon.median_last10_observed_ms)
    }));
  const topObservers = Array.from(cell.top_observers_map.values())
    .sort((a, b) => b.count - a.count || b.species - a.species || a.observer_id - b.observer_id)
    .slice(0, options.topObservers);

  return {
    ix: cell.ix,
    iy: cell.iy,
    key: cellKey(cell.ix, cell.iy),
    bin_size: cell.bin_size,
    nSquares: cell.nSquares,
    nActiveSquares: cell.nActiveSquares,
    occupied_fine_squares: cell.nActiveSquares,
    count: Number((cell.count_square_sum / active).toFixed(3)),
    species: Number((cell.square_taxa_sum / active).toFixed(3)),
    genera: Number((cell.square_taxa_sum / active).toFixed(3)),
    observers: Number((cell.observer_square_sum / active).toFixed(3)),
    n_captive: Number((cell.n_captive_sum / active).toFixed(3)),
    total_count: cell.total_count,
    unique_served_taxa: cell.top_taxa_map.size,
    served_taxon_records: cell.taxon_row_count,
    observer_square_sum: cell.observer_square_sum,
    unique_top_observers: cell.top_observers_map.size,
    coverage_ratio: Number((cell.nActiveSquares / cell.nSquares).toFixed(6)),
    bbox_grid: [cell.min_ix, cell.min_iy, cell.max_ix, cell.max_iy],
    last_observed: isoDate(cell.last_observed_ms),
    median_last10_observed: isoDate(
      cell.median_last10_observed_ms_n
        ? cell.median_last10_observed_ms_sum / cell.median_last10_observed_ms_n
        : 0
    ),
    last_observed_ms: cell.last_observed_ms,
    median_last10_observed_ms: cell.median_last10_observed_ms_n
      ? Math.round(cell.median_last10_observed_ms_sum / cell.median_last10_observed_ms_n)
      : 0,
    iconic_counts: iconicCounts,
    dominant_iconic: dominantIconic,
    iconic_n: Object.keys(iconicCounts).length,
    month_totals: cell.month_totals,
    peak_month: cell.month_totals.indexOf(peak) + 1,
    seasonal_strength: totalMonths ? Number((peak / totalMonths).toFixed(6)) : 0,
    month_entropy: Number(metricEntropy(cell.month_totals).toFixed(6)),
    activity_score: Number(
      (Math.log1p(cell.total_count) * (1 + cell.top_taxa_map.size * 0.05)).toFixed(6)
    ),
    served_rank_counts: Object.fromEntries(cell.served_rank_counts),
    policy_action_counts: Object.fromEntries(cell.policy_action_counts),
    playable_group_counts: Object.fromEntries(cell.playable_group_counts),
    top_taxa: topTaxa,
    top_observers: topObservers
  };
}

function lonFromMercatorX(x) {
  return ((x / R) * 180) / Math.PI;
}

function latFromMercatorY(y) {
  return ((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180) / Math.PI;
}

function cellPolygon(ix, iy, binSize, gridSizeM) {
  const x0 = ix * gridSizeM;
  const x1 = (ix + binSize) * gridSizeM;
  const y0 = iy * gridSizeM;
  const y1 = (iy + binSize) * gridSizeM;
  const west = lonFromMercatorX(x0);
  const east = lonFromMercatorX(x1);
  const south = latFromMercatorY(y0);
  const north = latFromMercatorY(y1);
  return [
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south]
    ]
  ];
}

function featureBounds(feature) {
  const ring = feature?.geometry?.coordinates?.[0] || [];
  const bounds = { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity };
  for (const point of ring) {
    const lng = Number(point?.[0]);
    const lat = Number(point?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    bounds.west = Math.min(bounds.west, lng);
    bounds.east = Math.max(bounds.east, lng);
    bounds.south = Math.min(bounds.south, lat);
    bounds.north = Math.max(bounds.north, lat);
  }
  return bounds;
}

function compactJson(value) {
  if (value == null) return "";
  if (Array.isArray(value) && value.length === 0) return "";
  if (!Array.isArray(value) && typeof value === "object" && !Object.keys(value).length) return "";
  return JSON.stringify(value);
}

function compactTaxa(rows, limit) {
  return (Array.isArray(rows) ? rows : []).slice(0, limit).map((row) => ({
    k: row.served_taxon_key,
    r: row.served_rank,
    n: row.served_display_name,
    g: row.playable_group_key,
    gn: row.playable_group_name,
    i: row.iconic_taxon_name,
    o: row.order_name,
    f: row.family_name,
    ge: row.genus_name,
    a: row.policy_action,
    p: row.playability_score,
    c: row.count,
    rc: row.raw_taxa_count,
    m: row.month_counts,
    lo: row.last_observed,
    ml: row.median_last10_observed
  }));
}

function compactObservers(rows, limit) {
  return (Array.isArray(rows) ? rows : []).slice(0, limit).map((row) => ({
    id: row.observer_id,
    c: row.count,
    s: row.species,
    q: row.contributing_square_count
  }));
}

function coarseProperties(cell, options) {
  const binSize = int(cell.bin_size || options.binSize);
  const monthTotals = Array.isArray(cell.month_totals) ? cell.month_totals.slice(0, 12) : [];
  while (monthTotals.length < 12) monthTotals.push(0);

  return {
    ix: int(cell.ix),
    iy: int(cell.iy),
    bin_size: binSize,
    nSquares: int(cell.nSquares || cell.n_squares || binSize * binSize),
    nActiveSquares: int(cell.nActiveSquares || cell.occupied_fine_squares || 0),
    occupied_fine_squares: int(cell.occupied_fine_squares || cell.nActiveSquares || 0),
    count: numberValue(cell.count),
    species: numberValue(cell.species || cell.genera || cell.unique_served_taxa),
    genera: numberValue(cell.genera || cell.species || cell.unique_served_taxa),
    observers: numberValue(cell.observers),
    n_captive: numberValue(cell.n_captive),
    total_count: numberValue(cell.total_count || cell.count),
    unique_served_taxa: int(cell.unique_served_taxa || cell.species || cell.genera),
    served_taxon_records: int(cell.served_taxon_records),
    observer_square_sum: int(cell.observer_square_sum),
    unique_top_observers: int(cell.unique_top_observers),
    coverage_ratio: numberValue(cell.coverage_ratio),
    last_observed: cell.last_observed || "",
    median_last10_observed: cell.median_last10_observed || "",
    last_observed_ms: numberValue(cell.last_observed_ms),
    median_last10_observed_ms: numberValue(cell.median_last10_observed_ms),
    dominant_iconic: cell.dominant_iconic || "Unknown",
    iconic_n: int(cell.iconic_n),
    peak_month: int(cell.peak_month || 1),
    seasonal_strength: numberValue(cell.seasonal_strength),
    month_entropy: numberValue(cell.month_entropy),
    activity_score: numberValue(cell.activity_score),
    month_totals_json: compactJson(monthTotals),
    iconic_counts_json: compactJson(cell.iconic_counts || {}),
    served_rank_counts_json: compactJson(cell.served_rank_counts || {}),
    policy_action_counts_json: compactJson(cell.policy_action_counts || {}),
    playable_group_counts_json: compactJson(cell.playable_group_counts || {}),
    top_taxa_json: compactJson(compactTaxa(cell.top_taxa, options.topTaxa)),
    top_observers_json: compactJson(compactObservers(cell.top_observers, options.topObservers))
  };
}

function quoteShell(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function windowsPathToWslPath(value) {
  const resolved = path.resolve(value).replace(/\\/g, "/");
  const match = resolved.match(/^([A-Za-z]):\/(.*)$/);
  if (!match) return resolved;
  return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
}

function shardKey(ix, iy, shardCellSpan) {
  const sx = Math.floor(ix / shardCellSpan);
  const sy = Math.floor(iy / shardCellSpan);
  return { id: `coarse_shard_${sx}_${sy}`, sx, sy };
}

function emptyShard({ id, sx, sy, geojsonseqFile, pmtilesFile }) {
  return {
    id,
    sx,
    sy,
    geojsonseq_file: geojsonseqFile,
    file: pmtilesFile,
    feature_count: 0,
    levels: [],
    level_counts: {},
    ix_min: Infinity,
    ix_max: -Infinity,
    iy_min: Infinity,
    iy_max: -Infinity,
    west: Infinity,
    south: Infinity,
    east: -Infinity,
    north: -Infinity
  };
}

function publicShard(stats) {
  return {
    id: stats.id,
    sx: stats.sx,
    sy: stats.sy,
    file: stats.file,
    geojsonseq_file: stats.geojsonseq_file,
    feature_count: stats.feature_count,
    geojsonseq_bytes: stats.geojsonseq_bytes || 0,
    pmtiles_bytes: stats.pmtiles_bytes || 0,
    levels: stats.levels.slice().sort((a, b) => a - b),
    level_counts: stats.level_counts,
    ix_min: stats.ix_min,
    ix_max: stats.ix_max,
    iy_min: stats.iy_min,
    iy_max: stats.iy_max,
    bounds: {
      west: stats.west,
      south: stats.south,
      east: stats.east,
      north: stats.north
    }
  };
}

async function refreshSizes(assetDir, manifest) {
  const manifestFile =
    manifest.coarse_pmtiles_shard_manifest_file || "coarse_pmtiles/shards_manifest.json";
  const manifestPath = path.join(assetDir, normalizeAssetPath(manifestFile));
  const shardManifest = await readJson(manifestPath);
  let present = 0;
  let totalBytes = 0;
  let largestBytes = 0;

  for (const shard of shardManifest.shards || []) {
    const pmtilesPath = path.join(assetDir, normalizeAssetPath(shard.file));
    try {
      const bytes = (await fsp.stat(pmtilesPath)).size;
      shard.pmtiles_bytes = bytes;
      present += 1;
      totalBytes += bytes;
      largestBytes = Math.max(largestBytes, bytes);
    } catch {
      shard.pmtiles_bytes = 0;
    }
  }

  shardManifest.pmtiles_shards_present = present;
  shardManifest.pmtiles_total_bytes = totalBytes;
  shardManifest.pmtiles_largest_bytes = largestBytes;
  shardManifest.refreshed_at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  await writeJson(manifestPath, shardManifest);

  manifest.coarse_pmtiles_shard_count = shardManifest.shard_count;
  manifest.coarse_pmtiles_total_bytes = totalBytes;
  manifest.coarse_pmtiles_largest_bytes = largestBytes;
  await writeJson(path.join(assetDir, "manifest.json"), manifest);

  return {
    shard_manifest: manifestPath,
    present,
    expected: shardManifest.shard_count,
    totalBytes,
    largestBytes
  };
}

function updateShardStats(stats, props, bin, bounds) {
  stats.feature_count += 1;
  stats.level_counts[bin] = (stats.level_counts[bin] || 0) + 1;
  if (!stats.levels.includes(bin)) stats.levels.push(bin);
  stats.ix_min = Math.min(stats.ix_min, props.ix);
  stats.ix_max = Math.max(stats.ix_max, props.ix + bin);
  stats.iy_min = Math.min(stats.iy_min, props.iy);
  stats.iy_max = Math.max(stats.iy_max, props.iy + bin);
  stats.west = Math.min(stats.west, bounds.west);
  stats.east = Math.max(stats.east, bounds.east);
  stats.south = Math.min(stats.south, bounds.south);
  stats.north = Math.max(stats.north, bounds.north);
}

async function main() {
  const args = parseArgs(process.argv);
  const product = args.product || DEFAULT_PRODUCT;
  const worldDir = path.resolve(args["world-dir"] || DEFAULT_WORLD_DIR);
  const assetDir = path.resolve(args["asset-dir"] || path.join(worldDir, "gold", product));
  const stageDir = path.resolve(args["stage-dir"] || path.join(worldDir, "gold_stage", product));
  const manifestPath = path.join(assetDir, "manifest.json");
  const manifest = await readJson(manifestPath);

  if (args["refresh-sizes"]) {
    console.log(JSON.stringify(await refreshSizes(assetDir, manifest), null, 2));
    return;
  }

  const levels = splitLevels(args.levels, DEFAULT_LEVELS);
  const levelSet = new Set(levels);
  const layer = args.layer || DEFAULT_LAYER;
  const shardCellSpan = int(args["shard-cell-span"], DEFAULT_SHARD_CELL_SPAN);
  const minZoom = int(args["minimum-zoom"], DEFAULT_MIN_ZOOM);
  const maxZoom = int(args["maximum-zoom"], DEFAULT_MAX_ZOOM);
  const topTaxa = Math.max(0, int(args["top-taxa"], DEFAULT_TOP_TAXA));
  const topObservers = Math.max(0, int(args["top-observers"], DEFAULT_TOP_OBSERVERS));
  const defaultOutputTag = `x${Math.min(...levels)}plus_z${maxZoom}_direct`;
  const outputTag = safeSlug(args["output-tag"] || args.tag || defaultOutputTag);
  const jobs = Math.max(1, int(args.jobs, 1));
  const tippecanoeThreads = Math.max(0, int(args["tippecanoe-threads"], 0));
  const updateManifest = args["no-update-manifest"] !== true;
  const keepJsonServing = args["keep-json-serving"] === true;
  const gridSizeM = numberValue(manifest.grid_size_m, 6.096);
  if (!(shardCellSpan > 0)) throw new Error("--shard-cell-span must be positive.");

  const squareFile = path.join(stageDir, "square_summary.csv");
  const taxaFile = path.join(stageDir, "square_taxa.csv");
  const observersFile = path.join(stageDir, "square_observers.csv");
  const superFile = path.join(stageDir, "superchunks.csv");
  for (const file of [squareFile, taxaFile, observersFile, superFile]) {
    await fsp.access(file);
  }
  if (args["check-inputs"]) {
    const files = {};
    for (const [label, file] of Object.entries({
      manifest: manifestPath,
      square_summary: squareFile,
      square_taxa: taxaFile,
      square_observers: observersFile,
      superchunks: superFile
    })) {
      files[label] = {
        path: file,
        bytes: (await fsp.stat(file)).size
      };
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          product,
          assetDir,
          stageDir,
          build_id: manifest.build_id,
          levels,
          outputTag,
          shardCellSpan,
          files
        },
        null,
        2
      )
    );
    return;
  }

  const outRoot = path.join(assetDir, "coarse_pmtiles");
  const shardRoot = ensureWithin(assetDir, path.join(outRoot, "shards"));
  const geojsonseqDir = ensureWithin(assetDir, path.join(shardRoot, "geojsonseq"));
  await fsp.mkdir(geojsonseqDir, { recursive: true });

  const writers = new Map();
  const shards = new Map();
  let totalFeatures = 0;
  let processedSuperchunks = 0;
  let processedSquares = 0;

  function statsForCell(cell) {
    const ix = int(cell.ix, NaN);
    const iy = int(cell.iy, NaN);
    if (!Number.isFinite(ix) || !Number.isFinite(iy)) return null;

    const { id, sx, sy } = shardKey(ix, iy, shardCellSpan);
    if (!shards.has(id)) {
      const tagPart = outputTag ? `_${outputTag}` : "";
      const base = `gridwild_${manifest.region || "region"}_${manifest.region_version || "served"}${tagPart}_${id}`;
      shards.set(
        id,
        emptyShard({
          id,
          sx,
          sy,
          geojsonseqFile: normalizeAssetPath(`coarse_pmtiles/shards/geojsonseq/${base}.geojsonseq`),
          pmtilesFile: normalizeAssetPath(`coarse_pmtiles/shards/${base}.pmtiles`)
        })
      );
    }

    return shards.get(id);
  }

  function writerFor(stats) {
    if (writers.has(stats.id)) return writers.get(stats.id);
    const absolute = ensureWithin(assetDir, path.join(assetDir, stats.geojsonseq_file));
    const writer = fs.createWriteStream(absolute, { flags: "w" });
    writers.set(stats.id, writer);
    return writer;
  }

  function writeFeature(cell) {
    const bin = int(cell.bin_size);
    if (!levelSet.has(bin)) return;
    const stats = statsForCell(cell);
    if (!stats) return;
    const props = coarseProperties(cell, { binSize: bin, topTaxa, topObservers });
    const feature = {
      type: "Feature",
      properties: props,
      geometry: {
        type: "Polygon",
        coordinates: cellPolygon(props.ix, props.iy, bin, gridSizeM)
      }
    };
    const bounds = featureBounds(feature);
    updateShardStats(stats, props, bin, bounds);
    writerFor(stats).write(`${JSON.stringify(feature)}\n`);
    totalFeatures += 1;
  }

  console.log("Building direct coarse PMTiles GeoJSONSeq shards");
  console.log(`Asset dir: ${assetDir}`);
  console.log(`Stage dir: ${stageDir}`);
  console.log(`Levels: ${levels.join(",")}`);
  console.log(`Shard cell span: ${shardCellSpan}`);
  console.log(`Output tag: ${outputTag}`);

  const superRows = await readCsv(superFile);
  const squareCursor = new CsvSuperGroupCursor(squareFile);
  const taxaCursor = new CsvSuperGroupCursor(taxaFile);
  const observerCursor = new CsvSuperGroupCursor(observersFile);

  try {
    for (const superRow of superRows) {
      const expectedKey = superKeyFromRow(superRow);
      const squareRows = await squareCursor.groupFor(expectedKey);
      const taxaRows = await taxaCursor.groupFor(expectedKey);
      const observerRows = await observerCursor.groupFor(expectedKey);
      if (!squareRows.length) continue;

      const cellsByLevel = new Map(levels.map((level) => [level, new Map()]));
      const allowedFineKeys = new Set();

      for (const row of squareRows) {
        const ix = int(row.ix);
        const iy = int(row.iy);
        const fineKey = cellKey(ix, iy);
        allowedFineKeys.add(fineKey);
        const count = int(row.count);
        const nGenera = int(row.n_genera);
        const nObservers = int(row.n_observers);
        const nCaptive = int(row.n_captive);
        const lastMs = parseDateMs(row.last_observed);
        const medianMs = parseDateMs(row.median_last10_observed);

        for (const binSize of levels) {
          const cell = getCell(cellsByLevel.get(binSize), ix, iy, binSize);
          cell.nActiveSquares += 1;
          cell.total_count += count;
          cell.count_square_sum += count;
          cell.square_taxa_sum += nGenera;
          cell.observer_square_sum += nObservers;
          cell.n_captive_sum += nCaptive;
          cell.min_ix = Math.min(cell.min_ix, ix);
          cell.min_iy = Math.min(cell.min_iy, iy);
          cell.max_ix = Math.max(cell.max_ix, ix);
          cell.max_iy = Math.max(cell.max_iy, iy);
          cell.last_observed_ms = Math.max(cell.last_observed_ms, lastMs);
          if (medianMs) {
            cell.median_last10_observed_ms_sum += medianMs;
            cell.median_last10_observed_ms_n += 1;
          }
        }
      }

      for (const row of taxaRows) {
        const ix = int(row.ix);
        const iy = int(row.iy);
        if (!allowedFineKeys.has(cellKey(ix, iy))) continue;
        const count = int(row.count);

        for (const binSize of levels) {
          const cell = cellsByLevel
            .get(binSize)
            .get(cellKey(coarseAnchor(ix, binSize), coarseAnchor(iy, binSize)));
          if (!cell) continue;
          cell.taxon_row_count += 1;
          for (let i = 0; i < 12; i += 1) {
            cell.month_totals[i] += int(row[`m${String(i + 1).padStart(2, "0")}`]);
          }
          addCount(cell.iconic_counts, row.iconic_taxon_name || "Unknown", count);
          addCount(cell.served_rank_counts, row.served_rank || "taxon", count);
          addCount(cell.policy_action_counts, row.policy_action || "unknown", count);
          addCount(cell.playable_group_counts, row.playable_group_key || "unmapped", count);
          updateTopTaxa(cell, row);
        }
      }

      for (const row of observerRows) {
        const ix = int(row.ix);
        const iy = int(row.iy);
        if (!allowedFineKeys.has(cellKey(ix, iy))) continue;

        for (const binSize of levels) {
          const cell = cellsByLevel
            .get(binSize)
            .get(cellKey(coarseAnchor(ix, binSize), coarseAnchor(iy, binSize)));
          if (!cell) continue;
          updateTopObserver(cell, row);
        }
      }

      for (const binSize of levels) {
        for (const cell of cellsByLevel.get(binSize).values()) {
          writeFeature(finalizeCell(cell, { topTaxa, topObservers }));
        }
      }

      processedSuperchunks += 1;
      processedSquares += squareRows.length;
      if (processedSuperchunks % 250 === 0) {
        console.log(
          `Processed ${processedSuperchunks}/${superRows.length} superchunks; features=${totalFeatures}`
        );
      }
    }
  } finally {
    squareCursor.close();
    taxaCursor.close();
    observerCursor.close();
  }

  await Promise.all(
    Array.from(writers.values()).map(
      (writer) =>
        new Promise((resolve, reject) => {
          writer.end(resolve);
          writer.on("error", reject);
        })
    )
  );

  for (const stats of shards.values()) {
    const geojsonseqPath = path.join(assetDir, stats.geojsonseq_file);
    stats.geojsonseq_bytes = (await fsp.stat(geojsonseqPath)).size;
    const pmtilesPath = path.join(assetDir, stats.file);
    try {
      stats.pmtiles_bytes = (await fsp.stat(pmtilesPath)).size;
    } catch {
      stats.pmtiles_bytes = 0;
    }
  }

  const publicShards = Array.from(shards.values())
    .map(publicShard)
    .sort((a, b) => a.sx - b.sx || a.sy - b.sy);

  const shardManifest = {
    schema_version: "gridwild.coarse-pmtiles-shards.v1",
    build_id: manifest.build_id || null,
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    source_kind: "gold_stage_csv",
    source_stage_dir: stageDir,
    shard_strategy: "grid_cell_span",
    shard_cell_span: shardCellSpan,
    layer,
    payload: "coarse_visual_summary_v1",
    output_tag: outputTag || null,
    minimum_zoom: minZoom,
    maximum_zoom: maxZoom,
    levels,
    top_taxa_limit: topTaxa,
    top_observers_limit: topObservers,
    jobs_hint: jobs,
    tippecanoe_threads_hint: tippecanoeThreads || null,
    shard_count: publicShards.length,
    feature_count: totalFeatures,
    processed_superchunks: processedSuperchunks,
    processed_squares: processedSquares,
    shards: publicShards
  };

  const shardManifestFile = "coarse_pmtiles/shards_manifest.json";
  await writeJson(path.join(assetDir, shardManifestFile), shardManifest);

  const bashPath = path.join(assetDir, "coarse_pmtiles", "build-coarse-shard-pmtiles.sh");
  const bashLines = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `echo "Building ${publicShards.length} direct coarse PMTiles shards..."`,
    `JOBS="\${TIPPECANOE_SHARD_JOBS:-${jobs}}"`,
    "if ! [[ \"$JOBS\" =~ ^[0-9]+$ ]] || (( JOBS < 1 )); then JOBS=1; fi",
    ...(tippecanoeThreads > 0
      ? [`export TIPPECANOE_MAX_THREADS="\${TIPPECANOE_MAX_THREADS:-${tippecanoeThreads}}"`]
      : []),
    "echo \"Shard jobs: $JOBS\"",
    "if [[ -n \"${TIPPECANOE_MAX_THREADS:-}\" ]]; then echo \"Tippecanoe threads per job: $TIPPECANOE_MAX_THREADS\"; fi",
    "running=0",
    "run_shard() {",
    "  local id=\"$1\"",
    "  local input=\"$2\"",
    "  local output=\"$3\"",
    "  if [[ -s \"$output\" && \"$output\" -nt \"$input\" ]]; then",
    "    echo \"Skipping $id\"",
    "  else",
    [
      "    tippecanoe",
      "      -o \"$output\"",
      "      --force",
      `      --minimum-zoom=${minZoom}`,
      `      --maximum-zoom=${maxZoom}`,
      "      --projection=EPSG:4326",
      `      --layer=${quoteShell(layer)}`,
      "      --no-feature-limit",
      "      --no-tile-size-limit",
      "      \"$input\""
    ].join(" \\\n"),
    "  fi",
    "}",
    "queue_shard() {",
    "  run_shard \"$@\" &",
    "  running=$((running + 1))",
    "  if (( running >= JOBS )); then",
    "    wait -n",
    "    running=$((running - 1))",
    "  fi",
    "}",
    ...publicShards.map((shard) => {
      const input = windowsPathToWslPath(path.join(assetDir, shard.geojsonseq_file));
      const output = windowsPathToWslPath(path.join(assetDir, shard.file));
      return `queue_shard ${quoteShell(shard.id)} ${quoteShell(input)} ${quoteShell(output)}`;
    }),
    "wait",
    "echo \"Done.\""
  ];
  await fsp.writeFile(bashPath, `${bashLines.join("\n")}\n`);

  const psPath = path.join(assetDir, "coarse_pmtiles", "build-coarse-shard-pmtiles.ps1");
  const psLines = [
    "$ErrorActionPreference = \"Stop\"",
    `$script = ${JSON.stringify(windowsPathToWslPath(bashPath))}`,
    "wsl.exe -e bash $script"
  ];
  await fsp.writeFile(psPath, `${psLines.join("\r\n")}\r\n`);

  if (updateManifest) {
    manifest.coarse_pmtiles_mode = "spatial_shards";
    manifest.coarse_pmtiles_layer = layer;
    manifest.coarse_pmtiles_payload = shardManifest.payload;
    manifest.coarse_pmtiles_shard_manifest_file = shardManifestFile;
    manifest.coarse_pmtiles_shard_count = publicShards.length;
    manifest.coarse_pmtiles_levels = levels;
    manifest.coarse_pmtiles_source = {
      source_kind: shardManifest.source_kind,
      output_tag: outputTag || null,
      processed_squares: processedSquares,
      processed_superchunks: processedSuperchunks
    };
    manifest.coarse_pmtiles_sharding = {
      schema_version: shardManifest.schema_version,
      shard_strategy: shardManifest.shard_strategy,
      shard_cell_span: shardCellSpan,
      shard_count: publicShards.length
    };

    if (!keepJsonServing) {
      if (manifest.coarse_pyramid_manifest_file) {
        manifest.coarse_pyramid_manifest_file_local = manifest.coarse_pyramid_manifest_file;
      }
      if (manifest.coarse_pyramid_summary_file) {
        manifest.coarse_pyramid_summary_file_local = manifest.coarse_pyramid_summary_file;
      }
      manifest.coarse_pyramid_manifest_file = null;
      manifest.coarse_pyramid_summary_file = null;
      manifest.products = (manifest.products || []).filter(
        (product) => product?.id !== "biodiversity-coarse"
      );
    }

    manifest.products = (manifest.products || []).filter(
      (product) => product?.id !== "biodiversity-coarse-pmtiles"
    );
    manifest.products.push({
      id: "biodiversity-coarse-pmtiles",
      format: "pmtiles-spatial-shards",
      manifest_file: shardManifestFile,
      layer,
      levels,
      semantics:
        "Spatial PMTiles shards for precomputed coarse heat cells with lens-ready summary metrics."
    });

    await writeJson(manifestPath, manifest);
  }

  console.log(
    JSON.stringify(
      {
        build_id: manifest.build_id,
        shard_manifest: path.join(assetDir, shardManifestFile),
        source: "gold_stage_csv",
        outputTag,
        levels,
        shards: publicShards.length,
        features: totalFeatures,
        processedSuperchunks,
        processedSquares,
        largestGeojsonSeqBytes: Math.max(...publicShards.map((shard) => shard.geojsonseq_bytes)),
        buildScript: psPath,
        manifestUpdated: updateManifest,
        jsonServingKept: keepJsonServing
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("Direct coarse PMTiles build failed.");
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
