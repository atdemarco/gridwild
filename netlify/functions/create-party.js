const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const {
      player_id,
      name,
      quest_id,
      mode = "live",
      visibility = "public",
      starts_at = null,
      duration_minutes = 60,
      target = 10,
      location_mode = "anywhere",
      location_user_id = null,
      location_label = null,
      location = null,
      resolved_location = null,
      lat = null,
      lng = null
    } = body;

    if (!player_id) throw new Error("player_id is required");

    const safeLocationMode = ["anywhere", "user", "location"].includes(location_mode)
      ? location_mode
      : "anywhere";

    const locationConfig = {
      locationMode: safeLocationMode,
      locationUserId: safeLocationMode === "user" ? (location_user_id || "self") : null,
      location: safeLocationMode === "location" ? location : null,
      resolvedLocation: resolved_location || null
    };

    const { data: party, error: partyError } = await supabase
      .from("parties")
      .insert({
        name: name || "New Party",
        created_by: player_id,
        visibility: visibility || "public",
        status: mode === "scheduled" ? "scheduled" : "active",
        starts_at: starts_at || null,
        duration_minutes: Number(duration_minutes || 60),
        target: Number(target || 10),
        location_mode: safeLocationMode,
        location_user_id: locationConfig.locationUserId,
        location_label: location_label || (
          safeLocationMode === "anywhere"
            ? "Anywhere"
            : location?.label || resolved_location?.label || null
        ),
        location_config: locationConfig,
        lat: Number.isFinite(Number(lat)) ? Number(lat) : null,
        lng: Number.isFinite(Number(lng)) ? Number(lng) : null
      })
      .select("*")
      .single();

    if (partyError) throw partyError;

    const { error: memberError } = await supabase
      .from("party_members")
      .insert({
        party_id: party.id,
        player_id,
        role: "leader"
      });

    if (memberError) throw memberError;

    await supabase.from("party_events").insert({
      party_id: party.id,
      player_id,
      event_type: "party_created",
      payload: { quest_id: quest_id || null }
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ party })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
