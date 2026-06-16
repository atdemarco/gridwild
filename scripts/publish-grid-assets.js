#!/usr/bin/env node

require("dotenv").config();

const fs = require("fs/promises");
const path = require("path");
const zlib = require("zlib");
const { promisify } = require("util");
const { createClient } = require("@supabase/supabase-js");

const DEFAULT_BUCKET = "gridwild-assets";
const DEFAULT_STORAGE_BACKEND = "supabase";
const SUPERCHUNK_UPSERT_BATCH_SIZE = 500;
const UPLOAD_PROGRESS_EVERY = 250;
const UPLOAD_MAX_ATTEMPTS = 5;
const UPLOAD_RETRY_BASE_DELAY_MS = 1000;
const gzipAsync = promisify(zlib.gzip);

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

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizeAssetPath(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid asset path: ${value}`);
  }

  return value.replace(/\\/g, "/").replace(/^\/+/, "");
}

function joinStoragePath(...parts) {
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

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".json") return "application/json";
  if (extension === ".csv") return "text/csv";
  if (extension === ".pmtiles") return "application/vnd.pmtiles";
  return "application/octet-stream";
}

function shouldGzipForStorage(backend, filePath) {
  if (backend !== "r2") return false;
  if (String(process.env.GRIDWILD_R2_GZIP || "true").toLowerCase() === "false") return false;

  const extension = path.extname(filePath).toLowerCase();
  return extension === ".csv" || extension === ".json";
}

async function readStorageBody({ backend, localPath }) {
  const body = await fs.readFile(localPath);

  if (!shouldGzipForStorage(backend, localPath)) {
    return { body, contentEncoding: null };
  }

  return {
    body: await gzipAsync(body, { level: 9 }),
    contentEncoding: "gzip"
  };
}

function cacheControlForStorage(backend) {
  if (process.env.GRIDWILD_ASSET_CACHE_CONTROL) {
    return process.env.GRIDWILD_ASSET_CACHE_CONTROL;
  }

  if (backend === "supabase") return "31536000";
  return "public, max-age=31536000, immutable";
}

function uploadConcurrencyFor(backend) {
  const raw = Number.parseInt(process.env.GRIDWILD_UPLOAD_CONCURRENCY || "", 10);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return backend === "r2" ? 16 : 1;
}

function envFlag(name, fallback = false) {
  const value = process.env[name];
  if (value == null || value === "") return fallback;
  return !["0", "false", "no", "off"].includes(String(value).trim().toLowerCase());
}

function shouldPromoteBuild(args) {
  if (args["no-promote"]) return false;
  if (args.promote) return true;
  return envFlag("GRIDWILD_PUBLISH_PROMOTE", true);
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function assertFileExists(filePath, label) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      throw new Error(`${label} is not a file: ${filePath}`);
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Missing ${label}: ${filePath}`);
    }
    throw error;
  }
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("manifest.json must contain a JSON object.");
  }

  if (!manifest.build_id || typeof manifest.build_id !== "string") {
    throw new Error("manifest.build_id is required.");
  }

  if (!manifest.schema_version || typeof manifest.schema_version !== "string") {
    throw new Error("manifest.schema_version is required.");
  }

  if (!Array.isArray(manifest.superchunks)) {
    throw new Error("manifest.superchunks must be an array.");
  }

  manifest.superchunks.forEach((superchunk, index) => {
    if (!superchunk || typeof superchunk !== "object") {
      throw new Error(`manifest.superchunks[${index}] must be an object.`);
    }

    if (!superchunk.superchunk_id || typeof superchunk.superchunk_id !== "string") {
      throw new Error(`manifest.superchunks[${index}].superchunk_id is required.`);
    }

    if (!superchunk.file || typeof superchunk.file !== "string") {
      throw new Error(`manifest.superchunks[${index}].file is required.`);
    }
  });
}

function requireAwsSdk() {
  try {
    return require("@aws-sdk/client-s3");
  } catch (error) {
    if (error.code === "MODULE_NOT_FOUND") {
      throw new Error(
        "Missing @aws-sdk/client-s3. Run `npm install @aws-sdk/client-s3` before publishing to R2."
      );
    }
    throw error;
  }
}

function getR2Endpoint() {
  if (process.env.R2_ENDPOINT) return process.env.R2_ENDPOINT;
  if (process.env.CLOUDFLARE_R2_ENDPOINT) return process.env.CLOUDFLARE_R2_ENDPOINT;

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) {
    throw new Error("Missing CLOUDFLARE_ACCOUNT_ID or R2_ENDPOINT for R2 publishing.");
  }

  return `https://${accountId}.r2.cloudflarestorage.com`;
}

async function createStorageUploader({ backend, supabase, bucket }) {
  if (backend === "supabase") {
    const { error: bucketError } = await supabase.storage.getBucket(bucket);
    if (bucketError) {
      throw new Error(
        `Could not access Supabase Storage bucket "${bucket}": ${bucketError.message}`
      );
    }

    return {
      backend,
      bucket,
      async upload({ localPath, storagePath }) {
        const { body } = await readStorageBody({ backend, localPath });
        const { error } = await supabase.storage.from(bucket).upload(storagePath, body, {
          cacheControl: cacheControlForStorage(backend),
          contentType: contentTypeFor(localPath),
          upsert: true
        });

        if (error) throw error;
      }
    };
  }

  if (backend === "r2") {
    const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

    if (!accessKeyId) throw new Error("Missing R2_ACCESS_KEY_ID for R2 publishing.");
    if (!secretAccessKey) throw new Error("Missing R2_SECRET_ACCESS_KEY for R2 publishing.");

    const { S3Client, HeadBucketCommand, PutObjectCommand } = requireAwsSdk();
    const client = new S3Client({
      region: "auto",
      endpoint: getR2Endpoint(),
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true
    });

    await client.send(new HeadBucketCommand({ Bucket: bucket }));

    return {
      backend,
      bucket,
      async upload({ localPath, storagePath }) {
        const { body, contentEncoding } = await readStorageBody({ backend, localPath });
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: storagePath,
            Body: body,
            CacheControl: cacheControlForStorage(backend),
            ContentType: contentTypeFor(localPath),
            ContentEncoding: contentEncoding || undefined
          })
        );
      }
    };
  }

  throw new Error(`Unsupported GRIDWILD_STORAGE_BACKEND "${backend}". Use "supabase" or "r2".`);
}

async function uploadFile({ uploader, localPath, storagePath, label }) {
  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt += 1) {
    try {
      await uploader.upload({ localPath, storagePath });
      return;
    } catch (error) {
      if (attempt === UPLOAD_MAX_ATTEMPTS) {
        throw new Error(`Failed to upload ${label} to ${storagePath}: ${error.message}`);
      }

      const delayMs = UPLOAD_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      console.warn(
        `Upload failed for ${label} (${error.message}). Retrying ${attempt + 1}/${UPLOAD_MAX_ATTEMPTS} in ${delayMs}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function uploadSuperchunks({ uploader, assetDir, superchunks, buildPrefix }) {
  const concurrency = uploadConcurrencyFor(uploader.backend);
  let nextIndex = 0;
  let uploaded = 0;

  console.log(`Upload concurrency: ${concurrency}`);

  async function worker() {
    while (nextIndex < superchunks.length) {
      const index = nextIndex;
      nextIndex += 1;

      const superchunk = superchunks[index];
      const localPath = path.join(assetDir, superchunk.file);
      const storagePath = joinStoragePath(buildPrefix, superchunk.file);

      await uploadFile({
        uploader,
        localPath,
        storagePath,
        label: `superchunk ${superchunk.superchunk_id}`
      });

      uploaded += 1;
      if (uploaded % UPLOAD_PROGRESS_EVERY === 0 || uploaded === superchunks.length) {
        console.log(`Uploaded ${uploaded}/${superchunks.length} superchunks`);
      }
    }
  }

  const workerCount = Math.min(concurrency, superchunks.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return uploaded;
}

async function uploadAssetFileList({ uploader, assetDir, files, buildPrefix, label }) {
  const concurrency = uploadConcurrencyFor(uploader.backend);
  let nextIndex = 0;
  let uploaded = 0;

  console.log(`${label} upload concurrency: ${concurrency}`);

  async function worker() {
    while (nextIndex < files.length) {
      const index = nextIndex;
      nextIndex += 1;

      const file = files[index];
      const localPath = path.join(assetDir, file);
      const storagePath = joinStoragePath(buildPrefix, file);

      await uploadFile({
        uploader,
        localPath,
        storagePath,
        label: `${label} ${index + 1}/${files.length}`
      });

      uploaded += 1;
      if (uploaded % UPLOAD_PROGRESS_EVERY === 0 || uploaded === files.length) {
        console.log(`Uploaded ${uploaded}/${files.length} ${label} files`);
      }
    }
  }

  const workerCount = Math.min(concurrency, files.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return uploaded;
}

function buildTopLevelAssets(manifest) {
  const assets = [
    { manifestKey: "heat_file", fallback: "dc_heat.csv", label: "heat CSV" },
    {
      manifestKey: "observer_dictionary_file",
      fallback: "observer_dictionary.json",
      label: "observer dictionary"
    },
    { file: "manifest.json", label: "manifest" }
  ];

  const optionalManifestAssets = [
    { manifestKey: "square_summary_file", label: "square genus summary" },
    { manifestKey: "policy_rollup_summary_file", label: "policy rollup summary" },
    { manifestKey: "served_taxonomy_policy_file", label: "served taxonomy policy" },
    { manifestKey: "coarse_pyramid_manifest_file", label: "coarse pyramid manifest" },
    { manifestKey: "coarse_pyramid_summary_file", label: "coarse pyramid summary" },
    { manifestKey: "pmtiles_shard_manifest_file", label: "PMTiles shard manifest" },
    { manifestKey: "pmtiles_file", label: "PMTiles" }
  ];

  for (const asset of optionalManifestAssets) {
    if (manifest[asset.manifestKey]) {
      assets.push({ ...asset, optional: true });
    }
  }

  assets.push({ file: "validation_report.json", label: "validation report", optional: true });
  return assets;
}

function assetFileFor(asset, manifest) {
  return normalizeAssetPath(asset.file || manifest[asset.manifestKey] || asset.fallback);
}

function buildMetadataRow(manifest, buildPrefix, { currentFlag } = {}) {
  const squareSummaryFile = manifest.square_summary_file
    ? joinStoragePath(buildPrefix, normalizeAssetPath(manifest.square_summary_file))
    : null;

  const row = {
    build_id: manifest.build_id,
    schema_version: manifest.schema_version,
    generator: manifest.generator || null,
    generated_at: manifest.generated_at || null,
    grid_size_m: manifest.grid_size_m ?? null,
    grid_size_ft: manifest.grid_size_ft ?? null,
    superchunk_size: manifest.superchunk_size ?? null,
    asset_root: buildPrefix,
    heat_file: joinStoragePath(
      buildPrefix,
      normalizeAssetPath(manifest.heat_file || "dc_heat.csv")
    ),
    observer_dictionary_file: joinStoragePath(
      buildPrefix,
      normalizeAssetPath(manifest.observer_dictionary_file || "observer_dictionary.json")
    ),
    square_summary_file: squareSummaryFile,
    superchunk_dir: joinStoragePath(
      buildPrefix,
      normalizeAssetPath(manifest.superchunk_dir || "square_genera_superchunks")
    ),
    n_observations: manifest.n_observations ?? null,
    n_squares: manifest.n_squares ?? null,
    n_superchunks: manifest.n_superchunks ?? manifest.superchunks.length,
    n_observers: manifest.n_observers ?? null,
    taxonomy_levels: manifest.taxonomy_levels ?? null,
    manifest
  };

  if (currentFlag !== undefined) {
    row.is_current = currentFlag;
  }

  return row;
}

function buildSuperchunkRow(manifest, superchunk, buildPrefix) {
  const file = normalizeAssetPath(superchunk.file);

  return {
    build_id: manifest.build_id,
    superchunk_id: superchunk.superchunk_id,
    super_ix: superchunk.super_ix ?? null,
    super_iy: superchunk.super_iy ?? null,
    file,
    storage_path: joinStoragePath(buildPrefix, file),
    n_squares: superchunk.n_squares ?? null,
    bbox_grid: superchunk.bbox_grid ?? null,
    cell_count: superchunk.cell_count ?? null,
    manifest_row: superchunk
  };
}

async function loadCoarsePyramidManifest(assetDir, manifest) {
  if (!manifest.coarse_pyramid_manifest_file) return null;
  const file = normalizeAssetPath(manifest.coarse_pyramid_manifest_file);
  const localPath = path.join(assetDir, file);
  if (!(await fileExists(localPath))) return null;
  return readJson(localPath);
}

async function loadPMTilesShardManifest(assetDir, manifest) {
  if (!manifest.pmtiles_shard_manifest_file) return null;
  const file = normalizeAssetPath(manifest.pmtiles_shard_manifest_file);
  const localPath = path.join(assetDir, file);
  if (!(await fileExists(localPath))) return null;
  return readJson(localPath);
}

function coarsePyramidTileFiles(coarseManifest) {
  const files = new Set();
  for (const level of coarseManifest?.levels || []) {
    for (const tile of level.tiles || []) {
      if (tile?.file) files.add(normalizeAssetPath(tile.file));
    }
  }
  return Array.from(files).sort();
}

function pmtilesShardFiles(shardManifest) {
  const files = new Set();
  for (const shard of shardManifest?.shards || []) {
    if (shard?.file) files.add(normalizeAssetPath(shard.file));
  }
  return Array.from(files).sort();
}

async function upsertRows({ supabase, table, rows, batchSize, onBatch }) {
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const { error } = await supabase.from(table).upsert(batch);

    if (error) {
      throw new Error(
        `Failed to upsert ${table} rows ${start + 1}-${start + batch.length}: ${error.message}`
      );
    }

    if (onBatch) {
      onBatch(start + batch.length, rows.length);
    }
  }
}

async function promoteBuild({ supabase, buildId }) {
  const { data: existing, error: existingError } = await supabase
    .from("gw_asset_builds")
    .select("build_id")
    .eq("build_id", buildId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to check staged build before promotion: ${existingError.message}`);
  }
  if (!existing) {
    throw new Error(`Cannot promote missing build. Stage it first: ${buildId}`);
  }

  const { error: clearCurrentError } = await supabase
    .from("gw_asset_builds")
    .update({ is_current: false })
    .neq("build_id", buildId);

  if (clearCurrentError) {
    throw new Error(`Failed to clear current build flags: ${clearCurrentError.message}`);
  }

  const { error: setCurrentError } = await supabase
    .from("gw_asset_builds")
    .update({ is_current: true })
    .eq("build_id", buildId);

  if (setCurrentError) {
    throw new Error(`Failed to set current build flag: ${setCurrentError.message}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const dryRun = Boolean(args["dry-run"]);
  const promoteOnly = Boolean(args["promote-only"]);
  const promote = promoteOnly ? true : shouldPromoteBuild(args);
  const supabaseUrl = dryRun ? process.env.SUPABASE_URL : requiredEnv("SUPABASE_URL");
  const serviceRoleKey = dryRun
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const assetDir = path.resolve(args["asset-dir"] || requiredEnv("GRIDWILD_ASSET_DIR"));
  const backend = (process.env.GRIDWILD_STORAGE_BACKEND || DEFAULT_STORAGE_BACKEND).toLowerCase();
  const bucket =
    backend === "r2"
      ? process.env.GRIDWILD_R2_BUCKET || process.env.GRIDWILD_STORAGE_BUCKET || DEFAULT_BUCKET
      : process.env.GRIDWILD_STORAGE_BUCKET || DEFAULT_BUCKET;

  const manifestPath = path.join(assetDir, "manifest.json");
  const manifest = await readJson(manifestPath);
  validateManifest(manifest);

  const buildPrefix = joinStoragePath("builds", manifest.build_id);
  const topLevelAssets = buildTopLevelAssets(manifest);
  const uploadableTopLevelAssets = [];

  console.log(`GridWild asset publish`);
  console.log(`Build: ${manifest.build_id}`);
  console.log(`Asset dir: ${assetDir}`);
  console.log(`Storage backend: ${backend}`);
  console.log(`Bucket: ${bucket}`);
  console.log(`Storage prefix: ${buildPrefix}`);
  console.log(`Superchunks expected: ${manifest.superchunks.length}`);
  console.log(`Promote to current: ${promote ? "yes" : "no"}`);
  if (dryRun) console.log("Dry run: no uploads or database writes will be performed.");

  if (promoteOnly) {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    await promoteBuild({ supabase, buildId: manifest.build_id });
    console.log("Promote-only complete.");
    console.log(`Current build: ${manifest.build_id}`);
    return;
  }

  const normalizedSuperchunks = manifest.superchunks.map((superchunk) => ({
    ...superchunk,
    file: normalizeAssetPath(superchunk.file)
  }));
  const coarsePyramidManifest = await loadCoarsePyramidManifest(assetDir, manifest);
  const coarsePyramidFiles = coarsePyramidTileFiles(coarsePyramidManifest);
  const pmtilesShardManifest = await loadPMTilesShardManifest(assetDir, manifest);
  const pmtilesShardAssetFiles = pmtilesShardFiles(pmtilesShardManifest);

  for (const asset of topLevelAssets) {
    const file = assetFileFor(asset, manifest);
    const localPath = path.join(assetDir, file);
    const exists = await fileExists(localPath);

    if (!exists && asset.optional) {
      console.log(`Skipping optional ${asset.label}: ${localPath}`);
      if (asset.manifestKey === "square_summary_file") {
        manifest[asset.manifestKey] = null;
      }
      continue;
    }

    await assertFileExists(localPath, asset.label);
    uploadableTopLevelAssets.push({ ...asset, file });
  }

  for (const superchunk of normalizedSuperchunks) {
    await assertFileExists(
      path.join(assetDir, superchunk.file),
      `superchunk ${superchunk.superchunk_id}`
    );
  }

  for (const file of coarsePyramidFiles) {
    await assertFileExists(path.join(assetDir, file), `coarse pyramid tile ${file}`);
  }

  for (const file of pmtilesShardAssetFiles) {
    await assertFileExists(path.join(assetDir, file), `PMTiles shard ${file}`);
  }

  console.log("All referenced files are present.");

  if (dryRun) {
    console.log(`Dry run complete.`);
    console.log(`Top-level assets present: ${uploadableTopLevelAssets.length}`);
    console.log(`Superchunks present: ${normalizedSuperchunks.length}`);
    console.log(`Coarse pyramid tiles present: ${coarsePyramidFiles.length}`);
    console.log(`PMTiles shards present: ${pmtilesShardAssetFiles.length}`);
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const uploader = await createStorageUploader({ backend, supabase, bucket });

  console.log(
    promote
      ? "Upserting build metadata with is_current = false before promotion..."
      : "Upserting staged build metadata without changing current build..."
  );

  const buildRow = buildMetadataRow(manifest, buildPrefix, {
    currentFlag: promote ? false : undefined
  });
  const { error: buildError } = await supabase.from("gw_asset_builds").upsert(buildRow);
  if (buildError) {
    throw new Error(`Failed to upsert gw_asset_builds row: ${buildError.message}`);
  }

  console.log("Uploading top-level assets...");
  for (const asset of uploadableTopLevelAssets) {
    const file = asset.file;
    const localPath = path.join(assetDir, file);
    const storagePath = joinStoragePath(buildPrefix, file);
    await uploadFile({ uploader, localPath, storagePath, label: asset.label });
    console.log(`Uploaded ${asset.label}: ${storagePath}`);
  }

  console.log("Uploading superchunks...");
  const uploadedSuperchunks = await uploadSuperchunks({
    uploader,
    assetDir,
    superchunks: normalizedSuperchunks,
    buildPrefix
  });

  let uploadedCoarsePyramidFiles = 0;
  if (coarsePyramidFiles.length) {
    console.log("Uploading coarse pyramid tiles...");
    uploadedCoarsePyramidFiles = await uploadAssetFileList({
      uploader,
      assetDir,
      files: coarsePyramidFiles,
      buildPrefix,
      label: "coarse pyramid"
    });
  }

  let uploadedPMTilesShards = 0;
  if (pmtilesShardAssetFiles.length) {
    console.log("Uploading PMTiles shards...");
    uploadedPMTilesShards = await uploadAssetFileList({
      uploader,
      assetDir,
      files: pmtilesShardAssetFiles,
      buildPrefix,
      label: "PMTiles shard"
    });
  }

  console.log("Upserting superchunk metadata...");
  const superchunkRows = normalizedSuperchunks.map((superchunk) =>
    buildSuperchunkRow(manifest, superchunk, buildPrefix)
  );
  await upsertRows({
    supabase,
    table: "gw_superchunks",
    rows: superchunkRows,
    batchSize: SUPERCHUNK_UPSERT_BATCH_SIZE,
    onBatch: (done, total) => console.log(`Upserted ${done}/${total} superchunk rows`)
  });

  if (!promote) {
    console.log("Leaving build staged. Current build was not changed.");
    console.log("Publish complete.");
    console.log(`Superchunks uploaded: ${uploadedSuperchunks}`);
    console.log(`Coarse pyramid tiles uploaded: ${uploadedCoarsePyramidFiles}`);
    console.log(`PMTiles shards uploaded: ${uploadedPMTilesShards}`);
    console.log(`Superchunk rows upserted: ${superchunkRows.length}`);
    console.log(`Staged build: ${manifest.build_id}`);
    return;
  }

  console.log("Promoting build to current...");
  await promoteBuild({ supabase, buildId: manifest.build_id });

  console.log("Publish complete.");
  console.log(`Superchunks uploaded: ${uploadedSuperchunks}`);
  console.log(`Coarse pyramid tiles uploaded: ${uploadedCoarsePyramidFiles}`);
  console.log(`PMTiles shards uploaded: ${uploadedPMTilesShards}`);
  console.log(`Superchunk rows upserted: ${superchunkRows.length}`);
  console.log(`Current build: ${manifest.build_id}`);
}

main().catch((error) => {
  console.error("Publish failed.");
  console.error(error);
  process.exitCode = 1;
});
