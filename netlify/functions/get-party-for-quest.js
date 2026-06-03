const { createClient } = require("@supabase/supabase-js");
const { applyPartyTimingToRows } = require("./_party-duration");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function(event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { player_id, quest_id } = body;

    if (!player_id) throw new Error("player_id is required");
    if (!quest_id) throw new Error("quest_id is required");

    const { data: events, error: eventError } = await supabase
      .from("party_events")
      .select("party_id, created_at")
      .contains("payload", { quest_id })
      .order("created_at", { ascending: false })
      .limit(10);

    if (eventError) throw eventError;

    const partyIds = [...new Set((events || []).map(e => e.party_id).filter(Boolean))];

    if (!partyIds.length) {
      return {
        statusCode: 200,
        body: JSON.stringify({ party: null, members: [], events: [], evidence: [], progress: 0 })
      };
    }

    const { data: parties, error: partiesError } = await supabase
      .from("parties")
      .select("*")
      .in("id", partyIds);

    if (partiesError) throw partiesError;

    const timedParties = await applyPartyTimingToRows(supabase, parties || [], { playerId: player_id });

    const party = timedParties.find(p =>
      p.status !== "ended" &&
      (p.visibility === "public" || p.created_by === player_id)
    ) || null;

    if (!party) {
      return {
        statusCode: 200,
        body: JSON.stringify({ party: null, members: [], events: [], evidence: [], progress: 0 })
      };
    }

    const { data: members, error: membersError } = await supabase
      .from("party_members")
      .select("*, players(id, display_name, wildpoints)")
      .eq("party_id", party.id)
      .order("joined_at", { ascending: true });

    if (membersError) throw membersError;

    const { data: partyEvents, error: partyEventsError } = await supabase
      .from("party_events")
      .select("*")
      .eq("party_id", party.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (partyEventsError) throw partyEventsError;

    const { data: evidence, error: evidenceError } = await supabase
      .from("party_evidence")
      .select("*")
      .eq("party_id", party.id)
      .order("created_at", { ascending: false });

    if (evidenceError) throw evidenceError;

    const progress = (evidence || []).filter(row => row.status !== "excluded").length;

    return {
      statusCode: 200,
      body: JSON.stringify({
        party,
        members: members || [],
        events: partyEvents || [],
        evidence: evidence || [],
        progress
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
