const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function(event) {
  try {
    const body = JSON.parse(event.body || "{}");

    const {
      player_id,
      survey
    } = body;

    if (!player_id) throw new Error("player_id required");
    if (!survey?.id) throw new Error("survey.id required");

    const row = {
      id: survey.id,
      owner_player_id: player_id,
      name: survey.name || "Untitled Survey",
      description: survey.description || "",
      time_range: survey.timeRange || "permanent",
      target_taxon: survey.targetTaxon || "Any",
      public_mode: survey.publicMode || "private",
      survey_json: survey,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from("surveys")
      .upsert(row)
      .select("*")
      .single();

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({
        survey: data
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message
      })
    };
  }
};