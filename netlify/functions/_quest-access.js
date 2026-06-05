const { httpError } = require("./_gridwild-player-session");
const { assertRewardQuestOwned } = require("./_quest-authority");

async function requireStartedQuest(supabase, playerId, questId) {
  if (!playerId) throw httpError(400, "player_id is required");
  if (!questId) throw httpError(400, "quest_id is required");

  const [playerQuestResult, questResult] = await Promise.all([
    supabase
      .from("player_quests")
      .select("player_id, quest_id, status, rewarded_at, accepted_at")
      .eq("player_id", playerId)
      .eq("quest_id", questId)
      .maybeSingle(),
    supabase
      .from("quests")
      .select("*")
      .eq("id", questId)
      .maybeSingle()
  ]);

  if (playerQuestResult.error) throw playerQuestResult.error;
  if (questResult.error) throw questResult.error;
  const playerQuest = playerQuestResult.data;
  const quest = questResult.data;
  if (!quest || quest.is_active === false) throw httpError(404, "Quest not found.");
  assertRewardQuestOwned(quest, playerId);
  if (!playerQuest || !["active", "paused"].includes(playerQuest.status)) {
    throw httpError(409, "Quest must be active or paused before evidence can be claimed.");
  }

  return { playerQuest, quest };
}

module.exports = {
  requireStartedQuest
};
