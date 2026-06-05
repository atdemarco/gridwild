const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");
const { applyPartyTiming } = require("./_party-duration");
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
    const requestedPartyId = party_id || null;
    let stateActivePartyId = null;

    if (!player_id && !party_id) {
      throw new Error("player_id or party_id is required");
    }

let activePartyId = requestedPartyId;

if (!activePartyId) {
  const { data: state, error: stateError } = await supabase
    .from("player_state")
    .select("active_party_id")
    .eq("player_id", player_id)
    .maybeSingle();

  if (stateError) throw stateError;

  stateActivePartyId = state?.active_party_id || null;
  activePartyId = stateActivePartyId;
}

    if (!activePartyId) {
      return {
        statusCode: 200,
        body: JSON.stringify({ party: null, members: [], events: [] })
      };
    }

    let { data: party, error: partyError } = await supabase
      .from("parties")
      .select("*")
      .eq("id", activePartyId)
      .single();

    if (partyError) throw partyError;

    const timing = await applyPartyTiming(supabase, party, { playerId: player_id });
    party = timing.party;
    await requirePartyAccess(supabase, {
      party,
      playerId: player_id,
      allowPublicRead: true
    });

    if (!requestedPartyId && party?.status === "ended" && player_id && party.id === stateActivePartyId) {
      await supabase
        .from("player_state")
        .upsert({
          player_id,
          active_party_id: null,
          updated_at: new Date().toISOString()
        }, {
          onConflict: "player_id"
        });
    }

    const { data: members, error: membersError } = await supabase
      .from("party_members")
      .select("*, players(id, display_name, archetype, icon, color, wildpoints)")
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

    const progress = (evidence || []).filter(row => row.status !== "excluded").length;

    return {
      statusCode: 200,
      body: JSON.stringify({
        party,
        members: members || [],
        events: events || [],
        evidence: evidence || [],
        progress
      })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
