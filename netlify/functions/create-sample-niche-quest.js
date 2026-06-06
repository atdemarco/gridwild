const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");
const {
  buildNicheDisplayTitle,
  buildSampleNicheRecipe,
  sampleQuestDescription
} = require("./_local-niche-utils");
const { MAX_QUEST_REWARD } = require("./_quest-reward");
const { issueQuest, questIssuanceKey } = require("./_quest-authority");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async function (event) {
  try {
    await authorizePlayerRequest(supabase, event);
    const body = JSON.parse(event.body || "{}");
    const { player_id, niche_id } = body;

    if (!player_id) throw new Error("player_id is required");
    if (!niche_id) throw new Error("niche_id is required");

    const { data: niche, error: nicheError } = await supabase
      .from("local_niches")
      .select("*")
      .eq("id", niche_id)
      .single();

    if (nicheError) throw nicheError;

    const title = niche.title || buildNicheDisplayTitle(niche);
    const recipe = buildSampleNicheRecipe(niche);

    const rewardWildpoints = Math.min(
      MAX_QUEST_REWARD,
      Math.max(40, Math.round(60 + Number(niche.questability_score || 0) * 90))
    );
    const issued = await issueQuest(supabase, {
      playerId: player_id,
      title,
      description: sampleQuestDescription(niche),
      questType: "sample_niche",
      recipe,
      source: "local_niche",
      rewardWildpoints,
      issuanceKey: questIssuanceKey("local_niche", "sample_niche", recipe, niche_id),
      nicheId: niche_id
    });
    const quest = issued.quest;

    const { data: existingPlayerQuest, error: existingPlayerQuestError } = await supabase
      .from("player_quests")
      .select("*")
      .eq("player_id", player_id)
      .eq("quest_id", quest.id)
      .maybeSingle();

    if (existingPlayerQuestError) throw existingPlayerQuestError;
    if (existingPlayerQuest && ["completed", "archived"].includes(existingPlayerQuest.status)) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          quest: {
            ...quest,
            status: existingPlayerQuest.status,
            player_quests: [existingPlayerQuest]
          },
          player_quest: existingPlayerQuest,
          state: null,
          already_issued: true
        })
      };
    }

    const { error: pauseError } = await supabase
      .from("player_quests")
      .update({ status: "paused" })
      .eq("player_id", player_id)
      .eq("status", "active")
      .neq("quest_id", quest.id);

    if (pauseError) throw pauseError;

    const { data: playerQuest, error: playerQuestError } = await supabase
      .from("player_quests")
      .upsert(
        {
          player_id,
          quest_id: quest.id,
          status: "active",
          accepted_at: new Date().toISOString()
        },
        { onConflict: "player_id,quest_id" }
      )
      .select("*")
      .single();

    if (playerQuestError) throw playerQuestError;

    const { data: state, error: stateError } = await supabase
      .from("player_state")
      .upsert(
        {
          player_id,
          active_quest_id: quest.id,
          updated_at: new Date().toISOString()
        },
        { onConflict: "player_id" }
      )
      .select("*")
      .single();

    if (stateError) throw stateError;

    await supabase
      .from("local_niches")
      .update({
        visits_count: Number(niche.visits_count || 0) + 1,
        status: "active"
      })
      .eq("id", niche_id);

    return {
      statusCode: 200,
      body: JSON.stringify({
        quest: {
          ...quest,
          status: "active",
          player_quests: [playerQuest]
        },
        player_quest: playerQuest,
        state,
        already_issued: !!issued.already_issued
      })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
