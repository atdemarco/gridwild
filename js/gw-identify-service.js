// -----------------------------------------------------------------------------
// GridWild Identify Service + Evidence Store
// Keeps Identify UI separate from evidence persistence and eventual iNat submit.
// -----------------------------------------------------------------------------

(function () {
  const CLAIM_STORAGE_KEY = "gw_identification_claims_v1";
  const SKIP_STORAGE_KEY = "gw_identification_skips_v1";

  function nowISO() {
    return new Date().toISOString();
  }

  function readArray(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeArray(key, rows) {
    localStorage.setItem(key, JSON.stringify(Array.isArray(rows) ? rows : []));
  }

  function questKey(quest) {
    return String(quest?.dbId || quest?.id || "");
  }

  function observationId(obs) {
    return String(obs?.id || obs?.observationId || "");
  }

  function loadClaims() {
    return readArray(CLAIM_STORAGE_KEY);
  }

  function saveClaims(claims) {
    writeArray(CLAIM_STORAGE_KEY, claims);
    window.dispatchEvent(new CustomEvent("gwIdentificationClaimsChanged"));
    window.dispatchEvent(new CustomEvent("gwQuestEvidenceChanged"));
  }

  function claimKey(claim) {
    return [claim?.questId || "", claim?.observationId || ""].join("::");
  }

  function sortClaims(claims) {
    return (claims || [])
      .slice()
      .sort((a, b) => String(b.claimedAt || "").localeCompare(String(a.claimedAt || "")));
  }

  function upsertLocalClaim(claim) {
    const key = claimKey(claim);
    const next = loadClaims().filter((row) => claimKey(row) !== key);
    saveClaims(sortClaims([claim, ...next]));
  }

  function normalizeServerClaim(row) {
    if (!row) return null;

    const observationIdValue = row.observation_id ?? row.observationId;
    const taxonIdValue = Number(row.taxon_id ?? row.taxonId);
    if (!observationIdValue || !Number.isFinite(taxonIdValue)) return null;

    const payload = row.payload && typeof row.payload === "object" ? row.payload : {};

    return {
      id:
        row.id || row.id === 0
          ? String(row.id)
          : row.localId || `ident_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      serverId: row.id ? String(row.id) : row.serverId || null,
      questId: row.quest_id ?? row.questId ?? null,
      observationId: String(observationIdValue),
      observationUri: row.observation_uri ?? row.observationUri ?? null,
      taxonId: taxonIdValue,
      taxonName: row.taxon_name ?? row.taxonName ?? "",
      taxonCommonName: row.taxon_common_name ?? row.taxonCommonName ?? "",
      confidence: row.confidence || "coarse",
      source: "identification",
      evidenceType: "identification",
      status: row.status || "claimed",
      mocked: Boolean(payload.mocked ?? row.mocked),
      pendingRealSubmit: Boolean(payload.pending_real_submit ?? row.pendingRealSubmit),
      externalId: row.external_identification_id ?? row.externalId ?? null,
      submittedAt: row.submitted_at ?? row.submittedAt ?? null,
      claimedAt: row.claimed_at ?? row.claimedAt ?? nowISO(),
      user:
        payload.user || row.user || window.GridWildINatAuth?.getUsername?.() || "mock-identifier",
      serverSynced: !!row.id
    };
  }

  function isClaimedStatus(status) {
    return ["claimed", "submitted", "verified", "counted"].includes(
      String(status || "").toLowerCase()
    );
  }

  function mergeServerClaims(rows = []) {
    const normalized = (Array.isArray(rows) ? rows : []).map(normalizeServerClaim).filter(Boolean);
    if (!normalized.length) return loadClaims();

    const merged = new Map(loadClaims().map((claim) => [claimKey(claim), claim]));
    normalized.forEach((claim) => {
      const previous = merged.get(claimKey(claim)) || {};
      merged.set(claimKey(claim), {
        ...previous,
        ...claim,
        localId: previous.localId || previous.id || null
      });
    });

    const next = sortClaims([...merged.values()]);
    saveClaims(next);
    return next;
  }

  function mergeQuestEvidence(evidenceRow) {
    if (!evidenceRow?.quest_id || !evidenceRow?.obs_id) return;

    window.__gwState = window.__gwState || {};
    const rows = window.__gwState.questEvidence || [];
    const next = rows.filter(
      (row) =>
        !(
          String(row.quest_id) === String(evidenceRow.quest_id) &&
          String(row.obs_id) === String(evidenceRow.obs_id) &&
          String(row.source || row.evidence_type || "") === "identification"
        )
    );

    window.__gwState.questEvidence = [evidenceRow, ...next];
    window.dispatchEvent(new CustomEvent("gwQuestEvidenceChanged"));
  }

  function loadSkips() {
    return readArray(SKIP_STORAGE_KEY);
  }

  function saveSkips(skips) {
    writeArray(SKIP_STORAGE_KEY, skips);
    window.dispatchEvent(new CustomEvent("gwIdentificationSkipsChanged"));
  }

  function getClaimedForQuest(quest) {
    const key = questKey(quest);
    if (!key) return [];

    return loadClaims()
      .filter((claim) => String(claim.questId || "") === key && isClaimedStatus(claim.status))
      .sort((a, b) => String(b.claimedAt || "").localeCompare(String(a.claimedAt || "")));
  }

  function hasClaimForObservation(quest, obs) {
    const key = questKey(quest);
    const id = observationId(obs);
    if (!key || !id) return false;

    return loadClaims().some(
      (claim) =>
        String(claim.questId || "") === key &&
        String(claim.observationId || "") === id &&
        isClaimedStatus(claim.status)
    );
  }

  function hasSkippedObservation(obs) {
    const id = observationId(obs);
    if (!id) return false;
    return loadSkips().some((skip) => String(skip.observationId || "") === id);
  }

  function skipObservation(obs, reason = "uncertain") {
    const id = observationId(obs);
    if (!id) return null;

    const skips = loadSkips().filter((skip) => String(skip.observationId || "") !== id);
    const skip = {
      observationId: id,
      observationUri: obs?.uri || obs?.observationUri || null,
      reason,
      skippedAt: nowISO()
    };

    saveSkips([skip, ...skips].slice(0, 500));
    return skip;
  }

  function clearSkip(obs) {
    const id = observationId(obs);
    if (!id) return;
    saveSkips(loadSkips().filter((skip) => String(skip.observationId || "") !== id));
  }

  function makeLocalClaim(input, submission) {
    const obs = input.observation || {};
    const taxon = input.taxon || {};
    const quest = input.quest || null;

    return {
      id: `ident_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      questId: quest ? questKey(quest) : null,
      observationId: observationId(obs),
      observationUri: obs.uri || null,
      taxonId: Number(taxon.id),
      taxonName: taxon.scientificName || taxon.name || taxon.label || "",
      taxonCommonName: taxon.label || taxon.preferred_common_name || "",
      confidence: input.confidence || "coarse",
      source: "identification",
      evidenceType: "identification",
      status: "claimed",
      mocked: !!submission.mocked,
      externalId: submission.externalId || null,
      submittedAt: submission.submittedAt || null,
      claimedAt: nowISO(),
      user: window.GridWildINatAuth?.getUsername?.() || "mock-identifier"
    };
  }

  function serverClaimPayload(input, submission, claim) {
    const obs = input.observation || {};
    const taxon = input.taxon || {};

    return {
      quest_id: claim.questId || null,
      observation_id: claim.observationId,
      observation_uri: claim.observationUri || null,
      taxon_id: claim.taxonId,
      taxon_name: claim.taxonName,
      taxon_common_name: claim.taxonCommonName,
      confidence: claim.confidence || "coarse",
      source: "gridwild_identify",
      status: "claimed",
      external_identification_id: submission.externalId || null,
      submitted_at: submission.submittedAt || null,
      claimed_at: claim.claimedAt,
      payload: {
        user: claim.user,
        mocked: !!submission.mocked,
        pending_real_submit: !!submission.pendingRealSubmit,
        observation: {
          id: claim.observationId,
          uri: claim.observationUri || null,
          lat: obs.lat ?? null,
          lng: obs.lng ?? null,
          observed_on: obs.observedOn || obs.observed_on || null,
          place: obs.place || "",
          user: obs.user || ""
        },
        taxon: {
          id: claim.taxonId,
          name: claim.taxonName,
          common_name: claim.taxonCommonName,
          rank: taxon.rank || null
        },
        submission: {
          mocked: !!submission.mocked,
          pending_real_submit: !!submission.pendingRealSubmit,
          external_id: submission.externalId || null,
          submitted_at: submission.submittedAt || null
        }
      }
    };
  }

  async function submitIdentification(input = {}) {
    const token = window.GridWildINatAuth?.getToken?.() || "";
    const adapter = window.GridWildINatIdentificationAdapter;

    if (adapter?.submitIdentification) {
      return adapter.submitIdentification(input);
    }

    // The real iNat write is intentionally behind this adapter boundary.
    // Until the endpoint/scope contract is verified, non-mock accounts create
    // local evidence only and expose a pending-real marker for later sync work.
    const isMock = !token || token.startsWith("mock:");

    return {
      ok: true,
      mocked: isMock,
      pendingRealSubmit: !isMock,
      externalId: null,
      submittedAt: isMock ? nowISO() : null
    };
  }

  async function claimIdentification(input = {}) {
    const obs = input.observation || null;
    const taxon = input.taxon || null;

    if (!observationId(obs)) {
      return { ok: false, reason: "Missing observation." };
    }

    if (!Number.isFinite(Number(taxon?.id))) {
      return { ok: false, reason: "Missing taxon." };
    }

    if (input.quest && hasClaimForObservation(input.quest, obs)) {
      return { ok: false, reason: "Already claimed for this quest." };
    }

    const submission = await submitIdentification(input);
    if (!submission?.ok) {
      return {
        ok: false,
        reason: submission?.reason || "Identification submission failed."
      };
    }

    let claim = makeLocalClaim(input, submission);
    let serverResult = null;

    if (window.GridWildAPI?.claimIdentificationEvidence && window.GridWildAPI?.getPlayerId?.()) {
      try {
        serverResult = await window.GridWildAPI.claimIdentificationEvidence(
          serverClaimPayload(input, submission, claim)
        );
        const serverClaim = normalizeServerClaim(serverResult?.claim);
        if (serverClaim) {
          claim = {
            ...claim,
            ...serverClaim,
            localId: claim.id,
            serverSynced: true
          };
        }
        mergeQuestEvidence(serverResult?.evidence);
      } catch (err) {
        console.warn("GridWild identification claim was not server-verified:", err);
        if (input.quest) {
          return {
            ok: false,
            reason: err?.message || "Identification was not verified by iNaturalist."
          };
        }
        claim = {
          ...claim,
          serverSynced: false,
          syncError: err.message || "Server sync failed"
        };
      }
    }

    if (input.quest && !serverResult?.claim) {
      return {
        ok: false,
        reason: "Reward-bearing identification claims must be verified by iNaturalist."
      };
    }

    upsertLocalClaim(claim);
    clearSkip(obs);

    return {
      ok: true,
      claim,
      submission: {
        ...submission,
        serverSynced: !!serverResult?.claim
      }
    };
  }

  function getStats() {
    return {
      claims: loadClaims().length,
      skips: loadSkips().length
    };
  }

  window.GridWildIdentificationEvidence = {
    loadClaims,
    saveClaims,
    mergeServerClaims,
    loadSkips,
    saveSkips,
    skipObservation,
    clearSkip,
    hasSkippedObservation,
    hasClaimForObservation,
    getClaimedForQuest,
    getStats,
    questKey
  };

  window.GridWildIdentifyService = {
    submitIdentification,
    claimIdentification
  };
})();
