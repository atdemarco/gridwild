#!/usr/bin/env node

require("dotenv").config();

const fs = require("fs/promises");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const DEFAULT_BUCKET = "gridwild-assets";
const DEFAULT_STORAGE_BACKEND = "supabase";
const SUPERCHUNK_UPSERT_BATCH_SIZE = 500;
const UPLOAD_PROGRESS_EVERY = 250;
const UPLOAD_MAX_ATTEMPTS = 5;
const UPLOAD_RETRY_BASE_DELAY_MS = 1000;

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
    .map((part) => String(part).replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".json") return "application/json";
  if (extension === ".csv") return "text/csv";
  return "application/octet-stream";
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
      throw new Error("Missing @aws-sdk/client-s3. Run `npm install @aws-sdk/client-s3` before publishing to R2.");
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
      throw new Error(`Could not access Supabase Storage bucket "${bucket}": ${bucketError.message}`);
    }

    return {
      backend,
      bucket,
      async upload({ localPath, storagePath }) {
        const body = await fs.readFile(localPath);
        const { error } = await supabase.storage.from(bucket).upload(storagePath, body, {
          cacheControl: cacheControlForStorage(backend),
          contentType: contentTypeFor(localPath),
          upsert: true,
        });

        if (error) throw error;
      },
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
      forcePathStyle: true,
    });

    await client.send(new HeadBucketCommand({ Bucket: bucket }));

    return {
      backend,
      bucket,
      async upload({ localPath, storagePath }) {
        const body = await fs.readFile(localPath);
        await client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: storagePath,
          Body: body,
          CacheControl: cacheControlForStorage(backend),
          ContentType: contentTypeFor(localPath),
        }));
      },
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

      const delayMs = UPLOAD_RETRY_BASE_DELAY_MS * (2 ** (attempt - 1));
      console.warn(
        `Upload failed for ${label} (${error.message}). Retrying ${attempt + 1}/${UPLOAD_MAX_ATTEMPTS} in ${delayMs}ms...`,
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
        label: `superchunk ${superchunk.superchunk_id}`,
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

function buildMetadataRow(manifest, buildPrefix) {
  const squareSummaryFile = manifest.square_summary_file
    ? joinStoragePath(buildPrefix, normalizeAssetPath(manifest.square_summary_file))
    : null;

  return {
    build_id: manifest.build_id,
    schema_version: manifest.schema_version,
    generator: manifest.generator || null,
    generated_at: manifest.generated_at || null,
    grid_size_m: manifest.grid_size_m ?? null,
    grid_size_ft: manifest.grid_size_ft ?? null,
    superchunk_size: manifest.superchunk_size ?? null,
    asset_root: buildPrefix,
    heat_file: joinStoragePath(buildPrefix, normalizeAssetPath(manifest.heat_file || "dc_heat.csv")),
    observer_dictionary_file: joinStoragePath(
      buildPrefix,
      normalizeAssetPath(manifest.observer_dictionary_file || "observer_dictionary.json"),
    ),
    square_summary_file: squareSummaryFile,
    superchunk_dir: joinStoragePath(
      buildPrefix,
      normalizeAssetPath(manifest.superchunk_dir || "square_genera_superchunks"),
    ),
    n_observations: manifest.n_observations ?? null,
    n_squares: manifest.n_squares ?? null,
    n_superchunks: manifest.n_superchunks ?? manifest.superchunks.length,
    n_observers: manifest.n_observers ?? null,
    taxonomy_levels: manifest.taxonomy_levels ?? null,
    manifest,
    is_current: false,
  };
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
    manifest_row: superchunk,
  };
}

async function upsertRows({ supabase, table, rows, batchSize, onBatch }) {
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const { error } = await supabase.from(table).upsert(batch);

    if (error) {
      throw new Error(`Failed to upsert ${table} rows ${start + 1}-${start + batch.length}: ${error.message}`);
    }

    if (onBatch) {
      onBatch(start + batch.length, rows.length);
    }
  }
}

async function main() {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const assetDir = requiredEnv("GRIDWILD_ASSET_DIR");
  const backend = (process.env.GRIDWILD_STORAGE_BACKEND || DEFAULT_STORAGE_BACKEND).toLowerCase();
  const bucket = backend === "r2"
    ? process.env.GRIDWILD_R2_BUCKET || process.env.GRIDWILD_STORAGE_BUCKET || DEFAULT_BUCKET
    : process.env.GRIDWILD_STORAGE_BUCKET || DEFAULT_BUCKET;

  const manifestPath = path.join(assetDir, "manifest.json");
  const manifest = await readJson(manifestPath);
  validateManifest(manifest);

  const buildPrefix = joinStoragePath("builds", manifest.build_id);
  const topLevelAssets = [
    { manifestKey: "heat_file", fallback: "dc_heat.csv", label: "heat CSV" },
    { manifestKey: "observer_dictionary_file", fallback: "observer_dictionary.json", label: "observer dictionary" },
    { file: "manifest.json", label: "manifest" },
  ];

  if (manifest.square_summary_file) {
    topLevelAssets.push({
      manifestKey: "square_summary_file",
      label: "square genus summary",
      optional: true,
    });
  }

  console.log(`GridWild asset publish`);
  console.log(`Build: ${manifest.build_id}`);
  console.log(`Asset dir: ${assetDir}`);
  console.log(`Storage backend: ${backend}`);
  console.log(`Bucket: ${bucket}`);
  console.log(`Storage prefix: ${buildPrefix}`);
  console.log(`Superchunks expected: ${manifest.superchunks.length}`);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const uploader = await createStorageUploader({ backend, supabase, bucket });

  const normalizedSuperchunks = manifest.superchunks.map((superchunk) => ({
    ...superchunk,
    file: normalizeAssetPath(superchunk.file),
  }));

  for (const asset of topLevelAssets) {
    const file = normalizeAssetPath(asset.file || manifest[asset.manifestKey] || asset.fallback);
    const localPath = path.join(assetDir, file);
    const exists = await fileExists(localPath);

    if (!exists && asset.optional) {
      console.log(`Skipping optional ${asset.label}: ${localPath}`);
      asset.skip = true;
      if (asset.manifestKey) {
        manifest[asset.manifestKey] = null;
      }
      continue;
    }

    await assertFileExists(localPath, asset.label);
  }

  for (const superchunk of normalizedSuperchunks) {
    await assertFileExists(path.join(assetDir, superchunk.file), `superchunk ${superchunk.superchunk_id}`);
  }

  console.log("All referenced files are present.");
  console.log("Upserting build metadata with is_current = false...");

  const buildRow = buildMetadataRow(manifest, buildPrefix);
  const { error: buildError } = await supabase.from("gw_asset_builds").upsert(buildRow);
  if (buildError) {
    throw new Error(`Failed to upsert gw_asset_builds row: ${buildError.message}`);
  }

  console.log("Uploading top-level assets...");
  for (const asset of topLevelAssets) {
    if (asset.skip) continue;

    const file = normalizeAssetPath(asset.file || manifest[asset.manifestKey] || asset.fallback);
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
    buildPrefix,
  });

  console.log("Upserting superchunk metadata...");
  const superchunkRows = normalizedSuperchunks.map((superchunk) => buildSuperchunkRow(manifest, superchunk, buildPrefix));
  await upsertRows({
    supabase,
    table: "gw_superchunks",
    rows: superchunkRows,
    batchSize: SUPERCHUNK_UPSERT_BATCH_SIZE,
    onBatch: (done, total) => console.log(`Upserted ${done}/${total} superchunk rows`),
  });

  console.log("Promoting build to current...");
  const { error: clearCurrentError } = await supabase
    .from("gw_asset_builds")
    .update({ is_current: false })
    .neq("build_id", manifest.build_id);

  if (clearCurrentError) {
    throw new Error(`Failed to clear current build flags: ${clearCurrentError.message}`);
  }

  const { error: setCurrentError } = await supabase
    .from("gw_asset_builds")
    .update({ is_current: true })
    .eq("build_id", manifest.build_id);

  if (setCurrentError) {
    throw new Error(`Failed to set current build flag: ${setCurrentError.message}`);
  }

  console.log("Publish complete.");
  console.log(`Superchunks uploaded: ${uploadedSuperchunks}`);
  console.log(`Superchunk rows upserted: ${superchunkRows.length}`);
  console.log(`Current build: ${manifest.build_id}`);
}

main().catch((error) => {
  console.error("Publish failed.");
  console.error(error);
  process.exitCode = 1;
});
