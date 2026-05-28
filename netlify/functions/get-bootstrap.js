const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");
    let playerId = body.player_id || null;

    let player = null;

    if (playerId) {
      const result = await supabase
        .from("players")
        .select("*")
        .eq("id", playerId)
        .maybeSingle();

      if (result.error) throw result.error;
      player = result.data;
    }

    if (!player) {
      const result = await supabase
        .from("players")
        .insert({ display_name: "New Explorer" })
        .select("*")
        .single();

      if (result.error) throw result.error;
      player = result.data;
    }

    const questsResult = await supabase
      .from("quests")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (questsResult.error) throw questsResult.error;

    const playerQuestsResult = await supabase
    .from("player_quests")
    .select("*")
    .eq("player_id", player.id);

    if (playerQuestsResult.error) throw playerQuestsResult.error;

    const playerQuestByQuestId = new Map(
    (playerQuestsResult.data || []).map(pq => [pq.quest_id, pq])
    );

    const questsWithStatus = (questsResult.data || []).map(q => {
    const pq = playerQuestByQuestId.get(q.id);

    return {
        ...q,
        status: pq?.status || "available",
        accepted_at: pq?.accepted_at || null,
        completed_at: pq?.completed_at || null
    };
    }).filter(q => q.status !== "abandoned");

    const stateResult = await supabase
      .from("player_state")
      .select("*")
      .eq("player_id", player.id)
      .maybeSingle();

    if (stateResult.error) throw stateResult.error;

    const inventoryResult = await supabase
    .from("player_inventory")
    .select("*")
    .eq("player_id", player.id);

    if (inventoryResult.error) throw inventoryResult.error;

    const equipmentResult = await supabase
    .from("player_equipment")
    .select("*")
    .eq("player_id", player.id)
    .maybeSingle();

    if (equipmentResult.error) throw equipmentResult.error;

    const achievementsResult = await supabase
      .from("player_achievements")
      .select("*")
      .eq("player_id", player.id);

    if (achievementsResult.error) throw achievementsResult.error;

    let identificationClaims = [];
    const identificationClaimsResult = await supabase
      .from("identification_claims")
      .select("*")
      .eq("player_id", player.id)
      .order("claimed_at", { ascending: false })
      .limit(200);

    if (identificationClaimsResult.error) {
      if (
        identificationClaimsResult.error.code !== "42P01" &&
        !String(identificationClaimsResult.error.message || "").includes("schema cache")
      ) {
        throw identificationClaimsResult.error;
      }
    } else {
      identificationClaims = identificationClaimsResult.data || [];
    }

    let playerPresence = null;
    const presenceResult = await supabase
      .from("player_presence")
      .select("*")
      .eq("player_id", player.id)
      .maybeSingle();

    if (presenceResult.error) {
      if (
        presenceResult.error.code !== "42P01" &&
        !String(presenceResult.error.message || "").includes("schema cache")
      ) {
        throw presenceResult.error;
      }
    } else {
      playerPresence = presenceResult.data || null;
    }

    let homeNicheId = null;
    let homeNiche = null;
    const homeNicheResult = await supabase
      .from("local_niche_stewards")
      .select("niche_id")
      .eq("user_id", player.id)
      .maybeSingle();

    if (homeNicheResult.error) {
      if (homeNicheResult.error.code !== "42P01") throw homeNicheResult.error;
    } else {
      homeNicheId = homeNicheResult.data?.niche_id || null;
    }

    if (homeNicheId) {
      const homeNicheDetailResult = await supabase
        .from("local_niches")
        .select("id, title, short_title, theme, primary_place_label")
        .eq("id", homeNicheId)
        .maybeSingle();

      if (homeNicheDetailResult.error) throw homeNicheDetailResult.error;
      homeNiche = homeNicheDetailResult.data || null;
    }

  const publicSurveysResult = await supabase
    .from("surveys")
    .select("*")
    .eq("public_mode", "public")
    .order("updated_at", { ascending: false });

  if (publicSurveysResult.error) throw publicSurveysResult.error;

  const ownedSurveysResult = await supabase
    .from("surveys")
    .select("*")
    .eq("owner_player_id", player.id)
    .order("updated_at", { ascending: false });

  if (ownedSurveysResult.error) throw ownedSurveysResult.error;

  const surveysById = new Map();
  [
    ...(ownedSurveysResult.data || []),
    ...(publicSurveysResult.data || [])
  ].forEach(survey => {
    surveysById.set(survey.id, survey);
  });

  const surveys = [...surveysById.values()]
    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));

  const playerSurveysResult = await supabase
    .from("player_surveys")
    .select("*")
    .eq("player_id", player.id);

  if (playerSurveysResult.error) throw playerSurveysResult.error;



    return {
      statusCode: 200,
      body: JSON.stringify({
        player,
        quests: questsWithStatus,
        state: stateResult.data || null,
        player_inventory: inventoryResult.data || [],
        player_equipment: equipmentResult.data || null,
        player_achievements: achievementsResult.data || [],
        identification_claims: identificationClaims,
        player_presence: playerPresence,
        home_niche_id: homeNicheId,
        home_niche: homeNiche,
        surveys,
        player_surveys: playerSurveysResult.data || []
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
