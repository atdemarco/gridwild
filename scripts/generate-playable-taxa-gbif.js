const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_BACKBONE_DIR = "C:\\Users\\ad1470\\Downloads\\backbone";
const DEFAULT_DUCKDB_EXE = "C:\\Users\\ad1470\\Desktop\\gridwild\\world\\duckdb.exe";
const DEFAULT_PROFILE_INPUT = path.join(
  __dirname,
  "..",
  "assets",
  "playable_taxonomy",
  "playable_taxon_profiles.json"
);
const DEFAULT_OUT_DIR = path.join(__dirname, "..", "assets", "playable_taxonomy");
const DEFAULT_VERSION = "playable-taxa-gbif-v001";
const READY_ANCHOR_KINDS = new Set(["canonical_clade", "multi_clade", "multi_family"]);

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

function sqlIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function sqlPath(value) {
  return String(value).replace(/\\/g, "/").replace(/'/g, "''");
}

function splitList(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function findFirstExisting(dir, names) {
  for (const name of names) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) return file;
  }
  return null;
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

function readHeader(file) {
  const fd = fs.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    const bytes = fs.readSync(fd, buffer, 0, buffer.length, 0);
    const text = buffer
      .subarray(0, bytes)
      .toString("utf8")
      .replace(/^\uFEFF/, "");
    const firstLine = text.split(/\r?\n/, 1)[0] || "";
    return firstLine.split("\t").map((name) => name.trim());
  } finally {
    fs.closeSync(fd);
  }
}

function pickColumn(header, candidates, options = {}) {
  const lower = new Map(header.map((name) => [name.toLowerCase(), name]));
  for (const candidate of candidates) {
    const match = lower.get(candidate.toLowerCase());
    if (match) return match;
  }
  if (options.required) {
    throw new Error(`Missing required column. Tried: ${candidates.join(", ")}`);
  }
  return null;
}

function colExpr(column, alias) {
  return column ? `${sqlIdent(column)} AS ${sqlIdent(alias)}` : `'' AS ${sqlIdent(alias)}`;
}

function buildTaxonInfo(header) {
  const columns = {
    taxonID: pickColumn(header, ["taxonID", "id", "ID"], { required: true }),
    parentNameUsageID: pickColumn(header, ["parentNameUsageID", "parentTaxonID", "parentID"]),
    acceptedNameUsageID: pickColumn(header, [
      "acceptedNameUsageID",
      "acceptedTaxonID",
      "acceptedID"
    ]),
    scientificName: pickColumn(header, ["scientificName", "name"], { required: true }),
    canonicalName: pickColumn(header, ["canonicalName", "scientificName"], { required: true }),
    taxonRank: pickColumn(header, ["taxonRank", "rank"], { required: true }),
    taxonomicStatus: pickColumn(header, ["taxonomicStatus", "status"]),
    kingdom: pickColumn(header, ["kingdom"]),
    phylum: pickColumn(header, ["phylum"]),
    className: pickColumn(header, ["class"]),
    orderName: pickColumn(header, ["order"]),
    family: pickColumn(header, ["family"]),
    genus: pickColumn(header, ["genus"])
  };

  return {
    columns,
    selectSql: [
      colExpr(columns.taxonID, "taxon_key"),
      colExpr(columns.parentNameUsageID, "parent_taxon_key"),
      colExpr(columns.acceptedNameUsageID, "accepted_taxon_key_raw"),
      colExpr(columns.scientificName, "scientific_name"),
      colExpr(columns.canonicalName, "canonical_name"),
      colExpr(columns.taxonRank, "taxon_rank"),
      colExpr(columns.taxonomicStatus, "taxonomic_status"),
      colExpr(columns.kingdom, "kingdom"),
      colExpr(columns.phylum, "phylum"),
      colExpr(columns.className, "class_name"),
      colExpr(columns.orderName, "order_name"),
      colExpr(columns.family, "family_name"),
      colExpr(columns.genus, "genus_name")
    ].join(",\n    ")
  };
}

function buildVernacularInfo(header) {
  if (!header) return null;
  return {
    taxonID: pickColumn(header, ["taxonID", "id", "usageID"], { required: true }),
    vernacularName: pickColumn(header, ["vernacularName", "name"], { required: true }),
    language: pickColumn(header, ["language", "languageCode"]),
    isPreferredName: pickColumn(header, ["isPreferredName", "preferred", "isPreferred"])
  };
}

function duckReadCsv(file) {
  return `read_csv(${sqlString(sqlPath(file))}, delim='\\t', header=true, all_varchar=true, ignore_errors=true)`;
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
    .filter((r) => r.length && r.some((v) => v !== ""))
    .map((r) => {
      const out = {};
      header.forEach((name, index) => {
        out[name] = r[index] ?? "";
      });
      return out;
    });
}

function endpointRankForProfile(profile, mode) {
  const key = `${mode}EndpointRank`;
  return profile[key] || profile.beginnerEndpointRank || "family";
}

function anchorRowsFromProfiles(profiles, options) {
  const include = new Set(splitList(options.profiles));
  const exclude = new Set(splitList(options["exclude-profiles"]));
  const mode = options["rank-mode"] || "beginner";

  const rows = [];
  for (const profile of profiles) {
    if (include.size && !include.has(profile.taxonKey)) continue;
    if (exclude.has(profile.taxonKey)) continue;

    const anchors = profile.gbif?.anchors || [];
    anchors.forEach((anchor, index) => {
      rows.push({
        profileKey: profile.taxonKey,
        profileDisplayName: profile.displayName,
        broadParentGroup: profile.broadParentGroup,
        endpointRank: endpointRankForProfile(profile, mode),
        speciesMode: profile.speciesMode,
        beginnerPlayabilityScore: profile.beginnerPlayabilityScore ?? "",
        anchorIndex: index,
        anchorTaxonKey: anchor.acceptedTaxonKey,
        anchorName: anchor.canonicalName || anchor.queryName || anchor.scientificName,
        anchorRank: anchor.rank || anchor.queryRank || "",
        anchorKind: anchor.anchorKind || "canonical_clade",
        anchorNote: anchor.note || ""
      });
    });
  }
  return rows.filter((row) => row.anchorTaxonKey);
}

function anchorValuesSql(rows) {
  return rows
    .map((row) => {
      const values = [
        row.profileKey,
        row.profileDisplayName,
        row.broadParentGroup,
        row.endpointRank,
        row.speciesMode,
        row.beginnerPlayabilityScore,
        row.anchorIndex,
        row.anchorTaxonKey,
        row.anchorName,
        row.anchorRank,
        row.anchorKind,
        row.anchorNote
      ].map((value) => sqlString(value));
      return `(${values.join(", ")})`;
    })
    .join(",\n");
}

function candidateStatus(anchorKind) {
  return READY_ANCHOR_KINDS.has(anchorKind) ? "ready" : "needs_filter";
}

function caveatCodes(anchorKind) {
  if (READY_ANCHOR_KINDS.has(anchorKind)) return [];
  return [`${anchorKind || "anchor"}_requires_local_filter`];
}

function buildExpansionSql({
  taxonFile,
  vernacularFile,
  taxonInfo,
  vernacularInfo,
  anchorRows,
  workDir,
  args
}) {
  const candidatesCsv = path.join(workDir, "generated_playable_taxa.csv");
  const profileStatsCsv = path.join(workDir, "generated_playable_taxa_profile_stats.csv");
  const maxDepth = Number.parseInt(args["max-depth"] || "16", 10);
  const limit = Number.parseInt(args.limit || "0", 10);
  const threads = Number.parseInt(args.threads || process.env.DUCKDB_THREADS || "4", 10);
  const taxonSelect = taxonInfo.selectSql;
  const values = anchorValuesSql(anchorRows);
  const limitSql = Number.isFinite(limit) && limit > 0 ? `LIMIT ${limit}` : "";
  const commonNamesEnabled = Boolean(vernacularFile && vernacularInfo && !args["no-common-names"]);
  const commonNameSql = commonNamesEnabled
    ? `
CREATE OR REPLACE TEMP TABLE playable_taxon_common_names AS
WITH candidate_ids AS (
  SELECT DISTINCT accepted_taxon_key
  FROM playable_taxon_candidates
  WHERE accepted_taxon_key IS NOT NULL
    AND trim(accepted_taxon_key) <> ''
),
deduped_names AS (
  SELECT
    CAST(${sqlIdent(vernacularInfo.taxonID)} AS VARCHAR) AS accepted_taxon_key,
    trim(CAST(${sqlIdent(vernacularInfo.vernacularName)} AS VARCHAR)) AS common_name,
    CASE
      WHEN lower(CAST(${vernacularInfo.language ? sqlIdent(vernacularInfo.language) : "''"} AS VARCHAR)) IN ('eng', 'en', 'english') THEN 0
      WHEN trim(CAST(${vernacularInfo.language ? sqlIdent(vernacularInfo.language) : "''"} AS VARCHAR)) = '' THEN 1
      ELSE 2
    END AS language_sort,
    CASE
      WHEN lower(CAST(${vernacularInfo.isPreferredName ? sqlIdent(vernacularInfo.isPreferredName) : "''"} AS VARCHAR)) IN ('true', '1', 'yes') THEN 0
      ELSE 1
    END AS preferred_sort,
    row_number() OVER (
      PARTITION BY CAST(${sqlIdent(vernacularInfo.taxonID)} AS VARCHAR),
        lower(trim(CAST(${sqlIdent(vernacularInfo.vernacularName)} AS VARCHAR)))
      ORDER BY
        CASE
          WHEN lower(CAST(${vernacularInfo.language ? sqlIdent(vernacularInfo.language) : "''"} AS VARCHAR)) IN ('eng', 'en', 'english') THEN 0
          WHEN trim(CAST(${vernacularInfo.language ? sqlIdent(vernacularInfo.language) : "''"} AS VARCHAR)) = '' THEN 1
          ELSE 2
        END,
        CASE
          WHEN lower(CAST(${vernacularInfo.isPreferredName ? sqlIdent(vernacularInfo.isPreferredName) : "''"} AS VARCHAR)) IN ('true', '1', 'yes') THEN 0
          ELSE 1
        END,
        length(trim(CAST(${sqlIdent(vernacularInfo.vernacularName)} AS VARCHAR))),
        trim(CAST(${sqlIdent(vernacularInfo.vernacularName)} AS VARCHAR))
    ) AS dedupe_rank
  FROM ${duckReadCsv(vernacularFile)}
  JOIN candidate_ids
    ON CAST(${sqlIdent(vernacularInfo.taxonID)} AS VARCHAR) = candidate_ids.accepted_taxon_key
  WHERE CAST(${sqlIdent(vernacularInfo.vernacularName)} AS VARCHAR) IS NOT NULL
    AND trim(CAST(${sqlIdent(vernacularInfo.vernacularName)} AS VARCHAR)) <> ''
),
ranked_names AS (
  SELECT
    accepted_taxon_key,
    common_name,
    row_number() OVER (
      PARTITION BY accepted_taxon_key
      ORDER BY language_sort, preferred_sort, length(common_name), common_name
    ) AS name_rank
  FROM deduped_names
  WHERE dedupe_rank = 1
)
SELECT
  accepted_taxon_key,
  max(CASE WHEN name_rank = 1 THEN common_name ELSE NULL END) AS common_name,
  string_agg(common_name, ' | ' ORDER BY name_rank) FILTER (WHERE name_rank <= 5) AS common_names
FROM ranked_names
WHERE name_rank <= 5
GROUP BY accepted_taxon_key;
`
    : `
CREATE OR REPLACE TEMP TABLE playable_taxon_common_names (
  accepted_taxon_key VARCHAR,
  common_name VARCHAR,
  common_names VARCHAR
);
`;

  return {
    candidatesCsv,
    profileStatsCsv,
    sql: `
SET threads TO ${Number.isFinite(threads) && threads > 0 ? threads : 4};
SET preserve_insertion_order = false;

CREATE OR REPLACE TEMP TABLE playable_anchors (
  profile_key VARCHAR,
  profile_display_name VARCHAR,
  broad_parent_group VARCHAR,
  endpoint_rank VARCHAR,
  species_mode VARCHAR,
  beginner_playability_score VARCHAR,
  anchor_index VARCHAR,
  anchor_taxon_key VARCHAR,
  anchor_name VARCHAR,
  anchor_rank VARCHAR,
  anchor_kind VARCHAR,
  anchor_note VARCHAR
);

INSERT INTO playable_anchors VALUES
${values};

CREATE OR REPLACE TEMP TABLE taxa AS
SELECT
  ${taxonSelect}
FROM ${duckReadCsv(taxonFile)}
WHERE CAST(${sqlIdent(taxonInfo.columns.taxonID)} AS VARCHAR) IS NOT NULL
  AND trim(CAST(${sqlIdent(taxonInfo.columns.taxonID)} AS VARCHAR)) <> '';

CREATE OR REPLACE TEMP TABLE playable_taxon_candidates AS
WITH RECURSIVE descendants AS (
  SELECT
    a.profile_key,
    a.profile_display_name,
    a.broad_parent_group,
    lower(trim(a.endpoint_rank)) AS endpoint_rank,
    a.species_mode,
    a.beginner_playability_score,
    a.anchor_index,
    a.anchor_taxon_key,
    a.anchor_name,
    lower(trim(a.anchor_rank)) AS anchor_rank,
    a.anchor_kind,
    a.anchor_note,
    t.taxon_key AS descendant_taxon_key,
    0 AS depth
  FROM playable_anchors a
  JOIN taxa t
    ON t.taxon_key = a.anchor_taxon_key

  UNION ALL

  SELECT
    d.profile_key,
    d.profile_display_name,
    d.broad_parent_group,
    d.endpoint_rank,
    d.species_mode,
    d.beginner_playability_score,
    d.anchor_index,
    d.anchor_taxon_key,
    d.anchor_name,
    d.anchor_rank,
    d.anchor_kind,
    d.anchor_note,
    child.taxon_key AS descendant_taxon_key,
    d.depth + 1 AS depth
  FROM descendants d
  JOIN taxa child
    ON child.parent_taxon_key = d.descendant_taxon_key
  WHERE d.depth < ${Number.isFinite(maxDepth) && maxDepth > 0 ? maxDepth : 16}
),
ranked_candidates AS (
  SELECT
    d.profile_key,
    d.profile_display_name,
    d.broad_parent_group,
    d.endpoint_rank,
    d.species_mode,
    d.beginner_playability_score,
    d.anchor_index,
    d.anchor_taxon_key,
    d.anchor_name,
    d.anchor_rank,
    d.anchor_kind,
    d.anchor_note,
    d.depth,
    t.taxon_key,
    CASE
      WHEN trim(t.accepted_taxon_key_raw) <> '' THEN t.accepted_taxon_key_raw
      ELSE t.taxon_key
    END AS accepted_taxon_key,
    t.parent_taxon_key,
    t.scientific_name,
    t.canonical_name,
    lower(trim(t.taxon_rank)) AS rank,
    lower(trim(t.taxonomic_status)) AS taxonomic_status,
    t.kingdom,
    t.phylum,
    t.class_name,
    t.order_name,
    t.family_name,
    t.genus_name,
    row_number() OVER (
      PARTITION BY d.profile_key,
        CASE
          WHEN trim(t.accepted_taxon_key_raw) <> '' THEN t.accepted_taxon_key_raw
          ELSE t.taxon_key
        END
      ORDER BY d.depth, t.taxon_key
    ) AS candidate_rank
  FROM descendants d
  JOIN taxa t
    ON t.taxon_key = d.descendant_taxon_key
  WHERE upper(trim(t.taxon_rank)) = upper(trim(d.endpoint_rank))
    AND (
      trim(t.taxonomic_status) = ''
      OR upper(trim(t.taxonomic_status)) = 'ACCEPTED'
    )
)
SELECT *
FROM ranked_candidates
WHERE candidate_rank = 1;

${commonNameSql}

COPY (
  SELECT
    c.profile_key,
    c.profile_display_name,
    c.broad_parent_group,
    c.endpoint_rank,
    c.species_mode,
    c.beginner_playability_score,
    c.anchor_index,
    c.anchor_taxon_key,
    c.anchor_name,
    c.anchor_rank,
    c.anchor_kind,
    c.anchor_note,
    c.depth,
    c.taxon_key,
    c.accepted_taxon_key,
    c.parent_taxon_key,
    c.scientific_name,
    c.canonical_name,
    COALESCE(names.common_name, '') AS common_name,
    COALESCE(names.common_names, '') AS common_names,
    c.rank,
    c.taxonomic_status,
    c.kingdom,
    c.phylum,
    c.class_name,
    c.order_name,
    c.family_name,
    c.genus_name
  FROM playable_taxon_candidates c
  LEFT JOIN playable_taxon_common_names names
    ON names.accepted_taxon_key = c.accepted_taxon_key
  ORDER BY c.profile_key, c.canonical_name, c.taxon_key
  ${limitSql}
) TO ${sqlString(sqlPath(candidatesCsv))} (HEADER, DELIMITER ',');

COPY (
  SELECT
    profile_key,
    profile_display_name,
    endpoint_rank,
    species_mode,
    count(*) AS generated_taxon_count,
    count(DISTINCT accepted_taxon_key) AS unique_accepted_taxon_count,
    count(DISTINCT anchor_taxon_key) AS anchor_count
  FROM playable_taxon_candidates
  GROUP BY profile_key, profile_display_name, endpoint_rank, species_mode
  ORDER BY profile_key
) TO ${sqlString(sqlPath(profileStatsCsv))} (HEADER, DELIMITER ',');
`
  };
}

function runDuckDb({ duckdbExe, sqlFile, dbFile }) {
  childProcess.execFileSync(duckdbExe, [dbFile, "-f", sqlFile], {
    stdio: "inherit",
    windowsHide: true
  });
}

function rowToPlayableTaxon(row) {
  const anchorKind = row.anchor_kind || "";
  const commonNames = String(row.common_names || "")
    .split("|")
    .map((name) => name.trim())
    .filter(Boolean);
  const commonName = row.common_name || commonNames[0] || null;
  const scientificDisplayName = row.canonical_name || row.scientific_name;
  return {
    playableTaxonKey: `${row.profile_key}:${row.accepted_taxon_key || row.taxon_key}`,
    playableGroupKey: row.profile_key,
    playableGroupName: row.profile_display_name,
    broadParentGroup: row.broad_parent_group,
    endpointRank: row.endpoint_rank,
    speciesMode: row.species_mode,
    beginnerPlayabilityScore:
      row.beginner_playability_score === "" ? null : Number(row.beginner_playability_score),
    individualPlayabilityScore: null,
    playabilityScoreBasis: "inherited_playable_group",
    candidateStatus: candidateStatus(anchorKind),
    caveatCodes: caveatCodes(anchorKind),
    acceptedTaxonKey: row.accepted_taxon_key,
    taxonKey: row.taxon_key,
    parentTaxonKey: row.parent_taxon_key || null,
    rank: row.rank,
    scientificName: row.scientific_name,
    canonicalName: row.canonical_name,
    scientificDisplayName,
    commonName,
    commonNames,
    displayName: commonName || scientificDisplayName,
    taxonomicStatus: row.taxonomic_status,
    anchor: {
      taxonKey: row.anchor_taxon_key,
      name: row.anchor_name,
      rank: row.anchor_rank,
      kind: anchorKind,
      note: row.anchor_note || null,
      depth: row.depth === "" ? null : Number(row.depth)
    },
    lineage: {
      kingdom: row.kingdom || null,
      phylum: row.phylum || null,
      class: row.class_name || null,
      order: row.order_name || null,
      family: row.family_name || null,
      genus: row.genus_name || null
    }
  };
}

function buildProfileStats({ profiles, anchorRows, sqlStats, taxa, rankMode }) {
  const statsByProfile = new Map(
    sqlStats.map((row) => [
      row.profile_key,
      {
        generatedTaxonCount: Number(row.generated_taxon_count) || 0,
        uniqueAcceptedTaxonCount: Number(row.unique_accepted_taxon_count) || 0,
        anchorCount: Number(row.anchor_count) || 0
      }
    ])
  );
  const emittedByProfile = new Map();
  taxa.forEach((taxon) => {
    emittedByProfile.set(
      taxon.playableGroupKey,
      (emittedByProfile.get(taxon.playableGroupKey) || 0) + 1
    );
  });

  return profiles
    .filter((profile) => anchorRows.some((row) => row.profileKey === profile.taxonKey))
    .map((profile) => {
      const anchorKinds = Array.from(
        new Set(
          anchorRows
            .filter((row) => row.profileKey === profile.taxonKey)
            .map((row) => row.anchorKind)
        )
      );
      const needsLocalFilter = anchorKinds.some((kind) => !READY_ANCHOR_KINDS.has(kind));
      const stats = statsByProfile.get(profile.taxonKey) || {
        generatedTaxonCount: 0,
        uniqueAcceptedTaxonCount: 0,
        anchorCount: 0
      };

      return {
        playableGroupKey: profile.taxonKey,
        playableGroupName: profile.displayName,
        endpointRank: endpointRankForProfile(profile, rankMode),
        speciesMode: profile.speciesMode,
        generatedTaxonCount: stats.generatedTaxonCount,
        emittedTaxonCount: emittedByProfile.get(profile.taxonKey) || 0,
        uniqueAcceptedTaxonCount: stats.uniqueAcceptedTaxonCount,
        anchorCount: stats.anchorCount,
        anchorKinds,
        needsLocalFilter
      };
    });
}

function main() {
  const args = parseArgs(process.argv);
  const profileInput = path.resolve(args["profile-input"] || DEFAULT_PROFILE_INPUT);
  const profilePayload = readJson(profileInput);
  if (!Array.isArray(profilePayload.profiles)) {
    throw new Error(`Profile input must contain profiles[]: ${profileInput}`);
  }

  const profiles = profilePayload.profiles;
  const anchorRows = anchorRowsFromProfiles(profiles, args);
  const backboneDir = path.resolve(
    args["gbif-dir"] || process.env.GBIF_BACKBONE_DIR || DEFAULT_BACKBONE_DIR
  );
  const taxonFile = findFirstExisting(backboneDir, [
    "Taxon.tsv",
    "taxon.tsv",
    "Taxon.txt",
    "taxon.txt"
  ]);
  const vernacularFile = findFirstExisting(backboneDir, [
    "VernacularName.tsv",
    "vernacularname.tsv",
    "VernacularName.txt",
    "vernacularname.txt"
  ]);
  const duckdbExe = locateDuckDb(args);
  const rankMode = args["rank-mode"] || "beginner";
  const outDir = path.resolve(args["out-dir"] || DEFAULT_OUT_DIR);
  const version = args.version || process.env.PLAYABLE_TAXA_VERSION || DEFAULT_VERSION;
  const commonNamesEnabled = Boolean(vernacularFile && !args["no-common-names"]);

  if (!taxonFile) {
    throw new Error(`Could not find Taxon.tsv inside GBIF backbone dir: ${backboneDir}`);
  }
  if (!anchorRows.length) {
    throw new Error("No hydrated GBIF anchors found in the profile input.");
  }

  if (args["check-inputs"]) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          profileInput,
          profileCount: profiles.length,
          anchorCount: anchorRows.length,
          rankMode,
          backboneDir,
          taxonFile,
          vernacularFile,
          commonNamesEnabled,
          duckdbExe,
          outDir
        },
        null,
        2
      )
    );
    return;
  }

  const taxonHeader = readHeader(taxonFile);
  const taxonInfo = buildTaxonInfo(taxonHeader);
  const vernacularHeader = commonNamesEnabled ? readHeader(vernacularFile) : null;
  const vernacularInfo = commonNamesEnabled ? buildVernacularInfo(vernacularHeader) : null;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "gridwild-playable-taxa-gbif-"));
  const dbFile = path.join(workDir, "generate.duckdb");
  const sqlFile = path.join(workDir, "generate.sql");
  const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const expansion = buildExpansionSql({
    taxonFile,
    vernacularFile: commonNamesEnabled ? vernacularFile : null,
    taxonInfo,
    vernacularInfo,
    anchorRows,
    workDir,
    args
  });

  fs.writeFileSync(sqlFile, expansion.sql);
  runDuckDb({ duckdbExe, sqlFile, dbFile });

  const rows = readCsv(expansion.candidatesCsv);
  const taxa = rows.map(rowToPlayableTaxon);
  const sqlStats = readCsv(expansion.profileStatsCsv);
  const profileStats = buildProfileStats({ profiles, anchorRows, sqlStats, taxa, rankMode });
  const readyCount = taxa.filter((taxon) => taxon.candidateStatus === "ready").length;
  const needsFilterCount = taxa.length - readyCount;
  const commonNameCount = taxa.filter((taxon) => taxon.commonName).length;

  const catalog = {
    schema_version: "gridwild-generated-playable-taxa-v1",
    playable_taxa_version: version,
    playable_taxonomy_version:
      profilePayload.playable_taxonomy_version || profilePayload.playableTaxonomyVersion || null,
    generated_at: generatedAt,
    source: "gbif-backbone-descendant-expansion",
    rank_mode: rankMode,
    scoring_model: {
      individual_taxon_scores: false,
      inherited_group_score_field: "beginnerPlayabilityScore",
      future_inputs: [
        "local observation count",
        "occupied square count",
        "observer count",
        "seasonality",
        "validation reliability",
        "manual identifiability overrides"
      ]
    },
    canonical_backbone: {
      source: "GBIF Backbone",
      taxon_file: path.basename(taxonFile),
      vernacular_file: commonNamesEnabled ? path.basename(vernacularFile) : null
    },
    profile_source: {
      file: path.basename(profileInput),
      source: profilePayload.source || null
    },
    summary: {
      profile_count: profiles.length,
      expanded_profile_count: profileStats.length,
      anchor_count: anchorRows.length,
      taxon_count: taxa.length,
      ready_taxon_count: readyCount,
      needs_filter_taxon_count: needsFilterCount,
      common_name_count: commonNameCount,
      common_names_enabled: commonNamesEnabled,
      global_limit_applied: Number.parseInt(args.limit || "0", 10) > 0
    },
    profile_stats: profileStats,
    taxa
  };

  const manifest = {
    schema_version: "gridwild-generated-playable-taxa-manifest-v1",
    playable_taxa_version: version,
    playable_taxonomy_version: catalog.playable_taxonomy_version,
    generated_at: generatedAt,
    source: catalog.source,
    rank_mode: rankMode,
    scoring_model: catalog.scoring_model,
    canonical_backbone: catalog.canonical_backbone,
    profile_source: catalog.profile_source,
    files: {
      catalog: "generated_playable_taxa.json"
    },
    summary: catalog.summary,
    profile_stats: profileStats
  };

  writeJson(path.join(outDir, "generated_playable_taxa.json"), catalog);
  writeJson(path.join(outDir, "generated_playable_taxa_manifest.json"), manifest);

  console.log(
    JSON.stringify(
      {
        playable_taxa_version: version,
        playable_taxonomy_version: catalog.playable_taxonomy_version,
        rankMode,
        taxa: taxa.length,
        readyTaxa: readyCount,
        needsFilterTaxa: needsFilterCount,
        commonNameTaxa: commonNameCount,
        profiles: profileStats.length,
        anchors: anchorRows.length,
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
