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
const DEFAULT_REGION = "mid_atlantic_broad";
const DEFAULT_PUBLIC_BASE = "https://assets.gridwild.com";
const DEFAULT_DOWNLOAD_THREADS = 8;
const DEFAULT_OVERFETCH = 0.05;

const REGION_PRESETS = {
  mid_atlantic_broad: {
    label: "Broad Mid-Atlantic",
    bbox: [-83.8, 35.6, -71.2, 42.8],
    maxzoom: 15,
    description:
      "Broad cutout covering DC, VA, MD, DE, PA, NJ, WV, NYC/Long Island edge, and nearby NC/OH/NY context."
  }
};

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

function int(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function numberValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value == null || value === "") return fallback;
  return !["0", "false", "no", "off"].includes(String(value).trim().toLowerCase());
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

function parseBbox(value, fallback) {
  if (!value) return fallback.slice();
  const bbox = String(value)
    .split(",")
    .map((part) => Number(part.trim()));

  if (
    bbox.length !== 4 ||
    bbox.some((part) => !Number.isFinite(part)) ||
    bbox[0] >= bbox[2] ||
    bbox[1] >= bbox[3]
  ) {
    throw new Error("--bbox must be MIN_LON,MIN_LAT,MAX_LON,MAX_LAT.");
  }

  return bbox;
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

    child.on("error", (error) => {
      reject(error);
    });
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

function getSource(args) {
  const sourceUrl = args["source-url"] || process.env.GRIDWILD_OSM_BASEMAP_SOURCE_URL;
  const sourceFile = args["source-file"] || process.env.GRIDWILD_OSM_BASEMAP_SOURCE_FILE;
  const source = args.source || process.env.GRIDWILD_OSM_BASEMAP_SOURCE;

  const supplied = [sourceUrl, sourceFile, source].filter(Boolean);
  if (supplied.length > 1) {
    throw new Error(
      "Use only one source: --source-url, --source-file, --source, or GRIDWILD_OSM_BASEMAP_SOURCE."
    );
  }

  if (sourceUrl) return { kind: "url", value: sourceUrl };
  if (sourceFile) return { kind: "file", value: path.resolve(sourceFile) };
  if (source) {
    if (/^https?:\/\//i.test(source) || /^[a-z]+:\/\//i.test(source)) {
      return { kind: "url", value: source };
    }
    return { kind: "file", value: path.resolve(source) };
  }

  return null;
}

function getR2Endpoint(args) {
  if (args.endpoint) return args.endpoint;
  if (process.env.R2_ENDPOINT) return process.env.R2_ENDPOINT;
  if (process.env.CLOUDFLARE_R2_ENDPOINT) return process.env.CLOUDFLARE_R2_ENDPOINT;
  if (process.env.CLOUDFLARE_ACCOUNT_ID) {
    return `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  }
  return null;
}

function getBucketUrl(args, bucket) {
  const explicit =
    args["bucket-url"] ||
    process.env.GRIDWILD_PMTILES_BUCKET_URL ||
    process.env.GRIDWILD_R2_BUCKET_URL;
  if (explicit) return explicit;

  const endpoint = getR2Endpoint(args);
  if (!endpoint)
    return `s3://${bucket}?region=auto&endpoint=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com&use_path_style=true`;

  return `s3://${bucket}?region=auto&endpoint=${endpoint}&use_path_style=true`;
}

function uploadEnv() {
  const env = { ...process.env };
  if (!env.AWS_ACCESS_KEY_ID && env.R2_ACCESS_KEY_ID) env.AWS_ACCESS_KEY_ID = env.R2_ACCESS_KEY_ID;
  if (!env.AWS_SECRET_ACCESS_KEY && env.R2_SECRET_ACCESS_KEY) {
    env.AWS_SECRET_ACCESS_KEY = env.R2_SECRET_ACCESS_KEY;
  }
  return env;
}

function assertUploadEnv(env) {
  if (!env.AWS_ACCESS_KEY_ID) {
    throw new Error("Missing AWS_ACCESS_KEY_ID or R2_ACCESS_KEY_ID for pmtiles upload.");
  }
  if (!env.AWS_SECRET_ACCESS_KEY) {
    throw new Error("Missing AWS_SECRET_ACCESS_KEY or R2_SECRET_ACCESS_KEY for pmtiles upload.");
  }
}

function assertUploadPlan(plan) {
  if (plan.bucketUrl.includes("YOUR_ACCOUNT_ID")) {
    throw new Error(
      "Missing R2 endpoint. Set CLOUDFLARE_ACCOUNT_ID, R2_ENDPOINT, or pass --bucket-url."
    );
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function buildPlan(args) {
  const regionId = safeSlug(
    args.region || process.env.GRIDWILD_OSM_BASEMAP_REGION || DEFAULT_REGION
  );
  const preset = REGION_PRESETS[regionId] || REGION_PRESETS[DEFAULT_REGION];
  const bbox = parseBbox(args.bbox || process.env.GRIDWILD_OSM_BASEMAP_BBOX, preset.bbox);
  const maxzoom = int(args.maxzoom || process.env.GRIDWILD_OSM_BASEMAP_MAXZOOM, preset.maxzoom);
  const buildId = safeSlug(
    args["build-id"] ||
      process.env.GRIDWILD_OSM_BASEMAP_BUILD_ID ||
      `gridwild_osm_protomaps_${regionId}_v001_${yyyymmdd()}`
  );
  const outDir = path.resolve(
    args["out-dir"] ||
      process.env.GRIDWILD_OSM_BASEMAP_DIR ||
      path.join(defaultOutRoot(), regionId, buildId)
  );
  const archiveName = safeFileName(args["archive-name"] || `${buildId}.pmtiles`);
  const archivePath = path.resolve(args.output || path.join(outDir, archiveName));
  const manifestPath = path.resolve(args["manifest-path"] || path.join(outDir, "manifest.json"));
  const explicitRemotePrefix =
    args["remote-prefix"] || process.env.GRIDWILD_OSM_BASEMAP_REMOTE_PREFIX;
  const remotePrefix = explicitRemotePrefix
    ? normalizeRemotePath(explicitRemotePrefix)
    : normalizeRemotePath("osm", "protomaps", regionId, buildId);
  const remotePmtilesKey = args["remote-key"]
    ? normalizeRemotePath(args["remote-key"])
    : normalizeRemotePath(remotePrefix, path.basename(archivePath));
  const remoteManifestKey = normalizeRemotePath(remotePrefix, "manifest.json");
  const publicBase = String(
    args["public-base"] || process.env.GRIDWILD_ASSET_PUBLIC_BASE || DEFAULT_PUBLIC_BASE
  ).replace(/\/+$/, "");
  const bucket =
    args.bucket ||
    process.env.GRIDWILD_R2_BUCKET ||
    process.env.GRIDWILD_STORAGE_BUCKET ||
    DEFAULT_BUCKET;

  if (!(maxzoom >= 0 && maxzoom <= 30)) {
    throw new Error("--maxzoom must be between 0 and 30.");
  }

  return {
    region: {
      id: regionId,
      label: preset.label,
      description: preset.description,
      bbox,
      maxzoom
    },
    buildId,
    outDir,
    archiveName: path.basename(archivePath),
    archivePath,
    manifestPath,
    bucket,
    bucketUrl: getBucketUrl(args, bucket),
    publicBase,
    remotePrefix,
    remotePmtilesKey,
    remoteManifestKey,
    pmtilesUrl: `${publicBase}/${remotePmtilesKey}`,
    manifestUrl: `${publicBase}/${remoteManifestKey}`,
    downloadThreads: int(
      args["download-threads"] || process.env.GRIDWILD_OSM_BASEMAP_DOWNLOAD_THREADS,
      DEFAULT_DOWNLOAD_THREADS
    ),
    overfetch: numberValue(
      args.overfetch || process.env.GRIDWILD_OSM_BASEMAP_OVERFETCH,
      DEFAULT_OVERFETCH
    )
  };
}

async function createManifest({ plan, source, header, metadata, bytes, pmtilesVersion, commands }) {
  return {
    schema_version: "gridwild.osm-basemap-mirror.v1",
    build_id: plan.buildId,
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    product: "osm-basemap",
    provider: "protomaps",
    source,
    region: plan.region,
    archive: {
      file: plan.archiveName,
      bytes,
      local_path: plan.archivePath,
      pmtiles_url: plan.pmtilesUrl,
      remote_key: plan.remotePmtilesKey
    },
    manifest: {
      local_path: plan.manifestPath,
      url: plan.manifestUrl,
      remote_key: plan.remoteManifestKey
    },
    r2: {
      bucket: plan.bucket,
      remote_prefix: plan.remotePrefix
    },
    attribution: [
      {
        text: "OpenStreetMap contributors",
        url: "https://www.openstreetmap.org/copyright"
      },
      {
        text: "Protomaps",
        url: "https://protomaps.com"
      }
    ],
    license_notes:
      "Protomaps basemap is an OpenStreetMap-derived Produced Work. Show OpenStreetMap attribution wherever the basemap is visible.",
    pmtiles: {
      cli_version: pmtilesVersion,
      header,
      metadata
    },
    commands
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const dryRun = Boolean(args["dry-run"]);
  const upload = Boolean(args.upload);
  const skipExtract = Boolean(args["skip-extract"]);
  const extractOnly = Boolean(args["extract-only"]);
  const verify = Boolean(args.verify || boolEnv("GRIDWILD_OSM_BASEMAP_VERIFY", false));
  const source = getSource(args);
  const plan = buildPlan(args);

  if (!source && !skipExtract) {
    throw new Error(
      "Missing source PMTiles. Pass --source-url, --source-file, --source, or GRIDWILD_OSM_BASEMAP_SOURCE."
    );
  }
  if (upload && extractOnly) {
    throw new Error("Use either --upload or --extract-only, not both.");
  }

  const pmtilesCommand = args["pmtiles-bin"] || process.env.PMTILES_BIN || "pmtiles";
  const pmtilesPath = await resolveExecutable(pmtilesCommand);
  const pmtilesDisplay = pmtilesPath || pmtilesCommand;
  const env = uploadEnv();

  const extractArgs = [
    "extract",
    source?.value || "<SOURCE.pmtiles>",
    plan.archivePath,
    `--bbox=${plan.region.bbox.join(",")}`,
    `--maxzoom=${plan.region.maxzoom}`,
    `--download-threads=${plan.downloadThreads}`,
    `--overfetch=${plan.overfetch}`
  ];
  const uploadArgs = [
    "upload",
    plan.archivePath,
    plan.remotePmtilesKey,
    `--bucket=${plan.bucketUrl}`
  ];

  console.log("GridWild OSM basemap PMTiles mirror");
  console.log(`Region: ${plan.region.label} (${plan.region.id})`);
  console.log(`BBox: ${plan.region.bbox.join(",")}`);
  console.log(`Max zoom: ${plan.region.maxzoom}`);
  console.log(`Build: ${plan.buildId}`);
  console.log(`Output: ${plan.archivePath}`);
  console.log(`Remote PMTiles: ${plan.pmtilesUrl}`);
  console.log(`Remote manifest: ${plan.manifestUrl}`);
  console.log(`pmtiles binary: ${pmtilesPath || "not found on PATH"}`);
  if (dryRun) console.log("Dry run: no extraction, file writes, or uploads will be performed.");
  if (skipExtract) console.log("Skipping extraction; using the existing local archive.");

  const commands = {
    extract: displayCommand(pmtilesDisplay, extractArgs),
    upload_pmtiles: displayCommand(pmtilesDisplay, uploadArgs),
    upload_pmtiles_with_cache_control: displayCommand("wrangler", [
      "r2",
      "object",
      "put",
      `${plan.bucket}/${plan.remotePmtilesKey}`,
      "--file",
      plan.archivePath,
      "--content-type",
      "application/vnd.pmtiles",
      "--cache-control",
      "public, max-age=31536000, immutable"
    ]),
    upload_manifest_hint: displayCommand("wrangler", [
      "r2",
      "object",
      "put",
      `${plan.bucket}/${plan.remoteManifestKey}`,
      "--file",
      plan.manifestPath,
      "--content-type",
      "application/json",
      "--cache-control",
      "public, max-age=31536000, immutable"
    ])
  };

  if (dryRun) {
    console.log("Planned commands:");
    console.log(commands.extract);
    if (!extractOnly) console.log(commands.upload_pmtiles);
    if (!extractOnly) console.log(commands.upload_pmtiles_with_cache_control);
    console.log(commands.upload_manifest_hint);
    return;
  }

  if (!pmtilesPath) {
    throw new Error(
      "Could not find the pmtiles CLI. Install the Protomaps pmtiles binary or set PMTILES_BIN."
    );
  }

  await fs.mkdir(path.dirname(plan.archivePath), { recursive: true });

  if (!skipExtract) {
    await runCommand(pmtilesPath, extractArgs);
  } else if (!(await fileExists(plan.archivePath))) {
    throw new Error(`--skip-extract requested but archive is missing: ${plan.archivePath}`);
  }

  if (verify) {
    await runCommand(pmtilesPath, ["verify", plan.archivePath]);
  }

  const headerResult = await runCommand(pmtilesPath, ["show", plan.archivePath, "--header-json"], {
    capture: true
  });
  const metadataResult = await runCommand(pmtilesPath, ["show", plan.archivePath, "--metadata"], {
    capture: true
  });
  const versionResult = await runCommand(pmtilesPath, ["version"], { capture: true });
  const stat = await fs.stat(plan.archivePath);
  const manifest = await createManifest({
    plan,
    source,
    header: parseJsonOutput("PMTiles header", headerResult.stdout),
    metadata: parseJsonOutput("PMTiles metadata", metadataResult.stdout),
    bytes: stat.size,
    pmtilesVersion: versionResult.stdout.trim() || null,
    commands
  });
  await writeJson(plan.manifestPath, manifest);
  console.log(`Wrote manifest: ${plan.manifestPath}`);

  if (upload && !extractOnly) {
    assertUploadPlan(plan);
    assertUploadEnv(env);
    await runCommand(pmtilesPath, uploadArgs, { env });
    console.log(`Uploaded PMTiles: ${plan.pmtilesUrl}`);
    console.log(
      "If the PMTiles object lacks Cache-Control, rerun the Wrangler PMTiles upload command below."
    );
    console.log(commands.upload_pmtiles_with_cache_control);
    console.log("Manifest upload is intentionally left to wrangler/R2 UI.");
    console.log(commands.upload_manifest_hint);
  } else {
    console.log("PMTiles upload command:");
    console.log(commands.upload_pmtiles);
    console.log("PMTiles immutable-cache upload command:");
    console.log(commands.upload_pmtiles_with_cache_control);
    console.log("Manifest upload command:");
    console.log(commands.upload_manifest_hint);
  }
}

main().catch((error) => {
  console.error("OSM basemap mirror failed.");
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
