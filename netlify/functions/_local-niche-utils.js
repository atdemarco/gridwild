function clampNumber(value, min, max, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function haversineMeters(aLat, aLng, bLat, bLng) {
  const r = 6371000;
  const toRad = (v) => (Number(v) * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function normalizeNicheRow(row, origin = null, commentCount = 0) {
  if (!row) return null;
  const distance_m = origin
    ? haversineMeters(origin.lat, origin.lng, row.centroid_lat, row.centroid_lng)
    : null;

  return {
    ...row,
    distance_m,
    comment_count: commentCount
  };
}

function compactLabel(value) {
  return (
    String(value || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)[0] || ""
  );
}

function phraseForNiche(niche) {
  const type = String(niche?.niche_type || "").toLowerCase();
  const theme = String(niche?.theme || "").toLowerCase();
  const focus = niche?.taxon_focus;
  const focusLabel =
    typeof focus === "string" ? focus : focus?.label || focus?.common || focus?.iconic || "";
  const taxon = compactLabel(focusLabel).toLowerCase();

  if (type.includes("edge") || theme.includes("wet edge") || theme.includes("stream")) {
    return taxon.includes("moth") ? "Check moths" : "Sample wet-edge plants";
  }
  if (type.includes("seasonal"))
    return taxon ? `Revisit seasonal ${taxon}` : "Revisit seasonal life";
  if (type.includes("taxon")) return taxon ? `Look for ${taxon}` : "Look for focal taxa";
  if (type.includes("stale")) return taxon ? `Revisit ${taxon}` : "Revisit this hotspot";
  if (type.includes("under"))
    return taxon ? `Survey under-covered ${taxon}` : "Sample under-covered life";
  if (type.includes("rich")) return taxon ? `Survey rich ${taxon}` : "Survey rich life";

  return taxon ? `Sample ${taxon}` : "Sample local life";
}

function placeSuffix(placeContext = {}) {
  const label = compactLabel(
    placeContext.primary_label || placeContext.primaryPlaceLabel || placeContext.name
  );
  const confidence = clampNumber(placeContext.label_confidence ?? placeContext.confidence, 0, 1, 0);
  const type = String(placeContext.place_type || placeContext.type || "").toLowerCase();
  const relation = String(placeContext.spatial_relation || "").toLowerCase();

  if (!label) {
    return confidence < 0.35 ? "near your current location" : "in this nearby area";
  }

  if (confidence >= 0.78) {
    if (relation) return `${relation} ${label}`;
    if (type.includes("trail") || type.includes("canal") || type.includes("stream"))
      return `along ${label}`;
    if (type.includes("water") || type.includes("river") || type.includes("creek"))
      return `beside ${label}`;
    if (type.includes("building") || type.includes("campus") || type.includes("garden"))
      return `near ${label}`;
    if (type.includes("park")) return `near ${label}`;
    return `at ${label}`;
  }

  if (confidence >= 0.45) return `near ${label}`;
  return `around ${label}`;
}

function buildNicheDisplayTitle(niche = {}) {
  const phrase = phraseForNiche(niche);
  const suffix = placeSuffix(
    niche.place_context || {
      primary_label: niche.primary_place_label,
      label_confidence: niche.place_label_confidence
    }
  );
  return `${phrase} ${suffix}`.replace(/\s+/g, " ").trim();
}

function sampleQuestDescription(niche = {}) {
  const evidence = niche.evidence_summary || {};
  const human = Array.isArray(evidence.human)
    ? evidence.human.filter(Boolean).slice(0, 2).join(" ")
    : String(evidence.human || "").trim();
  const place =
    niche.primary_place_label || niche.place_context?.primary_label || "this local niche";
  const rationale =
    human ||
    niche.description ||
    "This interpreted local niche could add useful ecological signal.";
  return `${rationale} Visit the highlighted area near ${place} and make observations that validate or refine this playable ecology layer.`;
}

function buildSampleNicheRecipe(niche = {}) {
  const radiusM = clampNumber(niche.radius_m, 20, 500, 90);
  const radiusCells = Math.max(1, Math.round(radiusM / 6.096));
  const focus = niche.taxon_focus || {};
  const iconicTaxon =
    typeof focus === "string" ? focus : focus.iconic || focus.taxon || focus.life_group || "Any";

  return {
    range: "here",
    iconicTaxon: iconicTaxon || "Any",
    objectiveType: "sample_niche",
    difficulty: Math.max(1, Math.min(5, Math.round(1 + Number(niche.questability_score || 0) * 4))),
    timeframe: "today",
    evidence: "photo_gps20",
    targetLocation: "sample_niche",
    quantity: 3,
    requiredObservationCount: 3,
    optionalTaxonTargets: iconicTaxon && iconicTaxon !== "Any" ? [iconicTaxon] : [],
    nicheId: niche.id,
    target: {
      mode: "sample_niche",
      lat: niche.centroid_lat,
      lng: niche.centroid_lng,
      radiusMeters: radiusM,
      radiusCells,
      label: niche.primary_place_label || niche.title || "Local niche",
      placeName: niche.primary_place_label || niche.place_context?.primary_label || null,
      geometry: niche.geometry || null
    },
    evidenceSummary: niche.evidence_summary || null,
    placeContext: niche.place_context || null
  };
}

module.exports = {
  buildNicheDisplayTitle,
  buildSampleNicheRecipe,
  clampNumber,
  haversineMeters,
  normalizeNicheRow,
  sampleQuestDescription
};
