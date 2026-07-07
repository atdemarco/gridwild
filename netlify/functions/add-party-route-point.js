const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");
const { applyPartyTiming } = require("./_party-duration");
const { requirePartyAccess } = require("./_party-access");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async function (event) {
  try {
    await authorizePlayerRequest(supabase, event);
    const body = JSON.parse(event.body || "{}");
    const { player_id, party_id, lat, lng, accuracy_meters, created_at } = body;

    if (!player_id) throw new Error("player_id is required");
    if (!party_id) throw new Error("party_id is required");

    const latNum = Number(lat);
    const lngNum = Number(lng);
    const createdAtMs = Date.parse(created_at || "");
    const createdAt = Number.isFinite(createdAtMs) ? new Date(createdAtMs).toISOString() : null;

    if (!Number.isFinite(latNum)) throw new Error("lat is required");
    if (!Number.isFinite(lngNum)) throw new Error("lng is required");

    const { data: party, error: partyError } = await supabase
      .from("parties")
      .select("*")
      .eq("id", party_id)
      .single();

    if (partyError) throw partyError;

    const timing = await applyPartyTiming(supabase, party, { playerId: player_id });
    const access = await requirePartyAccess(supabase, {
      party: timing.party,
      playerId: player_id
    });
    const activeParty = access.party || timing.party;

    if (activeParty?.status === "ended") {
      const pointMs = Number.isFinite(createdAtMs) ? createdAtMs : Date.now();
      const startMs = Date.parse(activeParty.starts_at || activeParty.created_at || "");
      const endedMs = Date.parse(activeParty.ended_at || "");
      const graceMs = 15 * 60 * 1000;

      if (Number.isFinite(startMs) && pointMs < startMs - graceMs) {
        throw new Error("Route point is before this party started.");
      }
      if (Number.isFinite(endedMs) && pointMs > endedMs + graceMs) {
        throw new Error("Route point is after this party ended.");
      }
    }

    const insertRow = {
      player_id,
      party_id,
      lat: latNum,
      lng: lngNum,
      accuracy_meters: Number.isFinite(Number(accuracy_meters)) ? Number(accuracy_meters) : null
    };
    if (createdAt) insertRow.created_at = createdAt;

    const { data, error } = await supabase
      .from("party_route_points")
      .insert(insertRow)
      .select("*")
      .single();

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({ point: data })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
