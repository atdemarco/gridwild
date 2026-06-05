const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");
const {
  issueQuest,
  normalizeQuestRecipe,
  questIssuanceKey,
  questReward
} = require("./_quest-authority");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function (event) {
  try {
    await authorizePlayerRequest(supabase, event);
    const body = JSON.parse(event.body || "{}");
    const { player_id, title, description, quest_type, recipe, source } = body;
    const safeSource = ["manual", "today", "onboarding"].includes(source)
      ? source
      : "manual";
    const safeQuestType = quest_type === "identify" ? "identify" : "explore";

    if (!player_id) throw new Error("player_id is required");
    if (!title) throw new Error("title is required");

    const safeRecipe = normalizeQuestRecipe(recipe || {}, {
      source: safeSource,
      questType: safeQuestType
    });
    const result = await issueQuest(supabase, {
      playerId: player_id,
      title,
      description,
      questType: safeQuestType,
      recipe: safeRecipe,
      source: safeSource,
      rewardWildpoints: questReward(safeRecipe, safeSource),
      issuanceKey: safeSource === "onboarding"
        ? "onboarding:v1"
        : questIssuanceKey(safeSource, safeQuestType, safeRecipe)
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        quest: result.quest,
        already_issued: !!result.already_issued
      })
    };
  } catch (err) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};
