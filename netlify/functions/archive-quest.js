const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function(event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { player_id, quest_id } = body;

    if (!player_id) throw new Error("player_id is required");
    if (!quest_id) throw new Error("quest_id is required");

    const { data: existing, error: existingError } = await supabase
      .from("player_quests")
      .select("*")
      .eq("player_id", player_id)
      .eq("quest_id", quest_id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) throw new Error("quest has not been started or completed");
    if (!["completed", "archived"].includes(existing.status)) {
      throw new Error("only completed quests can be archived");
    }

    const { data, error } = await supabase
      .from("player_quests")
      .update({
        status: "archived"
      })
      .eq("player_id", player_id)
      .eq("quest_id", quest_id)
      .select("*")
      .single();

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({ player_quest: data })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
