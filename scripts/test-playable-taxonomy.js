const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

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

const api = loadPlayableTaxonomyApi();

assert.ok(api, "GridWildPlayableTaxonomy API should load");

assert.equal(
  api.computeBeginnerPlayabilityScore({
    identifiability: 100,
    observability: 50,
    localDataSupport: 50,
    validationReliability: 50,
    distinctiveness: 0
  }),
  57.5,
  "weighted score should apply the transparent MVP weights"
);

assert.equal(
  api.computeBeginnerPlayabilityScore({
    identifiability: 200,
    observability: 200,
    localDataSupport: 200,
    validationReliability: 200,
    distinctiveness: 200
  }),
  100,
  "weighted score should clamp score components to 100"
);

assert.equal(api.compareRanks("family", "genus"), -1, "family should be broader than genus");
assert.equal(api.compareRanks("species", "genus"), 1, "species should be more specific than genus");
assert.equal(api.compareRanks("species", "species"), 0, "matching ranks should compare equally");
assert.equal(
  api.compareRanks("not-a-rank", "genus"),
  null,
  "invalid rank comparisons should return null"
);
assert.equal(
  api.isRankAtLeastAsSpecific("species", "genus"),
  true,
  "species should satisfy a genus minimum confidence rank"
);
assert.equal(
  api.isRankAtLeastAsSpecific("order", "family"),
  false,
  "order should not satisfy a family minimum confidence rank"
);

const birds = api.getEndpointForTaxonGroup("Aves");
assert.equal(birds.taxonKey, "birds", "Aves should resolve to the seeded birds profile");
assert.equal(birds.beginnerEndpointRank, "species");
assert.equal(birds.speciesMode, "required");
assert.match(api.getQuestLanguageForEndpoint(birds), /species/i);

const beetles = api.getEndpointForTaxonGroup({ orderName: "Coleoptera" });
assert.equal(beetles.taxonKey, "beetles", "Coleoptera should resolve by alias");
assert.equal(beetles.beginnerEndpointRank, "family");

const fallback = api.getEndpointForTaxonGroup("Orb-weaving mystery group");
assert.equal(fallback.isFallback, true, "unknown groups should return a graceful fallback profile");
assert.equal(fallback.source, "placeholder");
assert.equal(fallback.beginnerEndpointRank, "family");
assert.match(api.getQuestLanguageForEndpoint(fallback), /family|genus|field group/i);

const broadParentOnly = api.getEndpointForTaxonGroup({ parentGroup: "Insects" });
assert.equal(
  broadParentOnly.isFallback,
  true,
  "broad parent groups should not silently resolve to the first seeded child profile"
);

assert.equal(api.profiles.length, 18, "the MVP should seed the requested 18 taxon groups");
assert.equal(api.validateSeedProfiles().length, 0, "seed profiles should be valid");

for (const profile of api.profiles) {
  assert.equal(
    profile.beginnerPlayabilityScore,
    api.computeBeginnerPlayabilityScore(profile.metrics),
    `${profile.taxonKey} should expose a computed beginner playability score`
  );
  assert.ok(profile.rationale.trim(), `${profile.taxonKey} should have rationale copy`);
  assert.ok(profile.beginnerQuestLanguage.trim(), `${profile.taxonKey} should have quest copy`);
}

console.log("Playable taxonomy tests passed.");
