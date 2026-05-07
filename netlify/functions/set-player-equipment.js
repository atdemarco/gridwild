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
      slot,
      item_id
    } = body;

    if (!player_id) {
      throw new Error("player_id is required");
    }

    if (!slot) {
      throw new Error("slot is required");
    }

    const allowedSlots = [
      "title",
      "frame",
      "trail",
      "companion",
      "hat"
    ];

    if (!allowedSlots.includes(slot)) {
      throw new Error("invalid slot");
    }

    const patch = {
      player_id,
      updated_at: new Date().toISOString()
    };

    patch[slot] = item_id || null;

    const { data, error } = await supabase
      .from("player_equipment")
      .upsert(patch, {
        onConflict: "player_id"
      })
      .select("*")
      .single();

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({
        equipment: data
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