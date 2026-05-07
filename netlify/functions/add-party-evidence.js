const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function (event) {
  try {
    const {
      party_id,
      player_id,
      draft_id,
      taxon,
      iconic_taxon,
      cell_key,
      lat,
      lng
    } = JSON.parse(event.body || "{}");

    if (!party_id) throw new Error("party_id is required");
    if (!player_id) throw new Error("player_id is required");
    if (!draft_id) throw new Error("draft_id is required");

    const { data, error } = await supabase
      .from("party_evidence")
      .upsert(
        {
          party_id,
          player_id,
          draft_id,
          taxon: taxon || "Observation",
          iconic_taxon: iconic_taxon || null,
          cell_key: cell_key || null,
          lat: Number.isFinite(Number(lat)) ? Number(lat) : null,
          lng: Number.isFinite(Number(lng)) ? Number(lng) : null,
          status: "counted"
        },
        { onConflict: "party_id,draft_id" }
      )
      .select("*")
      .single();

    if (error) throw error;

    await supabase.from("party_events").insert({
      party_id,
      player_id,
      event_type: "evidence_counted",
      payload: { taxon: taxon || "Observation" }
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ evidence: data })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};