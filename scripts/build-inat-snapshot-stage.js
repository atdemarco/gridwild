const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_WORLD_DIR = "C:\\Users\\ad1470\\Desktop\\gridwild\\world";
const DEFAULT_DUCKDB_EXE = path.join(DEFAULT_WORLD_DIR, "duckdb.exe");
const DEFAULT_SNAPSHOT_BASE_URL = "https://inaturalist-open-data.s3.amazonaws.com";
const DEFAULT_REGION = "dc_va_inat";
const DEFAULT_LABEL = "District of Columbia + Virginia iNaturalist Snapshot";
const DEFAULT_VERSION = "inat_snapshot_v001";
const DEFAULT_MAX_POSITIONAL_ACCURACY_M = 30;
const DEFAULT_QUALITY_GRADES = ["research", "needs_id", "casual"];
const DEFAULT_GRID_SIZE_M = 6.096;
const R = 6378137;

const NAMED_REGIONS = {
  dc_va: {
    region: "dc_va_inat",
    label: DEFAULT_LABEL,
    bbox: [-83.75, 36.45, -75.0, 39.55],
    countryCode: "US",
    stateProvince: "inat_bbox_dc_va"
  },
  dc_va_inat: {
    region: "dc_va_inat",
    label: DEFAULT_LABEL,
    bbox: [-83.75, 36.45, -75.0, 39.55],
    countryCode: "US",
    stateProvince: "inat_bbox_dc_va"
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

function isUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
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

function snapshotInput({ args, snapshotDir, snapshotBaseUrl, key }) {
  if (args[key]) return args[key];
  const filename = `${key}.csv.gz`;
  if (snapshotDir) {
    const file = path.resolve(snapshotDir, filename);
    if (fs.existsSync(file)) return file;
  }
  return `${snapshotBaseUrl.replace(/\/+$/g, "")}/${filename}`;
}

function duckReadTsv(input) {
  const source = isUrl(input) ? input : path.resolve(input);
  return `read_csv(${sqlString(sqlPath(source))}, delim='\\t', header=true, all_varchar=true, ignore_errors=true, null_padding=true)`;
}

function maybeHttpfsSql(inputs) {
  return inputs.some(isUrl)
    ? `
INSTALL httpfs;
LOAD httpfs;
`
    : "";
}

function mercatorX(lon) {
  return R * ((lon * Math.PI) / 180);
}

function mercatorY(lat) {
  return R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 180 / 2));
}

function buildSql({
  observationsInput,
  taxaInput,
  observersInput,
  outputParquet,
  validationCsv,
  args,
  region,
  qualityGrades,
  maxAccuracyM,
  gridSizeM
}) {
  const [minLon, minLat, maxLon, maxLat] = region.bbox;
  const limit = int(args.limit || args["max-observations"] || 0);
  const limitSql = limit > 0 ? `LIMIT ${limit}` : "";
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
${maybeHttpfsSql([observationsInput, taxaInput, observersInput])}

CREATE OR REPLACE TABLE inat_taxa AS
SELECT
  TRY_CAST(taxon_id AS BIGINT) AS taxon_id,
  NULLIF(ancestry, '') AS ancestry,
  TRY_CAST(rank_level AS DOUBLE) AS rank_level,
  LOWER(NULLIF(rank, '')) AS rank,
  NULLIF(name, '') AS name,
  LOWER(COALESCE(active, '')) = 'true' AS active
FROM ${duckReadTsv(taxaInput)}
WHERE TRY_CAST(taxon_id AS BIGINT) IS NOT NULL;

CREATE OR REPLACE TABLE inat_taxon_lineage AS
WITH path_ids AS (
  SELECT
    t.taxon_id AS focal_taxon_id,
    TRY_CAST(unnest(string_split(
      CASE
        WHEN t.ancestry IS NULL OR t.ancestry = '' THEN CAST(t.taxon_id AS VARCHAR)
        ELSE t.ancestry || '/' || CAST(t.taxon_id AS VARCHAR)
      END,
      '/'
    )) AS BIGINT) AS lineage_taxon_id
  FROM inat_taxa t
)
SELECT
  p.focal_taxon_id AS taxon_id,
  MAX(CASE WHEN a.rank = 'kingdom' THEN a.name END) AS kingdom,
  MAX(CASE WHEN a.rank = 'phylum' THEN a.name END) AS phylum,
  MAX(CASE WHEN a.rank = 'class' THEN a.name END) AS class_name,
  MAX(CASE WHEN a.rank = 'order' THEN a.name END) AS order_name,
  MAX(CASE WHEN a.rank = 'family' THEN a.name END) AS family,
  MAX(CASE WHEN a.rank = 'genus' THEN a.name END) AS genus,
  MAX(CASE WHEN a.rank = 'species' THEN a.name END) AS species
FROM path_ids p
LEFT JOIN inat_taxa a
  ON a.taxon_id = p.lineage_taxon_id
GROUP BY p.focal_taxon_id;

CREATE OR REPLACE TABLE inat_observers AS
SELECT
  TRY_CAST(observer_id AS BIGINT) AS observer_id,
  NULLIF(login, '') AS login,
  NULLIF(name, '') AS name
FROM ${duckReadTsv(observersInput)}
WHERE TRY_CAST(observer_id AS BIGINT) IS NOT NULL;

CREATE OR REPLACE TABLE inat_observations_filtered AS
SELECT *
FROM (
  SELECT
    NULLIF(observation_uuid, '') AS observation_uuid,
    TRY_CAST(observer_id AS BIGINT) AS observer_id,
    TRY_CAST(latitude AS DOUBLE) AS lat,
    TRY_CAST(longitude AS DOUBLE) AS lon,
    TRY_CAST(positional_accuracy AS DOUBLE) AS positional_accuracy,
    TRY_CAST(taxon_id AS BIGINT) AS native_taxon_id,
    LOWER(NULLIF(quality_grade, '')) AS quality_grade,
    TRY_CAST(observed_on AS DATE) AS event_date,
    TRY_CAST(anomaly_score AS DOUBLE) AS anomaly_score
  FROM ${duckReadTsv(observationsInput)}
)
WHERE observation_uuid IS NOT NULL
  AND observer_id IS NOT NULL
  AND native_taxon_id IS NOT NULL
  AND event_date IS NOT NULL
  AND quality_grade IN (${sqlList(qualityGrades)})
  AND positional_accuracy <= ${maxAccuracyM}
  AND lat BETWEEN ${minLat} AND ${maxLat}
  AND lon BETWEEN ${minLon} AND ${maxLon}
  AND lat BETWEEN -85.05112878 AND 85.05112878
${limitSql};

CREATE OR REPLACE TABLE inat_occurrence_silver AS
SELECT
  'inat_snapshot' AS source,
  ${sqlString(args["snapshot-id"] || "inaturalist-open-data-latest")} AS source_snapshot,
  ${sqlString(args["season-id"] || "")} AS season_id,
  o.observation_uuid AS source_observation_uuid,
  CAST(o.observer_id AS VARCHAR) AS source_observer_id,
  ${sqlString(region.countryCode)} AS country_code,
  ${sqlString(region.stateProvince)} AS state_province,
  o.lat,
  o.lon,
  o.positional_accuracy,
  'inat:' || CAST(o.native_taxon_id AS VARCHAR) AS taxon_id,
  o.native_taxon_id AS inat_taxon_id,
  tx.rank AS taxon_rank,
  tx.name AS scientific_name,
  lineage.kingdom,
  lineage.phylum,
  lineage.class_name,
  lineage.order_name,
  lineage.family,
  lineage.genus,
  lineage.species,
  o.quality_grade,
  o.anomaly_score,
  o.event_date,
  EXTRACT(month FROM o.event_date)::INTEGER AS event_month,
  COALESCE(obs.login, 'inat_' || CAST(o.observer_id AS VARCHAR)) AS inaturalist_login,
  COALESCE(obs.name, obs.login, 'inat_' || CAST(o.observer_id AS VARCHAR)) AS recorded_by,
  CAST(NULL AS BOOLEAN) AS captive_cultivated,
  'unavailable_in_inat_open_data_snapshot' AS captive_cultivated_status_source
FROM inat_observations_filtered o
LEFT JOIN inat_taxa tx
  ON tx.taxon_id = o.native_taxon_id
LEFT JOIN inat_taxon_lineage lineage
  ON lineage.taxon_id = o.native_taxon_id
LEFT JOIN inat_observers obs
  ON obs.observer_id = o.observer_id
WHERE lineage.genus IS NOT NULL
  AND lineage.genus <> '';

COPY (
  SELECT *
  FROM inat_occurrence_silver
  ORDER BY event_date, source_observation_uuid
) TO ${sqlString(sqlPath(outputParquet))} (FORMAT PARQUET, COMPRESSION ZSTD);

COPY (
  SELECT 'accepted_observations' AS metric, COUNT(*)::VARCHAR AS value FROM inat_occurrence_silver
  UNION ALL SELECT 'distinct_observers', COUNT(DISTINCT source_observer_id)::VARCHAR FROM inat_occurrence_silver
  UNION ALL SELECT 'distinct_inat_taxa', COUNT(DISTINCT inat_taxon_id)::VARCHAR FROM inat_occurrence_silver
  UNION ALL SELECT 'distinct_genera', COUNT(DISTINCT genus)::VARCHAR FROM inat_occurrence_silver
  UNION ALL SELECT 'min_event_date', CAST(MIN(event_date) AS VARCHAR) FROM inat_occurrence_silver
  UNION ALL SELECT 'max_event_date', CAST(MAX(event_date) AS VARCHAR) FROM inat_occurrence_silver
  UNION ALL SELECT 'research_count', SUM(CASE WHEN quality_grade = 'research' THEN 1 ELSE 0 END)::VARCHAR FROM inat_occurrence_silver
  UNION ALL SELECT 'needs_id_count', SUM(CASE WHEN quality_grade = 'needs_id' THEN 1 ELSE 0 END)::VARCHAR FROM inat_occurrence_silver
  UNION ALL SELECT 'casual_count', SUM(CASE WHEN quality_grade = 'casual' THEN 1 ELSE 0 END)::VARCHAR FROM inat_occurrence_silver
  UNION ALL SELECT 'min_grid_ix', MIN(CAST(floor((6378137.0 * radians(lon)) / ${gridSizeM}) AS BIGINT))::VARCHAR FROM inat_occurrence_silver
  UNION ALL SELECT 'max_grid_ix', MAX(CAST(floor((6378137.0 * radians(lon)) / ${gridSizeM}) AS BIGINT))::VARCHAR FROM inat_occurrence_silver
  UNION ALL SELECT 'min_grid_iy', MIN(CAST(floor((6378137.0 * ln(tan(pi()/4.0 + radians(lat)/2.0))) / ${gridSizeM}) AS BIGINT))::VARCHAR FROM inat_occurrence_silver
  UNION ALL SELECT 'max_grid_iy', MAX(CAST(floor((6378137.0 * ln(tan(pi()/4.0 + radians(lat)/2.0))) / ${gridSizeM}) AS BIGINT))::VARCHAR FROM inat_occurrence_silver
) TO ${sqlString(sqlPath(validationCsv))} (HEADER, DELIMITER ',');

COPY (
  SELECT quality_grade, COUNT(*) AS count
  FROM inat_occurrence_silver
  GROUP BY quality_grade
  ORDER BY count DESC
) TO ${sqlString(sqlPath(path.join(path.dirname(validationCsv), "quality_grade_summary.csv")))} (HEADER, DELIMITER ',');

COPY (
  SELECT taxon_rank, COUNT(*) AS count
  FROM inat_occurrence_silver
  GROUP BY taxon_rank
  ORDER BY count DESC
) TO ${sqlString(sqlPath(path.join(path.dirname(validationCsv), "rank_summary.csv")))} (HEADER, DELIMITER ',');

COPY (
  SELECT genus, COUNT(*) AS count
  FROM inat_occurrence_silver
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

function runDuckDb({ duckdbExe, dbFile, sqlFile }) {
  childProcess.execFileSync(duckdbExe, [dbFile, "-f", sqlFile], {
    stdio: "inherit",
    windowsHide: true
  });
}

function validationMetricMap(file) {
  const out = {};
  for (const row of readCsv(file)) {
    const value = Number(row.value);
    out[row.metric] = Number.isNaN(value) ? row.value : value;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  const worldDir = path.resolve(
    args["world-dir"] || process.env.GRIDWILD_WORLD_DIR || DEFAULT_WORLD_DIR
  );
  const duckdbExe = locateDuckDb(args);
  const region = resolveRegion(args);
  const version = args.version || DEFAULT_VERSION;
  const snapshotDir = args["snapshot-dir"] ? path.resolve(args["snapshot-dir"]) : null;
  const snapshotBaseUrl = args["snapshot-base-url"] || DEFAULT_SNAPSHOT_BASE_URL;
  const observationsInput = snapshotInput({
    args,
    snapshotDir,
    snapshotBaseUrl,
    key: "observations"
  });
  const taxaInput = snapshotInput({ args, snapshotDir, snapshotBaseUrl, key: "taxa" });
  const observersInput = snapshotInput({ args, snapshotDir, snapshotBaseUrl, key: "observers" });
  const outDir = path.resolve(
    args["out-dir"] || path.join(worldDir, "parquet", version, region.region)
  );
  const outputParquet = path.join(outDir, "occurrence.parquet");
  const validationCsv = path.join(outDir, "validation_metrics.csv");
  const manifestFile = path.join(outDir, "manifest.json");
  const qualityGrades = splitList(args["quality-grades"]).length
    ? splitList(args["quality-grades"]).map((value) => value.toLowerCase())
    : DEFAULT_QUALITY_GRADES;
  const maxAccuracyM = numberValue(
    args["max-positional-accuracy"] || args["max-accuracy"],
    DEFAULT_MAX_POSITIONAL_ACCURACY_M
  );
  const gridSizeM = numberValue(args["grid-size-m"], DEFAULT_GRID_SIZE_M);

  if (args["check-inputs"]) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          duckdbExe,
          worldDir,
          region,
          version,
          snapshotDir,
          snapshotBaseUrl,
          observationsInput,
          taxaInput,
          observersInput,
          outDir,
          outputParquet,
          qualityGrades,
          maxAccuracyM,
          gridSizeM
        },
        null,
        2
      )
    );
    return;
  }

  if (fs.existsSync(outputParquet) && !args.overwrite) {
    throw new Error(`Output already exists: ${outputParquet}. Pass --overwrite to replace it.`);
  }

  ensureDir(outDir);
  if (args.overwrite) {
    for (const file of [
      outputParquet,
      validationCsv,
      manifestFile,
      path.join(outDir, "quality_grade_summary.csv"),
      path.join(outDir, "rank_summary.csv"),
      path.join(outDir, "top_genera.csv"),
      path.join(outDir, "region_bbox.csv")
    ]) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }

  const startedAt = new Date();
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "gridwild-inat-stage-"));
  const dbFile = path.join(workDir, "inat_snapshot.duckdb");
  const sqlFile = path.join(workDir, "build_inat_snapshot_stage.sql");

  fs.writeFileSync(
    sqlFile,
    buildSql({
      observationsInput,
      taxaInput,
      observersInput,
      outputParquet,
      validationCsv,
      args,
      region,
      qualityGrades,
      maxAccuracyM,
      gridSizeM
    })
  );

  runDuckDb({ duckdbExe, dbFile, sqlFile });

  const metrics = validationMetricMap(validationCsv);
  const finishedAt = new Date();
  const manifest = {
    schema_version: "gridwild.inat_snapshot_stage.v001",
    generator: "scripts/build-inat-snapshot-stage.js",
    generated_at: finishedAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
    duration_seconds: Math.round((finishedAt - startedAt) / 1000),
    region: region.region,
    region_label: region.label,
    region_version: version,
    bbox: {
      min_lon: region.bbox[0],
      min_lat: region.bbox[1],
      max_lon: region.bbox[2],
      max_lat: region.bbox[3]
    },
    source: {
      kind: "inaturalist_open_data_snapshot",
      snapshot_id: args["snapshot-id"] || "inaturalist-open-data-latest",
      observations: observationsInput,
      taxa: taxaInput,
      observers: observersInput
    },
    filters: {
      quality_grades: qualityGrades,
      quality_grade_weighting: "equal_for_main_gameplay_heat",
      max_positional_accuracy_m: maxAccuracyM,
      missing_positional_accuracy: "excluded",
      captive_cultivated_policy:
        "included_in_main_heat_when_present; status unavailable in AWS observations snapshot",
      obscured_policy:
        "snapshot has no geoprivacy field; fine filter uses public coordinates with positional_accuracy <= max_positional_accuracy_m"
    },
    output: {
      occurrence_parquet: outputParquet,
      validation_metrics: validationCsv
    },
    metrics,
    next_commands: {
      gold_served_taxonomy: `npm.cmd run build:gold-served-taxonomy -- --occurrence-input "${outputParquet}" --region ${region.region} --label "${region.label}" --version served_v001 --country all --states all --threads 4`,
      coarse_pyramid: `npm.cmd run build:coarse-pyramid -- --product ${region.region}_served_v001 --source-asset-dir "${path.join(worldDir, "gold", `${region.region}_served_v001`)}" --stage-dir "${path.join(worldDir, "gold_stage", `${region.region}_served_v001`)}" --threads 4`
    }
  };
  writeJson(manifestFile, manifest);

  console.log(
    JSON.stringify(
      {
        ok: true,
        region: region.region,
        version,
        outDir,
        outputParquet,
        metrics,
        next: manifest.next_commands.gold_served_taxonomy
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  main();
}
