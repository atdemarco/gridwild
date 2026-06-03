const { createClient } = require("@supabase/supabase-js");
const { applyPartyTiming } = require("./_party-duration");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { player_id, party_id } = body;

    if (!player_id) throw new Error("player_id is required");
    if (!party_id) throw new Error("party_id is required");

    const { data: party, error: partyError } = await supabase
      .from("parties")
      .select("*")
      .eq("id", party_id)
      .single();

    if (partyError) throw partyError;

    const timing = await applyPartyTiming(supabase, party, { playerId: player_id });
    if (timing.party?.status === "ended") {
      throw new Error("This party has ended.");
    }

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
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
