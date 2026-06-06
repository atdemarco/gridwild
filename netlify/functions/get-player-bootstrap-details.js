const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function isMissingOptionalTable(err) {
  const message = String(err?.message || "");
  return err?.code === "42P01" || message.includes("schema cache");
}

async function optionalQuery(query, fallback) {
  const result = await query;
  if (result.error) {
    if (isMissingOptionalTable(result.error)) return fallback;
    throw result.error;
  }
  return result.data ?? fallback;
}

exports.handler = async function (event) {
  try {
    await authorizePlayerRequest(supabase, event);
    const body = JSON.parse(event.body || "{}");
    const { player_id } = body;

    if (!player_id) throw new Error("player_id is required");

    const [inventory, equipment, achievements, identificationClaims, playerPresence, homeSteward] =
      await Promise.all([
        optionalQuery(supabase.from("player_inventory").select("*").eq("player_id", player_id), []),
        optionalQuery(
          supabase.from("player_equipment").select("*").eq("player_id", player_id).maybeSingle(),
          null
        ),
        optionalQuery(
          supabase.from("gridwild_verified_achievements").select("*").eq("player_id", player_id),
          []
        ),
        optionalQuery(
          supabase
            .from("identification_claims")
            .select("*")
            .eq("player_id", player_id)
            .order("claimed_at", { ascending: false })
            .limit(200),
          []
        ),
        optionalQuery(
          supabase.from("player_presence").select("*").eq("player_id", player_id).maybeSingle(),
          null
        ),
        optionalQuery(
          supabase
            .from("local_niche_stewards")
            .select("niche_id")
            .eq("user_id", player_id)
            .maybeSingle(),
          null
        )
      ]);

    const homeNicheId = homeSteward?.niche_id || null;
    let homeNiche = null;

    if (homeNicheId) {
      homeNiche = await optionalQuery(
        supabase
          .from("local_niches")
          .select("id, title, short_title, theme, primary_place_label")
          .eq("id", homeNicheId)
          .maybeSingle(),
        null
      );
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        player_inventory: inventory || [],
        player_equipment: equipment || null,
        player_achievements: achievements || [],
        identification_claims: identificationClaims || [],
        player_presence: playerPresence || null,
        home_niche_id: homeNicheId,
        home_niche: homeNiche
      })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
