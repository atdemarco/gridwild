const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { player_id, title, description, quest_type, reward_wildpoints, recipe, source } = body;

    if (!player_id) throw new Error("player_id is required");
    if (!title) throw new Error("title is required");

    const { data, error } = await supabase
      .from("quests")
      .insert({
        title,
        description: description || null,
        quest_type: quest_type || "explore",
        reward_wildpoints: Number(reward_wildpoints || 10),
        recipe: recipe || null,
        source: source || "manual",
        created_by: player_id,
        is_active: true
      })
      .select("*")
      .single();

    if (error) throw error;

    return { statusCode: 200, body: JSON.stringify({ quest: data }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};