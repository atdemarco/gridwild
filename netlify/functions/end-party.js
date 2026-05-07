const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function (event) {
  try {
    const { player_id, party_id } = JSON.parse(event.body || "{}");

    if (!player_id) throw new Error("player_id is required");
    if (!party_id) throw new Error("party_id is required");

    const endedAt = new Date().toISOString();

    const { data: party, error } = await supabase
      .from("parties")
      .update({
        status: "ended",
        ended_at: endedAt
      })
      .eq("id", party_id)
      .select("*")
      .single();

    if (error) throw error;

    await supabase.from("party_events").insert({
      party_id,
      player_id,
      event_type: "party_ended",
      payload: {}
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ party })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};