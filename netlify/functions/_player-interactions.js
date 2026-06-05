const INTERACTIONS_TABLE = "player_interactions";
const BLOCKS_TABLE = "player_blocks";

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function interactionTableHint(err) {
  const message = err?.message || "";
  if (
    message.includes(INTERACTIONS_TABLE) ||
    message.includes(BLOCKS_TABLE) ||
    message.includes("schema cache")
  ) {
    return `${message}. Run netlify/schema/player_interactions.sql in Supabase first.`;
  }
  return message;
}

function cleanText(value, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

function uniq(values = []) {
  return [...new Set(values.filter(Boolean).map(value => String(value)))];
}

async function fetchPlayersById(supabase, ids = []) {
  const playerIds = uniq(ids);
  if (!playerIds.length) return new Map();

  const { data, error } = await supabase
    .from("players")
    .select("id, display_name, archetype, icon, color, wildpoints")
    .in("id", playerIds);

  if (error) throw error;
  return new Map((data || []).map(player => [String(player.id), player]));
}

async function fetchPartiesById(supabase, ids = []) {
  const partyIds = uniq(ids);
  if (!partyIds.length) return new Map();

  const { data, error } = await supabase
    .from("parties")
    .select("id, name, visibility, status, created_by")
    .in("id", partyIds);

  if (error) throw error;
  return new Map((data || []).map(party => [String(party.id), party]));
}

async function findBlocksBetween(supabase, leftPlayerId, rightPlayerId) {
  if (!leftPlayerId || !rightPlayerId) return [];
  const ids = [leftPlayerId, rightPlayerId].map(value => String(value));

  const { data, error } = await supabase
    .from(BLOCKS_TABLE)
    .select("blocker_player_id, blocked_player_id, created_at")
    .in("blocker_player_id", ids)
    .in("blocked_player_id", ids)
    .limit(2);

  if (error) throw error;
  return (data || []).filter(row =>
    String(row.blocker_player_id) !== String(row.blocked_player_id)
  );
}

async function requireNotBlocked(supabase, senderPlayerId, recipientPlayerId) {
  const blocks = await findBlocksBetween(supabase, senderPlayerId, recipientPlayerId);
  if (!blocks.length) return;

  const senderBlockedTarget = blocks.some(row =>
    String(row.blocker_player_id) === String(senderPlayerId)
  );

  throw httpError(
    403,
    senderBlockedTarget
      ? "You blocked this player."
      : "This player is not accepting interactions from you."
  );
}

async function requireDirectRoomAccess(supabase, options = {}) {
  const roomId = options.roomId || options.room_id || null;
  const playerId = options.playerId || options.player_id || null;

  if (!roomId) throw httpError(400, "room_id is required");
  if (!playerId) throw httpError(400, "player_id is required");

  const { data: room, error } = await supabase
    .from(INTERACTIONS_TABLE)
    .select("*")
    .eq("type", "chat_request")
    .eq("status", "accepted")
    .eq("room_id", roomId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!room) throw httpError(404, "Direct chat room not found.");

  const isParticipant =
    String(room.sender_player_id) === String(playerId) ||
    String(room.recipient_player_id) === String(playerId);

  if (!isParticipant) {
    throw httpError(403, "You are not part of this direct chat.");
  }

  await requireNotBlocked(supabase, room.sender_player_id, room.recipient_player_id);
  return { interaction: room };
}

function decorateInteraction(row, maps = {}, viewerPlayerId = null) {
  if (!row) return null;

  const sender = maps.playersById?.get?.(String(row.sender_player_id)) || null;
  const recipient = maps.playersById?.get?.(String(row.recipient_player_id)) || null;
  const party = row.party_id
    ? maps.partiesById?.get?.(String(row.party_id)) || null
    : null;
  const otherPlayerId = String(row.sender_player_id) === String(viewerPlayerId)
    ? row.recipient_player_id
    : row.sender_player_id;

  return {
    ...row,
    sender,
    recipient,
    party,
    other_player: maps.playersById?.get?.(String(otherPlayerId)) || null
  };
}

module.exports = {
  BLOCKS_TABLE,
  INTERACTIONS_TABLE,
  cleanText,
  decorateInteraction,
  fetchPartiesById,
  fetchPlayersById,
  findBlocksBetween,
  httpError,
  interactionTableHint,
  requireDirectRoomAccess,
  requireNotBlocked,
  uniq
};
