#!/usr/bin/env node

try {
  require("dotenv").config({ quiet: true });
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
}

const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");

const DEFAULT_BUCKET = "gridwild-assets";
const DEFAULT_PUBLIC_BASE = "https://assets.gridwild.com";
const DEFAULT_REGION = "mid_atlantic_broad";
const DEFAULT_DOWNLOAD_THREADS = 8;
const DEFAULT_OVERFETCH = 0.08;
const DEFAULT_MAXZOOM = 15;
const DEFAULT_CURRENT_KEY = "osm/protomaps/shards/current.json";
const CACHE_CONTROL_IMMUTABLE = "public, max-age=31536000, immutable";
const CACHE_CONTROL_POINTER = "public, max-age=300, must-revalidate";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;

    const equalsIndex = token.indexOf("=");
    if (equalsIndex > 2) {
      args[token.slice(2, equalsIndex)] = token.slice(equalsIndex + 1);
      continue;
    }

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

function yyyymmdd(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function safeSlug(value) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 90);
}

function safeFileName(value) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

function normalizeRemotePath(...parts) {
  return parts
    .filter(Boolean)
    .map((part) =>
      String(part)
        .replace(/\\/g, "/")
        .replace(/^\/+|\/+$/g, "")
    )
    .filter(Boolean)
    .join("/");
}

function normalizePublicBase(value) {
  return String(value || DEFAULT_PUBLIC_BASE).replace(/\/+$/, "");
}

function int(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function numberValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolValue(value, fallback = false) {
  if (value == null || value === "") return fallback;
  if (value === true || value === false) return value;
  return !["0", "false", "no", "off"].includes(String(value).trim().toLowerCase());
}

function parseBbox(value) {
  const bbox = Array.isArray(value)
    ? value.map(Number)
    : String(value || "")
        .split(",")
        .map((part) => Number(part.trim()));

  if (
    bbox.length !== 4 ||
    bbox.some((part) => !Number.isFinite(part)) ||
    bbox[0] >= bbox[2] ||
    bbox[1] >= bbox[3]
  ) {
    throw new Error("BBox must be MIN_LON,MIN_LAT,MAX_LON,MAX_LAT.");
  }

  return bbox;
}

function bboxToBounds(bbox) {
  return [
    [bbox[1], bbox[0]],
    [bbox[3], bbox[2]]
  ];
}

function bboxArea(bbox) {
  return Math.max(0, bbox[2] - bbox[0]) * Math.max(0, bbox[3] - bbox[1]);
}

function defaultOutRoot() {
  const home = process.env.USERPROFILE || process.env.HOME || process.cwd();
  return path.join(home, "Desktop", "gridwild", "osm", "basemaps");
}

async function fileExists(file) {
  try {
    const stat = await fs.stat(file);
    return stat.isFile();
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function pathCandidates(command) {
  const hasPath = command.includes("/") || command.includes("\\") || /^[A-Za-z]:/.test(command);
  const extensions =
    process.platform === "win32"
      ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
      : [""];

  if (hasPath) {
    if (path.extname(command) || process.platform !== "win32") return [command];
    return extensions.map((extension) => `${command}${extension.toLowerCase()}`);
  }

  const dirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const names =
    process.platform === "win32" && !path.extname(command)
      ? [command, ...extensions.map((extension) => `${command}${extension.toLowerCase()}`)]
      : [command];
  return dirs.flatMap((dir) => names.map((name) => path.join(dir, name)));
}

async function resolveExecutable(command) {
  for (const candidate of pathCandidates(command)) {
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

function displayArg(value) {
  const text = String(value);
  if (!text || /[\s&?'"()]/.test(text)) {
    return `"${text.replace(/"/g, '\\"')}"`;
  }
  return text;
}

function displayCommand(command, args) {
  return [command, ...args].map(displayArg).join(" ");
}

function runCommand(command, args, options = {}) {
  const env = options.env || process.env;
  const capture = Boolean(options.capture);
  console.log(`> ${displayCommand(command, args)}`);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      shell: false,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit"
    });

    let stdout = "";
    let stderr = "";
    if (capture) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const detail = capture && stderr.trim() ? `\n${stderr.trim()}` : "";
      reject(
        new Error(
          `Command failed with exit code ${code}: ${displayCommand(command, args)}${detail}`
        )
      );
    });
  });
}

function parseJsonOutput(label, value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return { raw: trimmed, parse_error: `Could not parse ${label} as JSON.` };
  }
}

function getSource(args, config) {
  const source =
    args.source ||
    args["source-file"] ||
    args["source-url"] ||
    config.source ||
    process.env.GRIDWILD_OSM_BASEMAP_SOURCE ||
    process.env.GRIDWILD_OSM_BASEMAP_SOURCE_FILE ||
    process.env.GRIDWILD_OSM_BASEMAP_SOURCE_URL;
  if (!source) return null;
  if (/^https?:\/\//i.test(source) || /^[a-z]+:\/\//i.test(source)) {
    return { kind: "url", value: source };
  }
  return { kind: "file", value: path.resolve(source) };
}

function normalizeShard(shard, index, plan) {
  const id = safeSlug(shard.id || shard.name || `shard_${index + 1}`);
  if (!id) throw new Error(`Shard ${index + 1} is missing an id.`);

  const bbox = parseBbox(shard.bbox);
  const maxzoom = int(shard.maxzoom || plan.maxzoom, plan.maxzoom);
  const minzoom = int(shard.minzoom || 0, 0);
  const overfetch = numberValue(shard.overfetch || plan.overfetch, plan.overfetch);
  const archiveName = safeFileName(
    shard.archive_name || shard.archiveName || `${plan.buildId}_${id}.pmtiles`
  );
  const relativeFile = normalizeRemotePath("shards", id, archiveName);
  const remoteKey = normalizeRemotePath(plan.remotePrefix, relativeFile);
  const localPath = path.join(plan.outDir, "shards", id, archiveName);

  return {
    id,
    label: shard.label || shard.name || id.replace(/_/g, " "),
    bbox,
    bounds: bboxToBounds(bbox),
    minzoom,
    maxzoom,
    overfetch,
    bbox_area: bboxArea(bbox),
    file: relativeFile,
    local_path: localPath,
    remote_key: remoteKey,
    url: `${plan.publicBase}/${remoteKey}`,
    bytes: 0,
    pmtiles: null
  };
}

function buildPlan(args, config) {
  const buildId = safeSlug(
    args["build-id"] ||
      config.build_id ||
      process.env.GRIDWILD_OSM_BASEMAP_SHARD_BUILD_ID ||
      `gridwild_osm_protomaps_${config.region?.id || DEFAULT_REGION}_shards_v001_${yyyymmdd()}`
  );
  const regionId = safeSlug(args.region || config.region?.id || DEFAULT_REGION);
  const outDir = path.resolve(
    args["out-dir"] ||
      config.out_dir ||
      process.env.GRIDWILD_OSM_BASEMAP_SHARD_DIR ||
      path.join(defaultOutRoot(), regionId, buildId)
  );
  const publicBase = normalizePublicBase(
    args["public-base"] ||
      config.public_base ||
      process.env.GRIDWILD_ASSET_PUBLIC_BASE ||
      DEFAULT_PUBLIC_BASE
  );
  const remotePrefix = normalizeRemotePath(
    args["remote-prefix"] || config.remote_prefix || "osm/protomaps/shards",
    args["remote-prefix"] || config.remote_prefix ? "" : buildId
  );
  const currentKey = normalizeRemotePath(
    args["current-key"] || config.current_key || DEFAULT_CURRENT_KEY
  );
  const bucket =
    args.bucket ||
    config.bucket ||
    process.env.GRIDWILD_R2_BUCKET ||
    process.env.GRIDWILD_STORAGE_BUCKET ||
    DEFAULT_BUCKET;
  const maxzoom = int(args.maxzoom || config.maxzoom, DEFAULT_MAXZOOM);
  const downloadThreads = int(
    args["download-threads"] || config.download_threads,
    DEFAULT_DOWNLOAD_THREADS
  );
  const overfetch = numberValue(args.overfetch || config.overfetch, DEFAULT_OVERFETCH);

  if (!(maxzoom >= 0 && maxzoom <= 30)) throw new Error("--maxzoom must be between 0 and 30.");

  const plan = {
    buildId,
    outDir,
    manifestPath: path.resolve(args["manifest-path"] || path.join(outDir, "manifest.json")),
    publicBase,
    remotePrefix,
    currentKey,
    currentUrl: `${publicBase}/${currentKey}`,
    bucket,
    region: {
      id: regionId,
      label: config.region?.label || regionId.replace(/_/g, " "),
      description: config.region?.description || null
    },
    maxzoom,
    downloadThreads,
    overfetch,
    attribution: config.attribution || [
      {
        text: "OpenStreetMap contributors",
        url: "https://www.openstreetmap.org/copyright"
      },
      {
        text: "Protomaps",
        url: "https://protomaps.com"
      }
    ]
  };

  const only = String(args.only || "")
    .split(",")
    .map((part) => safeSlug(part))
    .filter(Boolean);
  const onlySet = new Set(only);
  const configShards = Array.isArray(config.shards) ? config.shards : [];
  const shards = configShards
    .map((shard, index) => normalizeShard(shard, index, plan))
    .filter((shard) => !onlySet.size || onlySet.has(shard.id));

  if (!shards.length) {
    throw new Error("No shards selected. Add shards to the config or adjust --only.");
  }

  return { ...plan, shards };
}

async function buildWranglerInvoker(args) {
  const requested = args["wrangler-bin"] || process.env.WRANGLER_BIN || "wrangler";
  const wranglerPath = await resolveExecutable(requested);
  if (wranglerPath) {
    return {
      command: wranglerPath,
      prefix: [],
      display: "wrangler",
      env: process.env
    };
  }

  const npmPath = await resolveExecutable(process.platform === "win32" ? "npm.cmd" : "npm");
  if (!npmPath) {
    throw new Error("Could not find wrangler or npm. Install Wrangler or pass --wrangler-bin.");
  }

  const env = { ...process.env };
  if (!env.npm_config_cache) {
    env.npm_config_cache = path.join(process.cwd(), ".npm-cache");
  }

  return {
    command: process.env.ComSpec || "cmd.exe",
    prefix: [
      "/d",
      "/s",
      "/c",
      "call",
      npmPath,
      "exec",
      "--yes",
      "--package",
      "wrangler",
      "--",
      "wrangler"
    ],
    display: "npm exec --package wrangler -- wrangler",
    env
  };
}

async function uploadObject(
  invoker,
  bucket,
  key,
  file,
  contentType,
  cacheControl = CACHE_CONTROL_IMMUTABLE
) {
  await runCommand(
    invoker.command,
    [
      ...invoker.prefix,
      "r2",
      "object",
      "put",
      `${bucket}/${key}`,
      "--remote",
      "--file",
      file,
      "--content-type",
      contentType,
      "--cache-control",
      cacheControl
    ],
    { env: invoker.env }
  );
}

async function shardMetadata(pmtilesPath, pmtilesPathBin) {
  const headerResult = await runCommand(pmtilesPathBin, ["show", pmtilesPath, "--header-json"], {
    capture: true
  });
  const metadataResult = await runCommand(pmtilesPathBin, ["show", pmtilesPath, "--metadata"], {
    capture: true
  });

  return {
    header: parseJsonOutput("PMTiles header", headerResult.stdout),
    metadata: parseJsonOutput("PMTiles metadata", metadataResult.stdout)
  };
}

async function createManifest({ plan, source, pmtilesVersion }) {
  return {
    schema_version: "gridwild.osm-basemap-shards.v1",
    build_id: plan.buildId,
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    product: "osm-basemap",
    provider: "protomaps",
    mode: "spatial_shards",
    source,
    region: plan.region,
    public_base: plan.publicBase,
    manifest: {
      local_path: plan.manifestPath,
      remote_key: normalizeRemotePath(plan.remotePrefix, "manifest.json"),
      url: `${plan.publicBase}/${normalizeRemotePath(plan.remotePrefix, "manifest.json")}`,
      current_key: plan.currentKey,
      current_url: plan.currentUrl
    },
    r2: {
      bucket: plan.bucket,
      remote_prefix: plan.remotePrefix
    },
    defaults: {
      minzoom: 0,
      maxzoom: plan.maxzoom,
      download_threads: plan.downloadThreads,
      overfetch: plan.overfetch
    },
    attribution: plan.attribution,
    license_notes:
      "Protomaps basemap is an OpenStreetMap-derived Produced Work. Show OpenStreetMap attribution wherever the basemap is visible.",
    pmtiles: {
      cli_version: pmtilesVersion
    },
    shard_count: plan.shards.length,
    shards: plan.shards.map((shard) => ({
      id: shard.id,
      label: shard.label,
      bbox: shard.bbox,
      bounds: shard.bounds,
      minzoom: shard.minzoom,
      maxzoom: shard.maxzoom,
      overfetch: shard.overfetch,
      bbox_area: shard.bbox_area,
      file: shard.file,
      url: shard.url,
      bytes: shard.bytes,
      remote_key: shard.remote_key,
      pmtiles: shard.pmtiles
    }))
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const configPath = path.resolve(args.config || "config/osm-basemap-shards.mid-atlantic.json");
  const config = await readJson(configPath);
  const plan = buildPlan(args, config);
  const source = getSource(args, config);
  const dryRun = Boolean(args["dry-run"]);
  const skipExtract = Boolean(args["skip-extract"]);
  const upload = Boolean(args.upload);
  const publishCurrent = boolValue(
    args["publish-current"],
    boolValue(config.publish_current, false)
  );
  const verify = Boolean(args.verify || boolValue(process.env.GRIDWILD_OSM_BASEMAP_VERIFY, false));
  const pmtilesCommand = args["pmtiles-bin"] || process.env.PMTILES_BIN || "pmtiles";
  const pmtilesPath = await resolveExecutable(pmtilesCommand);
  const pmtilesDisplay = pmtilesPath || pmtilesCommand;

  if (!source && !skipExtract) {
    throw new Error(
      "Missing source PMTiles. Pass --source, set config.source, or set GRIDWILD_OSM_BASEMAP_SOURCE."
    );
  }

  console.log("GridWild OSM basemap PMTiles shards");
  console.log(`Config: ${configPath}`);
  console.log(`Build: ${plan.buildId}`);
  console.log(`Region: ${plan.region.label} (${plan.region.id})`);
  console.log(`Shards: ${plan.shards.map((shard) => shard.id).join(", ")}`);
  console.log(`Output: ${plan.outDir}`);
  console.log(`Remote prefix: ${plan.remotePrefix}`);
  console.log(
    `Manifest: ${plan.publicBase}/${normalizeRemotePath(plan.remotePrefix, "manifest.json")}`
  );
  console.log(`Current pointer: ${plan.currentUrl}`);
  console.log(`pmtiles binary: ${pmtilesPath || "not found on PATH"}`);
  if (dryRun) console.log("Dry run: no extraction, file writes, or uploads will be performed.");
  if (skipExtract) console.log("Skipping extraction; using existing local shard archives.");

  for (const shard of plan.shards) {
    const extractArgs = [
      "extract",
      source?.value || "<SOURCE.pmtiles>",
      shard.local_path,
      `--bbox=${shard.bbox.join(",")}`,
      `--maxzoom=${shard.maxzoom}`,
      `--download-threads=${plan.downloadThreads}`,
      `--overfetch=${shard.overfetch}`
    ];
    shard.commands = {
      extract: displayCommand(pmtilesDisplay, extractArgs),
      upload: displayCommand("wrangler", [
        "r2",
        "object",
        "put",
        `${plan.bucket}/${shard.remote_key}`,
        "--remote",
        "--file",
        shard.local_path,
        "--content-type",
        "application/vnd.pmtiles",
        "--cache-control",
        CACHE_CONTROL_IMMUTABLE
      ])
    };

    if (dryRun) {
      console.log(shard.commands.extract);
      console.log(shard.commands.upload);
      continue;
    }

    if (!pmtilesPath) {
      throw new Error(
        "Could not find the pmtiles CLI. Install the Protomaps pmtiles binary or set PMTILES_BIN."
      );
    }

    await fs.mkdir(path.dirname(shard.local_path), { recursive: true });
    if (!skipExtract) {
      await runCommand(pmtilesPath, extractArgs);
    } else if (!(await fileExists(shard.local_path))) {
      throw new Error(`--skip-extract requested but shard archive is missing: ${shard.local_path}`);
    }

    if (verify) {
      await runCommand(pmtilesPath, ["verify", shard.local_path]);
    }

    const stat = await fs.stat(shard.local_path);
    shard.bytes = stat.size;
    shard.pmtiles = await shardMetadata(shard.local_path, pmtilesPath);
  }

  if (dryRun) return;

  const versionResult = await runCommand(pmtilesPath, ["version"], { capture: true });
  const manifest = await createManifest({
    plan,
    source,
    pmtilesVersion: versionResult.stdout.trim() || null
  });
  await writeJson(plan.manifestPath, manifest);
  console.log(`Wrote ${plan.manifestPath}`);

  if (upload) {
    const invoker = await buildWranglerInvoker(args);
    for (const shard of plan.shards) {
      await uploadObject(
        invoker,
        plan.bucket,
        shard.remote_key,
        shard.local_path,
        "application/vnd.pmtiles"
      );
    }

    const manifestKey = normalizeRemotePath(plan.remotePrefix, "manifest.json");
    await uploadObject(invoker, plan.bucket, manifestKey, plan.manifestPath, "application/json");
    if (publishCurrent) {
      await uploadObject(
        invoker,
        plan.bucket,
        plan.currentKey,
        plan.manifestPath,
        "application/json",
        CACHE_CONTROL_POINTER
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        manifest: plan.manifestPath,
        manifest_url: `${plan.publicBase}/${normalizeRemotePath(plan.remotePrefix, "manifest.json")}`,
        current_url: publishCurrent ? plan.currentUrl : null,
        shards: plan.shards.length,
        total_bytes: plan.shards.reduce((sum, shard) => sum + shard.bytes, 0),
        largest_bytes: Math.max(...plan.shards.map((shard) => shard.bytes))
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("OSM basemap sharding failed.");
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
