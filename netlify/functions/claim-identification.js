const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CONFIDENCE = new Set(["coarse", "likely", "careful", "expert"]);
const STATUS = new Set(["claimed", "submitted", "verified", "rejected"]);

function cleanString(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function cleanConfidence(value) {
  const next = cleanString(value, 24);
  return CONFIDENCE.has(next) ? next : "coarse";
}

function cleanStatus(value) {
  const next = cleanString(value, 24);
  return STATUS.has(next) ? next : "claimed";
}

function cleanPayload(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function findExistingClaim(playerId, questId, observationId) {
  let query = supabase
    .from("identification_claims")
    .select("id")
    .eq("player_id", playerId)
    .eq("observation_id", observationId)
    .order("claimed_at", { ascending: false })
    .limit(1);

  query = questId ? query.eq("quest_id", questId) : query.is("quest_id", null);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

async function upsertIdentificationClaim(row) {
  const existing = await findExistingClaim(row.player_id, row.quest_id, row.observation_id);

  if (existing?.id) {
    const { data, error } = await supabase
      .from("identification_claims")
      .update(row)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("identification_claims")
    .insert(row)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function upsertQuestEvidence(claim, payload) {
  if (!claim.quest_id) return null;

  const { data, error } = await supabase
    .from("quest_evidence")
    .upsert({
      player_id: claim.player_id,
      quest_id: claim.quest_id,
      obs_id: claim.observation_id,
      source: "identification",
      status: "claimed",
      claimed_at: claim.claimed_at,
      evidence_type: "identification",
      target_type: "observation",
      target_id: claim.observation_id,
      external_id: claim.external_identification_id,
      confidence: claim.confidence,
      verification_status: claim.status,
      payload: {
        ...payload,
        identification_claim_id: claim.id,
        taxon_id: claim.taxon_id,
        taxon_name: claim.taxon_name,
        taxon_common_name: claim.taxon_common_name
      }
    }, {
      onConflict: "player_id,quest_id,obs_id"
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const playerId = cleanString(body.player_id, 80);
    const questId = cleanString(body.quest_id, 80) || null;
    const observationId = cleanString(body.observation_id || body.obs_id, 120);
    const taxonId = Number(body.taxon_id);
    const taxonName = cleanString(body.taxon_name, 240);
    const claimedAt = body.claimed_at ? new Date(body.claimed_at).toISOString() : new Date().toISOString();
    const submittedAt = body.submitted_at ? new Date(body.submitted_at).toISOString() : null;
    const payload = cleanPayload(body.payload);

    if (!playerId) throw new Error("player_id is required");
    if (!observationId) throw new Error("observation_id is required");
    if (!Number.isFinite(taxonId)) throw new Error("taxon_id is required");
    if (!taxonName) throw new Error("taxon_name is required");

    const claim = await upsertIdentificationClaim({
      player_id: playerId,
      quest_id: questId,
      observation_id: observationId,
      observation_uri: cleanString(body.observation_uri, 500) || null,
      taxon_id: Math.round(taxonId),
      taxon_name: taxonName,
      taxon_common_name: cleanString(body.taxon_common_name, 240) || null,
      confidence: cleanConfidence(body.confidence),
      source: cleanString(body.source, 80) || "gridwild",
      status: cleanStatus(body.status),
      external_identification_id: cleanString(body.external_identification_id || body.external_id, 120) || null,
      submitted_at: submittedAt,
      claimed_at: claimedAt,
      payload
    });

    const evidence = await upsertQuestEvidence(claim, payload);

    return {
      statusCode: 200,
      body: JSON.stringify({ claim, evidence })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
