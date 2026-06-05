const { createClient } = require("@supabase/supabase-js");
const { accountTableHint, requireAccountSession } = require("./_gridwild-account-session");
const { requirePartyAccess } = require("./_party-access");
const {
  BLOCKS_TABLE,
  INTERACTIONS_TABLE,
  cleanText,
  decorateInteraction,
  fetchPartiesById,
  fetchPlayersById,
  httpError,
  interactionTableHint,
  requireNotBlocked
} = require("./_player-interactions");

const REQUEST_TTL_MS = 10 * 60 * 1000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function tableHint(err) {
  return interactionTableHint({ message: accountTableHint(err) });
}

function requestType(body = {}) {
  return cleanText(body.type || body.action || "", 48).toLowerCase();
}

async function requirePlayerExists(playerId) {
  const { data, error } = await supabase
    .from("players")
    .select("id, display_name, archetype, icon, color")
    .eq("id", playerId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw httpError(404, "Player not found.");
  return data;
}

async function findExistingInteraction(type, playerId, targetPlayerId, options = {}) {
  const ids = [playerId, targetPlayerId].map(value => String(value));
  const statuses = options.statuses || ["pending", "accepted"];

  const query = supabase
    .from(INTERACTIONS_TABLE)
    .select("*")
    .eq("type", type)
    .in("status", statuses)
    .in("sender_player_id", ids)
    .in("recipient_player_id", ids)
    .order("updated_at", { ascending: false })
    .limit(20);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).find(row => {
    const pairMatches =
      ids.includes(String(row.sender_player_id)) &&
      ids.includes(String(row.recipient_player_id)) &&
      String(row.sender_player_id) !== String(row.recipient_player_id);
    const partyMatches = !options.partyId || String(row.party_id || "") === String(options.partyId);
    return pairMatches && partyMatches;
  }) || null;
}

async function decorate(row, viewerPlayerId) {
  const playersById = await fetchPlayersById(supabase, [
    row.sender_player_id,
    row.recipient_player_id
  ]);
  const partiesById = await fetchPartiesById(supabase, [row.party_id]);
  return decorateInteraction(row, { playersById, partiesById }, viewerPlayerId);
}

async function createChatRequest(playerId, targetPlayerId, body = {}) {
  await requireNotBlocked(supabase, playerId, targetPlayerId);

  const existingAccepted = await findExistingInteraction("chat_request", playerId, targetPlayerId, {
    statuses: ["accepted"]
  });
  if (existingAccepted) return existingAccepted;

  const existingPending = await findExistingInteraction("chat_request", playerId, targetPlayerId, {
    statuses: ["pending"]
  });
  if (existingPending) return existingPending;

  const { data, error } = await supabase
    .from(INTERACTIONS_TABLE)
    .insert({
      type: "chat_request",
      status: "pending",
      sender_player_id: playerId,
      recipient_player_id: targetPlayerId,
      payload: {
        note: cleanText(body.note, 240) || null
      },
      expires_at: new Date(Date.now() + REQUEST_TTL_MS).toISOString()
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function createPartyInvite(playerId, targetPlayerId, body = {}) {
  const partyId = body.party_id || body.partyId || null;
  if (!partyId) throw httpError(400, "party_id is required");

  await requireNotBlocked(supabase, playerId, targetPlayerId);
  const { party } = await requirePartyAccess(supabase, {
    partyId,
    playerId,
    write: true
  });

  const { data: existingMember, error: memberError } = await supabase
    .from("party_members")
    .select("party_id, player_id")
    .eq("party_id", partyId)
    .eq("player_id", targetPlayerId)
    .maybeSingle();

  if (memberError) throw memberError;
  if (existingMember) throw httpError(409, "This player is already in that party.");

  const existingPending = await findExistingInteraction("party_invite", playerId, targetPlayerId, {
    statuses: ["pending"],
    partyId
  });
  if (existingPending) return existingPending;

  const { data, error } = await supabase
    .from(INTERACTIONS_TABLE)
    .insert({
      type: "party_invite",
      status: "pending",
      sender_player_id: playerId,
      recipient_player_id: targetPlayerId,
      party_id: partyId,
      payload: {
        party_name: party?.name || "Party"
      },
      expires_at: new Date(Date.now() + REQUEST_TTL_MS).toISOString()
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function createPartyJoinRequest(playerId, targetPlayerId, body = {}) {
  const partyId = body.party_id || body.partyId || null;
  if (!partyId) throw httpError(400, "party_id is required");

  await requireNotBlocked(supabase, playerId, targetPlayerId);

  const { data: targetMembership, error: targetMemberError } = await supabase
    .from("party_members")
    .select("party_id, player_id, role")
    .eq("party_id", partyId)
    .eq("player_id", targetPlayerId)
    .maybeSingle();

  if (targetMemberError) throw targetMemberError;
  if (!targetMembership) throw httpError(403, "That player is not in this party.");

  const { data: ownMembership, error: ownMemberError } = await supabase
    .from("party_members")
    .select("party_id, player_id")
    .eq("party_id", partyId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (ownMemberError) throw ownMemberError;
  if (ownMembership) throw httpError(409, "You are already in that party.");

  const { data: party, error: partyError } = await supabase
    .from("parties")
    .select("id, name, visibility, status, created_by")
    .eq("id", partyId)
    .maybeSingle();

  if (partyError) throw partyError;
  if (!party) throw httpError(404, "Party not found.");
  if (party.status === "ended") throw httpError(409, "This party has ended.");

  const existingPending = await findExistingInteraction("party_join_request", playerId, targetPlayerId, {
    statuses: ["pending"],
    partyId
  });
  if (existingPending) return existingPending;

  const { data, error } = await supabase
    .from(INTERACTIONS_TABLE)
    .insert({
      type: "party_join_request",
      status: "pending",
      sender_player_id: playerId,
      recipient_player_id: targetPlayerId,
      party_id: partyId,
      payload: {
        party_name: party.name || "Party"
      },
      expires_at: new Date(Date.now() + REQUEST_TTL_MS).toISOString()
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function blockPlayer(playerId, targetPlayerId) {
  const { data, error } = await supabase
    .from(BLOCKS_TABLE)
    .upsert({
      blocker_player_id: playerId,
      blocked_player_id: targetPlayerId
    }, {
      onConflict: "blocker_player_id,blocked_player_id"
    })
    .select("*")
    .single();

  if (error) throw error;

  const dismissResult = await supabase
    .from(INTERACTIONS_TABLE)
    .update({
      status: "dismissed",
      updated_at: new Date().toISOString()
    })
    .eq("status", "pending")
    .in("sender_player_id", [playerId, targetPlayerId])
    .in("recipient_player_id", [playerId, targetPlayerId]);

  if (dismissResult.error) throw dismissResult.error;

  return data;
}

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const playerId = body.player_id || null;
    const targetPlayerId = body.target_player_id || body.targetPlayerId || null;

    await requireAccountSession(supabase, {
      playerId,
      sessionToken: body.session_token
    });

    if (!targetPlayerId) throw httpError(400, "target_player_id is required");
    if (String(playerId) === String(targetPlayerId)) {
      throw httpError(400, "Choose another player.");
    }

    await requirePlayerExists(targetPlayerId);

    const type = requestType(body);
    if (type === "block") {
      const block = await blockPlayer(playerId, targetPlayerId);
      return {
        statusCode: 200,
        body: JSON.stringify({ block })
      };
    }

    let interaction = null;
    if (type === "chat_request") {
      interaction = await createChatRequest(playerId, targetPlayerId, body);
    } else if (type === "party_invite") {
      interaction = await createPartyInvite(playerId, targetPlayerId, body);
    } else if (type === "party_join_request") {
      interaction = await createPartyJoinRequest(playerId, targetPlayerId, body);
    } else {
      throw httpError(400, "Unsupported interaction type.");
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        interaction: await decorate(interaction, playerId)
      })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: tableHint(err) })
    };
  }
};
