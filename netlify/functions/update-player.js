const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest, httpError } = require("./_gridwild-player-session");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function (event) {
  try {
    await authorizePlayerRequest(supabase, event);
    const body = JSON.parse(event.body || "{}");

    const {
  player_id,
  display_name,
  archetype,
  icon,
  color
} = body;

    if (!player_id) {
      throw new Error("player_id is required");
    }

    const patch = {};

    if (display_name !== undefined) {
      patch.display_name = display_name;
    }

    if (Object.prototype.hasOwnProperty.call(body, "wildpoints")) {
      throw httpError(403, "Wild Points can only be changed by server-authoritative economy actions.");
    }

    if (archetype !== undefined) {
      patch.archetype = archetype;
    }

    if (icon !== undefined) {
      patch.icon = icon;
    }

    if (color !== undefined) {
      patch.color = color;
    }

    const { data, error } = await supabase
      .from("players")
      .update(patch)
      .eq("id", player_id)
      .select("*")
      .single();

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({
        player: data
      })
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
