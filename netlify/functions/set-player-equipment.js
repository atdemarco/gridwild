const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async function (event) {
  try {
    await authorizePlayerRequest(supabase, event);
    const body = JSON.parse(event.body || "{}");

    const { player_id, slot, item_id } = body;

    if (!player_id) {
      throw new Error("player_id is required");
    }

    if (!slot) {
      throw new Error("slot is required");
    }

    const { data, error } = await supabase.rpc("gridwild_set_owned_equipment", {
      p_player_id: player_id,
      p_slot: slot,
      p_item_id: item_id || null
    });

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({
        error: err.message
      })
    };
  }
};
