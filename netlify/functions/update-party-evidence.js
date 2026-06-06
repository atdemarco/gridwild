const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");
const { requirePartyAccess } = require("./_party-access");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async function (event) {
  try {
    await authorizePlayerRequest(supabase, event);
    const body = JSON.parse(event.body || "{}");
    const { player_id, party_id, draft_id, status } = body;

    if (!player_id) throw new Error("player_id is required");
    if (!party_id) throw new Error("party_id is required");
    if (!draft_id) throw new Error("draft_id is required");
    if (!["counted", "excluded"].includes(status)) {
      throw new Error("status must be counted or excluded");
    }
    await requirePartyAccess(supabase, {
      partyId: party_id,
      playerId: player_id,
      write: true
    });

    const { data, error } = await supabase
      .from("party_evidence")
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq("party_id", party_id)
      .eq("draft_id", draft_id)
      .select("*")
      .single();

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({ evidence: data })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
