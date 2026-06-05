const {
  observationCoordinates,
  observationDate,
  observationLocalHour,
  taxonomyText
} = require("./_inat-authority");

async function recordVerifiedObservation(supabase, options = {}) {
  const observation = options.observation || {};
  const coordinates = observationCoordinates(observation);
  const observedAt = observationDate(observation);
  const now = new Date().toISOString();

  const { error: observationError } = await supabase
    .from("gridwild_verified_observations")
    .upsert({
      player_id: options.playerId,
      obs_id: String(observation.id),
      inat_user_id: Number(options.inatUser?.id),
      observed_at: observedAt?.toISOString() || null,
      observed_local_hour: observationLocalHour(observation),
      iconic_taxon: observation?.taxon?.iconic_taxon_name || null,
      taxon_name: observation?.taxon?.name || null,
      common_name: observation?.taxon?.preferred_common_name || observation?.species_guess || null,
      taxonomy_text: taxonomyText(observation, options.taxonContext),
      quality_grade: observation?.quality_grade || null,
      latitude: coordinates?.lat ?? null,
      longitude: coordinates?.lng ?? null,
      positional_accuracy: Number.isFinite(Number(observation?.positional_accuracy))
        ? Number(observation.positional_accuracy)
        : null,
      photo_count: Array.isArray(observation?.photos) ? observation.photos.length : 0,
      verified_at: now,
      updated_at: now
    }, {
      onConflict: "player_id,obs_id"
    });

  if (observationError) throw observationError;

  const { data, error } = await supabase.rpc("gridwild_refresh_verified_achievements", {
    p_player_id: options.playerId
  });
  if (error) throw error;
  return data || [];
}

async function getVerifiedAchievements(supabase, playerId) {
  const { data, error } = await supabase
    .from("gridwild_verified_achievements")
    .select("*")
    .eq("player_id", playerId)
    .order("achievement_id", { ascending: true });

  if (error) throw error;
  return data || [];
}

module.exports = {
  getVerifiedAchievements,
  recordVerifiedObservation
};
