const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");

const DEFAULT_WORLD_DIR = "C:\\Users\\ad1470\\Desktop\\gridwild\\world";
const DEFAULT_DUCKDB_EXE = path.join(DEFAULT_WORLD_DIR, "duckdb.exe");
const DEFAULT_OCCURRENCE_INPUT = path.join(DEFAULT_WORLD_DIR, "parquet", "occurrence_silver_v001");
const DEFAULT_SCORED_TAXONOMY = path.join(
  __dirname,
  "..",
  "assets",
  "playable_taxonomy",
  "scored_playable_taxa.json"
);
const DEFAULT_REGION = "dc_va";
const DEFAULT_LABEL = "District of Columbia + Virginia";
const DEFAULT_VERSION = "served_v001";
const DEFAULT_GRID_SIZE_M = 6.096;
const DEFAULT_SUPERCHUNK_SIZE = 1024;
const R = 6378137;

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

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
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

function yyyymmddhhmmss(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "_",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds())
  ].join("");
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function int(value, fallback = 0) {
  return Math.trunc(numberValue(value, fallback));
}

function norm(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function hasArg(args, key) {
  return Object.prototype.hasOwnProperty.call(args, key);
}

function isAllSelector(value) {
  return ["", "all", "world", "*"].includes(norm(value));
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

function findDuckDb(args) {
  const candidates = [args.duckdb, process.env.DUCKDB_EXE, DEFAULT_DUCKDB_EXE, "duckdb"].filter(
    Boolean
  );
  for (const candidate of candidates) {
    if (candidate === "duckdb") return candidate;
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`DuckDB executable not found. Tried: ${candidates.join(", ")}`);
}

function hasGlob(value) {
  return /[*?[\]]/.test(String(value));
}

function hasFileRecursive(dir, predicate, depth = 0) {
  if (!fs.existsSync(dir) || depth > 5) return false;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && predicate(fullPath)) return true;
    if (entry.isDirectory() && hasFileRecursive(fullPath, predicate, depth + 1)) return true;
  }
  return false;
}

function occurrenceReadExpression(input) {
  if (hasGlob(input)) {
    if (String(input).toLowerCase().includes(".parquet")) {
      return `read_parquet(${sqlString(sqlPath(input))}, hive_partitioning=true, union_by_name=true)`;
    }
    return `read_csv(${sqlString(sqlPath(input))}, header=true, all_varchar=true, ignore_errors=true, null_padding=true)`;
  }

  if (!fs.existsSync(input)) throw new Error(`Occurrence input does not exist: ${input}`);
  const stat = fs.statSync(input);
  if (stat.isDirectory()) {
    if (hasFileRecursive(input, (file) => file.toLowerCase().endsWith(".parquet"))) {
      return `read_parquet(${sqlString(sqlPath(path.join(input, "**", "*.parquet")))}, hive_partitioning=true, union_by_name=true)`;
    }
    const occurrenceFile = ["occurrence.txt", "Occurrence.txt", "occurrence.tsv", "Occurrence.tsv"]
      .map((name) => path.join(input, name))
      .find((file) => fs.existsSync(file));
    if (occurrenceFile) return occurrenceReadExpression(occurrenceFile);
    throw new Error(`Occurrence directory has no Parquet or occurrence TSV: ${input}`);
  }

  const ext = path.extname(input).toLowerCase();
  if (ext === ".parquet") {
    return `read_parquet(${sqlString(sqlPath(input))}, hive_partitioning=true, union_by_name=true)`;
  }
  if (ext === ".tsv" || ext === ".txt") {
    return `read_csv(${sqlString(sqlPath(input))}, delim='\\t', header=true, all_varchar=true, ignore_errors=true, null_padding=true)`;
  }
  if (ext === ".csv") {
    return `read_csv(${sqlString(sqlPath(input))}, delim=',', header=true, all_varchar=true, ignore_errors=true, null_padding=true)`;
  }
  throw new Error(`Unsupported occurrence input: ${input}`);
}

function squareToken(value) {
  const n = Math.trunc(Number(value));
  return n < 0 ? `m${Math.abs(n)}` : `p${n}`;
}

function squareKey(ix, iy) {
  return `sq_${squareToken(ix)}_${squareToken(iy)}`;
}

function lonFromMercatorX(x) {
  return ((x / R) * 180) / Math.PI;
}

function latFromMercatorY(y) {
  return ((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180) / Math.PI;
}

function cellPolygon(ix, iy, gridSizeM) {
  const x0 = ix * gridSizeM;
  const x1 = (ix + 1) * gridSizeM;
  const y0 = iy * gridSizeM;
  const y1 = (iy + 1) * gridSizeM;
  const west = lonFromMercatorX(x0);
  const east = lonFromMercatorX(x1);
  const south = latFromMercatorY(y0);
  const north = latFromMercatorY(y1);
  return [
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south]
    ]
  ];
}

function exactServedTarget(taxon) {
  return {
    rank: taxon.rank || "taxon",
    key: taxon.acceptedTaxonKey || taxon.taxonKey || taxon.playableTaxonKey,
    displayName:
      taxon.commonName ||
      taxon.displayName ||
      taxon.scientificDisplayName ||
      taxon.canonicalName ||
      taxon.scientificName
  };
}

function collapseTargetFor(taxon) {
  const rank = String(taxon.rank || "").toLowerCase();
  if (rank === "species" && taxon.parentTaxonKey && taxon.lineage?.genus) {
    return {
      rank: "genus",
      key: taxon.parentTaxonKey,
      displayName: taxon.lineage.genus
    };
  }
  if ((rank === "species" || rank === "genus") && taxon.lineage?.family) {
    return {
      rank: "family",
      key: taxon.lineage.family,
      displayName: taxon.lineage.family
    };
  }
  if (taxon.lineage?.order) {
    return {
      rank: "order",
      key: taxon.lineage.order,
      displayName: taxon.lineage.order
    };
  }
  return {
    rank: "playable_group",
    key: taxon.playableGroupKey,
    displayName: taxon.playableGroupName || taxon.playableGroupKey
  };
}

function policyServedTarget(taxon, layer) {
  const action = taxon.goldLakeAction?.mode || "drop";
  if (action === "keep") return exactServedTarget(taxon);
  if (action === "developer_only" && layer === "developer") return exactServedTarget(taxon);
  if (action === "developer_only") return collapseTargetFor(taxon);

  const servedRank = taxon.goldLakeAction?.servedRank;
  const servedDisplayName = taxon.goldLakeAction?.servedDisplayName;
  const servedTaxonKey = taxon.goldLakeAction?.servedTaxonKey;
  if (servedRank && servedDisplayName) {
    return {
      rank: servedRank,
      key: servedTaxonKey || `${taxon.playableGroupKey}:${servedRank}:${servedDisplayName}`,
      displayName: servedDisplayName
    };
  }
  return collapseTargetFor(taxon);
}

function actionForLayer(action, layer) {
  if (action === "developer_only" && layer === "beginner") return "developer_collapsed";
  return action || "drop";
}

function policyRows(scoredTaxonomy, layer) {
  if (!Array.isArray(scoredTaxonomy.taxa)) {
    throw new Error("Scored taxonomy artifact must contain taxa[].");
  }
  return scoredTaxonomy.taxa
    .map((taxon, index) => {
      const matchRank = String(taxon.rank || "").toLowerCase();
      const matchName = norm(taxon.canonicalName || taxon.scientificName || taxon.displayName);
      if (!matchRank || !matchName) return null;
      const action = taxon.goldLakeAction?.mode || "drop";
      const target = policyServedTarget(taxon, layer);
      const reasonCodes = (taxon.goldLakeAction?.reasonCodes || []).join("|");
      const score = taxon.individualPlayabilityScore ?? taxon.beginnerPlayabilityScore ?? "";
      return {
        policy_id: index + 1,
        playable_taxon_key: taxon.playableTaxonKey,
        playable_group_key: taxon.playableGroupKey,
        playable_group_name: taxon.playableGroupName,
        policy_action: actionForLayer(action, layer),
        original_policy_action: action,
        match_rank: matchRank,
        match_name: matchName,
        taxon_rank: taxon.rank || "",
        taxon_key: taxon.acceptedTaxonKey || taxon.taxonKey || "",
        taxon_display_name:
          taxon.commonName ||
          taxon.displayName ||
          taxon.scientificDisplayName ||
          taxon.canonicalName ||
          taxon.scientificName ||
          "",
        served_rank: target.rank,
        served_taxon_key: target.key,
        served_display_name: target.displayName,
        playability_score: score,
        reason_codes: reasonCodes,
        kingdom: taxon.lineage?.kingdom || "",
        phylum: taxon.lineage?.phylum || "",
        class_name: taxon.lineage?.class || "",
        order_name: taxon.lineage?.order || "",
        family_name: taxon.lineage?.family || "",
        genus_name: taxon.lineage?.genus || ""
      };
    })
    .filter(Boolean);
}

function buildSql({
  readExpr,
  policyCsv,
  stageDir,
  args,
  country,
  states,
  gridSizeM,
  superchunkSize,
  layer
}) {
  const countrySql = isAllSelector(country) ? "1=1" : `country_code = ${sqlString(country)}`;
  const stateSql = states.length ? `AND state_province IN (${sqlList(states)})` : "";
  const maxObs = Math.max(0, Number.parseInt(args["max-observations"] || "0", 10) || 0);
  const limitSql = maxObs > 0 ? `LIMIT ${maxObs}` : "";
  const threads = Math.max(1, Number.parseInt(args.threads || "4", 10) || 4);

  return `
SET threads TO ${threads};
SET preserve_insertion_order = false;
SET temp_directory = ${sqlString(sqlPath(path.join(stageDir, "duckdb_tmp")))};

CREATE OR REPLACE TABLE playable_policy AS
SELECT *
FROM read_csv(${sqlString(sqlPath(policyCsv))}, header=true, all_varchar=true);

CREATE OR REPLACE TABLE gw_gold_region_counts AS
SELECT
  COUNT(*) AS retained_region_observations
FROM ${readExpr}
WHERE ${countrySql}
  ${stateSql};

CREATE OR REPLACE TABLE gw_gold_obs_raw AS
SELECT
  row_number() OVER () AS obs_row_id,
  CAST(floor((6378137.0 * radians(lon)) / ${gridSizeM}) AS BIGINT) AS ix,
  CAST(floor((6378137.0 * ln(tan(pi()/4.0 + radians(lat)/2.0))) / ${gridSizeM}) AS BIGINT) AS iy,
  CAST(floor(CAST(floor((6378137.0 * radians(lon)) / ${gridSizeM}) AS BIGINT) / ${superchunkSize}.0) AS BIGINT) AS super_ix,
  CAST(floor(CAST(floor((6378137.0 * ln(tan(pi()/4.0 + radians(lat)/2.0))) / ${gridSizeM}) AS BIGINT) / ${superchunkSize}.0) AS BIGINT) AS super_iy,
  CASE
    WHEN kingdom = 'Animalia' AND class_name IS NOT NULL AND class_name <> '' THEN class_name
    WHEN kingdom IS NULL OR kingdom = '' THEN 'Unknown'
    ELSE kingdom
  END AS raw_iconic_taxon_name,
  COALESCE(NULLIF(order_name, ''), 'Unknown') AS raw_order_name,
  COALESCE(NULLIF(family, ''), 'Unknown') AS raw_family_name,
  COALESCE(NULLIF(genus, ''), 'Unknown') AS raw_genus_name,
  NULLIF(scientific_name, '') AS raw_scientific_name,
  LOWER(NULLIF(scientific_name, '')) AS raw_scientific_name_norm,
  LOWER(NULLIF(genus, '')) AS raw_genus_name_norm,
  LOWER(NULLIF(family, '')) AS raw_family_name_norm,
  LOWER(NULLIF(order_name, '')) AS raw_order_name_norm,
  LOWER(NULLIF(class_name, '')) AS raw_class_name_norm,
  taxon_id,
  taxon_rank,
  event_date,
  event_month,
  COALESCE(NULLIF(inaturalist_login, ''), NULLIF(recorded_by, ''), 'unknown_user') AS login
FROM ${readExpr}
WHERE ${countrySql}
  ${stateSql}
  AND event_date IS NOT NULL
  AND event_month BETWEEN 1 AND 12
  AND genus IS NOT NULL
  AND genus <> ''
${limitSql};

CREATE OR REPLACE TABLE gw_gold_policy_candidates AS
SELECT o.obs_row_id, 10 AS match_priority, p.*
FROM gw_gold_obs_raw o
JOIN playable_policy p
  ON p.match_rank = 'species'
 AND p.match_name = o.raw_scientific_name_norm
UNION ALL
SELECT o.obs_row_id, 20 AS match_priority, p.*
FROM gw_gold_obs_raw o
JOIN playable_policy p
  ON p.match_rank = 'genus'
 AND p.match_name = o.raw_genus_name_norm
UNION ALL
SELECT o.obs_row_id, 30 AS match_priority, p.*
FROM gw_gold_obs_raw o
JOIN playable_policy p
  ON p.match_rank = 'family'
 AND p.match_name = o.raw_family_name_norm
UNION ALL
SELECT o.obs_row_id, 40 AS match_priority, p.*
FROM gw_gold_obs_raw o
JOIN playable_policy p
  ON p.match_rank = 'order'
 AND p.match_name = o.raw_order_name_norm
UNION ALL
SELECT o.obs_row_id, 50 AS match_priority, p.*
FROM gw_gold_obs_raw o
JOIN playable_policy p
  ON p.match_rank = 'class'
 AND p.match_name = o.raw_class_name_norm;

CREATE OR REPLACE TABLE gw_gold_best_policy AS
SELECT *
FROM (
  SELECT
    *,
    row_number() OVER (
      PARTITION BY obs_row_id
      ORDER BY match_priority ASC, TRY_CAST(playability_score AS DOUBLE) DESC, policy_id ASC
    ) AS rn
  FROM gw_gold_policy_candidates
)
WHERE rn = 1;

CREATE OR REPLACE TABLE gw_gold_obs_served AS
SELECT
  o.*,
  COALESCE(p.playable_taxon_key, 'unmapped:' || o.raw_genus_name) AS playable_taxon_key,
  COALESCE(p.playable_group_key, 'unmapped') AS playable_group_key,
  COALESCE(p.playable_group_name, 'Unmapped Taxa') AS playable_group_name,
  COALESCE(p.policy_action, 'raw_genus') AS policy_action,
  COALESCE(p.original_policy_action, 'raw_genus') AS original_policy_action,
  COALESCE(p.served_rank, 'genus') AS served_rank,
  COALESCE(p.served_taxon_key, 'raw_genus:' || o.raw_genus_name) AS served_taxon_key,
  COALESCE(p.served_display_name, o.raw_genus_name) AS served_display_name,
  COALESCE(p.playability_score, '') AS playability_score,
  COALESCE(p.reason_codes, '') AS reason_codes,
  COALESCE(p.match_rank, 'raw_genus') AS policy_match_rank,
  COALESCE(p.taxon_display_name, o.raw_scientific_name, o.raw_genus_name) AS policy_taxon_display_name,
  CASE
    WHEN COALESCE(p.served_rank, 'genus') = 'playable_group'
      THEN COALESCE(p.playable_group_name, 'Unmapped Taxa')
    ELSE o.raw_iconic_taxon_name
  END AS iconic_taxon_name,
  CASE
    WHEN p.served_rank = 'order' THEN p.served_display_name
    ELSE o.raw_order_name
  END AS order_name,
  CASE
    WHEN p.served_rank = 'family' THEN p.served_display_name
    WHEN p.served_rank = 'playable_group' THEN COALESCE(p.playable_group_name, 'Unmapped Taxa')
    ELSE o.raw_family_name
  END AS family_name,
  COALESCE(p.served_display_name, o.raw_genus_name) AS genus_name
FROM gw_gold_obs_raw o
LEFT JOIN gw_gold_best_policy p
  ON p.obs_row_id = o.obs_row_id;

CREATE OR REPLACE TABLE gw_gold_observer_dictionary AS
SELECT row_number() OVER (ORDER BY login) AS observer_id, login
FROM (SELECT DISTINCT login FROM gw_gold_obs_served WHERE login IS NOT NULL AND login <> 'unknown_user') d;

CREATE OR REPLACE TABLE gw_gold_square_summary AS
WITH base AS (
  SELECT o.*, d.observer_id
  FROM gw_gold_obs_served o
  LEFT JOIN gw_gold_observer_dictionary d USING (login)
), recent AS (
  SELECT ix, iy, median(event_date) AS median_last10_observed
  FROM (
    SELECT ix, iy, event_date, row_number() OVER (PARTITION BY ix, iy ORDER BY event_date DESC) AS rn
    FROM base
  )
  WHERE rn <= 10
  GROUP BY ix, iy
)
SELECT
  b.ix,
  b.iy,
  any_value(b.super_ix) AS super_ix,
  any_value(b.super_iy) AS super_iy,
  COUNT(*) AS count,
  COUNT(DISTINCT b.served_taxon_key) AS n_genera,
  COUNT(DISTINCT observer_id) AS n_observers,
  0 AS n_captive,
  strftime(MAX(event_date), '%Y-%m-%d') AS last_observed,
  strftime(any_value(r.median_last10_observed), '%Y-%m-%d') AS median_last10_observed
FROM base b
LEFT JOIN recent r USING (ix, iy)
GROUP BY b.ix, b.iy;

CREATE OR REPLACE TABLE gw_gold_square_taxa AS
WITH grouped AS (
  SELECT
    ix,
    iy,
    super_ix,
    super_iy,
    iconic_taxon_name,
    order_name,
    family_name,
    genus_name,
    served_rank,
    served_taxon_key,
    served_display_name,
    playable_group_key,
    playable_group_name,
    policy_action,
    original_policy_action,
    policy_match_rank,
    playability_score,
    reason_codes,
    COUNT(*) AS count,
    COUNT(DISTINCT COALESCE(raw_scientific_name, raw_genus_name)) AS raw_taxa_count,
    SUM(CASE WHEN event_month = 1 THEN 1 ELSE 0 END) AS m01,
    SUM(CASE WHEN event_month = 2 THEN 1 ELSE 0 END) AS m02,
    SUM(CASE WHEN event_month = 3 THEN 1 ELSE 0 END) AS m03,
    SUM(CASE WHEN event_month = 4 THEN 1 ELSE 0 END) AS m04,
    SUM(CASE WHEN event_month = 5 THEN 1 ELSE 0 END) AS m05,
    SUM(CASE WHEN event_month = 6 THEN 1 ELSE 0 END) AS m06,
    SUM(CASE WHEN event_month = 7 THEN 1 ELSE 0 END) AS m07,
    SUM(CASE WHEN event_month = 8 THEN 1 ELSE 0 END) AS m08,
    SUM(CASE WHEN event_month = 9 THEN 1 ELSE 0 END) AS m09,
    SUM(CASE WHEN event_month = 10 THEN 1 ELSE 0 END) AS m10,
    SUM(CASE WHEN event_month = 11 THEN 1 ELSE 0 END) AS m11,
    SUM(CASE WHEN event_month = 12 THEN 1 ELSE 0 END) AS m12,
    strftime(MAX(event_date), '%Y-%m-%d') AS last_observed
  FROM gw_gold_obs_served
  GROUP BY
    ix, iy, super_ix, super_iy, iconic_taxon_name, order_name, family_name, genus_name,
    served_rank, served_taxon_key, served_display_name, playable_group_key, playable_group_name,
    policy_action, original_policy_action, policy_match_rank, playability_score, reason_codes
), recent AS (
  SELECT ix, iy, served_taxon_key, median(event_date) AS median_last10_observed
  FROM (
    SELECT
      ix,
      iy,
      served_taxon_key,
      event_date,
      row_number() OVER (
        PARTITION BY ix, iy, served_taxon_key
        ORDER BY event_date DESC
      ) AS rn
    FROM gw_gold_obs_served
  )
  WHERE rn <= 10
  GROUP BY ix, iy, served_taxon_key
)
SELECT g.*, strftime(r.median_last10_observed, '%Y-%m-%d') AS median_last10_observed
FROM grouped g
LEFT JOIN recent r USING (ix, iy, served_taxon_key);

CREATE OR REPLACE TABLE gw_gold_square_observers AS
WITH per_observer AS (
  SELECT
    o.ix,
    o.iy,
    o.super_ix,
    o.super_iy,
    d.observer_id,
    d.login,
    COUNT(*) AS count,
    COUNT(DISTINCT COALESCE(o.raw_scientific_name, o.raw_genus_name)) AS species
  FROM gw_gold_obs_served o
  JOIN gw_gold_observer_dictionary d USING (login)
  GROUP BY o.ix, o.iy, o.super_ix, o.super_iy, d.observer_id, d.login
), ranked AS (
  SELECT *, row_number() OVER (PARTITION BY ix, iy ORDER BY count DESC, species DESC, login ASC) AS observer_rank
  FROM per_observer
)
SELECT ix, iy, super_ix, super_iy, observer_rank, observer_id, count, species
FROM ranked
WHERE observer_rank <= 10;

CREATE OR REPLACE TABLE gw_gold_superchunks AS
SELECT
  super_ix,
  super_iy,
  COUNT(*) AS n_squares,
  MIN(ix) AS min_ix,
  MIN(iy) AS min_iy,
  MAX(ix) AS max_ix,
  MAX(iy) AS max_iy,
  SUM(count) AS observation_count
FROM gw_gold_square_summary
GROUP BY super_ix, super_iy;

CREATE OR REPLACE TABLE gw_gold_policy_metrics AS
SELECT 'policy_action_' || policy_action AS metric, COUNT(*)::VARCHAR AS value
FROM gw_gold_obs_served
GROUP BY policy_action
UNION ALL
SELECT 'served_rank_' || served_rank AS metric, COUNT(*)::VARCHAR AS value
FROM gw_gold_obs_served
GROUP BY served_rank;

CREATE OR REPLACE TABLE gw_gold_validation_metrics AS
SELECT 'retained_region_observations' AS metric, retained_region_observations::VARCHAR AS value FROM gw_gold_region_counts
UNION ALL SELECT 'obs_with_served_taxon_date', COUNT(*)::VARCHAR FROM gw_gold_obs_served
UNION ALL SELECT 'occupied_20ft_squares', COUNT(*)::VARCHAR FROM gw_gold_square_summary
UNION ALL SELECT 'served_square_taxon_records', COUNT(*)::VARCHAR FROM gw_gold_square_taxa
UNION ALL SELECT 'superchunks_1024', COUNT(*)::VARCHAR FROM gw_gold_superchunks
UNION ALL SELECT 'observer_count', COUNT(*)::VARCHAR FROM gw_gold_observer_dictionary
UNION ALL SELECT 'median_obs_per_square', median(count)::VARCHAR FROM gw_gold_square_summary
UNION ALL SELECT 'avg_obs_per_square', avg(count)::VARCHAR FROM gw_gold_square_summary
UNION ALL SELECT 'max_obs_per_square', max(count)::VARCHAR FROM gw_gold_square_summary
UNION ALL SELECT metric, value FROM gw_gold_policy_metrics;

COPY (SELECT observer_id, login FROM gw_gold_observer_dictionary ORDER BY observer_id)
TO ${sqlString(sqlPath(path.join(stageDir, "observer_dictionary.csv")))} (HEADER, DELIMITER ',');

COPY (SELECT * FROM gw_gold_superchunks ORDER BY super_ix, super_iy)
TO ${sqlString(sqlPath(path.join(stageDir, "superchunks.csv")))} (HEADER, DELIMITER ',');

COPY (SELECT * FROM gw_gold_square_summary ORDER BY super_ix, super_iy, ix, iy)
TO ${sqlString(sqlPath(path.join(stageDir, "square_summary.csv")))} (HEADER, DELIMITER ',');

COPY (SELECT * FROM gw_gold_square_taxa ORDER BY super_ix, super_iy, ix, iy, count DESC, served_display_name)
TO ${sqlString(sqlPath(path.join(stageDir, "square_taxa.csv")))} (HEADER, DELIMITER ',');

COPY (SELECT * FROM gw_gold_square_observers ORDER BY super_ix, super_iy, ix, iy, observer_rank)
TO ${sqlString(sqlPath(path.join(stageDir, "square_observers.csv")))} (HEADER, DELIMITER ',');

COPY (SELECT * FROM gw_gold_validation_metrics ORDER BY metric)
TO ${sqlString(sqlPath(path.join(stageDir, "validation_metrics.csv")))} (HEADER, DELIMITER ',');

COPY (
  SELECT ix, iy, count, n_genera, n_observers, n_captive, last_observed, median_last10_observed
  FROM gw_gold_square_summary
  ORDER BY ix, iy
) TO ${sqlString(sqlPath(path.join(stageDir, "dc_heat.csv")))} (HEADER, DELIMITER ',');

COPY (
  SELECT
    ${sqlString(layer)} AS layer,
    policy_action,
    original_policy_action,
    served_rank,
    playable_group_key,
    COUNT(*) AS observation_count
  FROM gw_gold_obs_served
  GROUP BY policy_action, original_policy_action, served_rank, playable_group_key
  ORDER BY observation_count DESC
) TO ${sqlString(sqlPath(path.join(stageDir, "policy_rollup_summary.csv")))} (HEADER, DELIMITER ',');
`;
}

function runDuckDb({ duckdbExe, dbFile, sqlFile }) {
  childProcess.execFileSync(duckdbExe, [dbFile, "-f", sqlFile], {
    stdio: "inherit",
    windowsHide: true
  });
}

function groupBySquare(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = `${row.ix},${row.iy}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function rowsBySuperchunk(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = `${row.super_ix}_${row.super_iy}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function validationMetricMap(rows) {
  const out = {};
  for (const row of rows) {
    const value = Number(row.value);
    out[row.metric] = Number.isNaN(value) ? row.value : value;
  }
  return out;
}

function copyFileIfExists(from, to) {
  if (!fs.existsSync(from)) return false;
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
  return true;
}

function packageServedGold({
  stageDir,
  outDir,
  region,
  label,
  version,
  buildId,
  generatedAt,
  gridSizeM,
  superchunkSize,
  layer,
  scoredTaxonomy,
  scoredTaxonomyPath,
  policyCsv,
  occurrenceInput
}) {
  ensureDir(outDir);
  ensureDir(path.join(outDir, "square_genera_superchunks"));
  ensureDir(path.join(outDir, "pmtiles"));

  copyFileIfExists(path.join(stageDir, "dc_heat.csv"), path.join(outDir, "dc_heat.csv"));
  copyFileIfExists(
    path.join(stageDir, "policy_rollup_summary.csv"),
    path.join(outDir, "policy_rollup_summary.csv")
  );
  copyFileIfExists(policyCsv, path.join(outDir, "served_taxonomy_policy.csv"));

  const observerRows = readCsv(path.join(stageDir, "observer_dictionary.csv"));
  const superRows = readCsv(path.join(stageDir, "superchunks.csv"));
  const squareRows = readCsv(path.join(stageDir, "square_summary.csv"));
  const taxaRows = readCsv(path.join(stageDir, "square_taxa.csv"));
  const observerSquareRows = readCsv(path.join(stageDir, "square_observers.csv"));
  const validationRows = readCsv(path.join(stageDir, "validation_metrics.csv"));

  const taxaBySquare = groupBySquare(taxaRows);
  const observersBySquare = groupBySquare(observerSquareRows);
  const squaresBySuper = rowsBySuperchunk(squareRows);

  const observerDict = {};
  for (const row of observerRows) {
    observerDict[String(int(row.observer_id))] = { login: row.login || "unknown_user" };
  }
  writeJson(path.join(outDir, "observer_dictionary.json"), observerDict);

  const summary = squareRows.map((row) => ({
    ix: int(row.ix),
    iy: int(row.iy),
    square_id: `${int(row.ix)}_${int(row.iy)}`,
    n_genera: int(row.n_genera),
    n_obs_with_genus: int(row.count)
  }));
  writeJson(path.join(outDir, "squares_genus_summary.json"), summary);

  const geojsonSeqPath = path.join(
    outDir,
    "pmtiles",
    `${region}_${version}_served_cells.geojsonseq`
  );
  const geoFd = fs.openSync(geojsonSeqPath, "w");
  try {
    for (const square of squareRows) {
      const ix = int(square.ix);
      const iy = int(square.iy);
      const properties = {
        ix,
        iy,
        count: int(square.count),
        n_genera: int(square.n_genera),
        n_observers: int(square.n_observers),
        last_observed: square.last_observed || "",
        median_last10_observed: square.median_last10_observed || ""
      };
      fs.writeSync(
        geoFd,
        `${JSON.stringify({
          type: "Feature",
          properties,
          geometry: {
            type: "Polygon",
            coordinates: cellPolygon(ix, iy, gridSizeM)
          }
        })}\n`
      );
    }
  } finally {
    fs.closeSync(geoFd);
  }

  const superManifest = [];
  let jsonSuperchunkCount = 0;
  let totalSuperchunkBytes = 0;
  let totalSuperchunkGzipBytes = 0;
  let largestSuperchunkBytes = 0;
  let largestSuperchunkFile = "";
  let monthCountViolationCount = 0;
  let topObserverViolationCount = 0;
  let totalObservationCount = 0;
  let servedTaxonRecordCount = 0;

  for (const superRow of superRows) {
    const superIx = int(superRow.super_ix);
    const superIy = int(superRow.super_iy);
    const superKey = `${superIx}_${superIy}`;
    const members = squaresBySuper.get(superKey) || [];
    const squares = {};

    for (const square of members) {
      const ix = int(square.ix);
      const iy = int(square.iy);
      const key = squareKey(ix, iy);
      const sqKey = `${ix},${iy}`;
      const squareCount = int(square.count);
      totalObservationCount += squareCount;

      const genera = (taxaBySquare.get(sqKey) || []).map((row) => {
        const monthCounts = [
          int(row.m01),
          int(row.m02),
          int(row.m03),
          int(row.m04),
          int(row.m05),
          int(row.m06),
          int(row.m07),
          int(row.m08),
          int(row.m09),
          int(row.m10),
          int(row.m11),
          int(row.m12)
        ];
        const count = int(row.count);
        const monthTotal = monthCounts.reduce((sum, value) => sum + value, 0);
        if (monthTotal !== count) monthCountViolationCount += 1;
        servedTaxonRecordCount += 1;
        return {
          iconic_taxon_name: row.iconic_taxon_name || "Unknown",
          order_name: row.order_name || "Unknown",
          family_name: row.family_name || "Unknown",
          genus_name: row.genus_name || "Unknown",
          served_rank: row.served_rank || "genus",
          served_taxon_key: row.served_taxon_key || row.genus_name || "Unknown",
          served_display_name: row.served_display_name || row.genus_name || "Unknown",
          playable_group_key: row.playable_group_key || "unmapped",
          playable_group_name: row.playable_group_name || "Unmapped Taxa",
          policy_action: row.policy_action || "raw_genus",
          original_policy_action: row.original_policy_action || row.policy_action || "raw_genus",
          policy_match_rank: row.policy_match_rank || "raw_genus",
          playability_score:
            row.playability_score === "" ? null : numberValue(row.playability_score, null),
          reason_codes: String(row.reason_codes || "")
            .split("|")
            .map((item) => item.trim())
            .filter(Boolean),
          raw_taxa_count: int(row.raw_taxa_count, 1),
          count,
          month_counts: monthCounts,
          last_observed: row.last_observed || "",
          median_last10_observed: row.median_last10_observed || ""
        };
      });

      const topObservers = (observersBySquare.get(sqKey) || []).map((row) => ({
        observer_id: int(row.observer_id),
        count: int(row.count),
        species: int(row.species)
      }));
      if (topObservers.some((row) => row.count > squareCount)) topObserverViolationCount += 1;

      squares[key] = {
        ix,
        iy,
        last_observed: square.last_observed || "",
        median_last10_observed: square.median_last10_observed || "",
        genera,
        top_observers: topObservers
      };
    }

    const superStruct = {
      super_ix: superIx,
      super_iy: superIy,
      superchunk_size: superchunkSize,
      taxonomy_levels: [
        "playable_group_key",
        "served_rank",
        "served_taxon_key",
        "served_display_name"
      ],
      legacy_taxonomy_levels: ["iconic_taxon_name", "order_name", "family_name", "genus_name"],
      n_squares: members.length,
      squares
    };
    const superId = `super_${superIx}_${superIy}`;
    const relativeFile = `square_genera_superchunks/${superId}.json`;
    const absoluteFile = path.join(outDir, relativeFile);
    writeJson(absoluteFile, superStruct);

    const bytes = fs.statSync(absoluteFile).size;
    const gzipBytes = zlib.gzipSync(fs.readFileSync(absoluteFile), { level: 6 }).length;
    totalSuperchunkBytes += bytes;
    totalSuperchunkGzipBytes += gzipBytes;
    if (bytes > largestSuperchunkBytes) {
      largestSuperchunkBytes = bytes;
      largestSuperchunkFile = relativeFile;
    }
    jsonSuperchunkCount += 1;

    superManifest.push({
      superchunk_id: superId,
      super_ix: superIx,
      super_iy: superIy,
      file: relativeFile,
      n_squares: int(superRow.n_squares),
      bbox_grid: [
        int(superRow.min_ix),
        int(superRow.min_iy),
        int(superRow.max_ix),
        int(superRow.max_iy)
      ],
      cell_count: int(superRow.n_squares),
      observation_count: int(superRow.observation_count),
      bytes,
      gzip_bytes: gzipBytes
    });
  }

  const metrics = validationMetricMap(validationRows);
  const manifest = {
    build_id: buildId,
    schema_version: "superchunk.v4.playable-served-gold",
    generator: "scripts/build-gold-served-taxonomy.js",
    generated_at: generatedAt,
    region,
    region_label: label,
    region_version: version,
    grid_size_m: gridSizeM,
    grid_size_ft: 20,
    superchunk_size: superchunkSize,
    asset_root: "",
    heat_file: "dc_heat.csv",
    observer_dictionary_file: "observer_dictionary.json",
    square_summary_file: "squares_genus_summary.json",
    policy_rollup_summary_file: "policy_rollup_summary.csv",
    served_taxonomy_policy_file: "served_taxonomy_policy.csv",
    superchunk_dir: "square_genera_superchunks",
    pmtiles_file: `pmtiles/gridwild_${region}_${version}_cells.pmtiles`,
    pmtiles_layer: "gridwild_cells",
    pmtiles_payload: "visual_metrics_only",
    n_observations: totalObservationCount,
    n_squares: squareRows.length,
    n_superchunks: superManifest.length,
    n_observers: observerRows.length,
    n_served_taxon_records: servedTaxonRecordCount,
    taxonomy_levels: [
      "playable_group_key",
      "served_rank",
      "served_taxon_key",
      "served_display_name"
    ],
    legacy_taxonomy_levels: ["iconic_taxon_name", "order_name", "family_name", "genus_name"],
    taxonomy_policy: {
      playable_taxa_score_version: scoredTaxonomy.playable_taxa_score_version || null,
      playable_taxa_version: scoredTaxonomy.playable_taxa_version || null,
      playable_taxonomy_version: scoredTaxonomy.playable_taxonomy_version || null,
      scoring_model: scoredTaxonomy.scoring_model?.name || null,
      served_layer: layer,
      drop_semantics: "credit_to_served_parent",
      developer_only_semantics:
        layer === "developer" ? "serve_exact" : "collapse_to_parent_for_beginner"
    },
    source_inputs: {
      occurrence: occurrenceInput,
      scored_taxonomy: scoredTaxonomyPath
    },
    size_metrics: {
      total_superchunk_bytes: totalSuperchunkBytes,
      total_superchunk_gzip_bytes: totalSuperchunkGzipBytes,
      average_superchunk_bytes:
        superManifest.length > 0 ? Math.round(totalSuperchunkBytes / superManifest.length) : 0,
      average_superchunk_gzip_bytes:
        superManifest.length > 0 ? Math.round(totalSuperchunkGzipBytes / superManifest.length) : 0,
      largest_superchunk_bytes: largestSuperchunkBytes,
      largest_superchunk_file: largestSuperchunkFile
    },
    superchunks: superManifest
  };
  writeJson(path.join(outDir, "manifest.json"), manifest);

  const validation = {
    pipeline: {
      region,
      label,
      version,
      build_id: buildId,
      generated_at: generatedAt,
      finished_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      duration_seconds: null
    },
    metrics,
    files: {
      manifest: fs.existsSync(path.join(outDir, "manifest.json")),
      heat: fs.existsSync(path.join(outDir, "dc_heat.csv")),
      observer_dictionary: fs.existsSync(path.join(outDir, "observer_dictionary.json")),
      square_summary: fs.existsSync(path.join(outDir, "squares_genus_summary.json")),
      policy_rollup_summary: fs.existsSync(path.join(outDir, "policy_rollup_summary.csv")),
      served_taxonomy_policy: fs.existsSync(path.join(outDir, "served_taxonomy_policy.csv")),
      geojsonseq: fs.existsSync(geojsonSeqPath),
      json_superchunks: jsonSuperchunkCount
    },
    checks: {
      manifest_references_existing_superchunks: superManifest.every((row) =>
        fs.existsSync(path.join(outDir, row.file))
      ),
      heat_rows_equal_occupied_squares: int(metrics.occupied_20ft_squares) === squareRows.length,
      month_counts_sum_to_taxon_counts_violations: monthCountViolationCount,
      top_observer_count_violations: topObserverViolationCount,
      drop_rows_credit_parent: true,
      species_level_rows_possible: true
    },
    size_metrics: manifest.size_metrics,
    pmtiles: {
      status: "pending",
      message: "PMTiles generation has not run yet.",
      file: null,
      bytes: 0
    }
  };
  writeJson(path.join(outDir, "validation_report.json"), validation);

  return {
    squares: squareRows.length,
    servedTaxonRecords: servedTaxonRecordCount,
    superchunks: superManifest.length,
    observers: observerRows.length,
    totalSuperchunkBytes,
    totalSuperchunkGzipBytes,
    largestSuperchunkBytes,
    largestSuperchunkFile
  };
}

function main() {
  const args = parseArgs(process.argv);
  const worldDir = path.resolve(
    args["world-dir"] || process.env.GRIDWILD_WORLD_DIR || DEFAULT_WORLD_DIR
  );
  const occurrenceInput = path.resolve(
    args.occurrence ||
      args["occurrence-input"] ||
      process.env.GRIDWILD_OCCURRENCE_PATH ||
      DEFAULT_OCCURRENCE_INPUT
  );
  const scoredTaxonomyPath = path.resolve(args["scored-taxonomy"] || DEFAULT_SCORED_TAXONOMY);
  const region = args.region || DEFAULT_REGION;
  const label = args.label || DEFAULT_LABEL;
  const version = args.version || DEFAULT_VERSION;
  const layer = args.layer === "developer" ? "developer" : "beginner";
  const buildId =
    args["build-id"] || `gridwild_gold_${region}_${version}_${layer}_${yyyymmddhhmmss(new Date())}`;
  const stageDir = path.resolve(
    args["stage-dir"] || path.join(worldDir, "gold_stage", `${region}_${version}`)
  );
  const outDir = path.resolve(
    args["out-dir"] || path.join(worldDir, "gold", `${region}_${version}`)
  );
  const duckdbExe = findDuckDb(args);
  const gridSizeM = Number(args["grid-size-m"] || DEFAULT_GRID_SIZE_M);
  const superchunkSize = int(args["superchunk-size"] || DEFAULT_SUPERCHUNK_SIZE);
  const country = hasArg(args, "country") ? args.country : "US";
  const defaultStates =
    isAllSelector(country) || region !== DEFAULT_REGION ? "all" : "District of Columbia,Virginia";
  const statesArg = hasArg(args, "states") ? args.states : defaultStates;
  const states = isAllSelector(statesArg) ? [] : splitList(statesArg);

  if (args["check-inputs"]) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          worldDir,
          occurrenceInput,
          scoredTaxonomyPath,
          duckdbExe,
          region,
          label,
          version,
          layer,
          stageDir,
          outDir,
          country,
          states,
          gridSizeM,
          superchunkSize
        },
        null,
        2
      )
    );
    return;
  }

  if (!fs.existsSync(scoredTaxonomyPath)) {
    throw new Error(`Scored taxonomy not found: ${scoredTaxonomyPath}`);
  }
  if (!fs.existsSync(occurrenceInput)) {
    throw new Error(`Occurrence input not found: ${occurrenceInput}`);
  }

  ensureDir(stageDir);
  ensureDir(outDir);

  const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const scoredTaxonomy = readJson(scoredTaxonomyPath);
  const policyCsv = path.join(stageDir, "served_taxonomy_policy.csv");
  const rows = policyRows(scoredTaxonomy, layer);
  writeCsv(policyCsv, rows, [
    "policy_id",
    "playable_taxon_key",
    "playable_group_key",
    "playable_group_name",
    "policy_action",
    "original_policy_action",
    "match_rank",
    "match_name",
    "taxon_rank",
    "taxon_key",
    "taxon_display_name",
    "served_rank",
    "served_taxon_key",
    "served_display_name",
    "playability_score",
    "reason_codes",
    "kingdom",
    "phylum",
    "class_name",
    "order_name",
    "family_name",
    "genus_name"
  ]);

  const readExpr = occurrenceReadExpression(occurrenceInput);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "gridwild-gold-served-"));
  const dbFile = path.join(workDir, "served.duckdb");
  const sqlFile = path.join(workDir, "build_served_gold.sql");
  fs.writeFileSync(
    sqlFile,
    buildSql({
      readExpr,
      policyCsv,
      stageDir,
      args,
      country,
      states,
      gridSizeM,
      superchunkSize,
      layer
    })
  );

  runDuckDb({ duckdbExe, dbFile, sqlFile });

  const packaged = packageServedGold({
    stageDir,
    outDir,
    region,
    label,
    version,
    buildId,
    generatedAt,
    gridSizeM,
    superchunkSize,
    layer,
    scoredTaxonomy,
    scoredTaxonomyPath,
    policyCsv,
    occurrenceInput
  });

  console.log(
    JSON.stringify(
      {
        build_id: buildId,
        region,
        version,
        layer,
        outDir,
        stageDir,
        policyRows: rows.length,
        ...packaged
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (err) {
  console.error(err.stack || err.message);
  process.exit(1);
}
