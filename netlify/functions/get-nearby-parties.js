const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");
const { applyPartyTimingToRows } = require("./_party-duration");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function (event) {
  try {
    await authorizePlayerRequest(supabase, event);
    const { data, error } = await supabase
      .from("parties")
      .select("*")
      .eq("visibility", "public")
      .neq("status", "ended")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const timedParties = await applyPartyTimingToRows(supabase, data || []);
    const visibleParties = timedParties.filter(p => p?.status !== "ended");

    return {
      statusCode: 200,
      body: JSON.stringify({ parties: visibleParties })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
