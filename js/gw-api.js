window.GridWildAPI = {

    async getBootstrap() {
        const playerId = this.getPlayerId();

        const res = await fetch("/.netlify/functions/get-bootstrap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ player_id: playerId })
        });

        if (!res.ok) throw new Error(await res.text());
        return await res.json();
    },

    async createParty(name = "New Party", questId = null, options = {}) {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/create-party", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId,
      name,
      quest_id: questId,
      ...options
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},

async joinParty(partyId) {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/join-party", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId,
      party_id: partyId
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},

async leaveParty(partyId) {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/leave-party", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId,
      party_id: partyId
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},

async getParty(partyId = null) {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/get-party", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId,
      party_id: partyId
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},

async getPartyForQuest(questId) {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/get-party-for-quest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId,
      quest_id: questId
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},

async endParty(partyId) {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/end-party", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId,
      party_id: partyId
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},

async setActiveParty(partyId = null) {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/set-active-party", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId,
      party_id: partyId
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},
async getNearbyParties() {
  const res = await fetch("/.netlify/functions/get-nearby-parties", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},
async getPartyRoute(partyId) {
  const res = await fetch("/.netlify/functions/get-party-route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ party_id: partyId })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},
async claimQuestEvidence(questId, obsId, source = "observation") {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/claim-quest-evidence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId,
      quest_id: questId,
      obs_id: obsId,
      source
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},
async updatePlayer(patch = {}) {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/update-player", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      player_id: playerId,
      ...patch
    })
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return await res.json();
},

async addWildpoints(delta = 0) {
  window.__gwState = window.__gwState || {};
  window.__gwState.player = window.__gwState.player || {};

  const current = Number(window.__gwState.player.wildpoints || 0);
  const next = current + Number(delta || 0);

  const result = await this.updatePlayer({
    wildpoints: next
  });

  window.__gwState.player = result.player;

  return result.player;
},
async setActiveQuest(questId = null) {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/set-active-quest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId,
      quest_id: questId
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},
async createQuest(quest) {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/create-quest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...quest,
      player_id: playerId
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},
async getQuests() {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/get-quests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},
async getNearbyLocalNiches(lat, lng, options = {}) {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/get-local-niches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId,
      lat,
      lng,
      radius_m: options.radius_m,
      limit: options.limit
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},
async setHomeNiche(nicheId) {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/set-home-niche", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId,
      niche_id: nicheId
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},
async unsetHomeNiche() {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/unset-home-niche", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},
async getLocalNicheHomeUsers(nicheId) {
  const res = await fetch("/.netlify/functions/get-local-niche-home-users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ niche_id: nicheId })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},
async upsertLocalNiches(niches = []) {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/upsert-local-niches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId,
      niches
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},
async getLocalNicheComments(nicheId) {
  const res = await fetch("/.netlify/functions/get-local-niche-comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ niche_id: nicheId })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},
async addLocalNicheComment(nicheId, commentText, commentType = "general_comment") {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/add-local-niche-comment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId,
      niche_id: nicheId,
      comment_text: commentText,
      comment_type: commentType
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},
async createSampleNicheQuest(nicheId) {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/create-sample-niche-quest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId,
      niche_id: nicheId
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},
async addPartyRoutePoint(partyId, lat, lng, accuracyMeters = null) {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/add-party-route-point", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId,
      party_id: partyId,
      lat,
      lng,
      accuracy_meters: accuracyMeters
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},

async updatePartyEvidenceStatus(partyId, draftId, status) {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/update-party-evidence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId,
      party_id: partyId,
      draft_id: draftId,
      status
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},

async addPartyEvidence(evidence) {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/add-party-evidence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...evidence,
      player_id: playerId
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},

    async acceptQuest(questId) {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/accept-quest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId,
      quest_id: questId
        })
    });

    if (!res.ok) throw new Error(await res.text());
    return await res.json();
    },

    async abandonQuest(questId) {
    const playerId = this.getPlayerId();

    const res = await fetch("/.netlify/functions/abandon-quest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        player_id: playerId,
        quest_id: questId
        })
    });

    if (!res.ok) throw new Error(await res.text());
    return await res.json();
    },

    async archiveQuest(questId) {
    const playerId = this.getPlayerId();

    const res = await fetch("/.netlify/functions/archive-quest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        player_id: playerId,
        quest_id: questId
        })
    });

    if (!res.ok) throw new Error(await res.text());
    return await res.json();
    },

    async completeQuest(questId) {
    const playerId = this.getPlayerId();

    const res = await fetch("/.netlify/functions/complete-quest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        player_id: playerId,
        quest_id: questId
        })
    });

    if (!res.ok) throw new Error(await res.text());
    return await res.json();
    },
    async addPlayerInventoryItem(itemId) {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/add-player-inventory-item", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId,
      item_id: itemId
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},
async getSurveys() {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/get-surveys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},

async getSurveyById(surveyId) {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/get-survey-by-id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId,
      survey_id: surveyId
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},

async saveSurvey(survey) {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/save-survey", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId,
      survey
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},
async deleteSurvey(surveyId) {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/delete-survey", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId,
      survey_id: surveyId
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},

async setPlayerSurveyState(surveyId, patch = {}) {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/set-player-survey-state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId,
      survey_id: surveyId,
      ...patch
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},
async upsertPlayerAchievements(achievements = []) {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/upsert-player-achievements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId,
      achievements
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},
async setPlayerEquipment(slot, itemId = null) {
  const playerId = this.getPlayerId();

  const res = await fetch("/.netlify/functions/set-player-equipment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId,
      slot,
      item_id: itemId
    })
  });

  if (!res.ok) throw new Error(await res.text());
  return await res.json();
},
  async createPlayer(displayName = "New Explorer") {
    const res = await fetch("/.netlify/functions/create-player", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: displayName })
    });

    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  },

  getPlayerId() {
    return localStorage.getItem("gwPlayerId");
  },

  setPlayerId(id) {
    localStorage.setItem("gwPlayerId", id);
  }

  
};

