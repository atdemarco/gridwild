const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async function (event) {
  try {
    await authorizePlayerRequest(supabase, event);
    const body = JSON.parse(event.body || "{}");
    const { niche_id } = body;
    if (!niche_id) throw new Error("niche_id is required");

    const { data, error } = await supabase
      .from("local_niche_comments")
      .select("*")
      .eq("niche_id", niche_id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({ comments: data || [] })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
