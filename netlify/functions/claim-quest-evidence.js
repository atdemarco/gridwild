const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");
const { requireStartedQuest } = require("./_quest-access");
const {
  assertOwnedObservation,
  fetchINatObservation,
  fetchINatTaxonContext,
  observationCoordinates,
  requireLinkedINatUser
} = require("./_inat-authority");
const { assertObservationQualifiesForQuest } = require("./_quest-authority");
const { recordVerifiedObservation } = require("./_achievement-authority");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async function (event) {
  try {
    await authorizePlayerRequest(supabase, event);
    const body = JSON.parse(event.body || "{}");
    const { player_id, quest_id, obs_id } = body;

    if (!player_id) throw new Error("player_id is required");
    if (!quest_id) throw new Error("quest_id is required");
    if (!obs_id) throw new Error("obs_id is required");

    const { quest } = await requireStartedQuest(supabase, player_id, quest_id);
    const inat = await requireLinkedINatUser(supabase, event, player_id);
    const observation = await fetchINatObservation(inat.apiToken, obs_id);
    assertOwnedObservation(observation, inat.user);
    assertObservationQualifiesForQuest(observation, quest);

    const taxonContext = await fetchINatTaxonContext(inat.apiToken, observation);
    const verifiedAchievements = await recordVerifiedObservation(supabase, {
      playerId: player_id,
      inatUser: inat.user,
      observation,
      taxonContext
    });
    const coordinates = observationCoordinates(observation);
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("quest_evidence")
      .upsert(
        {
          player_id,
          quest_id,
          obs_id: String(observation.id),
          source: "inat_observation",
          status: "verified",
          claimed_at: now,
          evidence_type: "observation",
          target_type: "observation",
          target_id: String(observation.id),
          external_id: String(observation.id),
          verification_status: "verified",
          payload: {
            verified_at: now,
            inat_user_id: Number(inat.user.id),
            observation_uri: observation.uri || null,
            iconic_taxon: observation?.taxon?.iconic_taxon_name || null,
            taxon_name: observation?.taxon?.name || null,
            quality_grade: observation?.quality_grade || null,
            positional_accuracy: Number(observation?.positional_accuracy) || null,
            photo_count: Array.isArray(observation?.photos) ? observation.photos.length : 0,
            lat: coordinates?.lat ?? null,
            lng: coordinates?.lng ?? null
          }
        },
        {
          onConflict: "player_id,quest_id,obs_id"
        }
      )
      .select("*")
      .single();

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({
        evidence: data,
        verified_achievements: verifiedAchievements
      })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
