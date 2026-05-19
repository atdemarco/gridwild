const { createClient } = require("@supabase/supabase-js");
const {
  buildNicheDisplayTitle,
  buildSampleNicheRecipe,
  sampleQuestDescription
} = require("./_local-niche-utils");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function (event) {
  try {
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

    const insert = {
      title,
      description: sampleQuestDescription(niche),
      quest_type: "sample_niche",
      reward_wildpoints: Math.max(40, Math.round(60 + Number(niche.questability_score || 0) * 90)),
      recipe,
      source: "local_niche",
      created_by: player_id,
      is_active: true,
      niche_id
    };

    const { data: quest, error: questError } = await supabase
      .from("quests")
      .insert(insert)
      .select("*")
      .single();

    if (questError) throw questError;

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
        state
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
