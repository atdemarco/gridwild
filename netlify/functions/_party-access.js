const { applyPartyTiming } = require("./_party-duration");
const { httpError } = require("./_gridwild-player-session");

async function requirePartyAccess(supabase, options = {}) {
  const partyId = options.partyId || options.party_id || options.party?.id || null;
  const playerId = options.playerId || options.player_id || null;

  if (!partyId) throw httpError(400, "party_id is required");
  if (!playerId) throw httpError(400, "player_id is required");

  let party = options.party || null;
  if (!party) {
    const { data, error } = await supabase
      .from("parties")
      .select("*")
      .eq("id", partyId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw httpError(404, "Party not found.");
    party = data;
  }

  const timing = await applyPartyTiming(supabase, party, { playerId });
  party = timing.party;

  const { data: membership, error: memberError } = await supabase
    .from("party_members")
    .select("party_id, player_id, role")
    .eq("party_id", partyId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (memberError) throw memberError;

  const isLeader = party.created_by === playerId || membership?.role === "leader";
  const canReadPublic = options.allowPublicRead === true && party.visibility === "public";

  if (!membership && !canReadPublic) {
    throw httpError(403, "Join this party to access it.");
  }

  if (options.leader === true && !isLeader) {
    throw httpError(403, "Only the party leader can do that.");
  }

  if (options.write === true && party.status === "ended") {
    throw httpError(409, "This party has ended.");
  }

  return { party, membership, isLeader };
}

async function requirePartyJoinable(supabase, options = {}) {
  const partyId = options.partyId || options.party_id || null;
  const playerId = options.playerId || options.player_id || null;

  if (!partyId) throw httpError(400, "party_id is required");
  if (!playerId) throw httpError(400, "player_id is required");

  const { data: party, error } = await supabase
    .from("parties")
    .select("*")
    .eq("id", partyId)
    .maybeSingle();

  if (error) throw error;
  if (!party) throw httpError(404, "Party not found.");
  if (party.visibility !== "public" && party.created_by !== playerId) {
    throw httpError(403, "This party is private.");
  }

  const timing = await applyPartyTiming(supabase, party, { playerId });
  if (timing.party?.status === "ended") {
    throw httpError(409, "This party has ended.");
  }

  return timing.party;
}

module.exports = {
  requirePartyAccess,
  requirePartyJoinable
};
