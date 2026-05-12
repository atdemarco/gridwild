#!/usr/bin/env node

require("dotenv").config();

const fs = require("fs/promises");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const DEFAULT_BUCKET = "gridwild-assets";
const SUPERCHUNK_UPSERT_BATCH_SIZE = 500;
const UPLOAD_PROGRESS_EVERY = 250;

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

async function uploadFile({ supabase, bucket, localPath, storagePath, label }) {
  const body = await fs.readFile(localPath);
  const { error } = await supabase.storage.from(bucket).upload(storagePath, body, {
    cacheControl: "3600",
    contentType: contentTypeFor(localPath),
    upsert: true,
  });

  if (error) {
    throw new Error(`Failed to upload ${label} to ${storagePath}: ${error.message}`);
  }
}

function buildMetadataRow(manifest, buildPrefix) {
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
    square_summary_file: joinStoragePath(
      buildPrefix,
      normalizeAssetPath(manifest.square_summary_file || "squares_genus_summary.json"),
    ),
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
  const bucket = process.env.GRIDWILD_STORAGE_BUCKET || DEFAULT_BUCKET;

  const manifestPath = path.join(assetDir, "manifest.json");
  const manifest = await readJson(manifestPath);
  validateManifest(manifest);

  const buildPrefix = joinStoragePath("builds", manifest.build_id);
  const topLevelAssets = [
    { manifestKey: "heat_file", fallback: "dc_heat.csv", label: "heat CSV" },
    { manifestKey: "observer_dictionary_file", fallback: "observer_dictionary.json", label: "observer dictionary" },
    { manifestKey: "square_summary_file", fallback: "squares_genus_summary.json", label: "square genus summary" },
    { file: "manifest.json", label: "manifest" },
  ];

  console.log(`GridWild asset publish`);
  console.log(`Build: ${manifest.build_id}`);
  console.log(`Asset dir: ${assetDir}`);
  console.log(`Bucket: ${bucket}`);
  console.log(`Storage prefix: ${buildPrefix}`);
  console.log(`Superchunks expected: ${manifest.superchunks.length}`);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: bucketError } = await supabase.storage.getBucket(bucket);
  if (bucketError) {
    throw new Error(`Could not access storage bucket "${bucket}": ${bucketError.message}`);
  }

  const normalizedSuperchunks = manifest.superchunks.map((superchunk) => ({
    ...superchunk,
    file: normalizeAssetPath(superchunk.file),
  }));

  for (const asset of topLevelAssets) {
    const file = normalizeAssetPath(asset.file || manifest[asset.manifestKey] || asset.fallback);
    await assertFileExists(path.join(assetDir, file), asset.label);
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
    const file = normalizeAssetPath(asset.file || manifest[asset.manifestKey] || asset.fallback);
    const localPath = path.join(assetDir, file);
    const storagePath = joinStoragePath(buildPrefix, file);
    await uploadFile({ supabase, bucket, localPath, storagePath, label: asset.label });
    console.log(`Uploaded ${asset.label}: ${storagePath}`);
  }

  console.log("Uploading superchunks...");
  let uploadedSuperchunks = 0;
  for (const superchunk of normalizedSuperchunks) {
    const localPath = path.join(assetDir, superchunk.file);
    const storagePath = joinStoragePath(buildPrefix, superchunk.file);
    await uploadFile({
      supabase,
      bucket,
      localPath,
      storagePath,
      label: `superchunk ${superchunk.superchunk_id}`,
    });

    uploadedSuperchunks += 1;
    if (uploadedSuperchunks % UPLOAD_PROGRESS_EVERY === 0 || uploadedSuperchunks === normalizedSuperchunks.length) {
      console.log(`Uploaded ${uploadedSuperchunks}/${normalizedSuperchunks.length} superchunks`);
    }
  }

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
