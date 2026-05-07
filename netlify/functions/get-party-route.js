const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { party_id } = body;

    if (!party_id) throw new Error("party_id is required");

    const { data, error } = await supabase
      .from("party_route_points")
      .select("*")
      .eq("party_id", party_id)
      .order("created_at", { ascending: true })
      .limit(5000);

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({ route: data || [] })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};