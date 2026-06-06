const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async function (event) {
  try {
    await authorizePlayerRequest(supabase, event);
    const body = JSON.parse(event.body || "{}");
    const playerId = body.player_id || null;

    const { data: publicSurveys, error: publicError } = await supabase
      .from("surveys")
      .select("*")
      .eq("public_mode", "public")
      .order("updated_at", { ascending: false });

    if (publicError) throw publicError;

    let surveys = publicSurveys || [];

    if (playerId) {
      const { data: ownedSurveys, error: ownedError } = await supabase
        .from("surveys")
        .select("*")
        .eq("owner_player_id", playerId)
        .order("updated_at", { ascending: false });

      if (ownedError) throw ownedError;

      const byId = new Map();
      [...(ownedSurveys || []), ...surveys].forEach((survey) => {
        byId.set(survey.id, survey);
      });

      surveys = [...byId.values()].sort((a, b) =>
        String(b.updated_at || "").localeCompare(String(a.updated_at || ""))
      );
    }

    let playerSurveys = [];
    if (playerId) {
      const { data, error } = await supabase
        .from("player_surveys")
        .select("*")
        .eq("player_id", playerId);

      if (error) throw error;
      playerSurveys = data || [];
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        surveys,
        player_surveys: playerSurveys
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
