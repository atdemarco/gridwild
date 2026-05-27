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
      .filter(claim =>
        String(claim.questId || "") === key &&
        claim.status === "claimed"
      )
      .sort((a, b) => String(b.claimedAt || "").localeCompare(String(a.claimedAt || "")));
  }

  function hasClaimForObservation(quest, obs) {
    const key = questKey(quest);
    const id = observationId(obs);
    if (!key || !id) return false;

    return loadClaims().some(claim =>
      String(claim.questId || "") === key &&
      String(claim.observationId || "") === id &&
      claim.status === "claimed"
    );
  }

  function hasSkippedObservation(obs) {
    const id = observationId(obs);
    if (!id) return false;
    return loadSkips().some(skip => String(skip.observationId || "") === id);
  }

  function skipObservation(obs, reason = "uncertain") {
    const id = observationId(obs);
    if (!id) return null;

    const skips = loadSkips().filter(skip => String(skip.observationId || "") !== id);
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
    saveSkips(loadSkips().filter(skip => String(skip.observationId || "") !== id));
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

    const claim = makeLocalClaim(input, submission);
    saveClaims([claim, ...loadClaims()]);
    clearSkip(obs);

    return { ok: true, claim, submission };
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
