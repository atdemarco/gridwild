const { createClient } = require("@supabase/supabase-js");
const { accountTableHint, requireAccountSession } = require("./_gridwild-account-session");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function isMissingOptionalTable(err) {
  const message = String(err?.message || "");
  return err?.code === "42P01" || message.includes("schema cache");
}

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const playerId = body.player_id || null;
    const targetPlayerId = body.target_player_id || null;

    await requireAccountSession(supabase, {
      playerId,
      sessionToken: body.session_token
    });

    if (!targetPlayerId) throw new Error("target_player_id is required");

    const [
      playerResult,
      equipmentResult,
      completedQuestsResult,
      partiesResult,
      achievementsResult
    ] = await Promise.all([
      supabase
        .from("players")
        .select("id, display_name, archetype, icon, color, wildpoints")
        .eq("id", targetPlayerId)
        .maybeSingle(),
      supabase
        .from("player_equipment")
        .select("*")
        .eq("player_id", targetPlayerId)
        .maybeSingle(),
      supabase
        .from("player_quests")
        .select("quest_id", { count: "exact", head: true })
        .eq("player_id", targetPlayerId)
        .in("status", ["completed", "archived"]),
      supabase
        .from("party_members")
        .select("party_id", { count: "exact", head: true })
        .eq("player_id", targetPlayerId),
      supabase
        .from("gridwild_verified_achievements")
        .select("achievement_id", { count: "exact", head: true })
        .eq("player_id", targetPlayerId)
        .eq("unlocked", true)
    ]);

    if (playerResult.error) throw playerResult.error;
    if (!playerResult.data) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Player not found." })
      };
    }
    if (equipmentResult.error) throw equipmentResult.error;
    if (completedQuestsResult.error) throw completedQuestsResult.error;
    if (partiesResult.error) throw partiesResult.error;
    if (achievementsResult.error) throw achievementsResult.error;

    let homeNicheId = null;
    let homeNiche = null;
    const homeNicheResult = await supabase
      .from("local_niche_stewards")
      .select("niche_id")
      .eq("user_id", targetPlayerId)
      .maybeSingle();

    if (homeNicheResult.error) {
      if (!isMissingOptionalTable(homeNicheResult.error)) throw homeNicheResult.error;
    } else {
      homeNicheId = homeNicheResult.data?.niche_id || null;
    }

    if (homeNicheId) {
      const homeNicheDetailResult = await supabase
        .from("local_niches")
        .select("id, title, short_title, theme, primary_place_label, niche_type, scale_level")
        .eq("id", homeNicheId)
        .maybeSingle();

      if (homeNicheDetailResult.error) {
        if (!isMissingOptionalTable(homeNicheDetailResult.error)) throw homeNicheDetailResult.error;
      } else {
        homeNiche = homeNicheDetailResult.data || null;
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        player: playerResult.data,
        equipment: equipmentResult.data || null,
        home_niche_id: homeNicheId,
        home_niche: homeNiche,
        stats: {
          wildpoints: Number(playerResult.data.wildpoints || 0),
          quests_completed: Number(completedQuestsResult.count || 0),
          parties_joined: Number(partiesResult.count || 0),
          achievements_unlocked: Number(achievementsResult.count || 0)
        }
      })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: accountTableHint(err) })
    };
  }
};
