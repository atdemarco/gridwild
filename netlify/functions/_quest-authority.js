const crypto = require("crypto");
const { httpError } = require("./_gridwild-player-session");
const { calculateQuestReward } = require("./_quest-reward");
const {
  observationCoordinates,
  observationDate
} = require("./_inat-authority");

const GRID_SIZE_M = 6.096;
const EARTH_RADIUS_M = 6378137;
const SOURCES = new Set(["manual", "today", "onboarding"]);
const RANGES = new Set(["here", "1min", "5min", "15min", "anywhere"]);
const ICONIC_TAXA = new Set(["Any", "Insecta", "Plantae", "Fungi", "Aves", "Mammalia"]);
const OBJECTIVES = new Set([
  "any_observation",
  "new_square_taxon",
  "underobserved",
  "revisit_fading",
  "identify_unknowns"
]);
const TIMEFRAMES = new Set(["now", "today", "week", "weekend", "permanent"]);
const TARGET_LOCATIONS = new Set(["specific_square", "area_3x3", "area_20x20", "anywhere"]);
const EVIDENCE_TYPES = new Set(["photo_gps20", "photo", "observation", "research_grade", "identification"]);

function cleanString(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function cleanEnum(value, allowed, fallback) {
  const clean = cleanString(value, 80);
  return allowed.has(clean) ? clean : fallback;
}

function cleanTarget(raw, targetLocation) {
  if (targetLocation === "anywhere") {
    return { mode: "anywhere", label: "Anywhere", radiusCells: null };
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const target = {
    mode: targetLocation,
    label: cleanString(raw.label || targetLocation, 120)
  };

  for (const key of ["lat", "lng", "ix", "iy", "radiusCells", "radiusMeters"]) {
    const value = Number(raw[key]);
    if (Number.isFinite(value)) target[key] = value;
  }

  if (target.radiusCells !== undefined) {
    target.radiusCells = clampInteger(target.radiusCells, 0, 20, 0);
  }
  if (target.radiusMeters !== undefined) {
    target.radiusMeters = clampInteger(target.radiusMeters, 10, 1000, 100);
  }

  return target;
}

function isIdentificationQuest(questOrRecipe) {
  const recipe = questOrRecipe?.recipe || questOrRecipe || {};
  return (
    String(questOrRecipe?.quest_type || "").toLowerCase() === "identify" ||
    recipe.objectiveType === "identify_unknowns" ||
    recipe.evidence === "identification" ||
    recipe.evidenceType === "identification"
  );
}

function normalizeQuestRecipe(rawRecipe = {}, options = {}) {
  const source = cleanEnum(options.source, SOURCES, "manual");
  if (source === "onboarding") {
    return {
      range: "anywhere",
      iconicTaxon: "Any",
      objectiveType: "any_observation",
      difficulty: 1,
      timeframe: "today",
      evidence: "photo_gps20",
      surveyId: "none",
      targetLocation: "anywhere",
      target: { mode: "anywhere", label: "Anywhere", radiusCells: null },
      quantity: 1
    };
  }

  const objectiveType = cleanEnum(rawRecipe.objectiveType, OBJECTIVES, "any_observation");
  const identification = options.questType === "identify" || objectiveType === "identify_unknowns";
  const targetLocation = cleanEnum(rawRecipe.targetLocation, TARGET_LOCATIONS, "anywhere");
  const timeframe = source === "today"
    ? "today"
    : cleanEnum(rawRecipe.timeframe, TIMEFRAMES, "today");

  return {
    range: cleanEnum(rawRecipe.range, RANGES, targetLocation === "anywhere" ? "anywhere" : "here"),
    iconicTaxon: cleanEnum(rawRecipe.iconicTaxon, ICONIC_TAXA, "Any"),
    objectiveType: identification ? "identify_unknowns" : objectiveType,
    difficulty: clampInteger(rawRecipe.difficulty, 1, 5, 1),
    timeframe,
    evidence: identification
      ? "identification"
      : cleanEnum(rawRecipe.evidence, EVIDENCE_TYPES, "photo_gps20"),
    surveyId: cleanString(rawRecipe.surveyId || "none", 120) || "none",
    targetLocation,
    target: cleanTarget(rawRecipe.target, targetLocation),
    quantity: clampInteger(rawRecipe.quantity || rawRecipe.targetCount, 1, 5, 1)
  };
}

function questIssuanceKey(source, questType, recipe, nicheId = null) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({
      source,
      quest_type: questType,
      recipe,
      niche_id: nicheId || null
    }))
    .digest("hex");
}

async function issueQuest(supabase, quest = {}) {
  const source = cleanString(quest.source, 40);
  const reward = source === "manual"
    ? 0
    : Math.max(0, Math.round(Number(quest.rewardWildpoints) || 0));

  const { data, error } = await supabase.rpc("gridwild_issue_quest", {
    p_player_id: quest.playerId,
    p_title: cleanString(quest.title, 180) || "Untitled Quest",
    p_description: cleanString(quest.description, 1200) || null,
    p_quest_type: cleanString(quest.questType, 40) || "explore",
    p_recipe: quest.recipe || {},
    p_source: source,
    p_reward_wildpoints: reward,
    p_issuance_key: quest.issuanceKey,
    p_niche_id: quest.nicheId || null
  });

  if (error) throw error;
  return data;
}

function questReward(recipe, source) {
  return source === "manual" ? 0 : calculateQuestReward(recipe, { source });
}

function assertRewardQuestOwned(quest, playerId) {
  if (
    Number(quest?.reward_wildpoints || 0) > 0 &&
    String(quest?.created_by || "") !== String(playerId || "")
  ) {
    throw httpError(403, "Reward-bearing quests can only be used by the explorer they were issued to.");
  }
}

function haversineMeters(a, b) {
  const toRadians = value => (Number(value) * Math.PI) / 180;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(value));
}

function gridCellForCoordinates(coordinates) {
  const lngRadians = (coordinates.lng * Math.PI) / 180;
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, coordinates.lat));
  const latRadians = (clampedLat * Math.PI) / 180;
  const x = EARTH_RADIUS_M * lngRadians;
  const y = EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + latRadians / 2));
  return {
    ix: Math.floor(x / GRID_SIZE_M),
    iy: Math.floor(y / GRID_SIZE_M)
  };
}

function assertObservationQualifiesForQuest(observation, quest) {
  if (isIdentificationQuest(quest)) {
    throw httpError(409, "Identification quests require a verified iNaturalist identification.");
  }

  const recipe = quest?.recipe || {};
  const observationDateValue = observationDate(observation);
  if (!observationDateValue) {
    throw httpError(422, "The iNaturalist observation is missing an observation date.");
  }

  const now = Date.now();
  const ageMs = now - observationDateValue.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const maxAgeByTimeframe = {
    now: 6 * 60 * 60 * 1000,
    today: 1.5 * dayMs,
    week: 8 * dayMs,
    weekend: 4 * dayMs
  };
  const maxAge = maxAgeByTimeframe[recipe.timeframe];
  if ((Number.isFinite(maxAge) && ageMs > maxAge) || ageMs < -6 * 60 * 60 * 1000) {
    throw httpError(422, "The iNaturalist observation is outside this quest's timeframe.");
  }

  const wantedTaxon = String(recipe.iconicTaxon || "Any");
  const actualTaxon = String(observation?.taxon?.iconic_taxon_name || "");
  if (wantedTaxon !== "Any" && wantedTaxon !== actualTaxon) {
    throw httpError(422, "The iNaturalist observation does not match this quest's taxon.");
  }

  const evidence = String(recipe.evidence || "photo_gps20");
  const photoCount = Array.isArray(observation?.photos) ? observation.photos.length : 0;
  const accuracy = Number(observation?.positional_accuracy);
  if (["photo_gps20", "photo"].includes(evidence) && photoCount < 1) {
    throw httpError(422, "This quest requires an iNaturalist observation with a photo.");
  }
  if (evidence === "photo_gps20" && (!Number.isFinite(accuracy) || accuracy <= 0 || accuracy > 20)) {
    throw httpError(422, "This quest requires iNaturalist GPS accuracy of 20 meters or better.");
  }
  if (evidence === "research_grade" && observation?.quality_grade !== "research") {
    throw httpError(422, "This quest requires a research-grade iNaturalist observation.");
  }

  const target = recipe.target || null;
  const targetLocation = recipe.targetLocation || target?.mode || "anywhere";
  if (targetLocation === "anywhere") return;
  if (!target) throw httpError(422, "This reward-bearing quest is missing a server-checkable target.");

  const coordinates = observationCoordinates(observation);
  if (!coordinates) throw httpError(422, "This quest requires an iNaturalist observation with usable coordinates.");

  if (
    Number.isFinite(Number(target.lat)) &&
    Number.isFinite(Number(target.lng)) &&
    Number.isFinite(Number(target.radiusMeters))
  ) {
    const distance = haversineMeters(coordinates, {
      lat: Number(target.lat),
      lng: Number(target.lng)
    });
    if (distance > Number(target.radiusMeters)) {
      throw httpError(422, "The iNaturalist observation is outside this quest's target area.");
    }
    return;
  }

  if (Number.isFinite(Number(target.ix)) && Number.isFinite(Number(target.iy))) {
    const cell = gridCellForCoordinates(coordinates);
    const radius = clampInteger(target.radiusCells, 0, 20, 0);
    if (
      Math.abs(cell.ix - Number(target.ix)) > radius ||
      Math.abs(cell.iy - Number(target.iy)) > radius
    ) {
      throw httpError(422, "The iNaturalist observation is outside this quest's target cells.");
    }
  }
}

module.exports = {
  assertObservationQualifiesForQuest,
  assertRewardQuestOwned,
  isIdentificationQuest,
  issueQuest,
  normalizeQuestRecipe,
  questIssuanceKey,
  questReward
};
