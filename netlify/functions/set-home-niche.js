const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

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
    const { player_id, niche_id } = body;

    if (!player_id) throw new Error("player_id is required");
    if (!niche_id) throw new Error("niche_id is required");

    const { data: player, error: playerError } = await supabase
      .from("players")
      .select("id")
      .eq("id", player_id)
      .maybeSingle();

    if (playerError) throw playerError;
    if (!player) throw new Error("player not found");

    const { data: niche, error: nicheError } = await supabase
      .from("local_niches")
      .select(
        "id, title, short_title, theme, primary_place_label, centroid_lat, centroid_lng, radius_m, grid_cell_ids"
      )
      .eq("id", niche_id)
      .maybeSingle();

    if (nicheError) throw nicheError;
    if (!niche) throw new Error("niche not found");

    const { data: stewardship, error } = await supabase
      .from("local_niche_stewards")
      .upsert(
        {
          user_id: player_id,
          niche_id,
          stewardship_type: "home",
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      )
      .select("*")
      .single();

    if (error) throw error;

    const homeUsers = await loadHomeUsers(niche_id);

    return {
      statusCode: 200,
      body: JSON.stringify({
        home_niche_id: niche_id,
        home_niche: niche,
        stewardship,
        home_users: homeUsers
      })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
