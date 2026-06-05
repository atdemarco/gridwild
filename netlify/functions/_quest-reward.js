const MAX_QUEST_REWARD = 500;

const RANGE_BONUS = {
  here: 0,
  "1min": 5,
  "5min": 15,
  "15min": 30,
  anywhere: 10
};

const OBJECTIVE_BONUS = {
  any_observation: 10,
  new_square_taxon: 35,
  underobserved: 45,
  revisit_fading: 30,
  leaderboard: 50,
  identify_unknowns: 40
};

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function calculateQuestReward(recipe = {}, options = {}) {
  if (options.source === "onboarding") return 100;

  const difficulty = clampNumber(recipe.difficulty, 1, 5, 1);
  const rangeBonus = RANGE_BONUS[recipe.range] ?? 0;
  const objectiveBonus = OBJECTIVE_BONUS[recipe.objectiveType] ?? 10;

  return Math.min(
    MAX_QUEST_REWARD,
    Math.max(0, Math.round(20 + difficulty * 20 + rangeBonus + objectiveBonus))
  );
}

module.exports = {
  calculateQuestReward,
  MAX_QUEST_REWARD
};
