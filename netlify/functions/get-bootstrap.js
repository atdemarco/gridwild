const { createClient } = require("@supabase/supabase-js");
const { createGuestSession, requirePlayerSession } = require("./_gridwild-player-session");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");
    let playerId = body.player_id || null;
    let player = null;
    let playerSession = null;

    if (playerId && body.session_token) {
      await requirePlayerSession(supabase, {
        playerId,
        sessionToken: body.session_token
      });

      const result = await supabase.from("players").select("*").eq("id", playerId).maybeSingle();

      if (result.error) throw result.error;
      player = result.data;
    } else {
      // Legacy guest IDs had no proof of ownership and cannot be trusted.
      playerId = null;
    }

    if (!player) {
      const result = await supabase
        .from("players")
        .insert({ display_name: "New Explorer" })
        .select("*")
        .single();

      if (result.error) throw result.error;
      player = result.data;
      playerSession = await createGuestSession(supabase, player.id);
    }

    const stateResult = await supabase
      .from("player_state")
      .select("*")
      .eq("player_id", player.id)
      .maybeSingle();

    if (stateResult.error) throw stateResult.error;

    return {
      statusCode: 200,
      body: JSON.stringify({
        player,
        player_session: playerSession,
        state: stateResult.data || null,
        deferred: {
          quests: true,
          player_details: true,
          surveys: true,
          party: true
        }
      })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
