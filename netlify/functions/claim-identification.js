const { createClient } = require("@supabase/supabase-js");
const { authorizePlayerRequest } = require("./_gridwild-player-session");
const { requireStartedQuest } = require("./_quest-access");
const {
  fetchINatObservation,
  requireLinkedINatUser,
  verifyINatIdentification
} = require("./_inat-authority");
const { isIdentificationQuest } = require("./_quest-authority");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CONFIDENCE = new Set(["coarse", "likely", "careful", "expert"]);

function cleanString(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function cleanConfidence(value) {
  const next = cleanString(value, 24);
  return CONFIDENCE.has(next) ? next : "coarse";
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
      status: "verified",
      claimed_at: claim.claimed_at,
      evidence_type: "identification",
      target_type: "observation",
      target_id: claim.observation_id,
      external_id: claim.external_identification_id,
      confidence: claim.confidence,
      verification_status: "verified",
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
    await authorizePlayerRequest(supabase, event);
    const body = JSON.parse(event.body || "{}");
    const playerId = cleanString(body.player_id, 80);
    const questId = cleanString(body.quest_id, 80) || null;
    const observationId = cleanString(body.observation_id || body.obs_id, 120);
    const requestedTaxonId = Number(body.taxon_id);
    const externalIdentificationId = cleanString(
      body.external_identification_id || body.external_id,
      120
    );

    if (!playerId) throw new Error("player_id is required");
    if (!observationId) throw new Error("observation_id is required");
    if (!Number.isFinite(requestedTaxonId)) throw new Error("taxon_id is required");
    if (!externalIdentificationId) {
      throw new Error("external_identification_id is required");
    }

    let quest = null;
    if (questId) {
      ({ quest } = await requireStartedQuest(supabase, playerId, questId));
      if (!isIdentificationQuest(quest)) {
        throw new Error("This quest requires observation evidence, not identification evidence.");
      }
    }

    const inat = await requireLinkedINatUser(supabase, event, playerId);
    const observation = await fetchINatObservation(inat.apiToken, observationId);
    const identification = verifyINatIdentification(
      observation,
      inat.user,
      externalIdentificationId,
      requestedTaxonId
    );
    const taxon = identification?.taxon || {};
    const claimedAt = new Date().toISOString();
    const submittedAt = identification?.created_at || identification?.updated_at || claimedAt;
    const payload = {
      verified_at: claimedAt,
      inat_user_id: Number(inat.user.id),
      observation_uri: observation?.uri || null,
      identification_id: String(identification.id),
      category: identification?.category || null,
      disagreement: identification?.disagreement ?? null
    };

    const claim = await upsertIdentificationClaim({
      player_id: playerId,
      quest_id: questId,
      observation_id: observationId,
      observation_uri: observation?.uri || null,
      taxon_id: Number(taxon.id),
      taxon_name: cleanString(taxon.name, 240),
      taxon_common_name: cleanString(taxon.preferred_common_name, 240) || null,
      confidence: cleanConfidence(body.confidence),
      source: "inat_identification",
      status: "verified",
      external_identification_id: String(identification.id),
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
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
