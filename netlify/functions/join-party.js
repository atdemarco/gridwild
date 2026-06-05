const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");
const { requirePartyJoinable } = require("./_party-access");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function (event) {
  try {
    await authorizePlayerRequest(supabase, event);
    const body = JSON.parse(event.body || "{}");
    const { player_id, party_id } = body;

    if (!player_id) throw new Error("player_id is required");
    if (!party_id) throw new Error("party_id is required");

    await requirePartyJoinable(supabase, { partyId: party_id, playerId: player_id });

    const { data: member, error } = await supabase
      .from("party_members")
      .upsert(
        {
          party_id,
          player_id,
          role: "member"
        },
        { onConflict: "party_id,player_id" }
      )
      .select("*")
      .single();

    if (error) throw error;

    await supabase.from("party_events").insert({
      party_id,
      player_id,
      event_type: "player_joined",
      payload: {}
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ member })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
