const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");
const { buildNicheDisplayTitle, clampNumber } = require("./_local-niche-utils");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ALLOWED_TYPES = new Set([
  "high_richness_hotspot",
  "under_sampled_nearby_opportunity",
  "seasonal_hotspot",
  "taxon_specific_hotspot",
  "recently_stale_hotspot",
  "edge_habitat_niche",
  "community_user_commented_niche"
]);

function cleanString(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function cleanNiche(raw, playerId) {
  const centroidLat = Number(raw.centroid_lat);
  const centroidLng = Number(raw.centroid_lng);
  if (!Number.isFinite(centroidLat) || !Number.isFinite(centroidLng)) return null;

  const placeContext = raw.place_context && typeof raw.place_context === "object"
    ? raw.place_context
    : {};
  const nicheType = ALLOWED_TYPES.has(raw.niche_type)
    ? raw.niche_type
    : "under_sampled_nearby_opportunity";
  const title = cleanString(raw.title, 160) || buildNicheDisplayTitle({
    ...raw,
    niche_type: nicheType,
    place_context: placeContext
  });

  return {
    source_key: cleanString(raw.source_key, 220) || null,
    title,
    short_title: cleanString(raw.short_title || title, 90),
    description: cleanString(raw.description, 900) || null,
    niche_type: nicheType,
    theme: cleanString(raw.theme, 90) || null,
    centroid_lat: centroidLat,
    centroid_lng: centroidLng,
    geometry: raw.geometry && typeof raw.geometry === "object" ? raw.geometry : null,
    grid_cell_ids: Array.isArray(raw.grid_cell_ids)
      ? raw.grid_cell_ids.map((id) => cleanString(id, 60)).filter(Boolean).slice(0, 3000)
      : [],
    radius_m: Math.round(clampNumber(raw.radius_m, 10, 800, 90)),
    scale_level: cleanString(raw.scale_level, 40) || "walking-radius",
    taxon_focus: raw.taxon_focus && typeof raw.taxon_focus === "object" ? raw.taxon_focus : null,
    seasonal_profile: raw.seasonal_profile && typeof raw.seasonal_profile === "object" ? raw.seasonal_profile : null,
    evidence_summary: raw.evidence_summary && typeof raw.evidence_summary === "object" ? raw.evidence_summary : {},
    metrics: raw.metrics && typeof raw.metrics === "object" ? raw.metrics : {},
    confidence: clampNumber(raw.confidence, 0, 1, 0),
    novelty_score: clampNumber(raw.novelty_score, 0, 1, 0),
    sampling_need_score: clampNumber(raw.sampling_need_score, 0, 1, 0),
    biodiversity_score: clampNumber(raw.biodiversity_score, 0, 1, 0),
    questability_score: clampNumber(raw.questability_score, 0, 1, 0),
    place_context: placeContext,
    primary_place_label: cleanString(raw.primary_place_label || placeContext.primary_label, 120) || null,
    secondary_place_label: cleanString(raw.secondary_place_label || placeContext.secondary_label, 120) || null,
    place_label_confidence: clampNumber(raw.place_label_confidence ?? placeContext.label_confidence, 0, 1, 0),
    generated_by: cleanString(raw.generated_by, 80) || "gridwild_local_niche_generator_v1",
    created_by_user_id: playerId || null,
    visibility: cleanString(raw.visibility, 20) || "public",
    status: cleanString(raw.status, 24) || "active"
  };
}

exports.handler = async function (event) {
  try {
    await authorizePlayerRequest(supabase, event);
    const body = JSON.parse(event.body || "{}");
    const playerId = body.player_id || null;
    const incoming = Array.isArray(body.niches) ? body.niches : [];
    if (!incoming.length) throw new Error("niches array is required");

    const rows = incoming
      .map((row) => cleanNiche(row, playerId))
      .filter(Boolean)
      .slice(0, 50);

    if (!rows.length) throw new Error("no valid niches provided");

    const keyed = rows.filter((row) => row.source_key);
    const unkeyed = rows.filter((row) => !row.source_key);
    const saved = [];

    if (keyed.length) {
      const { data, error } = await supabase
        .from("local_niches")
        .upsert(keyed, { onConflict: "source_key" })
        .select("*");
      if (error) throw error;
      saved.push(...(data || []));
    }

    if (unkeyed.length) {
      const { data, error } = await supabase
        .from("local_niches")
        .insert(unkeyed)
        .select("*");
      if (error) throw error;
      saved.push(...(data || []));
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ niches: saved })
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
