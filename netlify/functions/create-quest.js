const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");
const {
  issueQuest,
  normalizeQuestRecipe,
  questIssuanceKey,
  questReward
} = require("./_quest-authority");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async function (event) {
  try {
    await authorizePlayerRequest(supabase, event);
    const body = JSON.parse(event.body || "{}");
    const { player_id, title, description, quest_type, recipe, source } = body;
    const safeSource = ["manual", "today", "onboarding", "patch"].includes(source)
      ? source
      : "manual";
    const safeQuestType = quest_type === "identify" ? "identify" : "explore";

    if (!player_id) throw new Error("player_id is required");
    if (!title) throw new Error("title is required");

    const safeRecipe = normalizeQuestRecipe(recipe || {}, {
      source: safeSource,
      questType: safeQuestType
    });
    if (safeRecipe.targetLocation === "target_set" && !safeRecipe.target?.cells?.length) {
      throw new Error("Target-set quests require at least one server-checkable cell.");
    }
    if (safeRecipe.targetLocation === "patch_polygon" && !safeRecipe.target?.rings?.length) {
      throw new Error("Patch-polygon quests require a server-checkable Patch boundary.");
    }

    const issue = (source, options = {}) =>
      issueQuest(supabase, {
        playerId: player_id,
        title,
        description,
        questType: safeQuestType,
        recipe: safeRecipe,
        source,
        rewardWildpoints: Number.isFinite(options.rewardWildpoints)
          ? options.rewardWildpoints
          : questReward(safeRecipe, source),
        issuanceKey:
          source === "onboarding"
            ? "onboarding:v1"
            : questIssuanceKey(source, safeQuestType, safeRecipe)
      });

    let result;
    let compatibilitySource = null;
    try {
      result = await issue(safeSource);
    } catch (err) {
      const oldPatchSourceRpc =
        safeSource === "patch" && /Quest source is not allowed/i.test(String(err?.message || ""));
      if (!oldPatchSourceRpc) throw err;

      compatibilitySource = "today";
      result = await issue(compatibilitySource, {
        rewardWildpoints: Math.min(150, questReward(safeRecipe, safeSource))
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        quest: result.quest,
        already_issued: !!result.already_issued,
        compatibility_source: compatibilitySource
      })
    };
  } catch (err) {
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message }) };
  }
};
