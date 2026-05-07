const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { player_id, achievements } = body;

    if (!player_id) throw new Error("player_id is required");
    if (!Array.isArray(achievements)) throw new Error("achievements must be an array");

    const rows = achievements.map(a => ({
      player_id,
      achievement_id: a.achievement_id,
      unlocked: !!a.unlocked,
      progress: Number(a.progress || 0),
      target: Number(a.target || 1),
      achieved_at: a.achieved_at || null,
      achieved_where: a.achieved_where || null,
      source: a.source || null,
      updated_at: new Date().toISOString()
    })).filter(a => a.achievement_id);

    if (!rows.length) {
      return {
        statusCode: 200,
        body: JSON.stringify({ achievements: [] })
      };
    }

    const { data, error } = await supabase
      .from("player_achievements")
      .upsert(rows, {
        onConflict: "player_id,achievement_id"
      })
      .select("*");

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({ achievements: data || [] })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};