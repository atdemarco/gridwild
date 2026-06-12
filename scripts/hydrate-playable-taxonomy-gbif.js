const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const DEFAULT_PLAYABLE_TAXONOMY_VERSION = "playable-taxonomy-gbif-v001";
const DEFAULT_BACKBONE_DIR = "C:\\Users\\ad1470\\Downloads\\backbone";
const DEFAULT_DUCKDB_EXE = "C:\\Users\\ad1470\\Desktop\\gridwild\\world\\duckdb.exe";
const DEFAULT_OUT_DIR = path.join(__dirname, "..", "assets", "playable_taxonomy");

const DEFAULT_ANCHORS = {
  birds: [{ name: "Aves", rank: "CLASS", kind: "canonical_clade" }],
  mammals: [{ name: "Mammalia", rank: "CLASS", kind: "canonical_clade" }],
  "reptiles-amphibians": [
    { name: "Reptilia", rank: "CLASS", kind: "multi_clade" },
    { name: "Amphibia", rank: "CLASS", kind: "multi_clade" }
  ],
  odonata: [{ name: "Odonata", rank: "ORDER", kind: "canonical_clade" }],
  butterflies: [
    {
      name: "Lepidoptera",
      rank: "ORDER",
      kind: "broad_clade",
      note: "Butterflies are a beginner-playable subset inside Lepidoptera."
    }
  ],
  moths: [
    {
      name: "Lepidoptera",
      rank: "ORDER",
      kind: "broad_clade",
      note: "Moths are a beginner-playable subset inside Lepidoptera."
    }
  ],
  beetles: [{ name: "Coleoptera", rank: "ORDER", kind: "canonical_clade" }],
  flies: [{ name: "Diptera", rank: "ORDER", kind: "canonical_clade" }],
  hymenoptera: [{ name: "Hymenoptera", rank: "ORDER", kind: "canonical_clade" }],
  spiders: [{ name: "Araneae", rank: "ORDER", kind: "canonical_clade" }],
  trees: [
    {
      name: "Plantae",
      rank: "KINGDOM",
      kind: "ecological_group",
      note: "Trees are a growth-form play group, not one GBIF clade."
    }
  ],
  wildflowers: [
    {
      name: "Magnoliopsida",
      rank: "CLASS",
      kind: "ecological_group",
      note: "Wildflowers are a field/play group inside flowering plants."
    },
    {
      name: "Liliopsida",
      rank: "CLASS",
      kind: "ecological_group",
      note: "Wildflowers are a field/play group inside flowering plants."
    }
  ],
  "grasses-sedges-rushes": [
    { name: "Poaceae", rank: "FAMILY", kind: "multi_family" },
    { name: "Cyperaceae", rank: "FAMILY", kind: "multi_family" },
    { name: "Juncaceae", rank: "FAMILY", kind: "multi_family" }
  ],
  ferns: [
    { name: "Polypodiopsida", rank: "CLASS", kind: "canonical_clade" },
    {
      name: "Polypodiophyta",
      rank: "PHYLUM",
      kind: "fallback_clade",
      note: "Fallback anchor if GBIF backbone ranks ferns by phylum."
    }
  ],
  fungi: [{ name: "Fungi", rank: "KINGDOM", kind: "canonical_clade" }],
  lichens: [
    {
      name: "Fungi",
      rank: "KINGDOM",
      kind: "functional_group",
      note: "Lichens are a functional play group mostly inside Fungi."
    }
  ],
  "mosses-liverworts": [
    { name: "Bryophyta", rank: "PHYLUM", kind: "multi_clade" },
    { name: "Marchantiophyta", rank: "PHYLUM", kind: "multi_clade" }
  ],
  "snails-slugs": [{ name: "Gastropoda", rank: "CLASS", kind: "canonical_clade" }]
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

function findFirstExisting(dir, names) {
  for (const name of names) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) return file;
  }
  return null;
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

function unique(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function loadPlayableTaxonomyApi() {
  const filename = path.join(__dirname, "..", "js", "gw-playable-taxonomy.js");
  const code = fs.readFileSync(filename, "utf8");
  const context = {
    console,
    window: {}
  };
  vm.createContext(context);
  vm.runInContext(code, context, { filename });
  return context.window.GridWildPlayableTaxonomy;
}

function loadProfileInput(args) {
  const profileInput = args["profile-input"] || process.env.PLAYABLE_TAXONOMY_PROFILE_INPUT;
  if (profileInput) {
    const payload = readJson(path.resolve(profileInput));
    if (!Array.isArray(payload?.profiles)) {
      throw new Error(`Profile input must contain a profiles array: ${profileInput}`);
    }
    return {
      profiles: payload.profiles,
      source: {
        type: "json",
        file: path.basename(profileInput),
        version: payload.playable_taxonomy_version || null
      }
    };
  }

  return {
    profiles: loadPlayableTaxonomyApi().getProfiles(),
    source: {
      type: "browser-seed-module",
      file: "js/gw-playable-taxonomy.js",
      version: "curated-seed"
    }
  };
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

function buildAnchorRows(profiles) {
  const rows = [];
  for (const profile of profiles) {
    const anchors = DEFAULT_ANCHORS[profile.taxonKey] || [];
    anchors.forEach((anchor, index) => {
      rows.push({
        profileKey: profile.taxonKey,
        queryName: anchor.name,
        queryRank: anchor.rank || "",
        anchorKind: anchor.kind || "canonical_clade",
        anchorIndex: index,
        note: anchor.note || ""
      });
    });
  }
  return rows;
}

function valuesSql(rows) {
  if (!rows.length) return "";
  return rows
    .map(
      (row) =>
        `(${[
          sqlString(row.profileKey),
          sqlString(row.queryName),
          sqlString(row.queryRank),
          sqlString(row.anchorKind),
          Number(row.anchorIndex) || 0,
          sqlString(row.note)
        ].join(", ")})`
    )
    .join(",\n");
}

function runDuckDb({ duckdbExe, sqlFile, dbFile }) {
  childProcess.execFileSync(duckdbExe, [dbFile, "-f", sqlFile], {
    stdio: "inherit",
    windowsHide: true
  });
}

function buildTaxonSelect(header) {
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
      colExpr(columns.taxonID, "taxon_id"),
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

function buildVernacularSelect(header) {
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

function buildHydrationSql({
  taxonFile,
  vernacularFile,
  taxonInfo,
  vernacularColumns,
  anchorRows,
  workDir
}) {
  const anchorsCsv = path.join(workDir, "gbif_anchors.csv");
  const vernacularCsv = path.join(workDir, "gbif_vernaculars.csv");
  const values = valuesSql(anchorRows);
  const taxonSelect = taxonInfo.selectSql;
  const taxonColumns = taxonInfo.columns;
  const vernacularSql =
    vernacularFile && vernacularColumns
      ? `
COPY (
  SELECT
    CAST(${sqlIdent(vernacularColumns.taxonID)} AS VARCHAR) AS accepted_taxon_key,
    CAST(${sqlIdent(vernacularColumns.vernacularName)} AS VARCHAR) AS vernacular_name,
    ${vernacularColumns.language ? `CAST(${sqlIdent(vernacularColumns.language)} AS VARCHAR)` : "''"} AS language,
    ${
      vernacularColumns.isPreferredName
        ? `CAST(${sqlIdent(vernacularColumns.isPreferredName)} AS VARCHAR)`
        : "''"
    } AS is_preferred
  FROM ${duckReadCsv(vernacularFile)}
  WHERE CAST(${sqlIdent(vernacularColumns.taxonID)} AS VARCHAR) IN (
    SELECT accepted_taxon_key FROM accepted_ids
  )
    AND CAST(${sqlIdent(vernacularColumns.vernacularName)} AS VARCHAR) IS NOT NULL
    AND trim(CAST(${sqlIdent(vernacularColumns.vernacularName)} AS VARCHAR)) <> ''
  QUALIFY row_number() OVER (
    PARTITION BY CAST(${sqlIdent(vernacularColumns.taxonID)} AS VARCHAR),
      lower(trim(CAST(${sqlIdent(vernacularColumns.vernacularName)} AS VARCHAR)))
    ORDER BY
      CASE
        WHEN lower(CAST(${vernacularColumns.language ? sqlIdent(vernacularColumns.language) : "''"} AS VARCHAR)) IN ('eng', 'en', 'english') THEN 0
        WHEN trim(CAST(${vernacularColumns.language ? sqlIdent(vernacularColumns.language) : "''"} AS VARCHAR)) = '' THEN 1
        ELSE 2
      END,
      CASE
        WHEN lower(CAST(${vernacularColumns.isPreferredName ? sqlIdent(vernacularColumns.isPreferredName) : "''"} AS VARCHAR)) IN ('true', '1', 'yes') THEN 0
        ELSE 1
      END
  ) = 1
  ORDER BY accepted_taxon_key, language, is_preferred DESC, vernacular_name
) TO ${sqlString(sqlPath(vernacularCsv))} (HEADER, DELIMITER ',');
`
      : "";

  return {
    anchorsCsv,
    vernacularCsv,
    sql: `
SET threads TO 4;
SET preserve_insertion_order = false;

CREATE OR REPLACE TEMP TABLE anchor_terms (
  profile_key VARCHAR,
  query_name VARCHAR,
  query_rank VARCHAR,
  anchor_kind VARCHAR,
  anchor_index INTEGER,
  note VARCHAR
);

INSERT INTO anchor_terms VALUES
${values};

CREATE OR REPLACE TEMP TABLE matched_taxa AS
WITH taxa AS (
  SELECT
    ${taxonSelect}
  FROM ${duckReadCsv(taxonFile)}
  WHERE lower(trim(CAST(${sqlIdent(taxonColumns.canonicalName)} AS VARCHAR))) IN (
    SELECT lower(trim(query_name)) FROM anchor_terms
  )
    OR lower(trim(CAST(${sqlIdent(taxonColumns.scientificName)} AS VARCHAR))) IN (
      SELECT lower(trim(query_name)) FROM anchor_terms
    )
),
matches AS (
  SELECT
    a.*,
    t.*,
    row_number() OVER (
      PARTITION BY a.profile_key, a.query_name, a.query_rank, a.anchor_kind, a.anchor_index
      ORDER BY
        CASE WHEN upper(trim(t.taxon_rank)) = upper(trim(a.query_rank)) THEN 0 ELSE 1 END,
        CASE
          WHEN upper(trim(t.taxonomic_status)) = 'ACCEPTED' THEN 0
          WHEN trim(t.accepted_taxon_key_raw) <> '' THEN 1
          ELSE 2
        END,
        length(t.scientific_name)
    ) AS match_rank
  FROM anchor_terms a
  JOIN taxa t
    ON lower(trim(t.canonical_name)) = lower(trim(a.query_name))
      OR lower(trim(t.scientific_name)) = lower(trim(a.query_name))
)
SELECT *
FROM matches
WHERE match_rank = 1;

CREATE OR REPLACE TEMP TABLE accepted_ids AS
SELECT DISTINCT
  CASE
    WHEN trim(accepted_taxon_key_raw) <> '' THEN accepted_taxon_key_raw
    ELSE taxon_id
  END AS accepted_taxon_key
FROM matched_taxa
WHERE taxon_id IS NOT NULL AND trim(taxon_id) <> '';

CREATE OR REPLACE TEMP TABLE accepted_taxa AS
SELECT
  ${taxonSelect}
FROM ${duckReadCsv(taxonFile)}
WHERE CAST(${sqlIdent(taxonColumns.taxonID)} AS VARCHAR) IN (SELECT accepted_taxon_key FROM accepted_ids);

COPY (
  SELECT
    m.profile_key,
    m.query_name,
    m.query_rank,
    m.anchor_kind,
    m.anchor_index,
    m.note,
    m.taxon_id AS matched_taxon_key,
    m.scientific_name AS matched_scientific_name,
    m.canonical_name AS matched_canonical_name,
    m.taxon_rank AS matched_rank,
    m.taxonomic_status AS matched_status,
    CASE
      WHEN trim(m.accepted_taxon_key_raw) <> '' THEN m.accepted_taxon_key_raw
      ELSE m.taxon_id
    END AS accepted_taxon_key,
    COALESCE(a.scientific_name, m.scientific_name) AS scientific_name,
    COALESCE(a.canonical_name, m.canonical_name) AS canonical_name,
    COALESCE(a.taxon_rank, m.taxon_rank) AS rank,
    COALESCE(a.taxonomic_status, m.taxonomic_status) AS taxonomic_status,
    COALESCE(a.parent_taxon_key, m.parent_taxon_key) AS parent_taxon_key,
    COALESCE(a.kingdom, m.kingdom) AS kingdom,
    COALESCE(a.phylum, m.phylum) AS phylum,
    COALESCE(a.class_name, m.class_name) AS class_name,
    COALESCE(a.order_name, m.order_name) AS order_name,
    COALESCE(a.family_name, m.family_name) AS family_name,
    COALESCE(a.genus_name, m.genus_name) AS genus_name
  FROM matched_taxa m
  LEFT JOIN accepted_taxa a
    ON a.taxon_id = CASE
      WHEN trim(m.accepted_taxon_key_raw) <> '' THEN m.accepted_taxon_key_raw
      ELSE m.taxon_id
    END
  ORDER BY m.profile_key, m.anchor_index
) TO ${sqlString(sqlPath(anchorsCsv))} (HEADER, DELIMITER ',');

${vernacularSql}
`
  };
}

function anchorLineage(anchor) {
  return unique([
    anchor.kingdom,
    anchor.phylum,
    anchor.class_name,
    anchor.order_name,
    anchor.family_name,
    anchor.genus_name,
    anchor.canonical_name
  ]);
}

function statusForProfile(expectedCount, anchors) {
  if (!expectedCount) return "manual";
  if (anchors.length === 0) return "unmatched";
  return anchors.length >= expectedCount ? "matched" : "partial";
}

function hydrateProfiles({ profiles, anchorRows, anchors, vernaculars, version, generatedAt }) {
  const anchorsByProfile = new Map();
  anchors.forEach((anchor) => {
    if (!anchorsByProfile.has(anchor.profile_key)) anchorsByProfile.set(anchor.profile_key, []);
    anchorsByProfile.get(anchor.profile_key).push(anchor);
  });

  const vernacularByTaxon = new Map();
  vernaculars.forEach((row) => {
    if (!vernacularByTaxon.has(row.accepted_taxon_key)) {
      vernacularByTaxon.set(row.accepted_taxon_key, []);
    }
    vernacularByTaxon.get(row.accepted_taxon_key).push(row.vernacular_name);
  });

  const expectedByProfile = new Map();
  anchorRows.forEach((row) => {
    expectedByProfile.set(row.profileKey, (expectedByProfile.get(row.profileKey) || 0) + 1);
  });

  return profiles.map((profile) => {
    const profileAnchors = (anchorsByProfile.get(profile.taxonKey) || []).map((anchor) => ({
      queryName: anchor.query_name,
      queryRank: anchor.query_rank,
      anchorKind: anchor.anchor_kind,
      note: anchor.note || "",
      matchedTaxonKey: anchor.matched_taxon_key,
      matchedScientificName: anchor.matched_scientific_name,
      matchedCanonicalName: anchor.matched_canonical_name,
      matchedRank: String(anchor.matched_rank || "").toLowerCase(),
      matchedStatus: String(anchor.matched_status || "").toLowerCase(),
      acceptedTaxonKey: anchor.accepted_taxon_key,
      scientificName: anchor.scientific_name,
      canonicalName: anchor.canonical_name,
      rank: String(anchor.rank || "").toLowerCase(),
      taxonomicStatus: String(anchor.taxonomic_status || "").toLowerCase(),
      parentTaxonKey: anchor.parent_taxon_key || null,
      lineage: anchorLineage(anchor)
    }));

    const profileVernaculars = unique(
      profileAnchors.flatMap((anchor) => vernacularByTaxon.get(anchor.acceptedTaxonKey) || [])
    ).slice(0, 40);
    const anchorAliases = profileAnchors.flatMap((anchor) => [
      anchor.canonicalName,
      anchor.scientificName,
      anchor.queryName,
      ...anchor.lineage
    ]);

    return {
      ...profile,
      aliases: unique([...(profile.aliases || []), ...anchorAliases, ...profileVernaculars]).slice(
        0,
        96
      ),
      source: profile.source === "curated" ? "mixed" : profile.source,
      gbif: {
        hydrationStatus: statusForProfile(
          expectedByProfile.get(profile.taxonKey) || 0,
          profileAnchors
        ),
        playableTaxonomyVersion: version,
        hydratedAt: generatedAt,
        canonicalBackbone: "GBIF Backbone",
        acceptedTaxonKeys: unique(profileAnchors.map((anchor) => anchor.acceptedTaxonKey)),
        anchors: profileAnchors,
        vernacularAliases: profileVernaculars
      }
    };
  });
}

function buildRollupRules({ profiles, version, generatedAt }) {
  const rules = [];
  for (const profile of profiles) {
    const anchors = profile.gbif?.anchors || [];
    if (!anchors.length) {
      rules.push({
        playable_group_key: profile.taxonKey,
        match_terms: unique([profile.taxonKey, profile.displayName, ...(profile.aliases || [])]),
        match_rank: null,
        match_taxon_key: null,
        accepted_taxon_key: null,
        endpoint_rank: profile.beginnerEndpointRank,
        served_rank: profile.beginnerEndpointRank,
        served_display_name: profile.displayName,
        species_mode: profile.speciesMode,
        prune_mode: "keep",
        source: profile.source,
        reason: "Manual playable group; no GBIF anchor matched."
      });
      continue;
    }

    for (const anchor of anchors) {
      rules.push({
        playable_group_key: profile.taxonKey,
        match_terms: unique([
          profile.taxonKey,
          profile.displayName,
          anchor.queryName,
          anchor.canonicalName,
          anchor.scientificName,
          ...(profile.aliases || [])
        ]),
        match_rank: anchor.rank,
        match_taxon_key: anchor.acceptedTaxonKey,
        accepted_taxon_key: anchor.acceptedTaxonKey,
        endpoint_rank: profile.beginnerEndpointRank,
        served_rank: profile.beginnerEndpointRank,
        served_display_name: profile.displayName,
        species_mode: profile.speciesMode,
        prune_mode: "keep",
        source: profile.source,
        gbif_anchor_kind: anchor.anchorKind,
        reason: anchor.note || "GBIF Backbone anchor joined to GridWild playable profile."
      });
    }
  }

  return {
    schema_version: "gridwild-playable-taxonomy-rollup-rules-v1",
    playable_taxonomy_version: version,
    generated_at: generatedAt,
    source: "gbif-backbone-hydrated",
    rules
  };
}

function main() {
  const args = parseArgs(process.argv);
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

  if (!taxonFile) {
    throw new Error(`Could not find Taxon.tsv inside GBIF backbone dir: ${backboneDir}`);
  }

  if (args["check-inputs"]) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          backboneDir,
          taxonFile,
          vernacularFile,
          duckdbExe
        },
        null,
        2
      )
    );
    return;
  }

  const profileInput = loadProfileInput(args);
  const profiles = profileInput.profiles;
  const anchorRows = buildAnchorRows(profiles);
  if (!anchorRows.length) throw new Error("No playable taxonomy anchor rows were configured.");

  const taxonHeader = readHeader(taxonFile);
  const vernacularHeader = vernacularFile ? readHeader(vernacularFile) : null;
  const taxonInfo = buildTaxonSelect(taxonHeader);
  const vernacularColumns = vernacularHeader ? buildVernacularSelect(vernacularHeader) : null;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "gridwild-playable-taxonomy-gbif-"));
  const dbFile = path.join(workDir, "hydrate.duckdb");
  const sqlFile = path.join(workDir, "hydrate.sql");
  const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const version =
    args.version || process.env.PLAYABLE_TAXONOMY_VERSION || DEFAULT_PLAYABLE_TAXONOMY_VERSION;
  const outDir = path.resolve(
    args["out-dir"] || process.env.PLAYABLE_TAXONOMY_OUT_DIR || DEFAULT_OUT_DIR
  );

  const hydrationSql = buildHydrationSql({
    taxonFile,
    vernacularFile,
    taxonInfo,
    vernacularColumns,
    anchorRows,
    workDir
  });
  fs.writeFileSync(sqlFile, hydrationSql.sql);

  runDuckDb({ duckdbExe, sqlFile, dbFile });

  const anchors = readCsv(hydrationSql.anchorsCsv);
  const vernaculars = readCsv(hydrationSql.vernacularCsv);
  const hydratedProfiles = hydrateProfiles({
    profiles,
    anchorRows,
    anchors,
    vernaculars,
    version,
    generatedAt
  });
  const api = loadPlayableTaxonomyApi();
  const profileErrors = api.validateSeedProfiles(hydratedProfiles);
  if (profileErrors.length) {
    throw new Error(`Hydrated playable profiles failed validation:\n${profileErrors.join("\n")}`);
  }

  const rollupRules = buildRollupRules({
    profiles: hydratedProfiles,
    version,
    generatedAt
  });

  const unmatchedProfiles = hydratedProfiles
    .filter((profile) => profile.gbif?.hydrationStatus === "unmatched")
    .map((profile) => profile.taxonKey);
  const partialProfiles = hydratedProfiles
    .filter((profile) => profile.gbif?.hydrationStatus === "partial")
    .map((profile) => profile.taxonKey);

  const profilePayload = {
    schema_version: "gridwild-playable-taxonomy-profiles-v1",
    playable_taxonomy_version: version,
    generated_at: generatedAt,
    source: "gbif-backbone-hydrated",
    canonical_backbone: {
      source: "GBIF Backbone",
      taxon_file: path.basename(taxonFile),
      vernacular_file: vernacularFile ? path.basename(vernacularFile) : null
    },
    curated_profile_source: profileInput.source,
    score_weights: api.scoreWeights,
    profiles: hydratedProfiles
  };

  const manifest = {
    schema_version: "gridwild-playable-taxonomy-manifest-v1",
    playable_taxonomy_version: version,
    generated_at: generatedAt,
    source: "gbif-backbone-hydrated",
    canonical_backbone: profilePayload.canonical_backbone,
    curated_profile_source: profileInput.source,
    local_evidence_build_id: null,
    profile_count: hydratedProfiles.length,
    files: {
      profiles: "playable_taxon_profiles.json",
      rollup_rules: "playable_taxon_rollup_rules.json",
      validation_report: "validation_report.json"
    },
    score_weights: api.scoreWeights,
    validation: {
      profile_errors: profileErrors,
      matched_anchor_count: anchors.length,
      vernacular_alias_count: vernaculars.length,
      unmatched_profiles: unmatchedProfiles,
      partial_profiles: partialProfiles
    }
  };

  const validation = {
    schema_version: "gridwild-playable-taxonomy-validation-v1",
    playable_taxonomy_version: version,
    generated_at: generatedAt,
    canonical_backbone: profilePayload.canonical_backbone,
    curated_profile_source: profileInput.source,
    profile_count: hydratedProfiles.length,
    configured_anchor_count: anchorRows.length,
    matched_anchor_count: anchors.length,
    rollup_rule_count: rollupRules.rules.length,
    vernacular_alias_count: vernaculars.length,
    unmatched_profiles: unmatchedProfiles,
    partial_profiles: partialProfiles,
    profile_errors: profileErrors
  };

  writeJson(path.join(outDir, "playable_taxonomy_manifest.json"), manifest);
  writeJson(path.join(outDir, "playable_taxon_profiles.json"), profilePayload);
  writeJson(path.join(outDir, "playable_taxon_rollup_rules.json"), rollupRules);
  writeJson(path.join(outDir, "validation_report.json"), validation);

  console.log(
    JSON.stringify(
      {
        playable_taxonomy_version: version,
        profiles: hydratedProfiles.length,
        configuredAnchors: anchorRows.length,
        matchedAnchors: anchors.length,
        rollupRules: rollupRules.rules.length,
        unmatchedProfiles,
        partialProfiles,
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
