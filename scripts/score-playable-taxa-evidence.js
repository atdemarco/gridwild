const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_DUCKDB_EXE = "C:\\Users\\ad1470\\Desktop\\gridwild\\world\\duckdb.exe";
const DEFAULT_CATALOG_INPUT = path.join(
  __dirname,
  "..",
  "assets",
  "playable_taxonomy",
  "generated_playable_taxa.json"
);
const DEFAULT_PROFILE_INPUT = path.join(
  __dirname,
  "..",
  "assets",
  "playable_taxonomy",
  "playable_taxon_profiles.json"
);
const DEFAULT_OUT_DIR = path.join(__dirname, "..", "assets", "playable_taxonomy");
const DEFAULT_OCCURRENCE_INPUT =
  "C:\\Users\\ad1470\\Desktop\\gridwild\\world\\parquet\\occurrence_silver_v001";
const DEFAULT_VERSION = "playable-taxa-score-v001";

const SCORE_WEIGHTS = {
  identifiability: 0.3,
  observability: 0.2,
  localDataSupport: 0.2,
  validationReliability: 0.15,
  distinctiveness: 0.15
};

const RANK_ORDER = ["kingdom", "phylum", "class", "order", "family", "genus", "species"];

const SPECIES_MODE_HEURISTICS = {
  required: {
    identifiability: 6,
    observability: 3,
    distinctiveness: 5,
    speciesFit: 92,
    endpointFit: 88
  },
  optional: {
    identifiability: 0,
    observability: 0,
    distinctiveness: 0,
    speciesFit: 74,
    endpointFit: 82
  },
  bonus: {
    identifiability: -4,
    observability: -2,
    distinctiveness: -2,
    speciesFit: 62,
    endpointFit: 76
  },
  discouraged: {
    identifiability: -14,
    observability: -6,
    distinctiveness: -10,
    speciesFit: 42,
    endpointFit: 68
  },
  hidden: {
    identifiability: -22,
    observability: -10,
    distinctiveness: -18,
    speciesFit: 28,
    endpointFit: 48
  }
};

const LOCAL_TARGETS = {
  species: { occurrences: 80, cells: 22, observers: 8, regions: 3, datasets: 2 },
  genus: { occurrences: 260, cells: 65, observers: 16, regions: 5, datasets: 3 },
  family: { occurrences: 900, cells: 170, observers: 30, regions: 8, datasets: 4 },
  order: { occurrences: 2200, cells: 300, observers: 45, regions: 10, datasets: 5 },
  class: { occurrences: 4200, cells: 450, observers: 60, regions: 12, datasets: 6 }
};

const GLOBAL_TARGET_MULTIPLIER = 12;
const RANK_KEY_ALIASES = {
  species: ["speciesKey", "species_key", "speciesID", "species_id"],
  genus: ["genusKey", "genus_key", "genusID", "genus_id"],
  family: ["familyKey", "family_key", "familyID", "family_id"],
  order: ["orderKey", "order_key", "orderID", "order_id"],
  class: ["classKey", "class_key", "classID", "class_id"],
  phylum: ["phylumKey", "phylum_key", "phylumID", "phylum_id"],
  kingdom: ["kingdomKey", "kingdom_key", "kingdomID", "kingdom_id"]
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

function splitList(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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

function sqlIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function sqlPath(value) {
  return String(value).replace(/\\/g, "/").replace(/'/g, "''");
}

function clamp(value, min = 0, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function round(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hasGlob(value) {
  return /[*?[\]]/.test(String(value));
}

function globBase(value) {
  const normalized = path.resolve(value);
  const match = normalized.match(/[*?[\]]/);
  if (!match) return normalized;
  const prefix = normalized.slice(0, match.index);
  const lastSeparator = Math.max(prefix.lastIndexOf("\\"), prefix.lastIndexOf("/"));
  return lastSeparator > 0 ? prefix.slice(0, lastSeparator) : process.cwd();
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

function findFirstExisting(dir, names) {
  for (const name of names) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) return file;
  }
  return null;
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

function resolveOccurrenceInput(args) {
  const requested =
    args.occurrence ||
    args["occurrence-input"] ||
    process.env.GRIDWILD_OCCURRENCE_PATH ||
    (fs.existsSync(DEFAULT_OCCURRENCE_INPUT) ? DEFAULT_OCCURRENCE_INPUT : null);

  if (!requested) {
    throw new Error(
      [
        "Missing occurrence evidence input.",
        "Pass --occurrence C:\\path\\to\\occurrence.txt, --occurrence C:\\path\\to\\silver.parquet,",
        "or set GRIDWILD_OCCURRENCE_PATH. GBIF backbone taxonomy alone is not enough to score lower taxa."
      ].join(" ")
    );
  }

  return path.resolve(requested);
}

function occurrenceReadExpression(input) {
  if (hasGlob(input)) {
    const base = globBase(input);
    if (!fs.existsSync(base)) {
      throw new Error(`Occurrence glob base does not exist: ${base}`);
    }
    const lowered = input.toLowerCase();
    if (lowered.includes(".parquet")) {
      return {
        kind: "parquet_glob",
        label: input,
        sql: `read_parquet(${sqlString(sqlPath(input))}, union_by_name=true)`
      };
    }
    return {
      kind: "delimited_glob",
      label: input,
      sql: `read_csv(${sqlString(sqlPath(input))}, header=true, all_varchar=true, ignore_errors=true, null_padding=true)`
    };
  }

  if (!fs.existsSync(input)) {
    throw new Error(`Occurrence input does not exist: ${input}`);
  }

  const stat = fs.statSync(input);
  if (stat.isDirectory()) {
    const occurrenceFile = findFirstExisting(input, [
      "occurrence.txt",
      "Occurrence.txt",
      "occurrence.tsv",
      "Occurrence.tsv",
      "occurrence.csv",
      "Occurrence.csv"
    ]);
    if (occurrenceFile) return occurrenceReadExpression(occurrenceFile);

    if (hasFileRecursive(input, (file) => file.toLowerCase().endsWith(".parquet"))) {
      const glob = path.join(input, "**", "*.parquet");
      return {
        kind: "parquet_directory",
        label: input,
        sql: `read_parquet(${sqlString(sqlPath(glob))}, union_by_name=true)`
      };
    }

    throw new Error(
      `Occurrence directory has no occurrence.txt/tsv/csv or Parquet files: ${input}`
    );
  }

  const ext = path.extname(input).toLowerCase();
  if (ext === ".zip") {
    throw new Error(
      "Pass an extracted GBIF occurrence.txt file or a Parquet silver lake, not the zipped DwC-A archive."
    );
  }
  if (ext === ".parquet") {
    return {
      kind: "parquet_file",
      label: input,
      sql: `read_parquet(${sqlString(sqlPath(input))}, union_by_name=true)`
    };
  }
  if (ext === ".tsv" || ext === ".txt") {
    return {
      kind: "tsv_file",
      label: input,
      sql: `read_csv(${sqlString(sqlPath(input))}, delim='\\t', header=true, all_varchar=true, ignore_errors=true, null_padding=true)`
    };
  }
  if (ext === ".csv") {
    return {
      kind: "csv_file",
      label: input,
      sql: `read_csv(${sqlString(sqlPath(input))}, delim=',', header=true, all_varchar=true, ignore_errors=true, null_padding=true)`
    };
  }

  throw new Error(`Unsupported occurrence input type: ${input}`);
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

function csvValue(value) {
  const text = value == null ? "" : String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function writeCsv(file, rows, columns) {
  const lines = [columns.join(",")];
  rows.forEach((row) => {
    lines.push(columns.map((column) => csvValue(row[column])).join(","));
  });
  fs.writeFileSync(file, `${lines.join("\n")}\n`);
}

function pickColumn(columns, candidates) {
  const lower = new Map(columns.map((name) => [String(name).toLowerCase(), name]));
  for (const candidate of candidates) {
    const match = lower.get(candidate.toLowerCase());
    if (match) return match;
  }
  return null;
}

function columnExpr(column, alias) {
  if (!column) return `NULL::VARCHAR AS ${sqlIdent(alias)}`;
  return `NULLIF(TRIM(CAST(${sqlIdent(column)} AS VARCHAR)), '') AS ${sqlIdent(alias)}`;
}

function runDuckDb({ duckdbExe, sqlFile, dbFile }) {
  childProcess.execFileSync(duckdbExe, [dbFile, "-f", sqlFile], {
    stdio: "inherit",
    windowsHide: true
  });
}

function probeOccurrenceColumns({ duckdbExe, dbFile, readExpr, workDir }) {
  const sqlFile = path.join(workDir, "probe_occurrence_columns.sql");
  const columnsCsv = path.join(workDir, "occurrence_columns.csv");
  fs.writeFileSync(
    sqlFile,
    `
CREATE OR REPLACE VIEW occurrence_probe AS
SELECT *
FROM ${readExpr.sql}
LIMIT 0;

COPY (
  SELECT name AS column_name
  FROM pragma_table_info('occurrence_probe')
  ORDER BY cid
) TO ${sqlString(sqlPath(columnsCsv))} (HEADER, DELIMITER ',');
`
  );
  runDuckDb({ duckdbExe, sqlFile, dbFile });
  return readCsv(columnsCsv)
    .map((row) => row.column_name)
    .filter(Boolean);
}

function occurrenceColumnMap(columns) {
  const rankColumns = {};
  for (const [rank, aliases] of Object.entries(RANK_KEY_ALIASES)) {
    rankColumns[rank] = pickColumn(columns, aliases);
  }

  return {
    acceptedTaxonKey: pickColumn(columns, [
      "acceptedTaxonKey",
      "accepted_taxon_key",
      "accepted_taxon_id"
    ]),
    taxonKey: pickColumn(columns, ["taxonKey", "taxon_key", "gbifID", "gbif_id"]),
    taxonRank: pickColumn(columns, ["taxonRank", "taxon_rank", "rank"]),
    scientificName: pickColumn(columns, ["scientificName", "scientific_name", "name"]),
    kingdom: pickColumn(columns, ["kingdom"]),
    phylum: pickColumn(columns, ["phylum"]),
    className: pickColumn(columns, ["class", "className", "class_name"]),
    orderName: pickColumn(columns, ["order", "orderName", "order_name"]),
    family: pickColumn(columns, ["family", "familyName", "family_name"]),
    genus: pickColumn(columns, ["genus", "genusName", "genus_name"]),
    decimalLatitude: pickColumn(columns, [
      "decimalLatitude",
      "decimal_latitude",
      "latitude",
      "lat"
    ]),
    decimalLongitude: pickColumn(columns, [
      "decimalLongitude",
      "decimal_longitude",
      "longitude",
      "lon",
      "lng"
    ]),
    squareKey: pickColumn(columns, [
      "square_key",
      "grid_square_key",
      "cell_key",
      "grid_cell",
      "gw_square_key"
    ]),
    observerKey: pickColumn(columns, [
      "recordedByID",
      "recorded_by_id",
      "observer_id",
      "user_id",
      "recordedBy",
      "recorded_by",
      "observer",
      "collector",
      "identifiedBy"
    ]),
    eventDate: pickColumn(columns, ["eventDate", "event_date", "date", "observed_on"]),
    year: pickColumn(columns, ["year", "eventYear", "event_year", "observed_year"]),
    month: pickColumn(columns, ["month", "eventMonth", "event_month", "observed_month"]),
    countryCode: pickColumn(columns, ["countryCode", "country_code", "country"]),
    stateProvince: pickColumn(columns, ["stateProvince", "state_province", "state", "province"]),
    county: pickColumn(columns, ["county", "countyName", "county_name"]),
    basisOfRecord: pickColumn(columns, ["basisOfRecord", "basis_of_record"]),
    occurrenceStatus: pickColumn(columns, ["occurrenceStatus", "occurrence_status"]),
    hasCoordinate: pickColumn(columns, ["hasCoordinate", "has_coordinate"]),
    hasGeospatialIssues: pickColumn(columns, [
      "hasGeospatialIssues",
      "has_geospatial_issues",
      "geospatial_issues"
    ]),
    issue: pickColumn(columns, ["issue", "issues", "gbifIssue", "gbif_issue"]),
    datasetKey: pickColumn(columns, ["datasetKey", "dataset_key", "datasetID", "dataset_id"]),
    publishingOrgKey: pickColumn(columns, [
      "publishingOrgKey",
      "publishing_org_key",
      "publisher_key"
    ]),
    rankColumns
  };
}

function profileMap(profiles) {
  return new Map(profiles.map((profile) => [profile.taxonKey, profile]));
}

function filteredTaxa(catalog, args) {
  if (!Array.isArray(catalog.taxa)) {
    throw new Error("Generated playable taxa input must contain taxa[].");
  }

  const include = new Set(splitList(args.profiles));
  const exclude = new Set(splitList(args["exclude-profiles"]));
  const limit = Math.max(0, Number.parseInt(args.limit || "0", 10) || 0);
  let taxa = catalog.taxa.filter((taxon) => {
    if (include.size && !include.has(taxon.playableGroupKey)) return false;
    if (exclude.has(taxon.playableGroupKey)) return false;
    return true;
  });
  if (limit > 0) taxa = taxa.slice(0, limit);
  return taxa;
}

function taxonRow(taxon) {
  return {
    playable_taxon_key: taxon.playableTaxonKey,
    playable_group_key: taxon.playableGroupKey,
    playable_group_name: taxon.playableGroupName,
    broad_parent_group: taxon.broadParentGroup,
    endpoint_rank: taxon.endpointRank,
    species_mode: taxon.speciesMode,
    inherited_group_score: taxon.beginnerPlayabilityScore,
    candidate_status: taxon.candidateStatus,
    accepted_taxon_key: taxon.acceptedTaxonKey,
    taxon_key: taxon.taxonKey,
    parent_taxon_key: taxon.parentTaxonKey,
    rank: taxon.rank,
    scientific_name: taxon.scientificName,
    canonical_name: taxon.canonicalName,
    display_name: taxon.displayName,
    common_name: taxon.commonName || "",
    anchor_kind: taxon.anchor?.kind || "",
    genus_name: taxon.lineage?.genus || "",
    family_name: taxon.lineage?.family || ""
  };
}

function buildScoringSql({ readExpr, columnMap, candidatesCsv, statsCsv, args }) {
  const binDegrees = Number(args["lat-lon-bin"] || 0.02);
  const threads = Math.max(1, Number.parseInt(args.threads || "4", 10) || 4);
  const recentSinceYear =
    Number.parseInt(args["recent-since-year"] || "", 10) ||
    new Date().getUTCFullYear() - Number.parseInt(args["recent-years"] || "10", 10);

  const rankKeySql = Object.entries(columnMap.rankColumns)
    .map(([rank, column]) => columnExpr(column, `${rank}_key`))
    .join(",\n    ");

  const spatialBinSql = `
    CASE
      WHEN square_key IS NOT NULL THEN square_key
      WHEN decimal_latitude IS NOT NULL
        AND decimal_longitude IS NOT NULL
        AND decimal_latitude BETWEEN -90 AND 90
        AND decimal_longitude BETWEEN -180 AND 180
      THEN CAST(FLOOR((decimal_latitude + 90.0) / ${binDegrees}) AS VARCHAR)
        || ':' ||
        CAST(FLOOR((decimal_longitude + 180.0) / ${binDegrees}) AS VARCHAR)
      ELSE NULL
    END AS spatial_bin`;

  return `
SET threads TO ${threads};
SET preserve_insertion_order = false;

CREATE OR REPLACE TABLE candidates AS
SELECT *
FROM read_csv(${sqlString(sqlPath(candidatesCsv))}, header=true, all_varchar=true);

CREATE OR REPLACE TABLE candidate_match_keys AS
SELECT DISTINCT
    playable_taxon_key,
    'key' AS join_type,
    'accepted' AS key_rank,
    accepted_taxon_key AS join_value
FROM candidates
WHERE accepted_taxon_key IS NOT NULL AND accepted_taxon_key <> ''
UNION
SELECT DISTINCT
    playable_taxon_key,
    'key' AS join_type,
    'taxon' AS key_rank,
    taxon_key AS join_value
FROM candidates
WHERE taxon_key IS NOT NULL AND taxon_key <> ''
UNION
SELECT DISTINCT
    playable_taxon_key,
    'key' AS join_type,
    LOWER(rank) AS key_rank,
    accepted_taxon_key AS join_value
FROM candidates
WHERE rank IS NOT NULL
  AND accepted_taxon_key IS NOT NULL
  AND accepted_taxon_key <> ''
UNION
SELECT DISTINCT
    playable_taxon_key,
    'key' AS join_type,
    LOWER(rank) AS key_rank,
    taxon_key AS join_value
FROM candidates
WHERE rank IS NOT NULL
  AND taxon_key IS NOT NULL
  AND taxon_key <> ''
UNION
SELECT DISTINCT
    playable_taxon_key,
    'name' AS join_type,
    LOWER(rank) AS key_rank,
    LOWER(NULLIF(TRIM(scientific_name), '')) AS join_value
FROM candidates
WHERE rank IS NOT NULL
  AND scientific_name IS NOT NULL
  AND scientific_name <> ''
UNION
SELECT DISTINCT
    playable_taxon_key,
    'name' AS join_type,
    LOWER(rank) AS key_rank,
    LOWER(NULLIF(TRIM(canonical_name), '')) AS join_value
FROM candidates
WHERE rank IS NOT NULL
  AND canonical_name IS NOT NULL
  AND canonical_name <> ''
UNION
SELECT DISTINCT
    playable_taxon_key,
    'name' AS join_type,
    'scientific' AS key_rank,
    LOWER(NULLIF(TRIM(scientific_name), '')) AS join_value
FROM candidates
WHERE scientific_name IS NOT NULL AND scientific_name <> ''
UNION
SELECT DISTINCT
    playable_taxon_key,
    'name' AS join_type,
    'scientific' AS key_rank,
    LOWER(NULLIF(TRIM(canonical_name), '')) AS join_value
FROM candidates
WHERE canonical_name IS NOT NULL AND canonical_name <> '';

CREATE OR REPLACE TABLE occurrence_projected AS
SELECT
    ROW_NUMBER() OVER () AS occurrence_row_id,
    ${columnExpr(columnMap.acceptedTaxonKey, "accepted_taxon_key")},
    ${columnExpr(columnMap.taxonKey, "taxon_key")},
    ${columnExpr(columnMap.taxonRank, "taxon_rank")},
    ${columnExpr(columnMap.scientificName, "scientific_name")},
    ${columnExpr(columnMap.kingdom, "kingdom_name")},
    ${columnExpr(columnMap.phylum, "phylum_name")},
    ${columnExpr(columnMap.className, "class_name")},
    ${columnExpr(columnMap.orderName, "order_name")},
    ${columnExpr(columnMap.family, "family_name")},
    ${columnExpr(columnMap.genus, "genus_name")},
    ${rankKeySql},
    ${columnExpr(columnMap.decimalLatitude, "decimal_latitude_raw")},
    ${columnExpr(columnMap.decimalLongitude, "decimal_longitude_raw")},
    ${columnExpr(columnMap.squareKey, "square_key")},
    ${columnExpr(columnMap.observerKey, "observer_key")},
    ${columnExpr(columnMap.eventDate, "event_date")},
    ${columnExpr(columnMap.year, "year_raw")},
    ${columnExpr(columnMap.month, "month_raw")},
    ${columnExpr(columnMap.countryCode, "country_code")},
    ${columnExpr(columnMap.stateProvince, "state_province")},
    ${columnExpr(columnMap.county, "county")},
    ${columnExpr(columnMap.basisOfRecord, "basis_of_record")},
    ${columnExpr(columnMap.occurrenceStatus, "occurrence_status")},
    ${columnExpr(columnMap.hasCoordinate, "has_coordinate")},
    ${columnExpr(columnMap.hasGeospatialIssues, "has_geospatial_issues")},
    ${columnExpr(columnMap.issue, "issue")},
    ${columnExpr(columnMap.datasetKey, "dataset_key")},
    ${columnExpr(columnMap.publishingOrgKey, "publishing_org_key")}
FROM ${readExpr.sql};

CREATE OR REPLACE TABLE occurrence_norm AS
SELECT
    occurrence_row_id,
    accepted_taxon_key,
    taxon_key,
    LOWER(taxon_rank) AS taxon_rank,
    LOWER(scientific_name) AS scientific_name_norm,
    LOWER(kingdom_name) AS kingdom_name_norm,
    LOWER(phylum_name) AS phylum_name_norm,
    LOWER(class_name) AS class_name_norm,
    LOWER(order_name) AS order_name_norm,
    LOWER(family_name) AS family_name_norm,
    LOWER(genus_name) AS genus_name_norm,
    species_key,
    genus_key,
    family_key,
    order_key,
    class_key,
    phylum_key,
    kingdom_key,
    TRY_CAST(decimal_latitude_raw AS DOUBLE) AS decimal_latitude,
    TRY_CAST(decimal_longitude_raw AS DOUBLE) AS decimal_longitude,
    square_key,
    observer_key,
    event_date,
    CASE
      WHEN TRY_CAST(year_raw AS INTEGER) BETWEEN 1500 AND 3000 THEN TRY_CAST(year_raw AS INTEGER)
      WHEN TRY_CAST(SUBSTR(event_date, 1, 4) AS INTEGER) BETWEEN 1500 AND 3000
        THEN TRY_CAST(SUBSTR(event_date, 1, 4) AS INTEGER)
      ELSE NULL
    END AS event_year,
    CASE
      WHEN TRY_CAST(month_raw AS INTEGER) BETWEEN 1 AND 12 THEN TRY_CAST(month_raw AS INTEGER)
      WHEN TRY_CAST(SUBSTR(event_date, 6, 2) AS INTEGER) BETWEEN 1 AND 12
        THEN TRY_CAST(SUBSTR(event_date, 6, 2) AS INTEGER)
      ELSE NULL
    END AS event_month,
    NULLIF(TRIM(CONCAT_WS(':', country_code, state_province, county)), '') AS region_key,
    basis_of_record,
    occurrence_status,
    has_coordinate,
    has_geospatial_issues,
    issue,
    dataset_key,
    publishing_org_key,
    CASE
      WHEN LOWER(COALESCE(occurrence_status, 'present')) IN ('absent', 'absence') THEN 0
      ELSE 1
    END AS present_ok
FROM occurrence_projected;

CREATE OR REPLACE TABLE occurrence_clean AS
SELECT
    *,
    CASE
      WHEN decimal_latitude IS NOT NULL
        AND decimal_longitude IS NOT NULL
        AND decimal_latitude BETWEEN -90 AND 90
        AND decimal_longitude BETWEEN -180 AND 180 THEN 1
      WHEN LOWER(COALESCE(has_coordinate, '')) IN ('true', 't', '1', 'yes') THEN 1
      ELSE 0
    END AS coordinate_ok,
    CASE
      WHEN LOWER(COALESCE(has_geospatial_issues, '')) IN ('true', 't', '1', 'yes') THEN 0
      WHEN LOWER(COALESCE(issue, '')) LIKE '%coordinate_invalid%' THEN 0
      WHEN LOWER(COALESCE(issue, '')) LIKE '%geospatial%' THEN 0
      ELSE 1
    END AS issue_free,
    CASE
      WHEN LOWER(COALESCE(basis_of_record, '')) IN (
        'human_observation',
        'machine_observation',
        'observation',
        'material_sample',
        'preserved_specimen'
      ) THEN 1
      WHEN basis_of_record IS NULL THEN 1
      ELSE 0
    END AS basis_ok,
    ${spatialBinSql}
FROM occurrence_norm
WHERE present_ok = 1;

CREATE OR REPLACE TABLE occurrence_join_keys AS
SELECT DISTINCT o.occurrence_row_id, 'species' AS key_rank, 'key' AS join_type, o.species_key AS join_value
FROM occurrence_clean o
JOIN candidate_match_keys c
  ON c.join_type = 'key' AND c.key_rank = 'species' AND c.join_value = o.species_key
WHERE o.species_key IS NOT NULL AND o.species_key <> ''
UNION ALL
SELECT DISTINCT o.occurrence_row_id, 'genus' AS key_rank, 'key' AS join_type, o.genus_key AS join_value
FROM occurrence_clean o
JOIN candidate_match_keys c
  ON c.join_type = 'key' AND c.key_rank = 'genus' AND c.join_value = o.genus_key
WHERE o.genus_key IS NOT NULL AND o.genus_key <> ''
UNION ALL
SELECT DISTINCT o.occurrence_row_id, 'family' AS key_rank, 'key' AS join_type, o.family_key AS join_value
FROM occurrence_clean o
JOIN candidate_match_keys c
  ON c.join_type = 'key' AND c.key_rank = 'family' AND c.join_value = o.family_key
WHERE o.family_key IS NOT NULL AND o.family_key <> ''
UNION ALL
SELECT DISTINCT o.occurrence_row_id, 'order' AS key_rank, 'key' AS join_type, o.order_key AS join_value
FROM occurrence_clean o
JOIN candidate_match_keys c
  ON c.join_type = 'key' AND c.key_rank = 'order' AND c.join_value = o.order_key
WHERE o.order_key IS NOT NULL AND o.order_key <> ''
UNION ALL
SELECT DISTINCT o.occurrence_row_id, 'class' AS key_rank, 'key' AS join_type, o.class_key AS join_value
FROM occurrence_clean o
JOIN candidate_match_keys c
  ON c.join_type = 'key' AND c.key_rank = 'class' AND c.join_value = o.class_key
WHERE o.class_key IS NOT NULL AND o.class_key <> ''
UNION ALL
SELECT DISTINCT o.occurrence_row_id, 'phylum' AS key_rank, 'key' AS join_type, o.phylum_key AS join_value
FROM occurrence_clean o
JOIN candidate_match_keys c
  ON c.join_type = 'key' AND c.key_rank = 'phylum' AND c.join_value = o.phylum_key
WHERE o.phylum_key IS NOT NULL AND o.phylum_key <> ''
UNION ALL
SELECT DISTINCT o.occurrence_row_id, 'kingdom' AS key_rank, 'key' AS join_type, o.kingdom_key AS join_value
FROM occurrence_clean o
JOIN candidate_match_keys c
  ON c.join_type = 'key' AND c.key_rank = 'kingdom' AND c.join_value = o.kingdom_key
WHERE o.kingdom_key IS NOT NULL AND o.kingdom_key <> ''
UNION ALL
SELECT DISTINCT o.occurrence_row_id, 'accepted' AS key_rank, 'key' AS join_type, o.accepted_taxon_key AS join_value
FROM occurrence_clean o
JOIN candidate_match_keys c
  ON c.join_type = 'key' AND c.key_rank = 'accepted' AND c.join_value = o.accepted_taxon_key
WHERE o.accepted_taxon_key IS NOT NULL AND o.accepted_taxon_key <> ''
UNION ALL
SELECT DISTINCT o.occurrence_row_id, 'taxon' AS key_rank, 'key' AS join_type, o.taxon_key AS join_value
FROM occurrence_clean o
JOIN candidate_match_keys c
  ON c.join_type = 'key' AND c.key_rank = 'taxon' AND c.join_value = o.taxon_key
WHERE o.taxon_key IS NOT NULL AND o.taxon_key <> ''
UNION ALL
SELECT DISTINCT
    o.occurrence_row_id,
    COALESCE(o.taxon_rank, 'scientific') AS key_rank,
    'name' AS join_type,
    o.scientific_name_norm AS join_value
FROM occurrence_clean o
JOIN candidate_match_keys c
  ON c.join_type = 'name'
 AND c.key_rank = COALESCE(o.taxon_rank, 'scientific')
 AND c.join_value = o.scientific_name_norm
WHERE o.scientific_name_norm IS NOT NULL AND o.scientific_name_norm <> ''
UNION ALL
SELECT DISTINCT o.occurrence_row_id, 'genus' AS key_rank, 'name' AS join_type, o.genus_name_norm AS join_value
FROM occurrence_clean o
JOIN candidate_match_keys c
  ON c.join_type = 'name' AND c.key_rank = 'genus' AND c.join_value = o.genus_name_norm
WHERE o.genus_name_norm IS NOT NULL AND o.genus_name_norm <> ''
UNION ALL
SELECT DISTINCT o.occurrence_row_id, 'family' AS key_rank, 'name' AS join_type, o.family_name_norm AS join_value
FROM occurrence_clean o
JOIN candidate_match_keys c
  ON c.join_type = 'name' AND c.key_rank = 'family' AND c.join_value = o.family_name_norm
WHERE o.family_name_norm IS NOT NULL AND o.family_name_norm <> ''
UNION ALL
SELECT DISTINCT o.occurrence_row_id, 'order' AS key_rank, 'name' AS join_type, o.order_name_norm AS join_value
FROM occurrence_clean o
JOIN candidate_match_keys c
  ON c.join_type = 'name' AND c.key_rank = 'order' AND c.join_value = o.order_name_norm
WHERE o.order_name_norm IS NOT NULL AND o.order_name_norm <> ''
UNION ALL
SELECT DISTINCT o.occurrence_row_id, 'class' AS key_rank, 'name' AS join_type, o.class_name_norm AS join_value
FROM occurrence_clean o
JOIN candidate_match_keys c
  ON c.join_type = 'name' AND c.key_rank = 'class' AND c.join_value = o.class_name_norm
WHERE o.class_name_norm IS NOT NULL AND o.class_name_norm <> ''
UNION ALL
SELECT DISTINCT o.occurrence_row_id, 'phylum' AS key_rank, 'name' AS join_type, o.phylum_name_norm AS join_value
FROM occurrence_clean o
JOIN candidate_match_keys c
  ON c.join_type = 'name' AND c.key_rank = 'phylum' AND c.join_value = o.phylum_name_norm
WHERE o.phylum_name_norm IS NOT NULL AND o.phylum_name_norm <> ''
UNION ALL
SELECT DISTINCT o.occurrence_row_id, 'kingdom' AS key_rank, 'name' AS join_type, o.kingdom_name_norm AS join_value
FROM occurrence_clean o
JOIN candidate_match_keys c
  ON c.join_type = 'name' AND c.key_rank = 'kingdom' AND c.join_value = o.kingdom_name_norm
WHERE o.kingdom_name_norm IS NOT NULL AND o.kingdom_name_norm <> '';

CREATE OR REPLACE TABLE occurrence_join_facts AS
SELECT DISTINCT
    k.join_type,
    k.key_rank,
    k.join_value,
    o.occurrence_row_id,
    o.spatial_bin,
    o.observer_key,
    o.region_key,
    o.event_year,
    o.event_month,
    o.coordinate_ok,
    o.issue_free,
    o.basis_ok,
    o.dataset_key,
    o.publishing_org_key
FROM occurrence_join_keys k
JOIN occurrence_clean o
  ON o.occurrence_row_id = k.occurrence_row_id;

CREATE OR REPLACE TABLE occurrence_matches AS
SELECT DISTINCT
    c.playable_taxon_key,
    f.occurrence_row_id,
    f.spatial_bin,
    f.observer_key,
    f.region_key,
    f.event_year,
    f.event_month,
    f.coordinate_ok,
    f.issue_free,
    f.basis_ok,
    f.dataset_key,
    f.publishing_org_key
FROM candidate_match_keys c
JOIN occurrence_join_facts f
  ON f.join_type = c.join_type
 AND f.key_rank = c.key_rank
 AND f.join_value = c.join_value;

COPY (
  SELECT
    c.playable_taxon_key,
    COUNT(m.occurrence_row_id) AS occurrence_count,
    COUNT(DISTINCT CASE WHEN m.spatial_bin IS NOT NULL THEN m.spatial_bin END) AS occupied_cell_count,
    COUNT(DISTINCT CASE WHEN m.observer_key IS NOT NULL THEN m.observer_key END) AS observer_count,
    COUNT(DISTINCT CASE WHEN m.region_key IS NOT NULL THEN m.region_key END) AS region_count,
    COUNT(DISTINCT CASE WHEN m.dataset_key IS NOT NULL THEN m.dataset_key END) AS dataset_count,
    COUNT(DISTINCT CASE WHEN m.publishing_org_key IS NOT NULL THEN m.publishing_org_key END) AS publisher_count,
    MAX(m.event_year) AS latest_year,
    SUM(CASE WHEN m.event_year >= ${recentSinceYear} THEN 1 ELSE 0 END) AS recent_occurrence_count,
    SUM(CASE WHEN m.coordinate_ok = 1 THEN 1 ELSE 0 END) AS coordinate_count,
    SUM(CASE WHEN m.issue_free = 1 THEN 1 ELSE 0 END) AS issue_free_count,
    SUM(CASE WHEN m.basis_ok = 1 THEN 1 ELSE 0 END) AS basis_ok_count,
    COUNT(DISTINCT CASE WHEN m.event_month BETWEEN 1 AND 12 THEN m.event_month END) AS month_count,
    SUM(CASE WHEN m.event_month = 1 THEN 1 ELSE 0 END) AS month_01,
    SUM(CASE WHEN m.event_month = 2 THEN 1 ELSE 0 END) AS month_02,
    SUM(CASE WHEN m.event_month = 3 THEN 1 ELSE 0 END) AS month_03,
    SUM(CASE WHEN m.event_month = 4 THEN 1 ELSE 0 END) AS month_04,
    SUM(CASE WHEN m.event_month = 5 THEN 1 ELSE 0 END) AS month_05,
    SUM(CASE WHEN m.event_month = 6 THEN 1 ELSE 0 END) AS month_06,
    SUM(CASE WHEN m.event_month = 7 THEN 1 ELSE 0 END) AS month_07,
    SUM(CASE WHEN m.event_month = 8 THEN 1 ELSE 0 END) AS month_08,
    SUM(CASE WHEN m.event_month = 9 THEN 1 ELSE 0 END) AS month_09,
    SUM(CASE WHEN m.event_month = 10 THEN 1 ELSE 0 END) AS month_10,
    SUM(CASE WHEN m.event_month = 11 THEN 1 ELSE 0 END) AS month_11,
    SUM(CASE WHEN m.event_month = 12 THEN 1 ELSE 0 END) AS month_12
  FROM candidates c
  LEFT JOIN occurrence_matches m
    ON m.playable_taxon_key = c.playable_taxon_key
  GROUP BY c.playable_taxon_key
  ORDER BY c.playable_taxon_key
) TO ${sqlString(sqlPath(statsCsv))} (HEADER, DELIMITER ',');
`;
}

function scoreTargets(rank, scale) {
  const base = LOCAL_TARGETS[String(rank || "").toLowerCase()] || LOCAL_TARGETS.genus;
  if (scale !== "global") return base;
  return Object.fromEntries(
    Object.entries(base).map(([key, value]) => [key, Math.max(1, value * GLOBAL_TARGET_MULTIPLIER)])
  );
}

function logScore(value, target) {
  const count = Math.max(0, Number(value) || 0);
  const excellent = Math.max(1, Number(target) || 1);
  return clamp((Math.log1p(count) / Math.log1p(excellent)) * 100);
}

function ratio(numerator, denominator, fallback = 0) {
  const top = Number(numerator) || 0;
  const bottom = Number(denominator) || 0;
  if (bottom <= 0) return fallback;
  return top / bottom;
}

function evidenceScores(taxon, stats, args) {
  const scale = args["evidence-scale"] === "global" ? "global" : "local";
  const targets = scoreTargets(taxon.rank, scale);
  const occurrenceCount = toNumber(stats.occurrence_count);
  const occupiedCellCount = toNumber(stats.occupied_cell_count);
  const observerCount = toNumber(stats.observer_count);
  const regionCount = toNumber(stats.region_count);
  const datasetCount = toNumber(stats.dataset_count);
  const recentOccurrenceCount = toNumber(stats.recent_occurrence_count);
  const monthCount = toNumber(stats.month_count);

  const occurrenceSupport = logScore(occurrenceCount, targets.occurrences);
  const spatialSupport = logScore(occupiedCellCount, targets.cells);
  const observerSupport = logScore(observerCount, targets.observers);
  const regionSupport = logScore(regionCount, targets.regions);
  const datasetSupport = logScore(datasetCount, targets.datasets);
  const recencySupport =
    occurrenceCount > 0 ? clamp(ratio(recentOccurrenceCount, occurrenceCount) * 100) : 0;
  const seasonalitySupport = clamp((monthCount / 6) * 100);

  const coordinateRatio = ratio(stats.coordinate_count, occurrenceCount, 0);
  const issueFreeRatio = ratio(
    stats.issue_free_count,
    occurrenceCount,
    occurrenceCount > 0 ? 0.85 : 0
  );
  const basisOkRatio = ratio(stats.basis_ok_count, occurrenceCount, occurrenceCount > 0 ? 0.85 : 0);

  const localDataSupport = clamp(
    occurrenceSupport * 0.42 +
      spatialSupport * 0.28 +
      observerSupport * 0.14 +
      regionSupport * 0.08 +
      recencySupport * 0.05 +
      seasonalitySupport * 0.03
  );

  const validationReliability = clamp(
    coordinateRatio * 32 +
      issueFreeRatio * 26 +
      basisOkRatio * 14 +
      observerSupport * 0.1 +
      datasetSupport * 0.08 +
      recencySupport * 0.06 +
      seasonalitySupport * 0.04
  );

  return {
    scale,
    targets,
    occurrenceSupport: round(occurrenceSupport),
    spatialSupport: round(spatialSupport),
    observerSupport: round(observerSupport),
    regionSupport: round(regionSupport),
    datasetSupport: round(datasetSupport),
    recencySupport: round(recencySupport),
    seasonalitySupport: round(seasonalitySupport),
    localDataSupport: round(localDataSupport),
    validationReliability: round(validationReliability),
    coordinateRatio: round(coordinateRatio, 4),
    issueFreeRatio: round(issueFreeRatio, 4),
    basisOkRatio: round(basisOkRatio, 4)
  };
}

function weightedScore(components, weights) {
  return Object.entries(weights).reduce(
    (sum, [key, weight]) => sum + clamp(components[key]) * weight,
    0
  );
}

function rankIndex(rank) {
  return RANK_ORDER.indexOf(String(rank || "").toLowerCase());
}

function compareRanks(left, right) {
  const leftIndex = rankIndex(left);
  const rightIndex = rankIndex(right);
  if (leftIndex < 0 || rightIndex < 0) return null;
  return leftIndex - rightIndex;
}

function speciesModeHeuristic(mode) {
  return SPECIES_MODE_HEURISTICS[mode] || SPECIES_MODE_HEURISTICS.optional;
}

function rankFitScore(taxon, profile) {
  const mode = speciesModeHeuristic(taxon.speciesMode);
  const rank = String(taxon.rank || "").toLowerCase();
  const endpointRank = String(
    taxon.endpointRank || profile?.beginnerEndpointRank || ""
  ).toLowerCase();
  const comparison = compareRanks(rank, endpointRank);

  if (rank === "species") return mode.speciesFit;
  if (comparison === 0) return mode.endpointFit;
  if (comparison != null && comparison < 0) return clamp(mode.endpointFit - 10);
  if (comparison != null && comparison > 0) return clamp(mode.speciesFit - 8);
  if (rank === "genus") return 72;
  if (rank === "family") return 66;
  return 52;
}

function nameSignalScore(taxon) {
  const commonNames = Array.isArray(taxon.commonNames) ? taxon.commonNames.length : 0;
  if (commonNames >= 2) return 94;
  if (taxon.commonName) return 88;
  const rank = String(taxon.rank || "").toLowerCase();
  if (rank === "species") return 38;
  if (rank === "genus") return 50;
  if (rank === "family") return 58;
  return 48;
}

function siblingEvidenceKey(taxon) {
  if (taxon.parentTaxonKey) return `${taxon.playableGroupKey}:parent:${taxon.parentTaxonKey}`;
  if (taxon.lineage?.genus) return `${taxon.playableGroupKey}:genus:${taxon.lineage.genus}`;
  if (taxon.lineage?.family) return `${taxon.playableGroupKey}:family:${taxon.lineage.family}`;
  return `${taxon.playableGroupKey}:group:${taxon.playableGroupKey}`;
}

function buildScoringContext(taxa, statsByTaxon) {
  const siblingEvidenceCounts = new Map();
  const groupEvidenceCounts = new Map();

  taxa.forEach((taxon) => {
    const stats = statsByTaxon.get(taxon.playableTaxonKey) || {};
    const occurrenceCount = toNumber(stats.occurrence_count);
    if (occurrenceCount <= 0) return;

    const siblingKey = siblingEvidenceKey(taxon);
    siblingEvidenceCounts.set(siblingKey, (siblingEvidenceCounts.get(siblingKey) || 0) + 1);
    groupEvidenceCounts.set(
      taxon.playableGroupKey,
      (groupEvidenceCounts.get(taxon.playableGroupKey) || 0) + 1
    );
  });

  return { siblingEvidenceCounts, groupEvidenceCounts };
}

function ambiguityClarityScore(taxon, context) {
  const siblingCount = context.siblingEvidenceCounts.get(siblingEvidenceKey(taxon)) || 0;
  const siblingAlternatives = Math.max(0, siblingCount - 1);
  const rank = String(taxon.rank || "").toLowerCase();
  const siblingTarget = rank === "species" ? 8 : rank === "genus" ? 18 : 28;
  const siblingPressure = logScore(siblingAlternatives, siblingTarget);
  const commonNameOffset = taxon.commonName ? 6 : 0;
  const filterPenalty = taxon.candidateStatus === "needs_filter" ? 10 : 0;
  return clamp(100 - siblingPressure * 0.42 + commonNameOffset - filterPenalty);
}

function taxonLevelPlayabilityComponents({ taxon, profile, evidence, args, context }) {
  const profileMetrics = profile?.metrics || {};
  const mode = speciesModeHeuristic(taxon.speciesMode);
  const nameSignal = nameSignalScore(taxon);
  const rankFit = rankFitScore(taxon, profile);
  const ambiguityClarity = ambiguityClarityScore(taxon, context);
  const filterPenalty = taxon.candidateStatus === "needs_filter" ? 8 : 0;
  const occurrencePenalty = evidence.occurrenceSupport > 0 ? 0 : 12;
  const reliabilityPenalty = evidence.validationReliability < 35 ? 6 : 0;

  const identifiability = clamp(
    toNumber(profileMetrics.identifiability, 50) * 0.4 +
      nameSignal * 0.22 +
      rankFit * 0.18 +
      ambiguityClarity * 0.12 +
      evidence.validationReliability * 0.08 +
      mode.identifiability -
      filterPenalty
  );

  const observability = clamp(
    toNumber(profileMetrics.observability, 50) * 0.28 +
      evidence.occurrenceSupport * 0.34 +
      evidence.spatialSupport * 0.16 +
      evidence.recencySupport * 0.1 +
      evidence.seasonalitySupport * 0.05 +
      evidence.observerSupport * 0.07 +
      mode.observability -
      occurrencePenalty
  );

  const distinctiveness = clamp(
    toNumber(profileMetrics.distinctiveness, 50) * 0.36 +
      ambiguityClarity * 0.24 +
      nameSignal * 0.16 +
      rankFit * 0.14 +
      evidence.observerSupport * 0.05 +
      evidence.validationReliability * 0.05 +
      mode.distinctiveness -
      reliabilityPenalty
  );

  return {
    components: {
      identifiability: round(identifiability),
      observability: round(observability),
      localDataSupport: evidence.localDataSupport,
      validationReliability: evidence.validationReliability,
      distinctiveness: round(distinctiveness)
    },
    signals: {
      nameSignal: round(nameSignal),
      rankFit: round(rankFit),
      ambiguityClarity: round(ambiguityClarity),
      speciesMode: taxon.speciesMode || "optional",
      candidateStatus: taxon.candidateStatus || null,
      siblingEvidenceCount: context.siblingEvidenceCounts.get(siblingEvidenceKey(taxon)) || 0,
      groupEvidenceCount: context.groupEvidenceCounts.get(taxon.playableGroupKey) || 0,
      evidenceScale: args["evidence-scale"] === "global" ? "global" : "local"
    }
  };
}

function scoreTaxon({ taxon, stats, profile, weights, args, context }) {
  const evidence = evidenceScores(taxon, stats, args);
  const occurrenceCount = toNumber(stats.occurrence_count);
  const heuristic = taxonLevelPlayabilityComponents({ taxon, profile, evidence, args, context });
  const scoreComponents = heuristic.components;

  const score = round(weightedScore(scoreComponents, weights));
  const action = storageAction({ taxon, stats, profile, score, evidence, args });

  return {
    ...taxon,
    inheritedGroupPlayabilityScore: taxon.beginnerPlayabilityScore,
    individualPlayabilityScore: score,
    beginnerPlayabilityScore: score,
    playabilityScoreBasis: "taxon_level_playability_heuristic_v001",
    scoreComponents,
    heuristicSignals: heuristic.signals,
    evidenceScore: {
      localDataSupport: evidence.localDataSupport,
      validationReliability: evidence.validationReliability,
      occurrenceSupport: evidence.occurrenceSupport,
      spatialSupport: evidence.spatialSupport,
      observerSupport: evidence.observerSupport,
      regionSupport: evidence.regionSupport,
      recencySupport: evidence.recencySupport,
      seasonalitySupport: evidence.seasonalitySupport,
      scale: evidence.scale
    },
    occurrenceEvidence: {
      occurrenceCount,
      occupiedCellCount: toNumber(stats.occupied_cell_count),
      observerCount: toNumber(stats.observer_count),
      regionCount: toNumber(stats.region_count),
      datasetCount: toNumber(stats.dataset_count),
      publisherCount: toNumber(stats.publisher_count),
      latestYear: stats.latest_year === "" ? null : toNumber(stats.latest_year, null),
      recentOccurrenceCount: toNumber(stats.recent_occurrence_count),
      coordinateCount: toNumber(stats.coordinate_count),
      issueFreeCount: toNumber(stats.issue_free_count),
      basisOkCount: toNumber(stats.basis_ok_count),
      monthCount: toNumber(stats.month_count),
      monthCounts: monthCounts(stats),
      coordinateRatio: evidence.coordinateRatio,
      issueFreeRatio: evidence.issueFreeRatio,
      basisOkRatio: evidence.basisOkRatio
    },
    goldLakeAction: action
  };
}

function monthCounts(stats) {
  return Array.from({ length: 12 }, (_, index) => {
    const key = `month_${String(index + 1).padStart(2, "0")}`;
    return toNumber(stats[key]);
  });
}

function storageAction({ taxon, stats, score, evidence, args }) {
  const occurrenceCount = toNumber(stats.occurrence_count);
  const keepScore = toNumber(args["min-keep-score"], 70);
  const developerScore = toNumber(args["min-developer-score"], 58);
  const collapseScore = toNumber(args["min-collapse-score"], 38);
  const minOccurrences = toNumber(args["min-occurrences"], 3);
  const speciesMode = taxon.speciesMode || "";
  const reasonCodes = [];

  if (occurrenceCount <= 0) reasonCodes.push("no_occurrence_evidence");
  if (occurrenceCount > 0 && occurrenceCount < minOccurrences) reasonCodes.push("thin_evidence");
  if (taxon.candidateStatus === "needs_filter") reasonCodes.push("needs_local_filter");
  if (evidence.validationReliability < 35) reasonCodes.push("low_validation_reliability");
  if (!taxon.commonName && taxon.rank === "species") reasonCodes.push("no_common_name");

  let mode = "drop";
  if (occurrenceCount >= minOccurrences && score >= keepScore && speciesMode !== "hidden") {
    mode = speciesMode === "discouraged" ? "developer_only" : "keep";
  } else if (occurrenceCount >= minOccurrences && score >= developerScore) {
    mode = "developer_only";
  } else if (occurrenceCount >= minOccurrences && score >= collapseScore) {
    mode = "collapse";
  }

  if (taxon.candidateStatus === "needs_filter" && mode === "keep") {
    mode = "developer_only";
    reasonCodes.push("kept_out_of_beginner_layer_until_reviewed");
  }

  const collapseTarget = collapseTargetFor(taxon);
  return {
    mode,
    servedRank: mode === "keep" || mode === "developer_only" ? taxon.rank : collapseTarget.rank,
    servedTaxonKey:
      mode === "keep" || mode === "developer_only"
        ? taxon.acceptedTaxonKey || taxon.taxonKey
        : collapseTarget.key,
    servedDisplayName:
      mode === "keep" || mode === "developer_only" ? taxon.displayName : collapseTarget.displayName,
    collapseTarget: mode === "collapse" ? collapseTarget : null,
    reasonCodes: Array.from(new Set(reasonCodes)),
    thresholds: {
      keepScore,
      developerScore,
      collapseScore,
      minOccurrences
    }
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
  if ((rank === "genus" || rank === "species") && taxon.lineage?.family) {
    return {
      rank: "family",
      key: taxon.lineage.family,
      displayName: taxon.lineage.family
    };
  }
  return {
    rank: "playable_group",
    key: taxon.playableGroupKey,
    displayName: taxon.playableGroupName
  };
}

function buildProfileStats(scoredTaxa) {
  const byGroup = new Map();
  scoredTaxa.forEach((taxon) => {
    const key = taxon.playableGroupKey;
    if (!byGroup.has(key)) {
      byGroup.set(key, {
        playableGroupKey: key,
        playableGroupName: taxon.playableGroupName,
        taxonCount: 0,
        keepCount: 0,
        collapseCount: 0,
        developerOnlyCount: 0,
        dropCount: 0,
        occurrenceCount: 0,
        scoredTaxonCount: 0,
        scoreSum: 0
      });
    }
    const stats = byGroup.get(key);
    stats.taxonCount += 1;
    stats.occurrenceCount += toNumber(taxon.occurrenceEvidence?.occurrenceCount);
    if (taxon.individualPlayabilityScore != null) {
      stats.scoredTaxonCount += 1;
      stats.scoreSum += taxon.individualPlayabilityScore;
    }
    if (taxon.goldLakeAction?.mode === "keep") stats.keepCount += 1;
    else if (taxon.goldLakeAction?.mode === "collapse") stats.collapseCount += 1;
    else if (taxon.goldLakeAction?.mode === "developer_only") stats.developerOnlyCount += 1;
    else if (taxon.goldLakeAction?.mode === "drop") stats.dropCount += 1;
  });

  return Array.from(byGroup.values()).map((stats) => {
    const { scoreSum, ...publicStats } = stats;
    return {
      ...publicStats,
      meanIndividualPlayabilityScore:
        stats.scoredTaxonCount > 0 ? round(scoreSum / stats.scoredTaxonCount) : null
    };
  });
}

function summary(scoredTaxa, options) {
  const profileStats = buildProfileStats(scoredTaxa);
  const counts = scoredTaxa.reduce(
    (acc, taxon) => {
      acc.taxon_count += 1;
      acc.occurrence_count += toNumber(taxon.occurrenceEvidence?.occurrenceCount);
      acc.with_occurrence_evidence += taxon.occurrenceEvidence?.occurrenceCount > 0 ? 1 : 0;
      acc.with_common_name += taxon.commonName ? 1 : 0;
      const mode = taxon.goldLakeAction?.mode;
      if (mode === "keep") acc.keep_count += 1;
      else if (mode === "collapse") acc.collapse_count += 1;
      else if (mode === "developer_only") acc.developer_only_count += 1;
      else if (mode === "drop") acc.drop_count += 1;
      if (taxon.individualPlayabilityScore != null) {
        acc.score_count += 1;
        acc.score_sum += taxon.individualPlayabilityScore;
      }
      return acc;
    },
    {
      taxon_count: 0,
      with_occurrence_evidence: 0,
      with_common_name: 0,
      occurrence_count: 0,
      keep_count: 0,
      collapse_count: 0,
      developer_only_count: 0,
      drop_count: 0,
      score_count: 0,
      score_sum: 0
    }
  );

  const { score_sum: scoreSum, ...publicCounts } = counts;
  return {
    ...publicCounts,
    mean_individual_playability_score:
      counts.score_count > 0 ? round(scoreSum / counts.score_count) : null,
    evidence_scale: options.evidenceScale,
    recent_since_year: options.recentSinceYear,
    global_limit_applied: options.globalLimitApplied,
    profile_stats: profileStats
  };
}

function main() {
  const args = parseArgs(process.argv);
  const catalogInput = path.resolve(args["catalog-input"] || DEFAULT_CATALOG_INPUT);
  const profileInput = path.resolve(args["profile-input"] || DEFAULT_PROFILE_INPUT);
  const outDir = path.resolve(args["out-dir"] || DEFAULT_OUT_DIR);
  const duckdbExe = locateDuckDb(args);
  const occurrenceInput = resolveOccurrenceInput(args);
  const occurrenceReader = occurrenceReadExpression(occurrenceInput);
  const catalog = readJson(catalogInput);
  const profilePayload = readJson(profileInput);
  const profiles = profilePayload.profiles || [];
  const taxa = filteredTaxa(catalog, args);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "gridwild-playable-taxa-score-"));
  const dbFile = path.join(workDir, "score.duckdb");
  const columns = probeOccurrenceColumns({
    duckdbExe,
    dbFile,
    readExpr: occurrenceReader,
    workDir
  });
  const columnMap = occurrenceColumnMap(columns);
  const missingKeyColumns = Object.entries(columnMap.rankColumns)
    .filter(([, column]) => !column)
    .map(([rank]) => rank);

  if (args["check-inputs"]) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          catalogInput,
          catalogTaxa: Array.isArray(catalog.taxa) ? catalog.taxa.length : null,
          filteredTaxa: taxa.length,
          profileInput,
          profileCount: profiles.length,
          duckdbExe,
          occurrenceInput,
          occurrenceKind: occurrenceReader.kind,
          occurrenceColumns: columns.length,
          missingRankKeyColumns: missingKeyColumns,
          outDir
        },
        null,
        2
      )
    );
    return;
  }

  if (!taxa.length) {
    throw new Error("No generated playable taxa selected for scoring.");
  }

  const candidatesCsv = path.join(workDir, "playable_taxa_candidates.csv");
  const statsCsv = path.join(workDir, "playable_taxa_occurrence_stats.csv");
  const scoringSql = path.join(workDir, "score_playable_taxa.sql");
  writeCsv(candidatesCsv, taxa.map(taxonRow), [
    "playable_taxon_key",
    "playable_group_key",
    "playable_group_name",
    "broad_parent_group",
    "endpoint_rank",
    "species_mode",
    "inherited_group_score",
    "candidate_status",
    "accepted_taxon_key",
    "taxon_key",
    "parent_taxon_key",
    "rank",
    "scientific_name",
    "canonical_name",
    "display_name",
    "common_name",
    "anchor_kind",
    "genus_name",
    "family_name"
  ]);
  fs.writeFileSync(
    scoringSql,
    buildScoringSql({
      readExpr: occurrenceReader,
      columnMap,
      candidatesCsv,
      statsCsv,
      args
    })
  );
  runDuckDb({ duckdbExe, sqlFile: scoringSql, dbFile });

  const statsByTaxon = new Map(readCsv(statsCsv).map((row) => [row.playable_taxon_key, row]));
  const profilesByKey = profileMap(profiles);
  const weights = profilePayload.score_weights || catalog.score_weights || SCORE_WEIGHTS;
  const context = buildScoringContext(taxa, statsByTaxon);
  const scoredTaxa = taxa.map((taxon) =>
    scoreTaxon({
      taxon,
      stats: statsByTaxon.get(taxon.playableTaxonKey) || {},
      profile: profilesByKey.get(taxon.playableGroupKey),
      weights,
      args,
      context
    })
  );

  const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const version = args.version || process.env.PLAYABLE_TAXA_SCORE_VERSION || DEFAULT_VERSION;
  const recentSinceYear =
    Number.parseInt(args["recent-since-year"] || "", 10) ||
    new Date().getUTCFullYear() - Number.parseInt(args["recent-years"] || "10", 10);
  const evidenceScale = args["evidence-scale"] === "global" ? "global" : "local";
  const globalLimitApplied = Math.max(0, Number.parseInt(args.limit || "0", 10) || 0) > 0;
  const scoringModel = {
    name: "taxon_level_playability_heuristic_v001",
    score_weights: weights,
    evidence_scale: evidenceScale,
    recent_since_year: recentSinceYear,
    lat_lon_bin_degrees: Number(args["lat-lon-bin"] || 0.02),
    storage_action_thresholds: {
      min_keep_score: toNumber(args["min-keep-score"], 70),
      min_developer_score: toNumber(args["min-developer-score"], 58),
      min_collapse_score: toNumber(args["min-collapse-score"], 38),
      min_occurrences: toNumber(args["min-occurrences"], 3)
    },
    notes: [
      "Scores lower taxa with the same five conceptual components as curated playable groups.",
      "Per-taxon heuristics combine profile priors, common-name signal, rank fit, species-mode policy, sibling crowding, and occurrence evidence.",
      "GBIF backbone supplies taxonomy; occurrence evidence supplies local/commonness support.",
      "iNaturalist-specific human identifiability signals are intentionally left for cached future enrichment."
    ]
  };
  const summaryPayload = summary(scoredTaxa, {
    evidenceScale,
    recentSinceYear,
    globalLimitApplied
  });

  const catalogOut = {
    schema_version: "gridwild-scored-playable-taxa-v1",
    playable_taxa_score_version: version,
    playable_taxa_version: catalog.playable_taxa_version || null,
    playable_taxonomy_version:
      catalog.playable_taxonomy_version || profilePayload.playable_taxonomy_version || null,
    generated_at: generatedAt,
    source: "taxon-level-playability-heuristic",
    scoring_model: scoringModel,
    inputs: {
      catalog: path.basename(catalogInput),
      profiles: path.basename(profileInput),
      occurrence: {
        kind: occurrenceReader.kind,
        label: occurrenceReader.label
      }
    },
    summary: summaryPayload,
    taxa: scoredTaxa
  };

  const manifestOut = {
    schema_version: "gridwild-scored-playable-taxa-manifest-v1",
    playable_taxa_score_version: version,
    playable_taxa_version: catalogOut.playable_taxa_version,
    playable_taxonomy_version: catalogOut.playable_taxonomy_version,
    generated_at: generatedAt,
    source: catalogOut.source,
    scoring_model: scoringModel,
    inputs: catalogOut.inputs,
    files: {
      catalog: "scored_playable_taxa.json"
    },
    summary: summaryPayload
  };

  writeJson(path.join(outDir, "scored_playable_taxa.json"), catalogOut);
  writeJson(path.join(outDir, "scored_playable_taxa_manifest.json"), manifestOut);

  console.log(
    JSON.stringify(
      {
        playable_taxa_score_version: version,
        playable_taxa_version: catalogOut.playable_taxa_version,
        playable_taxonomy_version: catalogOut.playable_taxonomy_version,
        taxa: summaryPayload.taxon_count,
        withOccurrenceEvidence: summaryPayload.with_occurrence_evidence,
        keep: summaryPayload.keep_count,
        collapse: summaryPayload.collapse_count,
        developerOnly: summaryPayload.developer_only_count,
        drop: summaryPayload.drop_count,
        meanIndividualPlayabilityScore: summaryPayload.mean_individual_playability_score,
        occurrenceInput,
        occurrenceKind: occurrenceReader.kind,
        outDir
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
