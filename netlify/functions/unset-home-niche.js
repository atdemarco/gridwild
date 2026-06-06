const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async function (event) {
  try {
    await authorizePlayerRequest(supabase, event);
    const body = JSON.parse(event.body || "{}");
    const { player_id } = body;

    if (!player_id) throw new Error("player_id is required");

    const { error } = await supabase.from("local_niche_stewards").delete().eq("user_id", player_id);

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({
        home_niche_id: null,
        home_niche: null
      })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
