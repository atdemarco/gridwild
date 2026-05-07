const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function(event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { player_id, survey_id } = body;

    if (!player_id) throw new Error("player_id required");
    if (!survey_id) throw new Error("survey_id required");

    const { data: survey, error: surveyError } = await supabase
      .from("surveys")
      .select("id, owner_player_id")
      .eq("id", survey_id)
      .maybeSingle();

    if (surveyError) throw surveyError;
    if (!survey) throw new Error("survey not found");

    if (survey.owner_player_id && survey.owner_player_id !== player_id) {
      throw new Error("only the survey owner can delete this survey");
    }

    const { error } = await supabase
      .from("surveys")
      .delete()
      .eq("id", survey_id);

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, survey_id })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};