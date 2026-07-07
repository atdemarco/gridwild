#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const DEFAULT_INPUT = path.join(
  __dirname,
  "..",
  "assets",
  "playable_taxonomy",
  "scored_playable_taxa.json"
);

const DEFAULT_THRESHOLDS = {
  min_keep_score: 70,
  min_developer_score: 58,
  min_collapse_score: 38,
  min_occurrences: 3
};

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function actionMode(taxon) {
  return taxon?.goldLakeAction?.mode || "missing";
}

function sortedEntries(record) {
  return Object.entries(record || {}).sort(([left], [right]) => left.localeCompare(right));
}

function addCount(record, key, amount = 1) {
  record[key] = (record[key] || 0) + amount;
}

function groupBucket(groups, key, name) {
  if (!groups.has(key)) {
    groups.set(key, {
      playableGroupKey: key,
      playableGroupName: name || key,
      taxonCount: 0,
      actions: {},
      ranks: {},
      speciesModes: {},
      nearCutoffs: {
        keep: 0,
        developer: 0,
        collapse: 0
      },
      nonSpeciesEndpointDemotions: 0,
      keepBeyondEndpoint: 0
    });
  }
  return groups.get(key);
}

function rankIndex(rank) {
  return ["kingdom", "phylum", "class", "order", "family", "genus", "species"].indexOf(
    String(rank || "").toLowerCase()
  );
}

function isBeyondEndpoint(taxon) {
  const rank = rankIndex(taxon.rank);
  const endpointRank = rankIndex(taxon.endpointRank);
  return rank >= 0 && endpointRank >= 0 && rank > endpointRank;
}

function isNear(score, threshold, width) {
  return Math.abs(score - threshold) <= width;
}

function sampleTaxon(taxon) {
  return {
    group: taxon.playableGroupKey,
    action: actionMode(taxon),
    rank: taxon.rank || null,
    endpointRank: taxon.endpointRank || null,
    score: toNumber(taxon.individualPlayabilityScore, null),
    name: taxon.displayName || taxon.canonicalName || taxon.scientificName || null,
    speciesMode: taxon.speciesMode || null,
    candidateStatus: taxon.candidateStatus || null,
    occurrences: toNumber(taxon.occurrenceEvidence?.occurrenceCount),
    reasons: taxon.goldLakeAction?.reasonCodes || []
  };
}

function main() {
  const args = parseArgs();
  const input = path.resolve(args.input || DEFAULT_INPUT);
  const nearWidth = toNumber(args.near, 2);
  const payload = readJson(input);
  const taxa = Array.isArray(payload.taxa) ? payload.taxa : [];
  const thresholds = {
    ...DEFAULT_THRESHOLDS,
    ...(payload.scoring_model?.storage_action_thresholds || {})
  };
  const groups = new Map();
  const totals = {
    taxonCount: taxa.length,
    actions: {},
    ranks: {},
    speciesModes: {},
    nearCutoffs: {
      keep: 0,
      developer: 0,
      collapse: 0
    },
    nonSpeciesEndpointDemotions: 0,
    keepBeyondEndpoint: 0
  };
  const samples = {
    nonSpeciesEndpointDemotions: [],
    keepNearCutoff: [],
    developerNearCutoff: [],
    collapseNearCutoff: [],
    keepBeyondEndpoint: []
  };

  for (const taxon of taxa) {
    const group = groupBucket(groups, taxon.playableGroupKey || "unknown", taxon.playableGroupName);
    const mode = actionMode(taxon);
    const rank = taxon.rank || "unknown";
    const speciesMode = taxon.speciesMode || "unknown";
    const score = toNumber(taxon.individualPlayabilityScore, Number.NaN);
    const occurrences = toNumber(taxon.occurrenceEvidence?.occurrenceCount);

    group.taxonCount += 1;
    addCount(group.actions, mode);
    addCount(group.ranks, rank);
    addCount(group.speciesModes, speciesMode);
    addCount(totals.actions, mode);
    addCount(totals.ranks, rank);
    addCount(totals.speciesModes, speciesMode);

    const demotedBySpeciesMode =
      mode === "developer_only" &&
      rank !== "species" &&
      ["discouraged", "hidden"].includes(speciesMode) &&
      score >= thresholds.min_keep_score &&
      occurrences >= thresholds.min_occurrences &&
      taxon.candidateStatus !== "needs_filter";
    if (demotedBySpeciesMode) {
      group.nonSpeciesEndpointDemotions += 1;
      totals.nonSpeciesEndpointDemotions += 1;
      if (samples.nonSpeciesEndpointDemotions.length < 25) {
        samples.nonSpeciesEndpointDemotions.push(sampleTaxon(taxon));
      }
    }

    if (mode === "keep" && isBeyondEndpoint(taxon)) {
      group.keepBeyondEndpoint += 1;
      totals.keepBeyondEndpoint += 1;
      if (samples.keepBeyondEndpoint.length < 25) {
        samples.keepBeyondEndpoint.push(sampleTaxon(taxon));
      }
    }

    if (!Number.isFinite(score)) continue;
    if (isNear(score, thresholds.min_keep_score, nearWidth)) {
      group.nearCutoffs.keep += 1;
      totals.nearCutoffs.keep += 1;
      if (samples.keepNearCutoff.length < 25) samples.keepNearCutoff.push(sampleTaxon(taxon));
    }
    if (isNear(score, thresholds.min_developer_score, nearWidth)) {
      group.nearCutoffs.developer += 1;
      totals.nearCutoffs.developer += 1;
      if (samples.developerNearCutoff.length < 25) {
        samples.developerNearCutoff.push(sampleTaxon(taxon));
      }
    }
    if (isNear(score, thresholds.min_collapse_score, nearWidth)) {
      group.nearCutoffs.collapse += 1;
      totals.nearCutoffs.collapse += 1;
      if (samples.collapseNearCutoff.length < 25) {
        samples.collapseNearCutoff.push(sampleTaxon(taxon));
      }
    }
  }

  const groupRows = Array.from(groups.values())
    .sort((left, right) => left.playableGroupKey.localeCompare(right.playableGroupKey))
    .map((group) => ({
      group: group.playableGroupKey,
      taxa: group.taxonCount,
      keep: group.actions.keep || 0,
      developer: group.actions.developer_only || 0,
      collapse: group.actions.collapse || 0,
      drop: group.actions.drop || 0,
      nonSpeciesEndpointDemotions: group.nonSpeciesEndpointDemotions,
      keepNearCutoff: group.nearCutoffs.keep,
      developerNearCutoff: group.nearCutoffs.developer,
      collapseNearCutoff: group.nearCutoffs.collapse
    }));

  const report = {
    input,
    scoringModel: payload.scoring_model?.name || null,
    scoreVersion: payload.playable_taxa_score_version || null,
    thresholds,
    nearWidth,
    totals,
    actionCounts: Object.fromEntries(sortedEntries(totals.actions)),
    rankCounts: Object.fromEntries(sortedEntries(totals.ranks)),
    speciesModeCounts: Object.fromEntries(sortedEntries(totals.speciesModes)),
    groups: groupRows,
    samples
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(
    JSON.stringify(
      {
        input,
        scoringModel: report.scoringModel,
        scoreVersion: report.scoreVersion,
        thresholds,
        nearWidth,
        totals: report.totals,
        actionCounts: report.actionCounts
      },
      null,
      2
    )
  );
  console.table(groupRows);
  if (samples.nonSpeciesEndpointDemotions.length) {
    console.log("Non-species endpoint demotion samples:");
    console.table(samples.nonSpeciesEndpointDemotions);
  }
}

try {
  main();
} catch (err) {
  console.error(err.stack || err.message);
  process.exit(1);
}
