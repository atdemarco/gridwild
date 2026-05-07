const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function () {
  try {
    const { data, error } = await supabase
      .from("parties")
      .select("*")
      .eq("visibility", "public")
      .neq("status", "ended")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({ parties: data || [] })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};