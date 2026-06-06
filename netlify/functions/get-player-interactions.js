const { createClient } = require("@supabase/supabase-js");
const { accountTableHint, requireAccountSession } = require("./_gridwild-account-session");
const {
  BLOCKS_TABLE,
  INTERACTIONS_TABLE,
  decorateInteraction,
  fetchPartiesById,
  fetchPlayersById,
  interactionTableHint
} = require("./_player-interactions");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function tableHint(err) {
  return interactionTableHint({ message: accountTableHint(err) });
}

function isExpired(row) {
  const expiresAt = Date.parse(row?.expires_at || "");
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

async function markExpired(rows = []) {
  const expiredIds = rows.filter(isExpired).map((row) => row.id);
  if (!expiredIds.length) return;

  const { error } = await supabase
    .from(INTERACTIONS_TABLE)
    .update({
      status: "expired",
      updated_at: new Date().toISOString()
    })
    .in("id", expiredIds);

  if (error) throw error;
}

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const playerId = body.player_id || null;

    await requireAccountSession(supabase, {
      playerId,
      sessionToken: body.session_token
    });

    const [
      pendingResult,
      declinedSentResult,
      conversationsSentResult,
      conversationsReceivedResult,
      blocksResult
    ] = await Promise.all([
      supabase
        .from(INTERACTIONS_TABLE)
        .select("*")
        .eq("recipient_player_id", playerId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from(INTERACTIONS_TABLE)
        .select("*")
        .eq("sender_player_id", playerId)
        .eq("status", "declined")
        .order("updated_at", { ascending: false })
        .limit(10),
      supabase
        .from(INTERACTIONS_TABLE)
        .select("*")
        .eq("type", "chat_request")
        .eq("status", "accepted")
        .eq("sender_player_id", playerId)
        .order("updated_at", { ascending: false })
        .limit(30),
      supabase
        .from(INTERACTIONS_TABLE)
        .select("*")
        .eq("type", "chat_request")
        .eq("status", "accepted")
        .eq("recipient_player_id", playerId)
        .order("updated_at", { ascending: false })
        .limit(30),
      supabase
        .from(BLOCKS_TABLE)
        .select("*")
        .eq("blocker_player_id", playerId)
        .order("created_at", { ascending: false })
    ]);

    [
      pendingResult,
      declinedSentResult,
      conversationsSentResult,
      conversationsReceivedResult,
      blocksResult
    ].forEach((result) => {
      if (result.error) throw result.error;
    });

    const pendingRows = pendingResult.data || [];
    await markExpired(pendingRows);

    const activePendingRows = pendingRows.filter((row) => !isExpired(row));
    const declinedRows = declinedSentResult.data || [];
    const conversationRows = [
      ...(conversationsSentResult.data || []),
      ...(conversationsReceivedResult.data || [])
    ].sort(
      (a, b) =>
        Date.parse(b.updated_at || b.created_at || "") -
        Date.parse(a.updated_at || a.created_at || "")
    );
    const blockRows = blocksResult.data || [];

    const allRows = [...activePendingRows, ...declinedRows, ...conversationRows];
    const playerIds = [
      ...allRows.flatMap((row) => [row.sender_player_id, row.recipient_player_id]),
      ...blockRows.map((row) => row.blocked_player_id)
    ];
    const partyIds = allRows.map((row) => row.party_id).filter(Boolean);
    const [playersById, partiesById] = await Promise.all([
      fetchPlayersById(supabase, playerIds),
      fetchPartiesById(supabase, partyIds)
    ]);
    const maps = { playersById, partiesById };

    return {
      statusCode: 200,
      body: JSON.stringify({
        notifications: [
          ...activePendingRows.map((row) => decorateInteraction(row, maps, playerId)),
          ...declinedRows.map((row) => decorateInteraction(row, maps, playerId))
        ],
        conversations: conversationRows.map((row) => decorateInteraction(row, maps, playerId)),
        blocks: blockRows.map((row) => ({
          ...row,
          blocked_player: playersById.get(String(row.blocked_player_id)) || null
        }))
      })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: tableHint(err) })
    };
  }
};
