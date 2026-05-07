const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { player_id, quest_id, obs_id, source } = body;

    if (!player_id) throw new Error("player_id is required");
    if (!quest_id) throw new Error("quest_id is required");
    if (!obs_id) throw new Error("obs_id is required");

    const { data, error } = await supabase
      .from("quest_evidence")
      .upsert({
        player_id,
        quest_id,
        obs_id,
        source: source || "observation",
        status: "claimed",
        claimed_at: new Date().toISOString()
      }, {
        onConflict: "player_id,quest_id,obs_id"
      })
      .select("*")
      .single();

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({ evidence: data })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};