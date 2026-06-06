const { createClient } = require("@supabase/supabase-js");
const { accountTableHint, requireAccountSession } = require("./_gridwild-account-session");
const { requireChatRoomAccess } = require("./_chat-room-access");
const { interactionTableHint } = require("./_player-interactions");

const CHAT_TABLE = "chat_messages";
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

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

function cleanText(value, maxLength) {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}

function cleanCoordinate(value, min, max) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function normalizeSharePayload(payload = {}) {
  const allowedKinds = new Set(["wildlist", "niche", "identification"]);
  const kind = cleanText(payload.kind, 32).toLowerCase();
  if (!allowedKinds.has(kind)) {
    throw httpError(400, "A valid shared item type is required.");
  }

  const title = cleanText(payload.title, 180);
  if (!title) throw httpError(400, "A shared item title is required.");

  const count = payload.count == null || payload.count === "" ? null : Number(payload.count);
  return {
    kind,
    id: cleanText(payload.id, 180) || null,
    source: cleanText(payload.source, 48) || null,
    title,
    subtitle: cleanText(payload.subtitle, 240) || null,
    count: Number.isFinite(count) ? Math.max(0, Math.round(count)) : null,
    lat: cleanCoordinate(payload.lat, -90, 90),
    lng: cleanCoordinate(payload.lng, -180, 180)
  };
}

function normalizeMessage(body) {
  const supportedTypes = new Set(["text", "location", "share"]);
  const requestedType = cleanText(body.message_type, 24);
  const messageType = supportedTypes.has(requestedType) ? requestedType : "text";
  const text = String(body.body || "")
    .trim()
    .slice(0, 500);

  if (messageType === "text") {
    if (!text) throw httpError(400, "Message text is required.");
    return {
      message_type: "text",
      body: text,
      payload: {}
    };
  }

  if (messageType === "share") {
    const payload = normalizeSharePayload(body.payload);
    return {
      message_type: "share",
      body: text || payload.title,
      payload
    };
  }

  const lat = Number(body.payload?.lat);
  const lng = Number(body.payload?.lng);
  const accuracyValue = body.payload?.accuracy_meters;
  const accuracyMeters = accuracyValue == null ? null : Number(accuracyValue);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw httpError(400, "A valid location latitude is required.");
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw httpError(400, "A valid location longitude is required.");
  }

  return {
    message_type: "location",
    body: text || "Shared location",
    payload: {
      lat,
      lng,
      accuracy_meters: Number.isFinite(accuracyMeters) ? accuracyMeters : null
    }
  };
}

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const playerId = body.player_id || null;
    const roomType = String(body.room_type || "").trim();
    const roomId = body.room_id || null;

    await requireAccountSession(supabase, {
      playerId,
      sessionToken: body.session_token
    });
    await requireChatRoomAccess(supabase, {
      roomType,
      roomId,
      playerId,
      write: true
    });

    const message = normalizeMessage(body);
    const { data, error } = await supabase
      .from(CHAT_TABLE)
      .insert({
        room_type: roomType,
        room_id: roomId,
        sender_player_id: playerId,
        ...message
      })
      .select("id, room_type, room_id, sender_player_id, message_type, body, payload, created_at")
      .single();

    if (error) throw error;

    const { data: sender, error: senderError } = await supabase
      .from("players")
      .select("id, display_name, archetype, icon, color")
      .eq("id", playerId)
      .maybeSingle();

    if (senderError) throw senderError;

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: {
          ...data,
          sender: sender || null
        }
      })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: tableHint(err) })
    };
  }
};
