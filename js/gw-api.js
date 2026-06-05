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

async function postFunction(name, payload = {}, options = {}) {
  const res = await fetch(`/.netlify/functions/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    body: gridWildApiBody(payload),
    ...(options.fetchOptions || {})
  });

  if (!res.ok) throw await gridWildApiErrorFromResponse(res);
  return await res.json();
}

function gridWildINatHeaders() {
  const token = window.GridWildINatAuth?.getToken?.() || "";
  return token ? { "X-GridWild-INat-Token": token } : {};
}

window.GridWildAPI = {
  async getBootstrap() {
    return postFunction("get-bootstrap", { player_id: this.getPlayerId() });
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

  async addPartyRoutePoint(partyId, lat, lng, accuracyMeters = null) {
    return postFunction("add-party-route-point", {
      player_id: this.getPlayerId(),
      party_id: partyId,
      lat,
      lng,
      accuracy_meters: accuracyMeters
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
      return session?.token || "";
    } catch {
      return "";
    }
  },

  getPlayerSessionToken() {
    const accountToken = this.getSessionToken();
    if (accountToken) return accountToken;

    try {
      const raw = localStorage.getItem("gwPlayerSession");
      const session = raw ? JSON.parse(raw) : null;
      return session?.token || "";
    } catch {
      return "";
    }
  },

  setPlayerSession(session) {
    if (!session?.token) {
      localStorage.removeItem("gwPlayerSession");
      return;
    }

    localStorage.setItem("gwPlayerSession", JSON.stringify({
      token: session.token,
      type: session.type || "guest",
      expiresAt: session.expires_at || session.expiresAt || ""
    }));
  },

  clearPlayerSession() {
    localStorage.removeItem("gwPlayerSession");
  },

  setPlayerId(id) {
    localStorage.setItem("gwPlayerId", id);
  }
};
