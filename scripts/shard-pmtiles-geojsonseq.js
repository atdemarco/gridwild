#!/usr/bin/env node

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const readline = require("readline");

const DEFAULT_SHARD_CELL_SPAN = 16384;
const DEFAULT_MIN_ZOOM = 0;
const DEFAULT_MAX_ZOOM = 19;
const DEFAULT_LAYER = "gridwild_cells";

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

function normalizeAssetPath(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
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

async function refreshShardSizes(assetDir, manifest) {
  const shardManifestFile = manifest.pmtiles_shard_manifest_file || "pmtiles/shards_manifest.json";
  const shardManifestPath = path.join(assetDir, normalizeAssetPath(shardManifestFile));
  const shardManifest = await readJson(shardManifestPath);
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
  await writeJson(shardManifestPath, shardManifest);

  return {
    shard_manifest: shardManifestPath,
    present,
    expected: shardManifest.shards?.length || 0,
    totalBytes,
    largestBytes
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

async function findInputGeojsonSeq(assetDir, manifest, explicitInput) {
  if (explicitInput) return path.resolve(explicitInput);
  if (manifest.pmtiles_source_geojsonseq) {
    return path.join(assetDir, normalizeAssetPath(manifest.pmtiles_source_geojsonseq));
  }

  const pmtilesDir = path.join(assetDir, "pmtiles");
  const entries = await fsp.readdir(pmtilesDir, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile() && /_served_cells\.geojsonseq$/i.test(entry.name))
    .map((entry) => path.join(pmtilesDir, entry.name))
    .sort();

  if (candidates.length === 1) return candidates[0];
  if (!candidates.length) {
    throw new Error(
      `Could not find *_served_cells.geojsonseq under ${pmtilesDir}. Pass --input explicitly.`
    );
  }
  throw new Error(
    `Found multiple served-cell GeoJSONSeq files under ${pmtilesDir}. Pass --input explicitly:\n${candidates.join("\n")}`
  );
}

function emptyStats(id, sx, sy, geojsonseqFile, pmtilesFile) {
  return {
    id,
    sx,
    sy,
    geojsonseq_file: geojsonseqFile,
    file: pmtilesFile,
    feature_count: 0,
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

function updateBoundsFromFeature(stats, feature) {
  const rings = feature?.geometry?.coordinates || [];
  for (const ring of rings) {
    for (const point of ring || []) {
      const lng = Number(point?.[0]);
      const lat = Number(point?.[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      stats.west = Math.min(stats.west, lng);
      stats.east = Math.max(stats.east, lng);
      stats.south = Math.min(stats.south, lat);
      stats.north = Math.max(stats.north, lat);
    }
  }
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

async function main() {
  const args = parseArgs(process.argv);
  const assetDir = path.resolve(args["asset-dir"] || process.env.GRIDWILD_ASSET_DIR || "");
  if (!assetDir || assetDir === path.parse(assetDir).root) {
    throw new Error("Pass --asset-dir or set GRIDWILD_ASSET_DIR.");
  }

  const manifestPath = path.join(assetDir, "manifest.json");
  const manifest = await readJson(manifestPath);
  if (args["refresh-sizes"]) {
    console.log(JSON.stringify(await refreshShardSizes(assetDir, manifest), null, 2));
    return;
  }

  const region = args.region || manifest.region || "region";
  const version = args.version || manifest.region_version || "served";
  const layer = args.layer || manifest.pmtiles_layer || DEFAULT_LAYER;
  const shardCellSpan = int(args["shard-cell-span"], DEFAULT_SHARD_CELL_SPAN);
  const minZoom = int(args["minimum-zoom"], DEFAULT_MIN_ZOOM);
  const maxZoom = int(args["maximum-zoom"], DEFAULT_MAX_ZOOM);
  const updateManifest = args["no-update-manifest"] !== true;

  if (!(shardCellSpan > 0)) throw new Error("--shard-cell-span must be positive.");

  const inputPath = ensureWithin(
    assetDir,
    await findInputGeojsonSeq(assetDir, manifest, args.input)
  );
  const shardRoot = ensureWithin(assetDir, path.join(assetDir, "pmtiles", "shards"));
  const geojsonseqDir = ensureWithin(shardRoot, path.join(shardRoot, "geojsonseq"));
  await fsp.mkdir(geojsonseqDir, { recursive: true });

  const writers = new Map();
  const shardStats = new Map();
  let totalFeatures = 0;
  let malformedLines = 0;

  function shardForFeature(feature) {
    const ix = int(feature?.properties?.ix, NaN);
    const iy = int(feature?.properties?.iy, NaN);
    if (!Number.isFinite(ix) || !Number.isFinite(iy)) return null;

    const sx = Math.floor(ix / shardCellSpan);
    const sy = Math.floor(iy / shardCellSpan);
    const id = `shard_${sx}_${sy}`;
    const base = `gridwild_${region}_${version}_${id}`;
    const geojsonseqFile = normalizeAssetPath(`pmtiles/shards/geojsonseq/${base}.geojsonseq`);
    const pmtilesFile = normalizeAssetPath(`pmtiles/shards/${base}.pmtiles`);

    let stats = shardStats.get(id);
    if (!stats) {
      stats = emptyStats(id, sx, sy, geojsonseqFile, pmtilesFile);
      shardStats.set(id, stats);
    }

    stats.feature_count += 1;
    stats.ix_min = Math.min(stats.ix_min, ix);
    stats.ix_max = Math.max(stats.ix_max, ix);
    stats.iy_min = Math.min(stats.iy_min, iy);
    stats.iy_max = Math.max(stats.iy_max, iy);
    updateBoundsFromFeature(stats, feature);
    return stats;
  }

  function writerFor(stats) {
    let writer = writers.get(stats.id);
    if (writer) return writer;

    const absolute = ensureWithin(assetDir, path.join(assetDir, stats.geojsonseq_file));
    writer = fs.createWriteStream(absolute, { flags: "w" });
    writers.set(stats.id, writer);
    return writer;
  }

  console.log(`Sharding PMTiles GeoJSONSeq`);
  console.log(`Asset dir: ${assetDir}`);
  console.log(`Input: ${inputPath}`);
  console.log(`Shard cell span: ${shardCellSpan}`);

  const input = fs.createReadStream(inputPath, { encoding: "utf8", highWaterMark: 1024 * 1024 });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let feature;
    try {
      feature = JSON.parse(line);
    } catch {
      malformedLines += 1;
      continue;
    }

    const stats = shardForFeature(feature);
    if (!stats) {
      malformedLines += 1;
      continue;
    }

    writerFor(stats).write(`${line}\n`);
    totalFeatures += 1;
    if (totalFeatures % 250000 === 0) {
      console.log(`Sharded ${totalFeatures.toLocaleString()} features...`);
    }
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

  for (const stats of shardStats.values()) {
    const geojsonseqPath = path.join(assetDir, stats.geojsonseq_file);
    stats.geojsonseq_bytes = (await fsp.stat(geojsonseqPath)).size;
    const pmtilesPath = path.join(assetDir, stats.file);
    try {
      stats.pmtiles_bytes = (await fsp.stat(pmtilesPath)).size;
    } catch {
      stats.pmtiles_bytes = 0;
    }
  }

  const shards = Array.from(shardStats.values())
    .sort((a, b) => a.sx - b.sx || a.sy - b.sy)
    .map(publicShard);

  const shardManifestPath = path.join(assetDir, "pmtiles", "shards_manifest.json");
  const shardManifest = {
    schema_version: "gridwild.pmtiles-shards.v1",
    build_id: manifest.build_id || null,
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    source_geojsonseq_file: normalizeAssetPath(path.relative(assetDir, inputPath)),
    shard_strategy: "grid_cell_span",
    shard_cell_span: shardCellSpan,
    layer,
    payload: manifest.pmtiles_payload || "visual_metrics_only",
    minimum_zoom: minZoom,
    maximum_zoom: maxZoom,
    shard_count: shards.length,
    feature_count: totalFeatures,
    malformed_lines: malformedLines,
    shards
  };
  await writeJson(shardManifestPath, shardManifest);

  const bashPath = path.join(assetDir, "pmtiles", "build-shard-pmtiles.sh");
  const bashLines = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `echo "Building ${shards.length} PMTiles shards..."`,
    ...shards.map((shard) => {
      const input = windowsPathToWslPath(path.join(assetDir, shard.geojsonseq_file));
      const output = windowsPathToWslPath(path.join(assetDir, shard.file));
      const quotedInput = quoteShell(input);
      const quotedOutput = quoteShell(output);
      const command = [
        "tippecanoe",
        `-o ${quotedOutput}`,
        "--force",
        `--minimum-zoom=${minZoom}`,
        `--maximum-zoom=${maxZoom}`,
        "--projection=EPSG:4326",
        `--layer=${quoteShell(layer)}`,
        "--no-feature-limit",
        "--no-tile-size-limit",
        quotedInput
      ].join(" ");
      return `if [[ -s ${quotedOutput} && ${quotedOutput} -nt ${quotedInput} ]]; then echo "Skipping ${shard.id}"; else ${command}; fi`;
    }),
    "echo \"Done.\""
  ];
  await fsp.writeFile(bashPath, `${bashLines.join("\n")}\n`);

  const psPath = path.join(assetDir, "pmtiles", "build-shard-pmtiles.ps1");
  const psLines = [
    "$ErrorActionPreference = \"Stop\"",
    `$script = ${JSON.stringify(windowsPathToWslPath(bashPath))}`,
    "wsl.exe -e bash $script"
  ];
  await fsp.writeFile(psPath, `${psLines.join("\r\n")}\r\n`);

  if (updateManifest) {
    if (manifest.pmtiles_file && !manifest.pmtiles_file_legacy) {
      manifest.pmtiles_file_legacy = manifest.pmtiles_file;
    }
    manifest.pmtiles_file = null;
    manifest.pmtiles_mode = "spatial_shards";
    manifest.pmtiles_shard_manifest_file = "pmtiles/shards_manifest.json";
    manifest.pmtiles_shard_count = shards.length;
    manifest.pmtiles_source_geojsonseq = normalizeAssetPath(path.relative(assetDir, inputPath));
    manifest.pmtiles_sharding = {
      schema_version: shardManifest.schema_version,
      shard_strategy: shardManifest.shard_strategy,
      shard_cell_span: shardCellSpan,
      shard_count: shards.length
    };
    await writeJson(manifestPath, manifest);
  }

  console.log(
    JSON.stringify(
      {
        build_id: manifest.build_id,
        input: inputPath,
        shard_manifest: shardManifestPath,
        shards: shards.length,
        features: totalFeatures,
        malformedLines,
        largestGeojsonSeqBytes: Math.max(...shards.map((shard) => shard.geojsonseq_bytes)),
        buildScript: psPath,
        manifestUpdated: updateManifest
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("PMTiles sharding failed.");
  console.error(error);
  process.exitCode = 1;
});
