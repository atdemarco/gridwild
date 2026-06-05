const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest, httpError } = require("./_gridwild-player-session");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function(event) {
  try {
    await authorizePlayerRequest(supabase, event);

    const body = JSON.parse(event.body || "{}");

    const {
      player_id,
      survey_id,
      joined,
      visible
    } = body;

    if (!player_id) throw new Error("player_id required");
    if (!survey_id) throw new Error("survey_id required");

    const { data: survey, error: surveyError } = await supabase
      .from("surveys")
      .select("id, owner_player_id, public_mode")
      .eq("id", survey_id)
      .maybeSingle();

    if (surveyError) throw surveyError;
    if (!survey) throw httpError(404, "Survey not found.");
    if (
      survey.owner_player_id !== player_id &&
      !["public", "unlisted"].includes(survey.public_mode)
    ) {
      throw httpError(403, "This survey is private.");
    }

    const patch = {
      player_id,
      survey_id,
      updated_at: new Date().toISOString()
    };

    if (joined !== undefined) {
      patch.joined = !!joined;

      if (joined) {
        patch.joined_at = new Date().toISOString();
      }
    }

    if (visible !== undefined) {
      patch.visible = !!visible;
    }

    const { data, error } = await supabase
      .from("player_surveys")
      .upsert(patch, {
        onConflict: "player_id,survey_id"
      })
      .select("*")
      .single();

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({
        player_survey: data
      })
    };

  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({
        error: err.message
      })
    };
  }
};
