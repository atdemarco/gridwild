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
    const body = JSON.parse(event.body || "{}");
    const { player_id, party_id } = body;

    if (!player_id) {
      throw new Error("player_id is required");
    }

    let nextPartyId = party_id || null;

    if (nextPartyId) {
      const access = await requirePartyAccess(supabase, {
        partyId: nextPartyId,
        playerId: player_id
      });
      if (access.party?.status === "ended") {
        nextPartyId = null;
      }
    }

    const { data, error } = await supabase
      .from("player_state")
      .upsert({
        player_id,
        active_party_id: nextPartyId,
        updated_at: new Date().toISOString()
      }, {
        onConflict: "player_id"
      })
      .select("*")
      .single();

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({ state: data })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
