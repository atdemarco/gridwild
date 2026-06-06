const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async function (event) {
  try {
    await authorizePlayerRequest(supabase, event);
    const body = JSON.parse(event.body || "{}");
    const { player_id, quest_id } = body;

    if (!player_id) throw new Error("player_id is required");
    if (!quest_id) throw new Error("quest_id is required");

    const { data: quest, error: questError } = await supabase
      .from("quests")
      .select("id, created_by")
      .eq("id", quest_id)
      .maybeSingle();

    if (questError) throw questError;
    if (!quest) throw new Error("quest not found");

    await supabase
      .from("quest_evidence")
      .delete()
      .eq("player_id", player_id)
      .eq("quest_id", quest_id);

    const { data: playerQuest, error: playerQuestError } = await supabase
      .from("player_quests")
      .upsert(
        {
          player_id,
          quest_id,
          status: "abandoned"
        },
        { onConflict: "player_id,quest_id" }
      )
      .select("*")
      .single();

    if (playerQuestError) throw playerQuestError;

    const { data: state } = await supabase
      .from("player_state")
      .select("active_quest_id")
      .eq("player_id", player_id)
      .maybeSingle();

    if (state?.active_quest_id === quest_id) {
      const { error: stateError } = await supabase.from("player_state").upsert(
        {
          player_id,
          active_quest_id: null,
          updated_at: new Date().toISOString()
        },
        { onConflict: "player_id" }
      );

      if (stateError) throw stateError;
    }

    if (quest.created_by === player_id) {
      const { error: questUpdateError } = await supabase
        .from("quests")
        .update({ is_active: false })
        .eq("id", quest_id);

      if (questUpdateError) throw questUpdateError;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        player_quest: playerQuest,
        deactivated_quest: quest.created_by === player_id
      })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
