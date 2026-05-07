const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { player_id, name, quest_id } = body;

    if (!player_id) throw new Error("player_id is required");

    const { data: party, error: partyError } = await supabase
      .from("parties")
      .insert({
        name: name || "New Party",
        created_by: player_id,
        visibility: "public",
        status: "active"
      })
      .select("*")
      .single();

    if (partyError) throw partyError;

    const { error: memberError } = await supabase
      .from("party_members")
      .insert({
        party_id: party.id,
        player_id,
        role: "leader"
      });

    if (memberError) throw memberError;

    await supabase.from("party_events").insert({
      party_id: party.id,
      player_id,
      event_type: "party_created",
      payload: { quest_id: quest_id || null }
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