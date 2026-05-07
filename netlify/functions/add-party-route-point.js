const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { player_id, party_id, lat, lng, accuracy_meters } = body;

    if (!player_id) throw new Error("player_id is required");
    if (!party_id) throw new Error("party_id is required");

    const latNum = Number(lat);
    const lngNum = Number(lng);

    if (!Number.isFinite(latNum)) throw new Error("lat is required");
    if (!Number.isFinite(lngNum)) throw new Error("lng is required");

    const { data, error } = await supabase
      .from("party_route_points")
      .insert({
        player_id,
        party_id,
        lat: latNum,
        lng: lngNum,
        accuracy_meters: Number.isFinite(Number(accuracy_meters))
          ? Number(accuracy_meters)
          : null
      })
      .select("*")
      .single();

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({ point: data })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};