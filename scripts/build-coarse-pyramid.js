const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const zlib = require("node:zlib");

const DEFAULT_WORLD_DIR = "C:\\Users\\ad1470\\Desktop\\gridwild\\world";
const DEFAULT_PRODUCT = "dc_va_served_v001";
const DEFAULT_LEVELS = [16, 32, 64, 128];
const DEFAULT_TILE_BINS = 32;
const DEFAULT_TOP_TAXA = 16;
const DEFAULT_TOP_OBSERVERS = 12;
const PYRAMID_DIR = "coarse_pyramid";

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

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(file, value, { pretty = false } = {}) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`);
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function int(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function numberValue(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

function csvValue(value) {
  const text = value == null ? "" : String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function writeCsv(file, rows, columns) {
  ensureDir(path.dirname(file));
  const lines = [columns.join(",")];
  rows.forEach((row) => {
    lines.push(columns.map((column) => csvValue(row[column])).join(","));
  });
  fs.writeFileSync(file, `${lines.join("\n")}\n`);
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

async function readCsvRows(file, onRow) {
  const stream = fs.createReadStream(file, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let header = null;
  let rowCount = 0;

  for await (const rawLine of rl) {
    const line = rawLine.replace(/\r$/, "");
    if (!line.trim()) continue;

    if (!header) {
      header = parseCsvLine(line).map((name) => name.trim());
      continue;
    }

    const fields = parseCsvLine(line);
    const row = {};
    header.forEach((name, index) => {
      row[name] = fields[index] ?? "";
    });
    rowCount += 1;
    await onRow(row, rowCount);
  }

  return rowCount;
}

async function readCsv(file) {
  const rows = [];
  await readCsvRows(file, (row) => {
    rows.push(row);
  });
  return rows;
}

function coarseAnchor(value, binSize) {
  return Math.floor(Number(value) / binSize) * binSize;
}

function cellKey(ix, iy) {
  return `${ix},${iy}`;
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

function addCount(map, key, count) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + (Number(count) || 0));
}

function topEntries(map, limit) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
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

function tileKeyForCell(cell, tileFineCells) {
  const tileIx = Math.floor(cell.ix / tileFineCells);
  const tileIy = Math.floor(cell.iy / tileFineCells);
  return `${tileIx},${tileIy}`;
}

function gzipBytes(file) {
  return zlib.gzipSync(fs.readFileSync(file), { level: 6 }).length;
}

class TileSetWriter {
  constructor({ binSize, pyramidDir, manifest, options }) {
    this.binSize = binSize;
    this.pyramidDir = pyramidDir;
    this.manifest = manifest;
    this.options = options;
    this.tileFineCells = binSize * options.tileBins;
    this.levelDir = path.join(pyramidDir, `bin_${binSize}`);
    this.tiles = new Map();
    ensureDir(this.levelDir);
  }

  metaForTile(tileIx, tileIy) {
    const key = `${tileIx},${tileIy}`;
    if (this.tiles.has(key)) return this.tiles.get(key);

    const relativeFile = path
      .join(PYRAMID_DIR, `bin_${this.binSize}`, `tile_${tileIx}_${tileIy}.json`)
      .replace(/\\/g, "/");
    const absoluteFile = path.join(path.dirname(this.pyramidDir), relativeFile);
    const meta = {
      key,
      tile_ix: tileIx,
      tile_iy: tileIy,
      file: relativeFile,
      absoluteFile,
      n_cells: 0,
      observation_count: 0,
      min_ix: Number.POSITIVE_INFINITY,
      min_iy: Number.POSITIVE_INFINITY,
      max_ix: Number.NEGATIVE_INFINITY,
      max_iy: Number.NEGATIVE_INFINITY
    };

    ensureDir(path.dirname(absoluteFile));
    fs.writeFileSync(
      absoluteFile,
      `${JSON.stringify({
        schema_version: "coarse-pyramid-tile.v1",
        build_id: this.manifest.build_id,
        source_schema_version: this.manifest.schema_version,
        bin_size: this.binSize,
        tile_bins: this.options.tileBins,
        tile_fine_cells: this.tileFineCells,
        tile_ix: tileIx,
        tile_iy: tileIy
      }).replace(/}$/, ',"cells":[')}`
    );

    this.tiles.set(key, meta);
    return meta;
  }

  appendCells(cells) {
    const byTile = new Map();
    for (const cell of cells) {
      const key = tileKeyForCell(cell, this.tileFineCells);
      if (!byTile.has(key)) byTile.set(key, []);
      byTile.get(key).push(cell);
    }

    for (const [key, tileCells] of byTile.entries()) {
      const [tileIx, tileIy] = key.split(",").map(Number);
      const meta = this.metaForTile(tileIx, tileIy);
      const prefix = meta.n_cells > 0 ? "," : "";
      fs.appendFileSync(
        meta.absoluteFile,
        `${prefix}${tileCells.map((cell) => JSON.stringify(cell)).join(",")}`
      );

      for (const cell of tileCells) {
        meta.n_cells += 1;
        meta.observation_count += cell.total_count;
        meta.min_ix = Math.min(meta.min_ix, cell.ix);
        meta.min_iy = Math.min(meta.min_iy, cell.iy);
        meta.max_ix = Math.max(meta.max_ix, cell.ix + this.binSize - 1);
        meta.max_iy = Math.max(meta.max_iy, cell.iy + this.binSize - 1);
      }
    }
  }

  finalize() {
    const tileManifest = [];
    let totalBytes = 0;
    let totalGzipBytes = 0;
    let largestTileBytes = 0;
    let largestTileFile = "";
    let totalObservationCount = 0;

    for (const meta of this.tiles.values()) {
      fs.appendFileSync(meta.absoluteFile, `],"cell_count":${meta.n_cells}}\n`);
      const bytes = fs.statSync(meta.absoluteFile).size;
      const gzBytes = gzipBytes(meta.absoluteFile);
      totalBytes += bytes;
      totalGzipBytes += gzBytes;
      totalObservationCount += meta.observation_count;
      if (bytes > largestTileBytes) {
        largestTileBytes = bytes;
        largestTileFile = meta.file;
      }

      tileManifest.push({
        tile_id: `bin_${this.binSize}_${meta.tile_ix}_${meta.tile_iy}`,
        tile_ix: meta.tile_ix,
        tile_iy: meta.tile_iy,
        file: meta.file,
        n_cells: meta.n_cells,
        bbox_grid: [meta.min_ix, meta.min_iy, meta.max_ix, meta.max_iy],
        observation_count: meta.observation_count,
        bytes,
        gzip_bytes: gzBytes
      });
    }

    tileManifest.sort((a, b) => a.tile_ix - b.tile_ix || a.tile_iy - b.tile_iy);

    return {
      tileManifest,
      totalBytes,
      totalGzipBytes,
      largestTileBytes,
      largestTileFile,
      totalObservationCount
    };
  }
}

function clearGeneratedPyramid(assetDir) {
  const target = path.resolve(assetDir, PYRAMID_DIR);
  const root = path.resolve(assetDir);
  if (!target.startsWith(`${root}${path.sep}`) || path.basename(target) !== PYRAMID_DIR) {
    throw new Error(`Refusing to remove unsafe generated directory: ${target}`);
  }
  fs.rmSync(target, { recursive: true, force: true });
}

async function buildLevel({ binSize, stageDir, pyramidDir, manifest, options }) {
  const squareFile = path.join(stageDir, "square_summary.csv");
  const taxaFile = path.join(stageDir, "square_taxa.csv");
  const observersFile = path.join(stageDir, "square_observers.csv");
  const superFile = path.join(stageDir, "superchunks.csv");
  const superRows = await readCsv(superFile);
  const squareCursor = new CsvSuperGroupCursor(squareFile);
  const taxaCursor = new CsvSuperGroupCursor(taxaFile);
  const observerCursor = new CsvSuperGroupCursor(observersFile);
  const tileWriter = new TileSetWriter({ binSize, pyramidDir, manifest, options });
  let levelCellCount = 0;
  let remainingSquares = options.limitSquares > 0 ? options.limitSquares : Number.POSITIVE_INFINITY;

  console.log(`Building coarse level ${binSize} by superchunk...`);

  try {
    for (const superRow of superRows) {
      if (!(remainingSquares > 0)) break;

      const expectedKey = superKeyFromRow(superRow);
      let squareRows = await squareCursor.groupFor(expectedKey);
      const taxaRows = await taxaCursor.groupFor(expectedKey);
      const observerRows = await observerCursor.groupFor(expectedKey);

      if (!squareRows.length) continue;
      if (Number.isFinite(remainingSquares) && squareRows.length > remainingSquares) {
        squareRows = squareRows.slice(0, remainingSquares);
      }
      remainingSquares -= squareRows.length;

      const cells = new Map();
      const allowedFineKeys = new Set();

      for (const row of squareRows) {
        const ix = int(row.ix);
        const iy = int(row.iy);
        const fineKey = cellKey(ix, iy);
        allowedFineKeys.add(fineKey);
        const cell = getCell(cells, ix, iy, binSize);
        const count = int(row.count);
        const nGenera = int(row.n_genera);
        const nObservers = int(row.n_observers);
        const nCaptive = int(row.n_captive);
        const lastMs = parseDateMs(row.last_observed);
        const medianMs = parseDateMs(row.median_last10_observed);

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

      for (const row of taxaRows) {
        const ix = int(row.ix);
        const iy = int(row.iy);
        if (!allowedFineKeys.has(cellKey(ix, iy))) continue;
        const cell = cells.get(cellKey(coarseAnchor(ix, binSize), coarseAnchor(iy, binSize)));
        if (!cell) continue;
        const count = int(row.count);

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

      for (const row of observerRows) {
        const ix = int(row.ix);
        const iy = int(row.iy);
        if (!allowedFineKeys.has(cellKey(ix, iy))) continue;
        const cell = cells.get(cellKey(coarseAnchor(ix, binSize), coarseAnchor(iy, binSize)));
        if (!cell) continue;
        updateTopObserver(cell, row);
      }

      const finalized = Array.from(cells.values()).map((cell) => finalizeCell(cell, options));
      levelCellCount += finalized.length;
      tileWriter.appendCells(finalized);
    }
  } finally {
    squareCursor.close();
    taxaCursor.close();
    observerCursor.close();
  }

  const {
    tileManifest,
    totalBytes,
    totalGzipBytes,
    largestTileBytes,
    largestTileFile,
    totalObservationCount
  } = tileWriter.finalize();

  return {
    bin_size: binSize,
    aggregation: "mean_display_plus_summary_totals",
    tile_bins: options.tileBins,
    tile_fine_cells: tileWriter.tileFineCells,
    n_cells: levelCellCount,
    n_tiles: tileManifest.length,
    total_observation_count: totalObservationCount,
    total_tile_bytes: totalBytes,
    total_tile_gzip_bytes: totalGzipBytes,
    average_tile_bytes: tileManifest.length ? Math.round(totalBytes / tileManifest.length) : 0,
    average_tile_gzip_bytes: tileManifest.length
      ? Math.round(totalGzipBytes / tileManifest.length)
      : 0,
    largest_tile_bytes: largestTileBytes,
    largest_tile_file: largestTileFile,
    tiles: tileManifest
  };
}

function updateMainManifest(assetDir, mainManifest, pyramidManifest) {
  const next = {
    ...mainManifest,
    coarse_pyramid_manifest_file: `${PYRAMID_DIR}/manifest.json`,
    coarse_pyramid_summary_file: `${PYRAMID_DIR}/summary.csv`,
    coarse_pyramid: {
      schema_version: pyramidManifest.schema_version,
      generated_at: pyramidManifest.generated_at,
      levels: pyramidManifest.levels.map((level) => ({
        bin_size: level.bin_size,
        aggregation: level.aggregation,
        tile_bins: level.tile_bins,
        tile_fine_cells: level.tile_fine_cells,
        n_cells: level.n_cells,
        n_tiles: level.n_tiles,
        total_tile_bytes: level.total_tile_bytes,
        total_tile_gzip_bytes: level.total_tile_gzip_bytes,
        largest_tile_bytes: level.largest_tile_bytes,
        largest_tile_file: level.largest_tile_file
      }))
    }
  };

  next.products = Array.isArray(next.products) ? next.products.filter(Boolean) : [];
  next.products = next.products.filter((product) => product?.id !== "biodiversity-coarse");
  next.products.push({
    id: "biodiversity-coarse",
    format: "json-coarse-pyramid",
    manifest_file: `${PYRAMID_DIR}/manifest.json`,
    levels: pyramidManifest.levels.map((level) => level.bin_size),
    semantics:
      "Precomputed coarse cells with lens-ready display metrics, taxon summaries, observer summaries, monthly activity, and recency."
  });

  writeJson(path.join(assetDir, "manifest.json"), next, { pretty: true });
  return next;
}

function updateValidation(assetDir, pyramidManifest) {
  const validationPath = path.join(assetDir, "validation_report.json");
  if (!fs.existsSync(validationPath)) return;

  const validation = readJson(validationPath);
  validation.files = validation.files || {};
  validation.files.coarse_pyramid_manifest = true;
  validation.files.coarse_pyramid_tiles = pyramidManifest.levels.reduce(
    (sum, level) => sum + level.n_tiles,
    0
  );
  validation.checks = validation.checks || {};
  validation.checks.coarse_pyramid_levels_present = pyramidManifest.levels.length > 0;
  validation.coarse_pyramid = {
    schema_version: pyramidManifest.schema_version,
    generated_at: pyramidManifest.generated_at,
    levels: pyramidManifest.levels.map((level) => ({
      bin_size: level.bin_size,
      n_cells: level.n_cells,
      n_tiles: level.n_tiles,
      total_tile_gzip_bytes: level.total_tile_gzip_bytes
    }))
  };
  writeJson(validationPath, validation, { pretty: true });
}

async function main() {
  const args = parseArgs(process.argv);
  const worldDir = path.resolve(args["world-dir"] || DEFAULT_WORLD_DIR);
  const product = args.product || DEFAULT_PRODUCT;
  const assetDir = path.resolve(args["asset-dir"] || path.join(worldDir, "gold", product));
  const sourceAssetDir = path.resolve(args["source-asset-dir"] || assetDir);
  const stageDir = path.resolve(args["stage-dir"] || path.join(worldDir, "gold_stage", product));
  const levels = splitList(args.levels || DEFAULT_LEVELS.join(","))
    .map((value) => int(value))
    .filter((value) => value > 1);
  const options = {
    tileBins: Math.max(1, int(args["tile-bins"] || DEFAULT_TILE_BINS)),
    topTaxa: Math.max(1, int(args["top-taxa"] || DEFAULT_TOP_TAXA)),
    topObservers: Math.max(1, int(args["top-observers"] || DEFAULT_TOP_OBSERVERS)),
    limitSquares: Math.max(0, int(args["limit-squares"] || 0))
  };

  const requiredFiles = [
    path.join(sourceAssetDir, "manifest.json"),
    path.join(stageDir, "superchunks.csv"),
    path.join(stageDir, "square_summary.csv"),
    path.join(stageDir, "square_taxa.csv"),
    path.join(stageDir, "square_observers.csv")
  ];

  if (args["check-inputs"]) {
    console.log(
      JSON.stringify(
        {
          ok: requiredFiles.every((file) => fs.existsSync(file)),
          assetDir,
          sourceAssetDir,
          stageDir,
          levels,
          options,
          files: Object.fromEntries(requiredFiles.map((file) => [file, fs.existsSync(file)]))
        },
        null,
        2
      )
    );
    return;
  }

  for (const file of requiredFiles) {
    if (!fs.existsSync(file)) throw new Error(`Missing required file: ${file}`);
  }

  ensureDir(assetDir);
  const sourceManifest = readJson(path.join(sourceAssetDir, "manifest.json"));
  const mainManifest = {
    ...sourceManifest,
    build_id: args["build-id"] || sourceManifest.build_id
  };
  if (mainManifest.build_id !== sourceManifest.build_id) {
    mainManifest.source_build_id = sourceManifest.build_id;
  }
  const sourceValidation = path.join(sourceAssetDir, "validation_report.json");
  const outValidation = path.join(assetDir, "validation_report.json");
  if (!fs.existsSync(outValidation) && fs.existsSync(sourceValidation)) {
    fs.copyFileSync(sourceValidation, outValidation);
  }
  const pyramidDir = path.join(assetDir, PYRAMID_DIR);
  clearGeneratedPyramid(assetDir);
  ensureDir(pyramidDir);

  const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const pyramidManifest = {
    schema_version: "coarse-pyramid.v1",
    generator: "scripts/build-coarse-pyramid.js",
    generated_at: generatedAt,
    build_id: mainManifest.build_id,
    source_schema_version: mainManifest.schema_version,
    source_manifest_file: "manifest.json",
    grid_size_m: mainManifest.grid_size_m,
    grid_size_ft: mainManifest.grid_size_ft,
    source_superchunk_size: mainManifest.superchunk_size,
    tile_addressing: "tile_ix=floor(coarse_ix/(bin_size*tile_bins))",
    cell_addressing: "ix,iy are fine-grid anchors for the coarse cell",
    display_metric_semantics:
      "count/species/genera/observers/n_captive are mean per occupied fine square; total_count and unique_served_taxa carry summary totals.",
    summary_fields: [
      "total_count",
      "unique_served_taxa",
      "top_taxa",
      "top_observers",
      "iconic_counts",
      "month_totals",
      "last_observed",
      "median_last10_observed",
      "served_rank_counts",
      "policy_action_counts",
      "playable_group_counts"
    ],
    levels: []
  };

  for (const binSize of levels) {
    const level = await buildLevel({
      binSize,
      stageDir,
      pyramidDir,
      manifest: mainManifest,
      options
    });
    pyramidManifest.levels.push(level);
  }

  pyramidManifest.levels.sort((a, b) => a.bin_size - b.bin_size);
  writeJson(path.join(pyramidDir, "manifest.json"), pyramidManifest, { pretty: true });
  writeCsv(path.join(pyramidDir, "summary.csv"), pyramidManifest.levels, [
    "bin_size",
    "aggregation",
    "tile_bins",
    "tile_fine_cells",
    "n_cells",
    "n_tiles",
    "total_observation_count",
    "total_tile_bytes",
    "total_tile_gzip_bytes",
    "average_tile_bytes",
    "average_tile_gzip_bytes",
    "largest_tile_bytes",
    "largest_tile_file"
  ]);

  if (!args["no-update-manifest"]) {
    updateMainManifest(assetDir, mainManifest, pyramidManifest);
    updateValidation(assetDir, pyramidManifest);
  }

  console.log(
    JSON.stringify(
      {
        build_id: mainManifest.build_id,
        assetDir,
        stageDir,
        coarsePyramidManifest: path.join(pyramidDir, "manifest.json"),
        levels: pyramidManifest.levels.map((level) => ({
          bin_size: level.bin_size,
          n_cells: level.n_cells,
          n_tiles: level.n_tiles,
          total_tile_gzip_bytes: level.total_tile_gzip_bytes,
          largest_tile_file: level.largest_tile_file
        }))
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
