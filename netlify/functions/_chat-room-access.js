const { applyPartyTiming } = require("./_party-duration");
const { requireDirectRoomAccess } = require("./_player-interactions");

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function requirePartyRoomAccess(supabase, options) {
  const { roomId, playerId, write } = options;

  const { data: partyRow, error: partyError } = await supabase
    .from("parties")
    .select("*")
    .eq("id", roomId)
    .maybeSingle();

  if (partyError) throw partyError;
  if (!partyRow) throw httpError(404, "Party chat room not found.");

  const timing = await applyPartyTiming(supabase, partyRow, { playerId });
  const party = timing.party;

  const { data: membership, error: memberError } = await supabase
    .from("party_members")
    .select("party_id, player_id, role")
    .eq("party_id", roomId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (memberError) throw memberError;
  if (!membership) throw httpError(403, "Join this party to use its chat.");
  if (write && party?.status === "ended") {
    throw httpError(409, "This party has ended. Its chat is read-only.");
  }

  return { party, membership };
}

async function requireChatRoomAccess(supabase, options = {}) {
  const roomType = String(options.roomType || options.room_type || "").trim();
  const roomId = options.roomId || options.room_id || null;
  const playerId = options.playerId || options.player_id || null;
  const write = options.write === true;

  if (!roomType) throw httpError(400, "room_type is required");
  if (!roomId) throw httpError(400, "room_id is required");
  if (!playerId) throw httpError(400, "player_id is required");

  if (roomType === "party") {
    return requirePartyRoomAccess(supabase, { roomId, playerId, write });
  }

  if (roomType === "direct") {
    return requireDirectRoomAccess(supabase, { roomId, playerId, write });
  }

  throw httpError(400, `Unsupported chat room type: ${roomType}`);
}

module.exports = {
  requireChatRoomAccess
};
