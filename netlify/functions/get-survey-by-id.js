const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function(event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { player_id, survey_id } = body;

    if (!survey_id) throw new Error("survey_id required");

    const { data: survey, error } = await supabase
      .from("surveys")
      .select("*")
      .eq("id", survey_id)
      .maybeSingle();

    if (error) throw error;
    if (!survey) throw new Error("survey not found");

    const isOwner = !!player_id && survey.owner_player_id === player_id;
    const isLinkVisible =
      survey.public_mode === "public" ||
      survey.public_mode === "unlisted";

    if (!isOwner && !isLinkVisible) {
      throw new Error("survey not available");
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ survey })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
