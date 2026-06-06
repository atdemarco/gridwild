const { createClient } = require("@supabase/supabase-js");
const { accountTableHint, requireAccountSession } = require("./_gridwild-account-session");

const PRESENCE_TABLE = "player_presence";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function tableHint(err) {
  const message = accountTableHint(err);
  if (message.includes(PRESENCE_TABLE) || message.includes("schema cache")) {
    return `${message}. Run netlify/schema/player_presence.sql in Supabase first.`;
  }
  return message;
}

function cleanVisibility(value) {
  return value === "visible" ? "visible" : "hidden";
}

function cleanStatus(value) {
  return value === "online" ? "online" : "offline";
}

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const playerId = body.player_id || null;

    await requireAccountSession(supabase, {
      playerId,
      sessionToken: body.session_token
    });

    const visibility = cleanVisibility(body.visibility);
    const status = visibility === "hidden" ? "offline" : cleanStatus(body.status || "online");
    const now = new Date().toISOString();
    const patch = {
      player_id: playerId,
      visibility,
      status
    };

    if (visibility === "visible" && status === "online") {
      const lat = Number(body.lat);
      const lng = Number(body.lng);

      if (!Number.isFinite(lat)) throw new Error("lat is required");
      if (!Number.isFinite(lng)) throw new Error("lng is required");

      patch.lat = lat;
      patch.lng = lng;
      patch.accuracy_meters = Number.isFinite(Number(body.accuracy_meters))
        ? Number(body.accuracy_meters)
        : null;
      patch.heading = Number.isFinite(Number(body.heading)) ? Number(body.heading) : null;
      patch.last_seen_at = now;
      patch.last_logout_at = null;
    } else {
      patch.last_logout_at = now;
    }

    const { data, error } = await supabase
      .from(PRESENCE_TABLE)
      .upsert(patch, { onConflict: "player_id" })
      .select("*")
      .single();

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({ presence: data })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: tableHint(err) })
    };
  }
};
