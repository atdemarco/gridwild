async function gridWildApiErrorFromResponse(response) {
  const text = await response.text();
  let message = text;

  try {
    message = JSON.parse(text)?.error || text;
  } catch {
    // Keep non-JSON response text as the error message.
  }

  const error = new Error(message || `Request failed: HTTP ${response.status}`);
  error.status = response.status;
  error.responseText = text;
  return error;
}

const GRIDWILD_BOOTSTRAP_TIMEOUT_MS = 6500;
const GRIDWILD_FUNCTION_TIMEOUT_MS = 10000;
const GRIDWILD_ONLINE_COOLDOWN_MS = 45000;

let gridWildBootstrapPromise = null;

const gridWildOnlineState = (window.__gwOnlineState = window.__gwOnlineState || {
  bootstrapReady: false,
  bootstrapPending: false,
  degraded: false,
  unavailableUntil: 0,
  lastError: null,
  lastFailedFunction: null,
  failures: 0
});

function serializeGridWildError(err) {
  if (!err) return null;
  return {
    name: err.name || "Error",
    message: err.message || String(err),
    status: err.status || null,
    at: Date.now()
  };
}

function isTransientGridWildApiError(err) {
  if (!err) return false;
  if (err.name === "AbortError" || err.code === "GRIDWILD_API_TIMEOUT") return true;
  if (err.status >= 500) return true;
  return err instanceof TypeError;
}

function gridWildOnlineUnavailableError(functionName) {
  const waitMs = Math.max(0, (Number(gridWildOnlineState.unavailableUntil) || 0) - Date.now());
  const err = new Error(
    `GridWild online gameplay is temporarily unavailable; skipped ${functionName}.`
  );
  err.code = "GRIDWILD_ONLINE_UNAVAILABLE";
  err.onlineUnavailable = true;
  err.retryAfterMs = waitMs;
  return err;
}

function isGridWildOnlineReady() {
  return (
    gridWildOnlineState.bootstrapReady === true || window.__gwState?.bootstrapReady === true
  );
}

function isGridWildOnlineCircuitOpen() {
  return Date.now() < (Number(gridWildOnlineState.unavailableUntil) || 0);
}

function markGridWildOnlinePending() {
  gridWildOnlineState.bootstrapPending = true;
  if (!isGridWildOnlineCircuitOpen()) {
    gridWildOnlineState.degraded = false;
  }
}

function markGridWildOnlineReady() {
  gridWildOnlineState.bootstrapReady = true;
  gridWildOnlineState.bootstrapPending = false;
  gridWildOnlineState.degraded = false;
  gridWildOnlineState.unavailableUntil = 0;
  gridWildOnlineState.lastError = null;
  gridWildOnlineState.lastFailedFunction = null;
  gridWildOnlineState.failures = 0;
  window.__gwState = window.__gwState || {};
  window.__gwState.bootstrapReady = true;
  window.__gwState.onlineGameplayReady = true;
}

function markGridWildOnlineFailure(functionName, err) {
  if (err?.gridWildOnlineFailureRecorded) return;
  try {
    err.gridWildOnlineFailureRecorded = true;
  } catch {
    // Some browser errors are immutable; duplicate failure bookkeeping is harmless.
  }

  gridWildOnlineState.bootstrapPending = false;
  gridWildOnlineState.lastError = serializeGridWildError(err);
  gridWildOnlineState.lastFailedFunction = functionName;

  if (!isTransientGridWildApiError(err)) return;

  gridWildOnlineState.bootstrapReady = false;
  gridWildOnlineState.degraded = true;
  gridWildOnlineState.failures = (Number(gridWildOnlineState.failures) || 0) + 1;
  gridWildOnlineState.unavailableUntil = Date.now() + GRIDWILD_ONLINE_COOLDOWN_MS;
  window.__gwState = window.__gwState || {};
  window.__gwState.bootstrapReady = false;
  window.__gwState.onlineGameplayReady = false;
}

function shouldRequireGridWildOnline(functionName, options = {}) {
  if (functionName === "get-bootstrap") return false;
  return options.requireOnline !== false;
}

function gridWildFunctionTimeoutMs(functionName, options = {}) {
  if (options.timeoutMs === false || options.fetchOptions?.keepalive) return 0;
  const explicit = Number(options.timeoutMs);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return functionName === "get-bootstrap"
    ? GRIDWILD_BOOTSTRAP_TIMEOUT_MS
    : GRIDWILD_FUNCTION_TIMEOUT_MS;
}

async function fetchGridWildFunction(functionName, fetchOptions = {}, options = {}) {
  const timeoutMs = gridWildFunctionTimeoutMs(functionName, options);
  const controller =
    timeoutMs > 0 && !fetchOptions.signal ? new AbortController() : null;
  const timer = controller
    ? window.setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    return await fetch(`/.netlify/functions/${functionName}`, {
      ...fetchOptions,
      ...(controller ? { signal: controller.signal } : {})
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      const timeoutError = new Error(`${functionName} timed out after ${timeoutMs}ms.`);
      timeoutError.name = "AbortError";
      timeoutError.code = "GRIDWILD_API_TIMEOUT";
      throw timeoutError;
    }
    throw err;
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

window.GridWildOnline = window.GridWildOnline || {
  isReady: isGridWildOnlineReady,
  isDegraded: () => gridWildOnlineState.degraded === true,
  isCircuitOpen: isGridWildOnlineCircuitOpen,
  state: () => ({ ...gridWildOnlineState }),
  canAutoStart: () => isGridWildOnlineReady() && !isGridWildOnlineCircuitOpen(),
  isUnavailableError: (err) => err?.onlineUnavailable === true,
  markPending: markGridWildOnlinePending,
  markReady: markGridWildOnlineReady,
  markFailure: markGridWildOnlineFailure
};

function gridWildApiBody(payload = {}) {
  const body = { ...(payload || {}) };
  const playerId = window.GridWildAPI?.getPlayerId?.() || null;
  const sessionToken = window.GridWildAPI?.getPlayerSessionToken?.() || "";

  if (body.player_id === undefined && playerId) {
    body.player_id = playerId;
  }

  if (body.session_token === undefined && sessionToken) {
    body.session_token = sessionToken;
  }

  return JSON.stringify(body);
}

function hasGridWildPlayerSession() {
  return Boolean(
    window.GridWildAPI?.getPlayerId?.() && window.GridWildAPI?.getPlayerSessionToken?.()
  );
}

function hasStoredGridWildAccount() {
  try {
    const raw = localStorage.getItem("gwAccount");
    const account = raw ? JSON.parse(raw) : null;
    return Boolean(account?.username);
  } catch {
    return false;
  }
}

async function ensureGridWildPlayerSession(options = {}) {
  if (hasGridWildPlayerSession() && options.force !== true) return true;
  if (!window.GridWildAPI?.getBootstrap) return false;
  if (hasStoredGridWildAccount()) {
    window.GridWildAccount?.markSessionInvalid?.("GridWild login expired on this device.");
    throw gridWildReloginError({ status: 401 });
  }

  const data = await window.GridWildAPI.getBootstrap({
    force: options.force === true,
    applySession: true
  });

  if (data?.player?.id) window.GridWildAPI.setPlayerId(data.player.id);
  if (data?.player_session) window.GridWildAPI.setPlayerSession(data.player_session);

  return hasGridWildPlayerSession();
}

function shouldRetryMissingPlayerSession(name, error, options = {}) {
  return (
    name !== "get-bootstrap" &&
    options.retryMissingSession !== false &&
    error?.status === 401 &&
    /GridWild player session is required/i.test(error?.message || "")
  );
}

function isInvalidGridWildAccountSession(error) {
  return /GridWild account session (?:is )?(?:invalid|expired|not active)/i.test(
    error?.message || ""
  );
}

function markGridWildAccountSessionInvalid(error) {
  if (!isInvalidGridWildAccountSession(error)) return;

  if (window.GridWildAccount?.markSessionInvalid) {
    window.GridWildAccount.markSessionInvalid("GridWild login expired on this device.");
    return;
  }

  localStorage.removeItem("gwAccountSession");
  window.dispatchEvent(
    new CustomEvent("gwAccountChanged", {
      detail: { account: null, player: window.__gwState?.player || null, sessionInvalid: true }
    })
  );
}

function gridWildReloginError(error) {
  const relogin = new Error(
    "GridWild login expired on this device. Open Me > GridWild Account and log in again."
  );
  relogin.status = error?.status || 401;
  relogin.cause = error;
  return relogin;
}

async function postFunction(name, payload = {}, options = {}) {
  if (
    name === "get-bootstrap" &&
    isGridWildOnlineCircuitOpen() &&
    options.force !== true
  ) {
    throw gridWildOnlineUnavailableError(name);
  }

  if (
    shouldRequireGridWildOnline(name, options) &&
    (!isGridWildOnlineReady() || isGridWildOnlineCircuitOpen())
  ) {
    throw gridWildOnlineUnavailableError(name);
  }

  if (name !== "get-bootstrap" && options.ensurePlayerSession !== false) {
    await ensureGridWildPlayerSession();
  }

  const request = () =>
    fetchGridWildFunction(
      name,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {})
        },
        body: gridWildApiBody(payload),
        ...(options.fetchOptions || {})
      },
      options
    );

  let res;
  try {
    res = await request();
  } catch (err) {
    markGridWildOnlineFailure(name, err);
    throw err;
  }
  if (!res.ok) {
    const error = await gridWildApiErrorFromResponse(res);
    markGridWildOnlineFailure(name, error);
    if (isInvalidGridWildAccountSession(error)) {
      markGridWildAccountSessionInvalid(error);
      if (
        name === "get-bootstrap" &&
        options.retryInvalidAccountSession !== false &&
        !hasStoredGridWildAccount()
      ) {
        try {
          res = await request();
        } catch (err) {
          markGridWildOnlineFailure(name, err);
          throw err;
        }
        if (res.ok) return await res.json();
      }
      throw gridWildReloginError(error);
    }
    if (shouldRetryMissingPlayerSession(name, error, options)) {
      await ensureGridWildPlayerSession({ force: true });
      try {
        res = await request();
      } catch (err) {
        markGridWildOnlineFailure(name, err);
        throw err;
      }
      if (!res.ok) {
        const retryError = await gridWildApiErrorFromResponse(res);
        markGridWildOnlineFailure(name, retryError);
        if (isInvalidGridWildAccountSession(retryError)) {
          markGridWildAccountSessionInvalid(retryError);
          throw gridWildReloginError(retryError);
        }
        throw retryError;
      }
    } else {
      throw error;
    }
  }

  return await res.json();
}

function gridWildINatHeaders() {
  const token = window.GridWildINatAuth?.getToken?.() || "";
  return token ? { "X-GridWild-INat-Token": token } : {};
}

window.GridWildAPI = {
  async getBootstrap(options = {}) {
    if (gridWildBootstrapPromise && options.force !== true) return gridWildBootstrapPromise;
    markGridWildOnlinePending();

    gridWildBootstrapPromise = postFunction(
      "get-bootstrap",
      { player_id: this.getPlayerId() },
      {
        ensurePlayerSession: false,
        retryMissingSession: false,
        force: options.force === true,
        timeoutMs: options.timeoutMs
      }
    )
      .then((data) => {
        if (options.applySession !== false) {
          if (data?.player?.id) this.setPlayerId(data.player.id);
          if (data?.player_session) this.setPlayerSession(data.player_session);
        }
        markGridWildOnlineReady();
        return data;
      })
      .catch((err) => {
        markGridWildOnlineFailure("get-bootstrap", err);
        throw err;
      })
      .finally(() => {
        gridWildBootstrapPromise = null;
      });

    return gridWildBootstrapPromise;
  },

  async getPlayerBootstrapDetails() {
    return postFunction("get-player-bootstrap-details", { player_id: this.getPlayerId() });
  },

  async createParty(name = "New Party", questId = null, options = {}) {
    return postFunction("create-party", {
      player_id: this.getPlayerId(),
      name,
      quest_id: questId,
      ...options
    });
  },

  async joinParty(partyId) {
    return postFunction("join-party", {
      player_id: this.getPlayerId(),
      party_id: partyId
    });
  },

  async leaveParty(partyId) {
    return postFunction("leave-party", {
      player_id: this.getPlayerId(),
      party_id: partyId
    });
  },

  async getParty(partyId = null) {
    return postFunction("get-party", {
      player_id: this.getPlayerId(),
      party_id: partyId
    });
  },

  async getPartyForQuest(questId) {
    return postFunction("get-party-for-quest", {
      player_id: this.getPlayerId(),
      quest_id: questId
    });
  },

  async getPartyHistory(limit = 25) {
    return postFunction("get-party-history", {
      player_id: this.getPlayerId(),
      limit
    });
  },

  async endParty(partyId) {
    return postFunction("end-party", {
      player_id: this.getPlayerId(),
      party_id: partyId
    });
  },

  async setActiveParty(partyId = null) {
    return postFunction("set-active-party", {
      player_id: this.getPlayerId(),
      party_id: partyId
    });
  },

  async getNearbyParties() {
    return postFunction("get-nearby-parties");
  },

  async getPartyRoute(partyId) {
    return postFunction("get-party-route", { party_id: partyId });
  },

  async claimQuestEvidence(questId, obsId, source = "observation") {
    const data = await postFunction(
      "claim-quest-evidence",
      {
        player_id: this.getPlayerId(),
        quest_id: questId,
        obs_id: obsId,
        source
      },
      { headers: gridWildINatHeaders() }
    );

    if (Array.isArray(data?.verified_achievements)) {
      window.__gwState = window.__gwState || {};
      window.__gwState.playerAchievements = data.verified_achievements;
      window.dispatchEvent(new CustomEvent("gwAchievementsChanged"));
    }

    return data;
  },

  async claimIdentificationEvidence(claim = {}) {
    return postFunction(
      "claim-identification",
      {
        ...claim,
        player_id: this.getPlayerId()
      },
      { headers: gridWildINatHeaders() }
    );
  },

  async updatePlayer(patch = {}) {
    return postFunction("update-player", {
      player_id: this.getPlayerId(),
      ...patch
    });
  },

  async setActiveQuest(questId = null) {
    return postFunction("set-active-quest", {
      player_id: this.getPlayerId(),
      quest_id: questId
    });
  },

  async createQuest(quest) {
    return postFunction("create-quest", {
      ...quest,
      player_id: this.getPlayerId()
    });
  },

  async getQuests() {
    return postFunction("get-quests", { player_id: this.getPlayerId() });
  },

  async getDraftObservationMirrors() {
    return postFunction("get-draft-observations", {
      player_id: this.getPlayerId()
    });
  },

  async upsertDraftObservationMirrors(drafts = []) {
    return postFunction("upsert-draft-observations", {
      player_id: this.getPlayerId(),
      drafts
    });
  },

  async deleteDraftObservationMirror(draftId) {
    return postFunction("delete-draft-observation", {
      player_id: this.getPlayerId(),
      draft_id: draftId
    });
  },

  async getNearbyLocalNiches(lat, lng, options = {}) {
    return postFunction("get-local-niches", {
      player_id: this.getPlayerId(),
      lat,
      lng,
      radius_m: options.radius_m,
      limit: options.limit
    });
  },

  async setHomeNiche(nicheId) {
    return postFunction("set-home-niche", {
      player_id: this.getPlayerId(),
      niche_id: nicheId
    });
  },

  async unsetHomeNiche() {
    return postFunction("unset-home-niche", { player_id: this.getPlayerId() });
  },

  async getLocalNicheHomeUsers(nicheId) {
    return postFunction("get-local-niche-home-users", { niche_id: nicheId });
  },

  async upsertLocalNiches(niches = []) {
    return postFunction("upsert-local-niches", {
      player_id: this.getPlayerId(),
      niches
    });
  },

  async getLocalNicheComments(nicheId) {
    return postFunction("get-local-niche-comments", { niche_id: nicheId });
  },

  async addLocalNicheComment(nicheId, commentText, commentType = "general_comment") {
    return postFunction("add-local-niche-comment", {
      player_id: this.getPlayerId(),
      niche_id: nicheId,
      comment_text: commentText,
      comment_type: commentType
    });
  },

  async createSampleNicheQuest(nicheId) {
    return postFunction("create-sample-niche-quest", {
      player_id: this.getPlayerId(),
      niche_id: nicheId
    });
  },

  async addPartyRoutePoint(partyId, lat, lng, accuracyMeters = null, createdAt = null) {
    return postFunction("add-party-route-point", {
      player_id: this.getPlayerId(),
      party_id: partyId,
      lat,
      lng,
      accuracy_meters: accuracyMeters,
      created_at: createdAt
    });
  },

  async upsertPlayerPresence(patch = {}, options = {}) {
    return postFunction(
      "upsert-player-presence",
      {
        player_id: this.getPlayerId(),
        session_token: this.getPlayerSessionToken(),
        ...patch
      },
      { fetchOptions: options.keepalive ? { keepalive: true } : {} }
    );
  },

  async getNearbyPlayerPresence(lat, lng, options = {}) {
    return postFunction("get-nearby-player-presence", {
      player_id: this.getPlayerId(),
      session_token: this.getPlayerSessionToken(),
      lat,
      lng,
      radius_m: options.radius_m
    });
  },

  async getPlayerInfo(targetPlayerId) {
    return postFunction("get-player-info", {
      player_id: this.getPlayerId(),
      session_token: this.getPlayerSessionToken(),
      target_player_id: targetPlayerId
    });
  },

  async getChatMessages(roomType, roomId, options = {}) {
    return postFunction("get-chat-messages", {
      player_id: this.getPlayerId(),
      session_token: this.getPlayerSessionToken(),
      room_type: roomType,
      room_id: roomId,
      limit: options.limit
    });
  },

  async sendChatMessage(roomType, roomId, message = {}) {
    return postFunction("send-chat-message", {
      player_id: this.getPlayerId(),
      session_token: this.getPlayerSessionToken(),
      room_type: roomType,
      room_id: roomId,
      message_type: message.message_type || "text",
      body: message.body || "",
      payload: message.payload || {}
    });
  },

  async getPlayerInteractions() {
    return postFunction("get-player-interactions", {
      player_id: this.getPlayerId(),
      session_token: this.getPlayerSessionToken()
    });
  },

  async createPlayerInteraction(payload = {}) {
    return postFunction("create-player-interaction", {
      player_id: this.getPlayerId(),
      session_token: this.getPlayerSessionToken(),
      ...payload
    });
  },

  async respondPlayerInteraction(interactionId, response) {
    return postFunction("respond-player-interaction", {
      player_id: this.getPlayerId(),
      session_token: this.getPlayerSessionToken(),
      interaction_id: interactionId,
      response
    });
  },

  async blockPlayer(targetPlayerId) {
    return postFunction("create-player-interaction", {
      player_id: this.getPlayerId(),
      session_token: this.getPlayerSessionToken(),
      type: "block",
      target_player_id: targetPlayerId
    });
  },

  async updatePartyEvidenceStatus(partyId, draftId, status) {
    return postFunction("update-party-evidence", {
      player_id: this.getPlayerId(),
      party_id: partyId,
      draft_id: draftId,
      status
    });
  },

  async addPartyEvidence(evidence) {
    return postFunction("add-party-evidence", {
      ...evidence,
      player_id: this.getPlayerId()
    });
  },

  async acceptQuest(questId) {
    return postFunction("accept-quest", {
      player_id: this.getPlayerId(),
      quest_id: questId
    });
  },

  async abandonQuest(questId) {
    return postFunction("abandon-quest", {
      player_id: this.getPlayerId(),
      quest_id: questId
    });
  },

  async archiveQuest(questId) {
    return postFunction("archive-quest", {
      player_id: this.getPlayerId(),
      quest_id: questId
    });
  },

  async completeQuest(questId) {
    return postFunction("complete-quest", {
      player_id: this.getPlayerId(),
      quest_id: questId
    });
  },

  async purchaseStoreItem(itemId) {
    return postFunction("purchase-store-item", {
      player_id: this.getPlayerId(),
      item_id: itemId
    });
  },

  async getSurveys() {
    return postFunction("get-surveys", { player_id: this.getPlayerId() });
  },

  async getSurveyById(surveyId) {
    return postFunction("get-survey-by-id", {
      player_id: this.getPlayerId(),
      survey_id: surveyId
    });
  },

  async saveSurvey(survey) {
    return postFunction("save-survey", {
      player_id: this.getPlayerId(),
      survey
    });
  },

  async deleteSurvey(surveyId) {
    return postFunction("delete-survey", {
      player_id: this.getPlayerId(),
      survey_id: surveyId
    });
  },

  async setPlayerSurveyState(surveyId, patch = {}) {
    return postFunction("set-player-survey-state", {
      player_id: this.getPlayerId(),
      survey_id: surveyId,
      ...patch
    });
  },

  async upsertPlayerAchievements() {
    return postFunction("upsert-player-achievements", {
      player_id: this.getPlayerId()
    });
  },

  async setPlayerEquipment(slot, itemId = null) {
    return postFunction("set-player-equipment", {
      player_id: this.getPlayerId(),
      slot,
      item_id: itemId
    });
  },

  getPlayerId() {
    return localStorage.getItem("gwPlayerId");
  },

  getSessionToken() {
    try {
      const raw = localStorage.getItem("gwAccountSession");
      const session = raw ? JSON.parse(raw) : null;
      const expiresAt = Date.parse(session?.expiresAt || session?.expires_at || "");
      if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return "";
      return session?.token || "";
    } catch {
      return "";
    }
  },

  getPlayerSessionToken() {
    const accountToken = this.getSessionToken();
    if (accountToken) return accountToken;
    if (this.hasStoredAccount()) return "";

    try {
      const raw = localStorage.getItem("gwPlayerSession");
      const session = raw ? JSON.parse(raw) : null;
      return session?.token || "";
    } catch {
      return "";
    }
  },

  hasStoredAccount() {
    return hasStoredGridWildAccount();
  },

  setPlayerSession(session) {
    if (!session?.token) {
      localStorage.removeItem("gwPlayerSession");
      return;
    }

    localStorage.setItem(
      "gwPlayerSession",
      JSON.stringify({
        token: session.token,
        type: session.type || "guest",
        expiresAt: session.expires_at || session.expiresAt || ""
      })
    );
  },

  clearPlayerSession() {
    localStorage.removeItem("gwPlayerSession");
  },

  setPlayerId(id) {
    localStorage.setItem("gwPlayerId", id);
  }
};
