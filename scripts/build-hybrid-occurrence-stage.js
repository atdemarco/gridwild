const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_WORLD_DIR = "C:\\Users\\ad1470\\Desktop\\gridwild\\world";
const DEFAULT_DUCKDB_EXE = path.join(DEFAULT_WORLD_DIR, "duckdb.exe");
const DEFAULT_REGION = "dc_va_hybrid";
const DEFAULT_LABEL = "District of Columbia + Virginia Hybrid Bootstrap";
const DEFAULT_VERSION = "hybrid_occurrence_v001";
const DEFAULT_GOLD_VERSION = "served_v002";
const DEFAULT_MAX_POSITIONAL_ACCURACY_M = 30;
const DEFAULT_AWS_QUALITY_GRADES = ["needs_id", "casual"];
const DEFAULT_GRID_SIZE_M = 6.096;
const R = 6378137;

const NAMED_REGIONS = {
  dc_va: {
    region: DEFAULT_REGION,
    label: DEFAULT_LABEL,
    bbox: [-83.75, 36.45, -75.0, 39.55],
    countryCode: "US",
    stateProvince: "hybrid_bbox_dc_va"
  },
  dc_va_hybrid: {
    region: DEFAULT_REGION,
    label: DEFAULT_LABEL,
    bbox: [-83.75, 36.45, -75.0, 39.55],
    countryCode: "US",
    stateProvince: "hybrid_bbox_dc_va"
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

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function readCsv(file) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
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
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  if (!rows.length) return [];

  const header = rows.shift();
  return rows
    .filter((r) => r.length && r.some((value) => value !== ""))
    .map((r) => {
      const out = {};
      header.forEach((name, index) => {
        out[name] = r[index] ?? "";
      });
      return out;
    });
}

function sqlString(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function sqlPath(value) {
  return String(value).replace(/\\/g, "/").replace(/'/g, "''");
}

function sqlList(values) {
  return values.map((value) => sqlString(value)).join(", ");
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function int(value, fallback = 0) {
  return Math.trunc(numberValue(value, fallback));
}

function hasGlob(value) {
  return /[*?[\]{}]/.test(String(value || ""));
}

function locateDuckDb(args) {
  const candidates = [args.duckdb, process.env.DUCKDB_EXE, DEFAULT_DUCKDB_EXE, "duckdb"].filter(
    Boolean
  );
  for (const candidate of candidates) {
    if (candidate === "duckdb") return candidate;
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `DuckDB executable not found. Set DUCKDB_EXE or pass --duckdb. Tried: ${candidates.join(", ")}`
  );
}

function parseBbox(value) {
  const values = splitList(value).map(Number);
  if (values.length !== 4 || values.some((n) => !Number.isFinite(n))) {
    throw new Error("BBox must be four comma-separated numbers: minLon,minLat,maxLon,maxLat");
  }
  const [minLon, minLat, maxLon, maxLat] = values;
  if (minLon >= maxLon || minLat >= maxLat) {
    throw new Error("BBox min values must be less than max values.");
  }
  return values;
}

function resolveRegion(args) {
  const requested = args.region || DEFAULT_REGION;
  const named = NAMED_REGIONS[requested];
  if (!named && !args.bbox) {
    throw new Error(
      `Unknown region "${requested}". Pass --bbox minLon,minLat,maxLon,maxLat for custom coverage.`
    );
  }
  const fallback = named || {
    region: requested,
    label: requested,
    bbox: parseBbox(args.bbox),
    countryCode: "US",
    stateProvince: requested
  };
  const bbox = args.bbox ? parseBbox(args.bbox) : fallback.bbox;
  return {
    region: args["region-id"] || fallback.region,
    label: args.label || fallback.label,
    bbox,
    countryCode: args["country-code"] || fallback.countryCode || "US",
    stateProvince: args["state-province"] || fallback.stateProvince || requested
  };
}

function readExpression(input) {
  const normalized = String(input || "");
  if (hasGlob(normalized)) {
    if (normalized.toLowerCase().includes(".parquet")) {
      return `read_parquet(${sqlString(sqlPath(normalized))}, hive_partitioning=true, union_by_name=true)`;
    }
    return `read_csv(${sqlString(sqlPath(normalized))}, header=true, all_varchar=true, ignore_errors=true, null_padding=true)`;
  }

  if (!fs.existsSync(normalized)) throw new Error(`Input does not exist: ${normalized}`);
  const stat = fs.statSync(normalized);
  if (stat.isDirectory()) {
    return `read_parquet(${sqlString(sqlPath(path.join(normalized, "**", "*.parquet")))}, hive_partitioning=true, union_by_name=true)`;
  }

  const ext = path.extname(normalized).toLowerCase();
  if (ext === ".parquet") {
    return `read_parquet(${sqlString(sqlPath(normalized))}, hive_partitioning=true, union_by_name=true)`;
  }
  if (ext === ".tsv" || ext === ".txt") {
    return `read_csv(${sqlString(sqlPath(normalized))}, delim='\\t', header=true, all_varchar=true, ignore_errors=true, null_padding=true)`;
  }
  if (ext === ".csv") {
    return `read_csv(${sqlString(sqlPath(normalized))}, delim=',', header=true, all_varchar=true, ignore_errors=true, null_padding=true)`;
  }
  throw new Error(`Unsupported input: ${normalized}`);
}

function mercatorX(lon) {
  return R * ((lon * Math.PI) / 180);
}

function mercatorY(lat) {
  return R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 180 / 2));
}

function validationMetricMap(file) {
  const out = {};
  for (const row of readCsv(file)) {
    const value = Number(row.value);
    out[row.metric] = Number.isNaN(value) ? row.value : value;
  }
  return out;
}

function runDuckDb({ duckdbExe, dbFile, sqlFile }) {
  childProcess.execFileSync(duckdbExe, [dbFile, "-f", sqlFile], {
    stdio: "inherit",
    windowsHide: true
  });
}

function buildSql({
  gbifExpr,
  awsExpr,
  outputParquet,
  validationCsv,
  args,
  region,
  awsQualityGrades,
  maxAccuracyM,
  gridSizeM
}) {
  const [minLon, minLat, maxLon, maxLat] = region.bbox;
  const limitPerSource = Math.max(0, int(args["limit-per-source"] || args.limit || 0));
  const gbifLimitSql = limitPerSource > 0 ? `LIMIT ${limitPerSource}` : "";
  const awsLimitSql = limitPerSource > 0 ? `LIMIT ${limitPerSource}` : "";
  const threads = Math.max(1, int(args.threads || "4", 4));
  const workMem = args.memory || args["memory-limit"] || "8GB";
  const minX = Math.floor(mercatorX(minLon) / gridSizeM);
  const maxX = Math.floor(mercatorX(maxLon) / gridSizeM);
  const minY = Math.floor(mercatorY(minLat) / gridSizeM);
  const maxY = Math.floor(mercatorY(maxLat) / gridSizeM);

  return `
SET threads TO ${threads};
SET preserve_insertion_order = false;
SET memory_limit = ${sqlString(workMem)};
SET temp_directory = ${sqlString(sqlPath(path.join(path.dirname(outputParquet), "duckdb_tmp")))};

CREATE OR REPLACE TABLE gbif_bootstrap AS
WITH raw AS (
  SELECT *
  FROM ${gbifExpr}
  WHERE lat BETWEEN ${minLat} AND ${maxLat}
    AND lon BETWEEN ${minLon} AND ${maxLon}
    AND lat BETWEEN -85.05112878 AND 85.05112878
    AND coordinate_uncertainty_m <= ${maxAccuracyM}
    AND event_date IS NOT NULL
    AND genus IS NOT NULL
    AND genus <> ''
  ${gbifLimitSql}
), normalized AS (
  SELECT
    COALESCE(
      NULLIF(catalog_number, ''),
      NULLIF(regexp_extract(occurrence_id, 'observations/([0-9]+)', 1), ''),
      NULLIF(regexp_extract(source_references, 'observations/([0-9]+)', 1), ''),
      NULLIF(source_observation_id, '')
    ) AS inat_observation_id,
    *
  FROM raw
)
SELECT
  'gbif_inaturalist_research_grade' AS source,
  ${sqlString(args["gbif-snapshot-id"] || "gbif_inaturalist_research_grade_local_silver")} AS source_snapshot,
  ${sqlString(args["season-id"] || "")} AS season_id,
  CAST(NULL AS VARCHAR) AS source_observation_uuid,
  CAST(inat_observation_id AS VARCHAR) AS source_observation_id,
  CAST(inat_observation_id AS VARCHAR) AS inat_observation_id,
  CAST(NULL AS VARCHAR) AS inat_observation_uuid,
  CASE
    WHEN inat_observation_id IS NOT NULL AND inat_observation_id <> '' THEN 'inat:' || CAST(inat_observation_id AS VARCHAR)
    ELSE 'gbif:' || COALESCE(
      NULLIF(occurrence_id, ''),
      NULLIF(source_observation_id, ''),
      NULLIF(catalog_number, ''),
      md5(
        COALESCE(scientific_name, '') || '|' ||
        COALESCE(CAST(event_date AS VARCHAR), '') || '|' ||
        COALESCE(CAST(lat AS VARCHAR), '') || '|' ||
        COALESCE(CAST(lon AS VARCHAR), '')
      )
    )
  END AS canonical_observation_key,
  country_code,
  state_province,
  lat,
  lon,
  coordinate_uncertainty_m AS positional_accuracy,
  CAST(taxon_id AS VARCHAR) AS taxon_id,
  CAST(NULL AS BIGINT) AS inat_taxon_id,
  taxon_rank,
  scientific_name,
  kingdom,
  phylum,
  class_name,
  order_name,
  family,
  genus,
  scientific_name AS species,
  'research' AS quality_grade,
  CAST(NULL AS DOUBLE) AS anomaly_score,
  event_date,
  event_month::INTEGER AS event_month,
  COALESCE(NULLIF(inaturalist_login, ''), NULLIF(recorded_by, ''), 'unknown_user') AS inaturalist_login,
  COALESCE(NULLIF(recorded_by, ''), NULLIF(inaturalist_login, ''), 'unknown_user') AS recorded_by,
  captive AS captive_cultivated,
  'gbif_inaturalist_research_grade' AS captive_cultivated_status_source,
  TRUE AS source_seen_gbif,
  FALSE AS source_seen_aws,
  FALSE AS source_seen_inat_api,
  20 AS source_priority,
  dataset_name,
  occurrence_id,
  catalog_number,
  source_references,
  license AS source_license
FROM normalized;

CREATE OR REPLACE TABLE aws_bootstrap AS
SELECT
  'aws_inaturalist_open_media' AS source,
  COALESCE(NULLIF(source_snapshot, ''), ${sqlString(args["aws-snapshot-id"] || "inat_aws_snapshot")}) AS source_snapshot,
  COALESCE(NULLIF(season_id, ''), ${sqlString(args["season-id"] || "")}) AS season_id,
  source_observation_uuid,
  CAST(NULL AS VARCHAR) AS source_observation_id,
  CAST(NULL AS VARCHAR) AS inat_observation_id,
  source_observation_uuid AS inat_observation_uuid,
  'inat_uuid:' || source_observation_uuid AS canonical_observation_key,
  country_code,
  state_province,
  lat,
  lon,
  positional_accuracy,
  CAST(taxon_id AS VARCHAR) AS taxon_id,
  inat_taxon_id,
  taxon_rank,
  scientific_name,
  kingdom,
  phylum,
  class_name,
  order_name,
  family,
  genus,
  species,
  quality_grade,
  anomaly_score,
  event_date,
  event_month::INTEGER AS event_month,
  inaturalist_login,
  recorded_by,
  captive_cultivated,
  captive_cultivated_status_source,
  FALSE AS source_seen_gbif,
  TRUE AS source_seen_aws,
  FALSE AS source_seen_inat_api,
  30 AS source_priority,
  'iNaturalist Licensed Observation Images' AS dataset_name,
  CAST(NULL AS VARCHAR) AS occurrence_id,
  CAST(NULL AS VARCHAR) AS catalog_number,
  CAST(NULL AS VARCHAR) AS source_references,
  CAST(NULL AS VARCHAR) AS source_license
FROM ${awsExpr}
WHERE lat BETWEEN ${minLat} AND ${maxLat}
  AND lon BETWEEN ${minLon} AND ${maxLon}
  AND lat BETWEEN -85.05112878 AND 85.05112878
  AND positional_accuracy <= ${maxAccuracyM}
  AND event_date IS NOT NULL
  AND genus IS NOT NULL
  AND genus <> ''
  AND quality_grade IN (${sqlList(awsQualityGrades)})
${awsLimitSql};

CREATE OR REPLACE TABLE hybrid_candidates AS
SELECT * FROM gbif_bootstrap
UNION ALL BY NAME
SELECT * FROM aws_bootstrap;

CREATE OR REPLACE TABLE hybrid_occurrence_stage AS
SELECT * EXCLUDE(dedupe_rank)
FROM (
  SELECT
    *,
    row_number() OVER (
      PARTITION BY canonical_observation_key
      ORDER BY source_priority ASC, source ASC
    ) AS dedupe_rank
  FROM hybrid_candidates
  WHERE canonical_observation_key IS NOT NULL
    AND canonical_observation_key <> ''
)
WHERE dedupe_rank = 1;

COPY (
  SELECT *
  FROM hybrid_occurrence_stage
  ORDER BY event_date, canonical_observation_key
) TO ${sqlString(sqlPath(outputParquet))} (FORMAT PARQUET, COMPRESSION ZSTD);

COPY (
  SELECT 'gbif_retained_rows' AS metric, COUNT(*)::VARCHAR AS value FROM gbif_bootstrap
  UNION ALL SELECT 'aws_retained_rows', COUNT(*)::VARCHAR FROM aws_bootstrap
  UNION ALL SELECT 'candidate_rows', COUNT(*)::VARCHAR FROM hybrid_candidates
  UNION ALL SELECT 'output_rows', COUNT(*)::VARCHAR FROM hybrid_occurrence_stage
  UNION ALL SELECT 'duplicate_canonical_rows_dropped', (SELECT COUNT(*) FROM hybrid_candidates) - (SELECT COUNT(*) FROM hybrid_occurrence_stage)
  UNION ALL SELECT 'distinct_canonical_observation_keys', COUNT(DISTINCT canonical_observation_key)::VARCHAR FROM hybrid_occurrence_stage
  UNION ALL SELECT 'distinct_observers', COUNT(DISTINCT inaturalist_login)::VARCHAR FROM hybrid_occurrence_stage
  UNION ALL SELECT 'distinct_taxa', COUNT(DISTINCT scientific_name)::VARCHAR FROM hybrid_occurrence_stage
  UNION ALL SELECT 'distinct_genera', COUNT(DISTINCT genus)::VARCHAR FROM hybrid_occurrence_stage
  UNION ALL SELECT 'min_event_date', CAST(MIN(event_date) AS VARCHAR) FROM hybrid_occurrence_stage
  UNION ALL SELECT 'max_event_date', CAST(MAX(event_date) AS VARCHAR) FROM hybrid_occurrence_stage
  UNION ALL SELECT 'research_count', SUM(CASE WHEN quality_grade = 'research' THEN 1 ELSE 0 END)::VARCHAR FROM hybrid_occurrence_stage
  UNION ALL SELECT 'needs_id_count', SUM(CASE WHEN quality_grade = 'needs_id' THEN 1 ELSE 0 END)::VARCHAR FROM hybrid_occurrence_stage
  UNION ALL SELECT 'casual_count', SUM(CASE WHEN quality_grade = 'casual' THEN 1 ELSE 0 END)::VARCHAR FROM hybrid_occurrence_stage
  UNION ALL SELECT 'min_grid_ix', MIN(CAST(floor((6378137.0 * radians(lon)) / ${gridSizeM}) AS BIGINT))::VARCHAR FROM hybrid_occurrence_stage
  UNION ALL SELECT 'max_grid_ix', MAX(CAST(floor((6378137.0 * radians(lon)) / ${gridSizeM}) AS BIGINT))::VARCHAR FROM hybrid_occurrence_stage
  UNION ALL SELECT 'min_grid_iy', MIN(CAST(floor((6378137.0 * ln(tan(pi()/4.0 + radians(lat)/2.0))) / ${gridSizeM}) AS BIGINT))::VARCHAR FROM hybrid_occurrence_stage
  UNION ALL SELECT 'max_grid_iy', MAX(CAST(floor((6378137.0 * ln(tan(pi()/4.0 + radians(lat)/2.0))) / ${gridSizeM}) AS BIGINT))::VARCHAR FROM hybrid_occurrence_stage
) TO ${sqlString(sqlPath(validationCsv))} (HEADER, DELIMITER ',');

COPY (
  SELECT source, quality_grade, COUNT(*) AS count
  FROM hybrid_occurrence_stage
  GROUP BY source, quality_grade
  ORDER BY source, quality_grade
) TO ${sqlString(sqlPath(path.join(path.dirname(validationCsv), "source_quality_summary.csv")))} (HEADER, DELIMITER ',');

COPY (
  SELECT taxon_rank, COUNT(*) AS count
  FROM hybrid_occurrence_stage
  GROUP BY taxon_rank
  ORDER BY count DESC
) TO ${sqlString(sqlPath(path.join(path.dirname(validationCsv), "rank_summary.csv")))} (HEADER, DELIMITER ',');

COPY (
  SELECT genus, COUNT(*) AS count
  FROM hybrid_occurrence_stage
  GROUP BY genus
  ORDER BY count DESC, genus
  LIMIT 50
) TO ${sqlString(sqlPath(path.join(path.dirname(validationCsv), "top_genera.csv")))} (HEADER, DELIMITER ',');

COPY (
  SELECT
    ${minLon} AS min_lon,
    ${minLat} AS min_lat,
    ${maxLon} AS max_lon,
    ${maxLat} AS max_lat,
    ${minX} AS min_grid_ix,
    ${maxX} AS max_grid_ix,
    ${minY} AS min_grid_iy,
    ${maxY} AS max_grid_iy
) TO ${sqlString(sqlPath(path.join(path.dirname(validationCsv), "region_bbox.csv")))} (HEADER, DELIMITER ',');
`;
}

function main() {
  const args = parseArgs(process.argv);
  const worldDir = path.resolve(
    args["world-dir"] || process.env.GRIDWILD_WORLD_DIR || DEFAULT_WORLD_DIR
  );
  const duckdbExe = locateDuckDb(args);
  const region = resolveRegion(args);
  const version = args.version || DEFAULT_VERSION;
  const gbifInput = path.resolve(
    args["gbif-input"] ||
      process.env.GRIDWILD_GBIF_OCCURRENCE_PATH ||
      path.join(worldDir, "parquet", "occurrence_silver_v001")
  );
  const awsInput = path.resolve(
    args["aws-input"] ||
      process.env.GRIDWILD_AWS_INAT_OCCURRENCE_PATH ||
      path.join(worldDir, "parquet", "inat_snapshot_v001", "dc_va_inat", "occurrence.parquet")
  );
  const outDir = path.resolve(
    args["out-dir"] || path.join(worldDir, "parquet", version, region.region)
  );
  const outputParquet = path.join(outDir, "occurrence.parquet");
  const validationCsv = path.join(outDir, "validation_metrics.csv");
  const manifestFile = path.join(outDir, "manifest.json");
  const awsQualityGrades = splitList(args["aws-quality-grades"]).length
    ? splitList(args["aws-quality-grades"]).map((value) => value.toLowerCase())
    : DEFAULT_AWS_QUALITY_GRADES;
  const maxAccuracyM = numberValue(
    args["max-positional-accuracy"] || args["max-accuracy"],
    DEFAULT_MAX_POSITIONAL_ACCURACY_M
  );
  const gridSizeM = numberValue(args["grid-size-m"], DEFAULT_GRID_SIZE_M);
  const goldVersion = args["gold-version"] || DEFAULT_GOLD_VERSION;

  if (args["check-inputs"]) {
    console.log(
      JSON.stringify(
        {
          ok: fs.existsSync(gbifInput) && fs.existsSync(awsInput),
          worldDir,
          duckdbExe,
          region,
          version,
          gbifInput,
          awsInput,
          outDir,
          outputParquet,
          awsQualityGrades,
          maxAccuracyM,
          gridSizeM,
          goldVersion,
          files: {
            gbifInput: fs.existsSync(gbifInput),
            awsInput: fs.existsSync(awsInput)
          }
        },
        null,
        2
      )
    );
    return;
  }

  if (!fs.existsSync(gbifInput)) throw new Error(`GBIF input not found: ${gbifInput}`);
  if (!fs.existsSync(awsInput)) throw new Error(`AWS iNat input not found: ${awsInput}`);
  if (fs.existsSync(outputParquet) && !args.overwrite) {
    throw new Error(`Output already exists. Pass --overwrite to replace: ${outputParquet}`);
  }

  ensureDir(outDir);
  const started = Date.now();
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "gridwild-hybrid-stage-"));
  const dbFile = path.join(workDir, "hybrid.duckdb");
  const sqlFile = path.join(workDir, "build_hybrid_occurrence.sql");
  const gbifExpr = readExpression(gbifInput);
  const awsExpr = readExpression(awsInput);

  fs.writeFileSync(
    sqlFile,
    buildSql({
      gbifExpr,
      awsExpr,
      outputParquet,
      validationCsv,
      args,
      region,
      awsQualityGrades,
      maxAccuracyM,
      gridSizeM
    })
  );

  runDuckDb({ duckdbExe, dbFile, sqlFile });

  const metrics = validationMetricMap(validationCsv);
  const durationSeconds = Math.round((Date.now() - started) / 1000);
  const goldProduct = `${region.region}_${goldVersion}`;
  const manifest = {
    schema_version: "gridwild.hybrid_occurrence_stage.v001",
    generator: "scripts/build-hybrid-occurrence-stage.js",
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    duration_seconds: durationSeconds,
    region: region.region,
    region_label: region.label,
    region_version: version,
    bbox: {
      min_lon: region.bbox[0],
      min_lat: region.bbox[1],
      max_lon: region.bbox[2],
      max_lat: region.bbox[3]
    },
    source_policy: {
      summary:
        "Bootstrap hybrid: GBIF iNaturalist research-grade rows plus AWS iNaturalist open-media needs_id/casual rows.",
      gbif: "Local GBIF silver lake is treated as the research-grade iNaturalist backbone for this bootstrap build.",
      aws: "AWS iNaturalist Licensed Observation Images contributes non-research quality grades by default to avoid double-counting GBIF research-grade rows.",
      aws_quality_grades: awsQualityGrades,
      dedupe:
        "Rows are deduped by canonical_observation_key. Without a UUID-to-iNat-ID crosswalk, GBIF rows use inat:<id> and AWS rows use inat_uuid:<uuid>.",
      future_api_enrichment:
        "Future iNaturalist API/export rows should populate inat_observation_id and supersede GBIF/AWS rows with canonical_observation_key=inaturalist id."
    },
    filters: {
      max_positional_accuracy_m: maxAccuracyM,
      missing_positional_accuracy: "excluded",
      fine_heat_policy:
        "Only rows passing this fine observation filter enter Gold and coarse summaries."
    },
    source: {
      gbif_input: gbifInput,
      aws_input: awsInput
    },
    output: {
      occurrence_parquet: outputParquet,
      validation_metrics: validationCsv
    },
    metrics,
    next_commands: {
      gold_served_taxonomy: `npm.cmd run build:gold-served-taxonomy -- --occurrence-input "${outputParquet}" --region ${region.region} --label "${region.label}" --version ${goldVersion} --country all --states all --threads 4`,
      coarse_pyramid: `npm.cmd run build:coarse-pyramid -- --product ${goldProduct} --levels 16,32,64,128 --source-asset-dir "${path.join(worldDir, "gold", goldProduct)}" --stage-dir "${path.join(worldDir, "gold_stage", goldProduct)}" --threads 4`
    }
  };

  writeJson(manifestFile, manifest);

  console.log(
    JSON.stringify(
      {
        region: region.region,
        version,
        outputParquet,
        manifestFile,
        metrics,
        next: manifest.next_commands.gold_served_taxonomy
      },
      null,
      2
    )
  );
}

main();
