const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { accountTableHint, requireAccountSession } = require("./_gridwild-account-session");
const {
  INTERACTIONS_TABLE,
  cleanText,
  decorateInteraction,
  fetchPartiesById,
  fetchPlayersById,
  httpError,
  interactionTableHint,
  requireNotBlocked
} = require("./_player-interactions");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function tableHint(err) {
  return interactionTableHint({ message: accountTableHint(err) });
}

async function fetchInteraction(interactionId) {
  const { data, error } = await supabase
    .from(INTERACTIONS_TABLE)
    .select("*")
    .eq("id", interactionId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw httpError(404, "Interaction not found.");
  return data;
}

function isExpired(row) {
  const expiresAt = Date.parse(row?.expires_at || "");
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

async function decorate(row, viewerPlayerId) {
  const playersById = await fetchPlayersById(supabase, [
    row.sender_player_id,
    row.recipient_player_id
  ]);
  const partiesById = await fetchPartiesById(supabase, [row.party_id]);
  return decorateInteraction(row, { playersById, partiesById }, viewerPlayerId);
}

async function grantPartyMembership(partyId, joiningPlayerId, eventPlayerId) {
  if (!partyId) throw httpError(400, "party_id is required");

  const { data: party, error: partyError } = await supabase
    .from("parties")
    .select("id, name, status")
    .eq("id", partyId)
    .maybeSingle();

  if (partyError) throw partyError;
  if (!party) throw httpError(404, "Party not found.");
  if (party.status === "ended") throw httpError(409, "This party has ended.");

  const { data: member, error: memberError } = await supabase
    .from("party_members")
    .upsert(
      {
        party_id: partyId,
        player_id: joiningPlayerId,
        role: "member"
      },
      {
        onConflict: "party_id,player_id"
      }
    )
    .select("*")
    .single();

  if (memberError) throw memberError;

  const stateResult = await supabase.from("player_state").upsert(
    {
      player_id: joiningPlayerId,
      active_party_id: partyId,
      updated_at: new Date().toISOString()
    },
    {
      onConflict: "player_id"
    }
  );

  if (stateResult.error) throw stateResult.error;

  const eventResult = await supabase.from("party_events").insert({
    party_id: partyId,
    player_id: eventPlayerId || joiningPlayerId,
    event_type: "player_joined",
    payload: {
      via: "player_interaction",
      joined_player_id: joiningPlayerId
    }
  });

  if (eventResult.error) throw eventResult.error;

  return member;
}

async function acceptInteraction(row) {
  await requireNotBlocked(supabase, row.sender_player_id, row.recipient_player_id);

  const patch = {
    status: "accepted",
    responded_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (row.type === "chat_request") {
    patch.room_id = row.room_id || crypto.randomUUID();
  } else if (row.type === "party_invite") {
    await grantPartyMembership(row.party_id, row.recipient_player_id, row.recipient_player_id);
  } else if (row.type === "party_join_request") {
    const { data: approverMembership, error: approverError } = await supabase
      .from("party_members")
      .select("party_id, player_id, role")
      .eq("party_id", row.party_id)
      .eq("player_id", row.recipient_player_id)
      .maybeSingle();

    if (approverError) throw approverError;
    if (!approverMembership) {
      throw httpError(403, "You are not in that party anymore.");
    }

    await grantPartyMembership(row.party_id, row.sender_player_id, row.recipient_player_id);
  } else {
    throw httpError(400, "Unsupported interaction type.");
  }

  const { data, error } = await supabase
    .from(INTERACTIONS_TABLE)
    .update(patch)
    .eq("id", row.id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function declineInteraction(row) {
  const { data, error } = await supabase
    .from(INTERACTIONS_TABLE)
    .update({
      status: "declined",
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", row.id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function dismissInteraction(row) {
  const patch = {
    read_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (["declined", "expired", "pending"].includes(row.status)) {
    patch.status = "dismissed";
  }

  const { data, error } = await supabase
    .from(INTERACTIONS_TABLE)
    .update(patch)
    .eq("id", row.id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function expireInteraction(row) {
  const { data, error } = await supabase
    .from(INTERACTIONS_TABLE)
    .update({
      status: "expired",
      updated_at: new Date().toISOString()
    })
    .eq("id", row.id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const playerId = body.player_id || null;
    const interactionId = body.interaction_id || body.interactionId || null;
    const response = cleanText(body.response || body.action || "", 24).toLowerCase();

    await requireAccountSession(supabase, {
      playerId,
      sessionToken: body.session_token
    });

    if (!interactionId) throw httpError(400, "interaction_id is required");
    if (!["accept", "decline", "dismiss"].includes(response)) {
      throw httpError(400, "response must be accept, decline, or dismiss");
    }

    const row = await fetchInteraction(interactionId);
    const isSender = String(row.sender_player_id) === String(playerId);
    const isRecipient = String(row.recipient_player_id) === String(playerId);

    if (!isSender && !isRecipient) {
      throw httpError(403, "You are not part of this interaction.");
    }

    if (response !== "dismiss") {
      if (!isRecipient) {
        throw httpError(403, "Only the recipient can respond to this request.");
      }
      if (row.status !== "pending") {
        throw httpError(409, "This request was already handled.");
      }
      if (isExpired(row)) {
        const expired = await expireInteraction(row);
        return {
          statusCode: 410,
          body: JSON.stringify({
            error: "This request expired.",
            interaction: await decorate(expired, playerId)
          })
        };
      }
    }

    const interaction =
      response === "accept"
        ? await acceptInteraction(row)
        : response === "decline"
          ? await declineInteraction(row)
          : await dismissInteraction(row);

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
