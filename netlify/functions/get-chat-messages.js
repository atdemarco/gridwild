const { createClient } = require("@supabase/supabase-js");
const { accountTableHint, requireAccountSession } = require("./_gridwild-account-session");
const { requireChatRoomAccess } = require("./_chat-room-access");
const { interactionTableHint } = require("./_player-interactions");

const CHAT_TABLE = "chat_messages";
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function tableHint(err) {
  const message = accountTableHint(err);
  if (message.includes("player_interactions") || message.includes("player_blocks")) {
    return interactionTableHint({ message });
  }
  if (message.includes(CHAT_TABLE) || message.includes("schema cache")) {
    return `${message}. Run netlify/schema/chat_messages.sql in Supabase first.`;
  }
  return message;
}

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const playerId = body.player_id || null;
    const roomType = String(body.room_type || "").trim();
    const roomId = body.room_id || null;
    const limit = Math.max(1, Math.min(100, Number(body.limit) || 60));

    await requireAccountSession(supabase, {
      playerId,
      sessionToken: body.session_token
    });
    await requireChatRoomAccess(supabase, {
      roomType,
      roomId,
      playerId,
      write: false
    });

    const { data: rows, error } = await supabase
      .from(CHAT_TABLE)
      .select("id, room_type, room_id, sender_player_id, message_type, body, payload, created_at")
      .eq("room_type", roomType)
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    const playerIds = [...new Set((rows || []).map(row => row.sender_player_id).filter(Boolean))];
    let playersById = new Map();

    if (playerIds.length) {
      const { data: players, error: playersError } = await supabase
        .from("players")
        .select("id, display_name, archetype, icon, color")
        .in("id", playerIds);

      if (playersError) throw playersError;
      playersById = new Map((players || []).map(player => [player.id, player]));
    }

    const messages = (rows || [])
      .reverse()
      .map(row => ({
        ...row,
        sender: playersById.get(row.sender_player_id) || null
      }));

    return {
      statusCode: 200,
      body: JSON.stringify({ messages })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: tableHint(err) })
    };
  }
};
