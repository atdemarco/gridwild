const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async function (event) {
  try {
    await authorizePlayerRequest(supabase, event);
    const body = JSON.parse(event.body || "{}");
    const { player_id } = body;

    if (!player_id) throw new Error("player_id is required");

    const { data, error } = await supabase
      .from("quests")
      .select(
        `
  *,
  player_quests (
    id,
    player_id,
    status,
    accepted_at,
    completed_at,
    rewarded_at
  ),
  quest_evidence (
    id,
    player_id,
    quest_id,
    obs_id,
    source,
    status,
    claimed_at,
    evidence_type,
    target_type,
    target_id,
    external_id,
    confidence,
    verification_status,
    payload
  )
`
      )
      .eq("is_active", true)
      .eq("created_by", player_id)
      .eq("player_quests.player_id", player_id)
      .eq("quest_evidence.player_id", player_id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({ quests: data || [] })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
