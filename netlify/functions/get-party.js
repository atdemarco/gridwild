const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { player_id, party_id } = body;

    if (!player_id && !party_id) {
      throw new Error("player_id or party_id is required");
    }

let activePartyId = party_id || null;

if (!activePartyId) {
  const { data: state, error: stateError } = await supabase
    .from("player_state")
    .select("active_party_id")
    .eq("player_id", player_id)
    .maybeSingle();

  if (stateError) throw stateError;

  activePartyId = state?.active_party_id || null;
}

    if (!activePartyId) {
      return {
        statusCode: 200,
        body: JSON.stringify({ party: null, members: [], events: [] })
      };
    }

    const { data: party, error: partyError } = await supabase
      .from("parties")
      .select("*")
      .eq("id", activePartyId)
      .single();

    if (partyError) throw partyError;

    const { data: members, error: membersError } = await supabase
      .from("party_members")
      .select("*, players(id, display_name, wildpoints)")
      .eq("party_id", activePartyId)
      .order("joined_at", { ascending: true });

    if (membersError) throw membersError;

    const { data: events, error: eventsError } = await supabase
      .from("party_events")
      .select("*")
      .eq("party_id", activePartyId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (eventsError) throw eventsError;

    const { data: evidence, error: evidenceError } = await supabase
      .from("party_evidence")
      .select("*")
      .eq("party_id", activePartyId)
      .order("created_at", { ascending: false });

    if (evidenceError) throw evidenceError;

    return {
      statusCode: 200,
      body: JSON.stringify({
        party,
        members: members || [],
        events: events || [],
        evidence: evidence || [],
        progress: (evidence || []).length
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};