const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");
const { requirePartyAccess } = require("./_party-access");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async function (event) {
  try {
    await authorizePlayerRequest(supabase, event);
    const { player_id, party_id } = JSON.parse(event.body || "{}");

    if (!player_id) throw new Error("player_id is required");
    if (!party_id) throw new Error("party_id is required");
    await requirePartyAccess(supabase, { partyId: party_id, playerId: player_id });

    const { error } = await supabase
      .from("party_members")
      .delete()
      .eq("player_id", player_id)
      .eq("party_id", party_id);

    if (error) throw error;

    await supabase.from("party_events").insert({
      party_id,
      player_id,
      event_type: "player_left",
      payload: {}
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
