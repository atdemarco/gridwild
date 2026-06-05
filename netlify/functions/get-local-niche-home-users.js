const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function loadHomeUsers(nicheId) {
  const { data: stewardRows, error: stewardError } = await supabase
    .from("local_niche_stewards")
    .select("user_id, created_at")
    .eq("niche_id", nicheId)
    .order("created_at", { ascending: true })
    .limit(50);

  if (stewardError) throw stewardError;

  const userIds = (stewardRows || []).map((row) => row.user_id).filter(Boolean);
  if (!userIds.length) return [];

  const { data: players, error: playerError } = await supabase
    .from("players")
    .select("id, display_name, icon, color")
    .in("id", userIds);

  if (playerError) throw playerError;

  const playersById = new Map((players || []).map((player) => [player.id, player]));

  return (stewardRows || []).map((row) => {
    const player = playersById.get(row.user_id) || {};
    return {
      user_id: row.user_id,
      display_name: player.display_name || "GridWild Steward",
      icon: player.icon || null,
      color: player.color || null,
      stewarded_at: row.created_at
    };
  });
}

exports.handler = async function (event) {
  try {
    await authorizePlayerRequest(supabase, event);
    const body = JSON.parse(event.body || "{}");
    const { niche_id } = body;
    if (!niche_id) throw new Error("niche_id is required");

    const homeUsers = await loadHomeUsers(niche_id);

    return {
      statusCode: 200,
      body: JSON.stringify({ home_users: homeUsers })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
