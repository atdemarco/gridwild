const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");
const { requirePartyAccess } = require("./_party-access");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function (event) {
  try {
    await authorizePlayerRequest(supabase, event);
    const { player_id, party_id } = JSON.parse(event.body || "{}");

    if (!player_id) throw new Error("player_id is required");
    if (!party_id) throw new Error("party_id is required");
    await requirePartyAccess(supabase, {
      partyId: party_id,
      playerId: player_id,
      leader: true,
      write: true
    });

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

    await supabase
      .from("player_state")
      .upsert({
        player_id,
        active_party_id: null,
        updated_at: endedAt
      }, {
        onConflict: "player_id"
      });

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
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
