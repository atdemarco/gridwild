const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");
const { getVerifiedAchievements } = require("./_achievement-authority");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function (event) {
  try {
    await authorizePlayerRequest(supabase, event);
    const body = JSON.parse(event.body || "{}");
    const { player_id } = body;

    if (!player_id) throw new Error("player_id is required");
    const { error: refreshError } = await supabase.rpc("gridwild_refresh_verified_achievements", {
      p_player_id: player_id
    });
    if (refreshError) throw refreshError;

    const achievements = await getVerifiedAchievements(supabase, player_id);

    return {
      statusCode: 200,
      body: JSON.stringify({ achievements })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
