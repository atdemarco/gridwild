const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const PLAYABLE_TAXONOMY_VERSION = "playable-taxonomy-seed-v001";

function loadApi() {
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

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

const api = loadApi();
if (!api) {
  throw new Error("GridWildPlayableTaxonomy API did not load.");
}

const errors = api.validateSeedProfiles();
if (errors.length) {
  throw new Error(`Playable taxonomy seed profiles are invalid:\n${errors.join("\n")}`);
}

const outDir = path.join(__dirname, "..", "assets", "playable_taxonomy");
const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const profiles = api.getProfiles();

const profilePayload = {
  schema_version: "gridwild-playable-taxonomy-profiles-v1",
  playable_taxonomy_version: PLAYABLE_TAXONOMY_VERSION,
  generated_at: generatedAt,
  source: "curated-seed-export",
  score_weights: api.scoreWeights,
  profiles
};

const rollupRules = {
  schema_version: "gridwild-playable-taxonomy-rollup-rules-v1",
  playable_taxonomy_version: PLAYABLE_TAXONOMY_VERSION,
  generated_at: generatedAt,
  source: "curated-seed-export",
  rules: profiles.map((profile) => ({
    playable_group_key: profile.taxonKey,
    match_terms: unique([profile.taxonKey, profile.displayName, ...(profile.aliases || [])]),
    endpoint_rank: profile.beginnerEndpointRank,
    served_rank: profile.beginnerEndpointRank,
    species_mode: profile.speciesMode,
    prune_mode: "keep",
    source: profile.source,
    reason: "Seed rule exported from GridWild curated playable taxonomy."
  }))
};

const manifest = {
  schema_version: "gridwild-playable-taxonomy-manifest-v1",
  playable_taxonomy_version: PLAYABLE_TAXONOMY_VERSION,
  generated_at: generatedAt,
  source: "curated-seed-export",
  canonical_backbone: null,
  local_evidence_build_id: null,
  profile_count: profiles.length,
  files: {
    profiles: "playable_taxon_profiles.json",
    rollup_rules: "playable_taxon_rollup_rules.json"
  },
  score_weights: api.scoreWeights,
  validation: {
    profile_errors: errors
  }
};

writeJson(path.join(outDir, "playable_taxonomy_manifest.json"), manifest);
writeJson(path.join(outDir, "playable_taxon_profiles.json"), profilePayload);
writeJson(path.join(outDir, "playable_taxon_rollup_rules.json"), rollupRules);

console.log(
  JSON.stringify(
    {
      playable_taxonomy_version: PLAYABLE_TAXONOMY_VERSION,
      outDir,
      profiles: profiles.length,
      rollupRules: rollupRules.rules.length
    },
    null,
    2
  )
);
