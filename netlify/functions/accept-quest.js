const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");
const { assertRewardQuestOwned } = require("./_quest-authority");

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
      .select("*")
      .eq("id", quest_id)
      .maybeSingle();

    if (questError) throw questError;
    if (!quest || quest.is_active === false) throw new Error("Quest not found.");
    assertRewardQuestOwned(quest, player_id);

    const { error: pauseError } = await supabase
      .from("player_quests")
      .update({ status: "paused" })
      .eq("player_id", player_id)
      .eq("status", "active")
      .neq("quest_id", quest_id);

    if (pauseError) throw pauseError;

    const { data, error } = await supabase
      .from("player_quests")
      .upsert(
        {
          player_id,
          quest_id,
          status: "active",
          accepted_at: new Date().toISOString()
        },
        { onConflict: "player_id,quest_id" }
      )
      .select("*")
      .single();

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({ player_quest: data })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
