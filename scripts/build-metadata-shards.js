#!/usr/bin/env node

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const zlib = require("node:zlib");

const DEFAULT_WORLD_DIR = "C:\\Users\\ad1470\\Desktop\\gridwild\\world";
const DEFAULT_PRODUCT = "dc_va_hybrid_served_v002";
const DEFAULT_SHARD_SIZE = 1024;

function parseArgs(argv = process.argv) {
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

function boolArg(args, key, fallback = false) {
  if (!Object.prototype.hasOwnProperty.call(args, key)) return fallback;
  const value = args[key];
  if (value === true) return true;
  return !["0", "false", "no", "off"].includes(String(value).toLowerCase());
}

function normalizeAssetPath(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

function relativeAssetPath(assetDir, file) {
  const relative = path.relative(path.resolve(assetDir), path.resolve(file));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return normalizeAssetPath(relative);
}

function joinAssetPath(...parts) {
  return normalizeAssetPath(parts.filter(Boolean).join("/"));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function readJsonIfExists(file) {
  try {
    return JSON.parse(await fsp.readFile(file, "utf8"));
  } catch {
    return null;
  }
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

async function* readCsvRowsStream(file) {
  let header = null;
  let carry = "";

  async function* emitLine(rawLine) {
    const line = rawLine.replace(/\r$/, "");
    if (!line.trim()) return;

    if (!header) {
      header = parseCsvLine(line).map((name) => name.trim());
      return;
    }

    const fields = parseCsvLine(line);
    const row = {};
    header.forEach((name, index) => {
      row[name] = fields[index] ?? "";
    });
    yield row;
  }

  const stream = fs.createReadStream(file, { encoding: "utf8", highWaterMark: 1024 * 1024 });
  for await (const chunk of stream) {
    carry += chunk;
    const lines = carry.split("\n");
    carry = lines.pop() || "";
    for (const rawLine of lines) {
      yield* emitLine(rawLine);
    }
  }

  if (carry) yield* emitLine(carry);
}

async function readCsv(file) {
  const rows = [];
  for await (const row of readCsvRowsStream(file)) rows.push(row);
  return rows;
}

function superKeyForValues(superIx, superIy) {
  return `${int(superIx)}_${int(superIy)}`;
}

function superKeyForRow(row) {
  return superKeyForValues(row.super_ix, row.super_iy);
}

function parseSuperKey(key) {
  const [superIx, superIy] = String(key).split("_").map(Number);
  return { superIx, superIy };
}

function compareSuperKeys(a, b) {
  const left = parseSuperKey(a);
  const right = parseSuperKey(b);
  return left.superIx - right.superIx || left.superIy - right.superIy;
}

class CsvSuperGroupCursor {
  constructor(file) {
    this.iterator = readCsvRowsStream(file)[Symbol.asyncIterator]();
    this.pendingRow = null;
    this.pendingGroup = null;
    this.done = false;
  }

  async readNextGroup() {
    if (this.done) return null;
    let firstRow = this.pendingRow;
    this.pendingRow = null;
    if (!firstRow) {
      const next = await this.iterator.next();
      if (next.done) {
        this.done = true;
        return null;
      }
      firstRow = next.value;
    }

    const key = superKeyForRow(firstRow);
    const rows = [firstRow];
    while (true) {
      const next = await this.iterator.next();
      if (next.done) {
        this.done = true;
        break;
      }
      const rowKey = superKeyForRow(next.value);
      if (rowKey !== key) {
        this.pendingRow = next.value;
        break;
      }
      rows.push(next.value);
    }
    return { key, rows };
  }

  async groupFor(targetKey) {
    if (!this.pendingGroup) this.pendingGroup = await this.readNextGroup();
    while (this.pendingGroup && compareSuperKeys(this.pendingGroup.key, targetKey) < 0) {
      this.pendingGroup = await this.readNextGroup();
    }
    if (!this.pendingGroup || this.pendingGroup.key !== targetKey) return [];
    const rows = this.pendingGroup.rows;
    this.pendingGroup = null;
    return rows;
  }
}

function groupBySquare(rows) {
  const out = new Map();
  for (const row of rows) {
    const key = `${int(row.ix)},${int(row.iy)}`;
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(row);
  }
  return out;
}

function dictionaryId(map, rows, key, value) {
  if (!key) return 0;
  if (map.has(key)) return map.get(key);
  const id = rows.length + 1;
  map.set(key, id);
  rows.push({ id, ...value });
  return id;
}

function makeDateDictionary() {
  const map = new Map([["", 0]]);
  const rows = [{ id: 0, date: "" }];
  return {
    id(date) {
      const key = String(date || "");
      if (map.has(key)) return map.get(key);
      const id = rows.length;
      map.set(key, id);
      rows.push({ id, date: key });
      return id;
    },
    rows
  };
}

function makeDictionaries() {
  const groupsByKey = new Map();
  const iconicByKey = new Map();
  const taxaByKey = new Map();
  const groupRows = [];
  const iconicRows = [];
  const taxonRows = [];

  return {
    groupId(row) {
      const key = row.playable_group_key || "unmapped";
      return dictionaryId(groupsByKey, groupRows, key, {
        key,
        name: row.playable_group_name || "Unmapped Taxa"
      });
    },
    iconicId(row) {
      const key = row.iconic_taxon_name || "Unknown";
      return dictionaryId(iconicByKey, iconicRows, key, { name: key });
    },
    taxonId(row) {
      const groupId = this.groupId(row);
      const iconicId = this.iconicId(row);
      const key = [
        row.served_taxon_key || "",
        row.served_rank || "",
        row.served_display_name || "",
        row.playable_group_key || ""
      ].join("|");
      return dictionaryId(taxaByKey, taxonRows, key, {
        served_taxon_key: row.served_taxon_key || "",
        served_rank: row.served_rank || "taxon",
        served_display_name: row.served_display_name || row.genus_name || "Unknown",
        playable_group_id: groupId,
        playable_group_key: row.playable_group_key || "unmapped",
        iconic_id: iconicId,
        iconic_taxon_name: row.iconic_taxon_name || "Unknown",
        order_name: row.order_name || "",
        family_name: row.family_name || "",
        genus_name: row.genus_name || "",
        policy_action: row.policy_action || "",
        original_policy_action: row.original_policy_action || "",
        policy_match_rank: row.policy_match_rank || "",
        playability_score:
          row.playability_score === "" ? null : numberValue(row.playability_score, null),
        reason_codes: String(row.reason_codes || "")
          .split("|")
          .map((item) => item.trim())
          .filter(Boolean)
      });
    },
    groupRows,
    iconicRows,
    taxonRows
  };
}

function monthCounts(row) {
  return Array.from({ length: 12 }, (_, index) =>
    int(row[`m${String(index + 1).padStart(2, "0")}`])
  );
}

function compactTaxonRow(row, dictionaries, dates) {
  return [
    dictionaries.taxonId(row),
    int(row.count),
    int(row.raw_taxa_count, 1),
    dates.id(row.last_observed),
    dates.id(row.median_last10_observed),
    monthCounts(row)
  ];
}

function compactObserverRow(row) {
  return [int(row.observer_id), int(row.count), int(row.species)];
}

function buildGroupCounts(taxonRows, dictionaries) {
  const counts = new Map();
  for (const row of taxonRows) {
    const groupId = dictionaries.groupId(row);
    counts.set(groupId, (counts.get(groupId) || 0) + int(row.count));
  }
  return Array.from(counts.entries()).sort((a, b) => a[0] - b[0]);
}

function buildShardPayload({
  superRow,
  squareRows,
  taxaBySquare,
  observersBySquare,
  dictionaries,
  dates,
  options
}) {
  const superIx = int(superRow.super_ix);
  const superIy = int(superRow.super_iy);
  const cells = [];
  const bbox = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY
  ];

  for (const square of squareRows) {
    const ix = int(square.ix);
    const iy = int(square.iy);
    bbox[0] = Math.min(bbox[0], ix);
    bbox[1] = Math.min(bbox[1], iy);
    bbox[2] = Math.max(bbox[2], ix);
    bbox[3] = Math.max(bbox[3], iy);

    const squareKey = `${ix},${iy}`;
    const taxonRows = taxaBySquare.get(squareKey) || [];
    const taxa = taxonRows.map((row) => compactTaxonRow(row, dictionaries, dates));
    const groups = buildGroupCounts(taxonRows, dictionaries);
    const observers = options.includeObservers
      ? (observersBySquare.get(squareKey) || []).map(compactObserverRow)
      : [];

    cells.push([
      ix,
      iy,
      int(square.count),
      int(square.n_genera),
      int(square.n_observers),
      int(square.n_captive),
      dates.id(square.last_observed),
      dates.id(square.median_last10_observed),
      groups,
      taxa,
      observers
    ]);
  }

  return {
    v: 1,
    schema: "gridwild.metadata-shard.v1",
    shard: `meta_${superIx}_${superIy}`,
    sx: superIx,
    sy: superIy,
    span: options.shardSize,
    bbox_grid: bbox[0] === Number.POSITIVE_INFINITY ? null : bbox,
    cells
  };
}

async function writeShard(outDir, shard, payload, keepJson) {
  const json = `${JSON.stringify(payload)}\n`;
  const gzip = zlib.gzipSync(Buffer.from(json), { level: 9 });
  const file = normalizeAssetPath(`shards/${shard}.json.gz`);
  const gzipPath = path.join(outDir, file);
  await fsp.mkdir(path.dirname(gzipPath), { recursive: true });
  await fsp.writeFile(gzipPath, gzip);
  if (keepJson) {
    await fsp.writeFile(path.join(outDir, normalizeAssetPath(`shards/${shard}.json`)), json);
  }
  return {
    shard,
    file,
    sx: payload.sx,
    sy: payload.sy,
    span: payload.span,
    json_bytes: Buffer.byteLength(json),
    gzip_bytes: gzip.length,
    cells: payload.cells.length,
    bbox_grid: payload.bbox_grid
  };
}

function makeFilterDictionary(groupRows) {
  const byKey = new Map(groupRows.map((row) => [row.key, row.id]));
  const group = (key) => byKey.get(key);
  const filters = [
    { id: "birds", label: "Birds", group_keys: ["birds"] },
    {
      id: "insects",
      label: "Insects",
      group_keys: ["beetles", "flies", "hymenoptera", "odonata", "butterflies", "moths"]
    },
    {
      id: "plants",
      label: "Plants",
      group_keys: ["trees", "wildflowers", "grasses-sedges-rushes", "ferns", "mosses-liverworts"]
    },
    { id: "fungi", label: "Fungi", group_keys: ["fungi", "lichens"] }
  ];
  return filters
    .map((filter) => ({
      ...filter,
      group_ids: filter.group_keys.map(group).filter((value) => value > 0)
    }))
    .filter((filter) => filter.group_ids.length);
}

async function main() {
  const args = parseArgs();
  const worldDir = path.resolve(args["world-dir"] || DEFAULT_WORLD_DIR);
  const product = String(args.product || DEFAULT_PRODUCT);
  const stageDir = path.resolve(args["stage-dir"] || path.join(worldDir, "gold_stage", product));
  const assetDir = path.resolve(args["asset-dir"] || path.join(worldDir, "gold", product));
  const outDir = path.resolve(args["out-dir"] || path.join(assetDir, "metadata"));
  const limitSuperchunks = Math.max(0, int(args["limit-superchunks"]));
  const keepJson = boolArg(args, "keep-json", false);
  const includeObservers = !boolArg(args, "no-observers", false);
  const updateManifest = !boolArg(args, "no-update-manifest", false);
  const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const required = ["superchunks.csv", "square_summary.csv", "square_taxa.csv"];
  if (includeObservers) required.push("square_observers.csv");
  for (const file of required) {
    const absolute = path.join(stageDir, file);
    if (!fs.existsSync(absolute)) throw new Error(`Missing required stage file: ${absolute}`);
  }

  ensureDir(outDir);
  const manifest = await readJsonIfExists(path.join(assetDir, "manifest.json"));
  const sourceSuperchunkSize = int(manifest?.superchunk_size, DEFAULT_SHARD_SIZE);
  const shardSize = int(args["shard-size"], sourceSuperchunkSize);
  if (shardSize !== sourceSuperchunkSize) {
    throw new Error(
      `This pilot builder writes one metadata shard per source superchunk. ` +
        `Use --shard-size ${sourceSuperchunkSize} for this product, or add a second-stage packer to merge shards.`
    );
  }
  const superRows = await readCsv(path.join(stageDir, "superchunks.csv"));
  const squareCursor = new CsvSuperGroupCursor(path.join(stageDir, "square_summary.csv"));
  const taxaCursor = new CsvSuperGroupCursor(path.join(stageDir, "square_taxa.csv"));
  const observerCursor = includeObservers
    ? new CsvSuperGroupCursor(path.join(stageDir, "square_observers.csv"))
    : null;
  const dictionaries = makeDictionaries();
  const dates = makeDateDictionary();
  const shards = [];
  const stats = {
    shard_count: 0,
    cell_count: 0,
    cell_taxon_records: 0,
    cell_observer_records: 0,
    json_bytes: 0,
    gzip_bytes: 0,
    largest_json_bytes: 0,
    largest_gzip_bytes: 0,
    largest_shard: null
  };

  const selectedSuperRows = limitSuperchunks ? superRows.slice(0, limitSuperchunks) : superRows;
  for (const superRow of selectedSuperRows) {
    const targetKey = superKeyForValues(superRow.super_ix, superRow.super_iy);
    const squareRows = await squareCursor.groupFor(targetKey);
    const taxonRows = await taxaCursor.groupFor(targetKey);
    const observerRows = observerCursor ? await observerCursor.groupFor(targetKey) : [];
    const payload = buildShardPayload({
      superRow,
      squareRows,
      taxaBySquare: groupBySquare(taxonRows),
      observersBySquare: groupBySquare(observerRows),
      dictionaries,
      dates,
      options: { includeObservers, shardSize }
    });
    const shard = await writeShard(outDir, payload.shard, payload, keepJson);
    shards.push(shard);

    stats.shard_count += 1;
    stats.cell_count += squareRows.length;
    stats.cell_taxon_records += taxonRows.length;
    stats.cell_observer_records += observerRows.length;
    stats.json_bytes += shard.json_bytes;
    stats.gzip_bytes += shard.gzip_bytes;
    if (shard.json_bytes > stats.largest_json_bytes) stats.largest_json_bytes = shard.json_bytes;
    if (shard.gzip_bytes > stats.largest_gzip_bytes) {
      stats.largest_gzip_bytes = shard.gzip_bytes;
      stats.largest_shard = shard.file;
    }

    if (stats.shard_count % 250 === 0) {
      console.log(
        `Processed ${stats.shard_count}/${selectedSuperRows.length} metadata shards; gzip=${stats.gzip_bytes}`
      );
    }
  }

  const dictionaryPayload = {
    schema_version: "gridwild.metadata-dictionaries.v1",
    generated_at: generatedAt,
    product,
    source_stage_dir: stageDir,
    groups: dictionaries.groupRows,
    iconic_groups: dictionaries.iconicRows,
    taxa: dictionaries.taxonRows,
    dates: dates.rows,
    filters: makeFilterDictionary(dictionaries.groupRows)
  };
  const dictionariesPath = path.join(outDir, "metadata_dictionaries.json");
  await writeJson(dictionariesPath, dictionaryPayload);

  const relativeOutDir = relativeAssetPath(assetDir, outDir);
  const publicFile = (file) => (relativeOutDir ? joinAssetPath(relativeOutDir, file) : file);
  const publicShards = shards.map((shard) => ({
    ...shard,
    file: publicFile(shard.file)
  }));
  const publicStats = {
    ...stats,
    largest_shard: stats.largest_shard ? publicFile(stats.largest_shard) : null
  };

  const shardManifest = {
    schema_version: "gridwild.metadata-shards.v1",
    generated_at: generatedAt,
    product,
    source_stage_dir: stageDir,
    source_asset_dir: assetDir,
    source_build_id: manifest?.build_id || null,
    source_schema_version: manifest?.schema_version || null,
    source_taxonomy_policy: manifest?.taxonomy_policy || null,
    shard_size: shardSize,
    source_superchunk_size: sourceSuperchunkSize,
    shard_payload: "compact-json-gzip",
    include_observers: includeObservers,
    keep_json: keepJson,
    dictionaries_file: publicFile("metadata_dictionaries.json"),
    shards_dir: publicFile("shards"),
    cell_schema: [
      "ix",
      "iy",
      "count",
      "n_served_taxa",
      "n_observers",
      "n_captive",
      "last_observed_date_id",
      "median_last10_observed_date_id",
      "group_counts",
      "taxa",
      "observers"
    ],
    group_count_schema: ["group_id", "count"],
    taxon_schema: [
      "taxon_id",
      "count",
      "raw_taxa_count",
      "last_observed_date_id",
      "median_last10_observed_date_id",
      "month_counts"
    ],
    observer_schema: ["observer_id", "count", "served_taxa"],
    stats: {
      ...publicStats,
      average_json_bytes: publicStats.shard_count
        ? Math.round(publicStats.json_bytes / publicStats.shard_count)
        : 0,
      average_gzip_bytes: publicStats.shard_count
        ? Math.round(publicStats.gzip_bytes / publicStats.shard_count)
        : 0,
      dictionary_counts: {
        groups: dictionaries.groupRows.length,
        iconic_groups: dictionaries.iconicRows.length,
        taxa: dictionaries.taxonRows.length,
        dates: dates.rows.length,
        filters: dictionaryPayload.filters.length
      },
      source_superchunk_size_metrics: manifest?.size_metrics || null
    },
    shards: publicShards
  };
  const shardManifestPath = path.join(outDir, "metadata_manifest.json");
  await writeJson(shardManifestPath, shardManifest);

  const relativeManifestFile = relativeAssetPath(assetDir, shardManifestPath);
  const relativeDictionaryFile = relativeAssetPath(assetDir, dictionariesPath);
  if (updateManifest && manifest && relativeManifestFile && relativeDictionaryFile) {
    manifest.metadata_shard_manifest_file = relativeManifestFile;
    manifest.metadata_shard_dictionary_file = relativeDictionaryFile;
    manifest.metadata_shard_mode = "json_gzip_spatial_shards";
    manifest.metadata_shard_payload = "compact_served_taxon_cells";
    manifest.metadata_shard_count = stats.shard_count;
    manifest.metadata_shard_total_gzip_bytes = stats.gzip_bytes;
    manifest.metadata_shard_largest_gzip_bytes = stats.largest_gzip_bytes;
    manifest.metadata_shard_dictionary_counts = shardManifest.stats.dictionary_counts;
    await writeJson(path.join(assetDir, "manifest.json"), manifest);
  }

  console.log(
    JSON.stringify(
      {
        outDir,
        product,
        shards: stats.shard_count,
        cells: stats.cell_count,
        cellTaxonRecords: stats.cell_taxon_records,
        gzipBytes: stats.gzip_bytes,
        averageGzipBytes: shardManifest.stats.average_gzip_bytes,
        largestGzipBytes: stats.largest_gzip_bytes,
        largestShard: publicStats.largest_shard,
        dictionaries: shardManifest.stats.dictionary_counts,
        oldSuperchunkGzipBytes: manifest?.size_metrics?.total_superchunk_gzip_bytes || null,
        manifestUpdated: Boolean(updateManifest && relativeManifestFile && relativeDictionaryFile)
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
