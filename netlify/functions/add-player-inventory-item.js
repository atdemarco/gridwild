const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");

    const {
      player_id,
      item_id
    } = body;

    if (!player_id) {
      throw new Error("player_id is required");
    }

    if (!item_id) {
      throw new Error("item_id is required");
    }

    const { data, error } = await supabase
      .from("player_inventory")
      .upsert({
        player_id,
        item_id
      }, {
        onConflict: "player_id,item_id"
      })
      .select("*")
      .single();

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({
        inventory_item: data
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message
      })
    };
  }
};