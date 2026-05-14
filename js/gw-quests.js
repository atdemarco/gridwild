// -----------------------------------------------------------------------------
// GridWild Quest recipes + quest list + quest status/creation modals
// -----------------------------------------------------------------------------

(function () {
  const STORAGE_KEY = "gw_quests_v1";

  const TAXON_FLAVORS = {
    Any:       { label: "Any life", icon: "🌎" },
    Insecta:  { label: "Insects", icon: "🐛" },
    Plantae:  { label: "Plants", icon: "🌿" },
    Fungi:    { label: "Fungi", icon: "🍄" },
    Aves:     { label: "Birds", icon: "🐦" },
    Mammalia: { label: "Mammals", icon: "🦝" }
  };

  const OBJECTIVES = {
    any_observation: {
      label: "Make any observation",
      icon: "📷",
      summary: "Document any organism in the chosen arena."
    },
    new_square_taxon: {
      label: "New taxon for this square",
      icon: "✨",
      summary: "Find a taxon not yet represented in the current grid area."
    },
    underobserved: {
      label: "Under-observed life",
      icon: "🔎",
      summary: "Look for taxa that are likely nearby but poorly sampled."
    },
    revisit_fading: {
      label: "Revisit fading territory",
      icon: "🕯️",
      summary: "Refresh a surveyed cell before it fades back into fog."
    },
    leaderboard: {
      label: "Challenge local territory",
      icon: "🏴",
      summary: "Target a cell where another observer currently dominates."
    }
  };

  const RANGE_LABELS = {
    here: "Here",
    "1min": "1 minute walk",
    "5min": "5 minute walk",
    "15min": "15 minute walk",
    anywhere: "Anywhere"
  };

  const TIMEFRAME_LABELS = {
    now: "Right now",
    today: "Today",
    week: "This week",
    weekend: "This weekend"
  };

  const TARGET_LOCATION_LABELS = {
  specific_square: "Specific square",
  area_3x3: "Area range: 3×3 squares",
  area_20x20: "Area range: 20×20 squares",
  anywhere: "Anywhere"
};

const CAMPAIGNS = {
  none: {
    id: "none",
    name: "None",
    description: "No survey association. This is a standalone quest.",
    anatomy: ["Standalone quest", "No survey scoring", "No shared survey boundary"]
  },
  front_yard: {
    id: "front_yard",
    name: "My Front Yard",
    description: "A tiny personal biodiversity atlas for the immediate home territory.",
    anatomy: ["Permanent home survey", "Small location radius", "Good for daily phenology"]
  },
  georgetown_ark: {
    id: "georgetown_ark",
    name: "Georgetown Ark Project",
    description: "A campus-scale biodiversity rescue and discovery survey.",
    anatomy: ["Urban campus survey", "Student-friendly quests", "Restoration / stewardship framing"]
  },
  wildsumaco: {
    id: "wildsumaco",
    name: "WildSumaco Research Station",
    description: "Persistent biomarathon for visitors documenting life across a tropical field station.",
    anatomy: ["Station boundary placeholder", "Visitor sampling routes", "Future KML / drawn polygon support"]
  },
  weekend_bioblitz: {
    id: "weekend_bioblitz",
    name: "Weekend Bioblitz",
    description: "Short, time-boxed burst survey for rapid local biodiversity discovery.",
    anatomy: ["Temporary survey", "High activity window", "Good for group events"]
  }
};




const LANIER_HEIGHTS_TEST_POINTS = [
  { label: "Lanier Heights north", lat: 38.92555, lng: -77.04195 },
  { label: "Lanier Heights middle", lat: 38.92395, lng: -77.04285 },
  { label: "Lanier Heights south", lat: 38.92245, lng: -77.04365 }
];

function cellTargetFromLatLng(lat, lng, mode = "specific_square") {
  const p = map.options.crs.project(L.latLng(lat, lng));
  const ix = Math.floor(p.x / GRID_SIZE_M);
  const iy = Math.floor(p.y / GRID_SIZE_M);

  const radiusCells = {
    specific_square: 0,
    area_3x3: 1,
    area_20x20: 10,
    anywhere: null
  }[mode];

  return {
    mode,
    lat,
    lng,
    ix,
    iy,
    cellKey: `${ix},${iy}`,
    radiusCells,
    label: TARGET_LOCATION_LABELS[mode] || mode
  };
}

function makeLanierTarget(mode) {
  if (mode === "anywhere") {
    return {
      mode: "anywhere",
      label: "Anywhere",
      radiusCells: null
    };
  }

  const pt = LANIER_HEIGHTS_TEST_POINTS[
    Math.floor(Math.random() * LANIER_HEIGHTS_TEST_POINTS.length)
  ];

  return {
    ...cellTargetFromLatLng(pt.lat, pt.lng, mode),
    placeName: pt.label
  };
}

function makeTodayQuestSeed(title, recipe, forcedTargetLocation) {
  const targetLocation = forcedTargetLocation || recipe.targetLocation || "area_3x3";

  return {
    title,
    recipe: {
      range: targetLocation === "anywhere" ? "anywhere" : "here",
      iconicTaxon: recipe.iconicTaxon || "Any",
      objectiveType: recipe.objectiveType || "any_observation",
      difficulty: Number(recipe.difficulty || 1),
      timeframe: "today",
      evidence: "photo_gps20",
      surveyId: recipe.surveyId || "none",
      targetLocation,
      target: makeLanierTarget(targetLocation)
    }
  };
}

function generateDailyQuests() {
  const required = [
    makeTodayQuestSeed(
      "Open-world wander: observe anything today",
      { iconicTaxon: "Any", objectiveType: "any_observation", difficulty: 1 },
      "anywhere"
    ),
    makeTodayQuestSeed(
      "Lanier Heights pinpoint survey",
      { iconicTaxon: "Plantae", objectiveType: "any_observation", difficulty: 2 },
      "specific_square"
    ),
    makeTodayQuestSeed(
      "Lanier Heights 3×3 sweep",
      { iconicTaxon: "Insecta", objectiveType: "underobserved", difficulty: 3 },
      "area_3x3"
    )
  ];

  const extras = [
    makeTodayQuestSeed(
      "Find fungi, lichens, or decomposers",
      { iconicTaxon: "Fungi", objectiveType: "underobserved", difficulty: 3 },
      "area_20x20"
    ),
    makeTodayQuestSeed(
      "Add one new taxon to the neighborhood",
      { iconicTaxon: "Any", objectiveType: "new_square_taxon", difficulty: 4 },
      ["specific_square", "area_3x3", "area_20x20", "anywhere"][Math.floor(Math.random() * 4)]
    )
  ];

  return [...required, ...extras];
}

let DAILY_QUESTS = generateDailyQuests();
let sharedSurveyOpened = false;


const DAILY_QUESTS_ORIGINAL = [
  {
    title: "Photograph one plant in the current area",
    recipe: { iconicTaxon: "Plantae", objectiveType: "any_observation", difficulty: 1, targetLocation: "area_3x3", timeframe: "today", surveyId: "none" }
  },
  {
    title: "Find an insect or spider near you",
    recipe: { iconicTaxon: "Insecta", objectiveType: "underobserved", difficulty: 2, targetLocation: "area_3x3", timeframe: "today", surveyId: "none" }
  },
  {
    title: "Refresh one fading fog cell",
    recipe: { iconicTaxon: "Any", objectiveType: "revisit_fading", difficulty: 2, targetLocation: "specific_square", timeframe: "today", surveyId: "none" }
  },
  {
    title: "Look for fungi, lichens, or decomposers",
    recipe: { iconicTaxon: "Fungi", objectiveType: "underobserved", difficulty: 3, targetLocation: "area_20x20", timeframe: "today", surveyId: "none" }
  },
  {
    title: "Add one new taxon to this neighborhood",
    recipe: { iconicTaxon: "Any", objectiveType: "new_square_taxon", difficulty: 4, targetLocation: "area_20x20", timeframe: "today", surveyId: "none" }
  }
];



  function loadQuests() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveQuests(quests) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quests || []));
  }

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function difficultyLabel(n) {
    n = Number(n) || 1;
    if (n <= 1) return "Easy";
    if (n === 2) return "Moderate";
    if (n === 3) return "Challenging";
    if (n === 4) return "Hard";
    return "Mythic";
  }

    function statusLabel(status) {
    const s = String(status || "paused").toLowerCase();

    if (s === "active") return "Active";
    if (s === "available") return "Available";
    if (s === "paused" || s === "draft") return "Paused";
    if (s === "stale" || s === "expired") return "Stale";
    if (s === "unavailable") return "Unavailable";
    if (s === "completed" || s === "complete") return "Completed";
    if (s === "archived") return "Archived";
    if (s === "abandoned") return "Abandoned";

    return "Paused";
    }

    function statusClass(status) {
    const s = String(status || "paused").toLowerCase();
    if (s === "complete") return "completed";
    if (s === "expired") return "stale";
    return s;
    }

  function estimateRewardXP(recipe) {
    const difficulty = Number(recipe.difficulty || 1);
    const rangeBonus = {
      here: 0,
      "1min": 5,
      "5min": 15,
      "15min": 30,
      anywhere: 10
    }[recipe.range] ?? 0;

    const objectiveBonus = {
      any_observation: 10,
      new_square_taxon: 35,
      underobserved: 45,
      revisit_fading: 30,
      leaderboard: 50
    }[recipe.objectiveType] ?? 10;

    return Math.round(20 + difficulty * 20 + rangeBonus + objectiveBonus);
  }

  function buildQuestTitle(recipe) {
    const tax = TAXON_FLAVORS[recipe.iconicTaxon]?.label || "Life";
    const obj = OBJECTIVES[recipe.objectiveType]?.label || "Field quest";
    return `${obj}: ${tax}`;
  }

 function isArchivedQuest(q) {
  return q?.archived === true ||
    q?.archived === "true" ||
    !!q?.archivedAt ||
    String(q?.status || "").toLowerCase() === "archived";
}

function isAbandonedQuest(q) {
  return String(q?.status || "").toLowerCase() === "abandoned";
}

function normalizeDbQuest(q) {
  const playerQuest = q.player_quests?.[0] || null;
  const storedRecipe = q.recipe && typeof q.recipe === "object" ? q.recipe : {};

  const recipe = {
    range: storedRecipe.range || "anywhere",
    iconicTaxon: storedRecipe.iconicTaxon || "Any",
    objectiveType: storedRecipe.objectiveType || (q.quest_type === "identify" ? "new_square_taxon" : "any_observation"),
    difficulty: Number(storedRecipe.difficulty || 1),
    timeframe: storedRecipe.timeframe || "today",
    evidence: storedRecipe.evidence || "photo_gps20",
    targetLocation: storedRecipe.targetLocation || storedRecipe.target?.mode || "anywhere",
    target: storedRecipe.target || null,
    surveyId: storedRecipe.surveyId || "none",
    quantity: storedRecipe.quantity || storedRecipe.targetCount || 1
  };

  return {
    id: q.id,
    dbId: q.id,
    source: "db",
    title: q.title || "Untitled Quest",
    createdAt: q.created_at || nowISO(),
    status: playerQuest?.status || q.status || "available",
    archived: false,
    archivedAt: null,
    startedAt: playerQuest?.accepted_at || q.accepted_at || null,
    completedAt: playerQuest?.completed_at || q.completed_at || null,
    pointValue: q.reward_wildpoints || 0,
    description: q.description || "",
    recipe
  };
}

function getDbQuests() {
  const quests = window.__gwState?.quests || [];
  return Array.isArray(quests) ? quests.map(normalizeDbQuest) : [];
}

function isPlayerTrackedQuest(q) {
  const status = String(q?.status || "").toLowerCase();
  return !["", "available", "unavailable"].includes(status);
}

function updateRuntimeQuestPlayerState(questId, playerQuest, patch = {}) {
  window.__gwState = window.__gwState || {};
  const nextStatus = playerQuest?.status || patch.status || null;

  window.__gwState.quests = (window.__gwState.quests || []).map(q => {
    const isTarget = String(q.id) === String(questId);

    if (!isTarget) {
      const pq = q.player_quests?.[0] || null;
      const currentStatus = pq?.status || q.status;

      if (nextStatus === "active" && currentStatus === "active") {
        return {
          ...q,
          status: "paused",
          player_quests: pq
            ? [{ ...pq, status: "paused" }]
            : q.player_quests
        };
      }

      return q;
    }

    return {
      ...q,
      status: nextStatus || q.status,
      accepted_at: playerQuest?.accepted_at || patch.accepted_at || q.accepted_at || null,
      completed_at: playerQuest?.completed_at || patch.completed_at || q.completed_at || null,
      player_quests: playerQuest
        ? [playerQuest]
        : q.player_quests
    };
  });
}

function getVisibleQuests() {
  return getDbQuests()
    .filter(q => isPlayerTrackedQuest(q) && !isArchivedQuest(q) && !isAbandonedQuest(q));
}

async function acceptAndEmbarkQuest(quest) {
  if (!quest) return null;

  if (quest.source === "db" || quest.dbId) {
    const questId = quest.dbId || quest.id;
    const accepted = await window.GridWildAPI.acceptQuest(questId);
    await window.GridWildAPI.setActiveQuest(questId);

    quest.status = "active";
    quest.startedAt = accepted.player_quest?.accepted_at || quest.startedAt || nowISO();

    window.__gwState = window.__gwState || {};
    window.__gwState.activeQuestId = questId;
    updateRuntimeQuestPlayerState(questId, accepted.player_quest, {
      status: "active",
      accepted_at: quest.startedAt
    });

    window.refreshQuestBadge?.();
    renderQuestListIntoPage();

    if (window.GridWildQuestLayer) {
      window.GridWildQuestLayer.embark(quest);
    }

    window.dispatchEvent(new CustomEvent("gwQuestEmbarked", {
      detail: { quest }
    }));

    return quest;
  }

  const activeQuest = embarkQuest(quest.id);

  window.dispatchEvent(new CustomEvent("gwQuestEmbarked", {
    detail: { quest: activeQuest || quest }
  }));

  return activeQuest || quest;
}

function getArchivedQuests() {
  return [
    ...getDbQuests().filter(q => isArchivedQuest(q)),
    ...loadQuests().filter(q => isArchivedQuest(q))
  ];
}

function embarkQuest(questId) {
  const quests = loadQuests();
  let activeQuest = null;

  quests.forEach(q => {
    if (q.archived) return;

    if (q.id === questId) {
      q.status = "active";
      q.startedAt = q.startedAt || nowISO();
      activeQuest = q;
    } else if (q.status === "active") {
      q.status = "paused";
    }
  });

  saveQuests(quests);
  renderQuestListIntoPage();
  window.dispatchEvent(new CustomEvent("gwQuestEvidenceChanged"));
  window.refreshQuestBadge?.();

  if (activeQuest && window.GridWildQuestLayer) {
    window.GridWildQuestLayer.embark(activeQuest);
  }

  return activeQuest;
}

async function archiveQuest(questId) {
  const dbQuest = getDbQuests().find(q => String(q.id) === String(questId));

  if (dbQuest?.source === "db" || dbQuest?.dbId) {
    try {
      const result = await window.GridWildAPI.archiveQuest(dbQuest.dbId || dbQuest.id);

      updateRuntimeQuestPlayerState(dbQuest.dbId || dbQuest.id, result.player_quest, {
        status: "archived"
      });

      if (String(window.__gwState?.activeQuestId || "") === String(dbQuest.dbId || dbQuest.id)) {
        await window.GridWildAPI.setActiveQuest(null);
        window.__gwState.activeQuestId = null;
        window.GridWildQuestLayer?.clear?.();
      }

      renderQuestListIntoPage();
      window.refreshQuestBadge?.();
      window.dispatchEvent(new CustomEvent("gwQuestEvidenceChanged"));

      return true;
    } catch (err) {
      console.error("Archive quest failed:", err);
      alert(`Could not archive quest: ${err.message}`);
      return false;
    }
  }

  const quests = loadQuests();
  const q = quests.find(x => x.id === questId);
  if (!q) return false;

  const wasActive = q.status === "active";

  q.archived = true;
  q.archivedAt = nowISO();

  // Archiving ends the current field action.
  if (wasActive) {
    q.status = "paused";
    if (window.GridWildQuestLayer?.clear) {
        window.GridWildQuestLayer.clear();
    }
    if (window.__gwState?.activeQuestId === q.id) {
      delete window.__gwState.activeQuestId;
      window.refreshQuestBadge?.();
    }
  }

  saveQuests(quests);
  renderQuestListIntoPage();
  window.refreshQuestBadge?.();
  window.dispatchEvent(new CustomEvent("gwQuestEvidenceChanged"));

  return true;
}

async function abandonQuest(questId) {
  const dbQuest = getDbQuests().find(q => String(q.id) === String(questId));

  if (dbQuest?.source === "db" || dbQuest?.dbId) {
    try {
      const id = dbQuest.dbId || dbQuest.id;
      const result = await window.GridWildAPI.abandonQuest(id);

      updateRuntimeQuestPlayerState(id, result.player_quest, {
        status: "abandoned"
      });

      if (result.deactivated_quest) {
        window.__gwState.quests = (window.__gwState.quests || [])
          .filter(q => String(q.id) !== String(id));
      }

      if (String(window.__gwState?.activeQuestId || "") === String(id)) {
        window.__gwState.activeQuestId = null;
        window.GridWildQuestLayer?.clear?.();
      }

      renderQuestListIntoPage();
      window.refreshQuestBadge?.();
      window.dispatchEvent(new CustomEvent("gwQuestEvidenceChanged"));

      return true;
    } catch (err) {
      console.error("Abandon quest failed:", err);
      alert(`Could not abandon quest: ${err.message}`);
      return false;
    }
  }

  const quests = loadQuests();
  const q = quests.find(x => x.id === questId);
  if (!q) return false;

  const next = quests.filter(x => x.id !== questId);
  saveQuests(next);

  if (window.__gwState?.activeQuestId === questId) {
    window.__gwState.activeQuestId = null;
    window.GridWildQuestLayer?.clear?.();
  }

  renderQuestListIntoPage();
  window.refreshQuestBadge?.();
  window.dispatchEvent(new CustomEvent("gwQuestEvidenceChanged"));

  return true;
}

function getRuntimePartyIdForQuest(questId) {
  const id = String(questId || "");
  if (!id) return null;

  const activeParty = window.__gwState?.party;
  const activeLinked = (window.__gwState?.partyEvents || [])
    .some(e => String(e?.payload?.quest_id || "") === id);

  if (activeParty?.id && activeLinked) return activeParty.id;

  const parties = window.GridWildParty?.getAllParties?.() || [];
  const party = parties.find(p => String(p.linkedQuestId || "") === id);

  return party?.id || null;
}

async function hydratePartyForQuest(questId) {
  const runtimePartyId = getRuntimePartyIdForQuest(questId);
  if (runtimePartyId) return runtimePartyId;

  const result = await window.GridWildAPI?.getPartyForQuest?.(questId);
  if (!result?.party?.id) return null;

  window.__gwState = window.__gwState || {};
  window.__gwState.party = result.party;
  window.__gwState.partyMembers = result.members || [];
  window.__gwState.partyEvents = result.events || [];
  window.__gwState.partyEvidence = result.evidence || [];
  window.__gwState.partyProgress = result.progress || 0;

  try {
    const routeData = await window.GridWildAPI?.getPartyRoute?.(result.party.id);
    window.__gwState.partyRoute = routeData?.route || [];
  } catch (err) {
    console.warn("Could not load quest party route:", err);
    window.__gwState.partyRoute = [];
  }

  return result.party.id;
}

async function openQuestPartyRecap(questId) {
  try {
    const partyId = await hydratePartyForQuest(questId);

    if (!partyId) {
      alert("No party recap is linked to this quest yet.");
      return;
    }

    document
      .querySelectorAll(".gw-quest-modal-backdrop")
      .forEach(el => el.remove());

    window.GridWildParty?.openPartyRecap?.(partyId);
  } catch (err) {
    console.error("Could not open quest party recap:", err);
    alert(`Could not open party recap: ${err.message}`);
  }
}

async function updateCompletedQuestPartyButton(root, questId) {
  const btn = root.querySelector("#gwQuestPartyBtn");
  if (!btn) return;

  try {
    const partyId = await hydratePartyForQuest(questId);
    if (!partyId || !document.body.contains(root)) return;

    btn.disabled = false;
    btn.textContent = "View Party";
    btn.dataset.partyId = partyId;
  } catch (err) {
    console.warn("Could not find linked quest party:", err);
  }
}

function openQuestArchive() {
  injectStyles();

  document
    .querySelectorAll(".gw-quest-modal-backdrop")
    .forEach(el => el.remove());

  const archived = getArchivedQuests();

  const root = document.createElement("div");
  root.className = "gw-quest-modal-backdrop";

  root.innerHTML = `
    <div class="gw-quest-modal">
      <div class="gw-quest-modal-title">Archive of Quests</div>
      <div class="gw-quest-modal-subtitle">
        Quests stored here are hidden from Current and Prior Quests.
      </div>

      ${
        archived.length
          ? `
            <div class="gw-list">
              ${archived.map(q => {
                const r = q.recipe || {};
                return `
                  <div class="gw-rowline">
                    <span style="display:flex;align-items:center;gap:10px;min-width:0;">
                      <span class="gw-quest-icon">${esc(getFlavorIcon(q))}</span>
                      <span style="min-width:0;display:flex;flex-direction:column;line-height:1.18;">
                        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                          ${esc(q.title)}
                        </span>
                        <span class="gw-muted" style="font-size:11px;">
                          ${esc(RANGE_LABELS[r.range] || r.range)} · ${esc(TIMEFRAME_LABELS[r.timeframe] || r.timeframe)}
                        </span>
                      </span>
                    </span>

                    <span class="gw-quest-pill archived">Archived</span>
                  </div>
                `;
              }).join("")}
            </div>
          `
          : `<div class="gw-muted">No archived quests yet.</div>`
      }

      <div class="gw-quest-actions">
        <button class="gw-quest-btn secondary" id="gwQuestArchiveCloseBtn">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  root.addEventListener("click", evt => {
    if (evt.target === root) closeModal(root);
  });

  root.querySelector("#gwQuestArchiveCloseBtn").onclick = () => closeModal(root);

  root.querySelectorAll(".gw-rowline").forEach((row, idx) => {
    row.style.cursor = "pointer";
    row.addEventListener("click", () => {
      const quest = archived[idx];
      if (quest) openQuestStatus(quest.id);
    });
  });
}

  function makeQuest(recipe) {
    const fullRecipe = {
    range: recipe.range || "here",
    iconicTaxon: recipe.iconicTaxon || "Any",
    objectiveType: recipe.objectiveType || "any_observation",
    difficulty: Number(recipe.difficulty || 1),
    timeframe: recipe.timeframe || "today",
    evidence: recipe.evidence || "photo_gps20",
    targetLocation: recipe.targetLocation || "area_3x3",
    target: recipe.target || null,
    surveyId: recipe.surveyId || "none"
    };

    return {
      id: `quest_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      title: buildQuestTitle(fullRecipe),
      createdAt: nowISO(),
      status: "paused",
      startedAt: null,
      archived: false,
      archivedAt: null,
      completedAt: null,
      pointValue: estimateRewardXP(fullRecipe),
      recipe: fullRecipe
    };
  }

async function startQuestFromRecipe(recipe, options = {}) {
  const title = options.title || buildQuestTitle(recipe);
  const source = options.source || "manual";
  const rewardXP = Number(options.rewardXP);

  const quest = makeQuest(recipe);
  quest.title = title;
  quest.source = source;
  if (Number.isFinite(rewardXP) && rewardXP > 0) {
    quest.pointValue = Math.round(rewardXP);
  }

  try {
    const result = await window.GridWildAPI.createQuest({
      title: quest.title,
      description: "",
      quest_type: "explore",
      reward_wildpoints: quest.pointValue || estimateRewardXP(quest.recipe),
      recipe: quest.recipe,
      source
    });

    const data = await window.GridWildAPI.getQuests();

    window.__gwState = window.__gwState || {};
    window.__gwState.quests = data.quests || [];
    window.__gwState.questEvidence = (data.quests || [])
      .flatMap(q => q.quest_evidence || []);

    const dbQuest = result.quest;
    const normalized = normalizeDbQuest(dbQuest);

    renderQuestListIntoPage();

    if (options.autoEmbark === true) {
      await acceptAndEmbarkQuest(normalized);
    } else if (options.openStatus !== false) {
      openQuestStatus(normalized.id);
    }

    window.dispatchEvent(new CustomEvent("gwQuestStarted", {
      detail: { quest: normalized }
    }));

    return normalized;
  } catch (err) {
    console.error("DB quest create failed:", err);
    alert(`Could not create quest: ${err.message}`);
    return null;
  }
}

  function getFlavorIcon(quest) {
    const recipe = quest?.recipe || {};
    const taxIcon = TAXON_FLAVORS[recipe.iconicTaxon]?.icon || "🌎";
    const objIcon = OBJECTIVES[recipe.objectiveType]?.icon || "🎯";
    return `${taxIcon}${objIcon}`;
  }

  function injectStyles() {
    if (document.getElementById("gwQuestStyles")) return;

    const style = document.createElement("style");
    style.id = "gwQuestStyles";
    style.textContent = `

    .gw-quest-row.is-completed-quest {
      opacity: 0.62;
      background: rgba(80,220,140,0.06);
      border-radius: 14px;
      padding-left: 8px;
      padding-right: 8px;
    }

    .gw-quest-row.is-completed-quest .gw-quest-row-title {
      text-decoration: line-through;
      text-decoration-thickness: 2px;
      text-decoration-color: rgba(158,230,189,0.55);
    }
      
     .gw-quest-btn.danger {
        background: rgba(170,55,45,0.30);
        color: #ffd8d2;
        border: 1px solid rgba(255,130,110,0.30);
      }

      .gw-quest-row {
        cursor: pointer;
      }

      .gw-quest-row:hover {
        background: rgba(240,209,138,0.06);
      }

      .gw-quest-icon {
        width: 44px;
        height: 34px;
        border-radius: 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        white-space: nowrap;
        line-height: 1;
        background: rgba(240,209,138,0.10);
        border: 1px solid rgba(240,209,138,0.20);
        flex: 0 0 auto;
      }

      .gw-quest-pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 3px 7px;
        font-size: 10px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        border: 1px solid rgba(240,209,138,0.22);
        color: rgba(240,209,138,0.95);
        background: rgba(240,209,138,0.08);
      }

      .gw-quest-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  width: 100%;
}

.gw-quest-row-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.gw-quest-row-text {
  min-width: 0;
  margin-left: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.18;
  text-align: right;
}

.gw-quest-row-title,
.gw-quest-row-sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gw-quest-row-controls {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  white-space: nowrap;
}

.gw-quest-row-controls .gw-mini-btn {
  padding: 6px 7px;
  font-size: 10px;
  border-radius: 10px;
}

.gw-quest-status-stack {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}

.gw-quest-difficulty {
  font-size: 10px;
}

@media (max-width: 420px) {
  .gw-quest-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
    padding-top: 8px;
    padding-bottom: 8px;
  }

  .gw-quest-icon {
    width: 38px;
  }

  .gw-quest-row-main {
    min-width: 0;
  }

  .gw-quest-row-text {
    min-width: 0;
  }

  .gw-quest-row-title {
    font-size: 12px;
  }

  .gw-quest-row-sub {
    display: none;
  }

  .gw-quest-row-controls {
    gap: 4px;
  }

  .gw-quest-row-controls .gw-mini-btn {
    padding: 4px 6px;
    font-size: 9px;
    border-radius: 999px;
  }

  .gw-quest-pill {
    font-size: 9px;
    padding: 3px 5px;
  }

  .gw-quest-pill {
    font-size: 10px;
    padding: 4px 6px;
  }
}

      .gw-quest-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 99996;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
        box-sizing: border-box;
        background: rgba(9, 12, 10, 0.76);
      }

      .gw-quest-modal {
        width: min(470px, 96vw);
        max-height: min(760px, 92vh);
        overflow: auto;
        border-radius: 24px;
        padding: 16px;
        box-sizing: border-box;
        color: #efe6d3;
        background:
          linear-gradient(180deg, rgba(47,40,33,0.98), rgba(23,19,16,0.99));
        border: 2px solid rgba(215,183,116,0.58);
        box-shadow: 0 24px 80px rgba(0,0,0,0.56);
      }

      .gw-quest-modal-title {
        color: #f0d18a;
        font-size: 20px;
        font-weight: 950;
        margin-bottom: 6px;
      }

      .gw-quest-modal-subtitle {
        color: rgba(239,230,211,0.68);
        font-size: 12px;
        line-height: 1.35;
        margin-bottom: 14px;
      }

      .gw-quest-form {
        display: grid;
        gap: 12px;
      }

      .gw-quest-field label {
        display: block;
        color: #d7b774;
        font-size: 11px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-bottom: 5px;
      }

      .gw-quest-field select,
      .gw-quest-field input[type="range"] {
        width: 100%;
      }

      .gw-quest-field select {
        border-radius: 12px;
        padding: 10px;
        border: 1px solid rgba(215,183,116,0.30);
        background: rgba(20,17,15,0.88);
        color: #efe6d3;
        font-weight: 750;
      }

      .gw-quest-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-top: 14px;
      }

      .gw-quest-btn {
        border: 0;
        border-radius: 999px;
        padding: 13px 14px;
        font-size: 14px;
        font-weight: 900;
        cursor: pointer;
      }

      .gw-quest-btn.primary {
        background: #ffe082;
        color: #21301f;
      }

      .gw-quest-btn.secondary {
        background: rgba(255,255,255,0.10);
        color: #efe6d3;
        border: 1px solid rgba(255,255,255,0.14);
      }

      .gw-quest-status-grid {
        display: grid;
        gap: 8px;
        margin-top: 12px;
      }

      .gw-quest-status-line {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        border-bottom: 1px solid rgba(215,183,116,0.12);
        padding: 8px 0;
        font-size: 13px;
      }

      .gw-quest-status-line span:first-child {
        color: rgba(239,230,211,0.62);
      }

      .gw-quest-status-line span:last-child {
        font-weight: 850;
        text-align: right;
      }

    .gw-quest-actions.three {
    grid-template-columns: 1fr 1.15fr 1fr;
    }

    .gw-quest-actions-four {
      grid-template-columns: 1fr 1fr;
    }

    .gw-quest-actions-four .gw-quest-btn {
      font-size: 12px;
      padding: 11px 10px;
    }

    .gw-quest-btn.primary#gwQuestEmbarkBtn {
    background: linear-gradient(180deg, #ffe082, #d7b774);
    color: #1f271d;
    box-shadow:
        0 0 0 2px rgba(255,224,130,0.16),
        0 8px 22px rgba(0,0,0,0.28);
    }

    .gw-quest-row.is-active-quest {
    background:
        radial-gradient(circle at 0% 50%, rgba(255,224,130,0.18), transparent 42%),
        rgba(255,224,130,0.08);
    border-radius: 14px;
    padding-left: 8px;
    padding-right: 8px;
    box-shadow: inset 0 0 0 1px rgba(255,224,130,0.22);
    }

    .gw-quest-pill.active {
    color: #1f271d;
    background: linear-gradient(180deg, #ffe082, #d7b774);
    border-color: rgba(255,224,130,0.78);
    box-shadow: 0 0 12px rgba(255,224,130,0.28);
    }

    .gw-quest-pill.paused {
    color: rgba(239,230,211,0.82);
    background: rgba(255,255,255,0.07);
    }

    .gw-quest-pill.stale {
    color: #f6b36b;
    background: rgba(246,179,107,0.10);
    border-color: rgba(246,179,107,0.28);
    }

    .gw-quest-pill.unavailable {
    color: #cfc7b6;
    background: rgba(255,255,255,0.05);
    border-color: rgba(255,255,255,0.12);
    }

    .gw-quest-pill.completed {
    color: #9ee6bd;
    background: rgba(80,220,140,0.10);
    border-color: rgba(80,220,140,0.26);
    }

    .gw-quest-pill.archived {
    color: #cfc7b6;
    background: rgba(255,255,255,0.06);
    border-color: rgba(255,255,255,0.16);
    }

    .gw-quest-archive-btn {
    font-size: 10px;
    padding: 6px 8px;
    border-radius: 999px;
    opacity: 0.82;
    }

    .gw-quest-confirm-backdrop {
      z-index: 100000;
      background: rgba(9, 12, 10, 0.82);
    }

    .gw-quest-confirm-modal {
      width: min(430px, 94vw);
    }

    .gw-quest-confirm-name {
      margin-top: 10px;
      padding: 10px 12px;
      border-radius: 14px;
      color: #f4e8cf;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(215,183,116,0.14);
      font-size: 13px;
      font-weight: 850;
      line-height: 1.35;
    }
    `;

    document.head.appendChild(style);
  }

  function closeModal(root) {
    root?.remove();
  }

  function openQuestConfirmDialog({
    title = "Confirm",
    message = "",
    subject = "",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    danger = false
  } = {}) {
    injectStyles();

    return new Promise(resolve => {
      const root = document.createElement("div");
      root.className = "gw-quest-modal-backdrop gw-quest-confirm-backdrop";
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-modal", "true");
      root.setAttribute("aria-labelledby", "gwQuestConfirmTitle");

      root.innerHTML = `
        <div class="gw-quest-modal gw-quest-confirm-modal">
          <div class="gw-quest-modal-title" id="gwQuestConfirmTitle">${esc(title)}</div>
          <div class="gw-quest-modal-subtitle">${esc(message)}</div>
          ${subject ? `<div class="gw-quest-confirm-name">${esc(subject)}</div>` : ""}
          <div class="gw-quest-actions">
            <button class="gw-quest-btn secondary" id="gwQuestConfirmCancelBtn" type="button">${esc(cancelLabel)}</button>
            <button class="gw-quest-btn ${danger ? "danger" : "primary"}" id="gwQuestConfirmOkBtn" type="button">${esc(confirmLabel)}</button>
          </div>
        </div>
      `;

      const finish = value => {
        root.remove();
        resolve(value);
      };

      document.body.appendChild(root);

      root.querySelector("#gwQuestConfirmCancelBtn").onclick = () => finish(false);
      root.querySelector("#gwQuestConfirmOkBtn").onclick = () => finish(true);
      root.addEventListener("click", evt => {
        if (evt.target === root) finish(false);
      });
      root.addEventListener("keydown", evt => {
        if (evt.key === "Escape") finish(false);
      });

      root.querySelector("#gwQuestConfirmCancelBtn")?.focus();
    });
  }

  function openQuestStatus(questId) {

    document
      .querySelectorAll(".gw-quest-modal-backdrop")
      .forEach(el => el.remove());

    injectStyles();

    const quest =
      getVisibleQuests().find(q => q.id === questId) ||
      getDbQuests().find(q => q.id === questId) ||
      getArchivedQuests().find(q => q.id === questId) ||
      loadQuests().find(q => q.id === questId);

    if (!quest) return;

    const r = quest.recipe || {};
    const obj = OBJECTIVES[r.objectiveType] || OBJECTIVES.any_observation;
    const tax = TAXON_FLAVORS[r.iconicTaxon] || TAXON_FLAVORS.Any;
    const isCompletedQuest = ["completed", "complete"].includes(String(quest.status || "").toLowerCase());
    const isArchived = isArchivedQuest(quest);
    const isActiveQuest = String(quest.status || "").toLowerCase() === "active";

    const root = document.createElement("div");
    root.className = "gw-quest-modal-backdrop";

    root.innerHTML = `
      <div class="gw-quest-modal">
        <div class="gw-quest-modal-title">${esc(getFlavorIcon(quest))} ${esc(quest.title)}</div>
        <div class="gw-quest-modal-subtitle">
          ${esc(obj.summary)}
        </div>

        <div class="gw-quest-status-grid">
          <div class="gw-quest-status-line">
            <span>Status</span>
            <span>${esc(statusLabel(quest.status))}</span>
          </div>

          <div class="gw-quest-status-line">
            <span>Difficulty</span>
            <span>${esc(difficultyLabel(r.difficulty))}</span>
          </div>

          <div class="gw-quest-status-line">
            <span>Target flavor</span>
            <span>${esc(tax.icon)} ${esc(tax.label)}</span>
          </div>

          <div class="gw-quest-status-line">
            <span>Arena</span>
            <span>${esc(RANGE_LABELS[r.range] || r.range)}</span>
          </div>

          <div class="gw-quest-status-line">
            <span>Timeframe</span>
            <span>${esc(TIMEFRAME_LABELS[r.timeframe] || r.timeframe)}</span>
          </div>

          <div class="gw-quest-status-line">
            <span>Evidence</span>
            <span>${r.evidence === "photo_gps20" ? "Photo + GPS ≤20 m" : esc(r.evidence)}</span>
          </div>

          <div class="gw-quest-status-line">
            <span>Reward</span>
            <span>${esc(quest.pointValue)} XP</span>
          </div>
        </div>

        ${window.GridWildQuestEvidence
          ? window.GridWildQuestEvidence.renderQuestEvidencePanel(quest)
          : `
            <div class="gw-quest-modal-subtitle" style="margin-top:14px;">
              Evidence matching is not loaded yet.
            </div>
          `
        }

      <div class="gw-quest-actions gw-quest-actions-four">
      <button class="gw-quest-btn secondary" id="gwQuestCloseBtn">Close</button>
      ${isCompletedQuest ? `
        <button class="gw-quest-btn primary" id="gwQuestArchiveBtn">Archive</button>
      ` : isArchived ? `
        <button class="gw-quest-btn secondary" type="button" disabled>Archived</button>
      ` : isActiveQuest ? `
        <button class="gw-quest-btn danger" id="gwQuestAbandonBtn">Abandon</button>
      ` : `
        <button class="gw-quest-btn primary" id="gwQuestEmbarkBtn">Embark!</button>
      `}
      <button class="gw-quest-btn secondary" id="gwQuestPartyBtn" ${isCompletedQuest || isArchived ? "disabled" : ""}>Start Party</button>
      <button class="gw-quest-btn secondary" id="gwQuestCompleteBtn" ${isCompletedQuest || isArchived ? "disabled" : ""}>
        ${isCompletedQuest ? "Completed" : isArchived ? "Archived" : "Mark Complete"}
      </button>
      </div>
    `;

    document.body.appendChild(root);
    window.GridWildQuestEvidence?.bindQuestEvidencePanel?.(root, quest);

    root.addEventListener("click", evt => {
      if (evt.target === root) closeModal(root);
    });

    root.querySelector("#gwQuestCloseBtn").onclick = () => {
      document
        .querySelectorAll(".gw-quest-modal-backdrop")
        .forEach(el => el.remove());
    };

    if (isCompletedQuest) {
      updateCompletedQuestPartyButton(root, quest.dbId || quest.id);
    }

 root.querySelector("#gwQuestArchiveBtn")?.addEventListener("click", async () => {
  const ok = await archiveQuest(quest.dbId || quest.id);
  if (ok) {
    closeModal(root);
    openQuestArchive();
  }
});

 root.querySelector("#gwQuestAbandonBtn")?.addEventListener("click", async () => {
  const ok = await openQuestConfirmDialog({
    title: "Abandon Quest?",
    message: "This quest will disappear from your quest list.",
    subject: quest.title || "Untitled Quest",
    confirmLabel: "Abandon",
    cancelLabel: "Keep Quest",
    danger: true
  });
  if (!ok) return;

  const abandoned = await abandonQuest(quest.dbId || quest.id);
  if (abandoned) closeModal(root);
});

 root.querySelector("#gwQuestEmbarkBtn")?.addEventListener("click", async () => {
  try {
    if (quest.source === "db" || quest.dbId) {
      await acceptAndEmbarkQuest(quest);
      closeModal(root);
      return;
    }

    await acceptAndEmbarkQuest(quest);
    closeModal(root);
  } catch (err) {
    console.error("Accept quest failed:", err);
    alert(`Could not accept quest: ${err.message}`);
  }
});

root.querySelector("#gwQuestPartyBtn")?.addEventListener("click", async evt => {
  if (isCompletedQuest) {
    evt.preventDefault();
    await openQuestPartyRecap(quest.dbId || quest.id);
    return;
  }

  if (!window.GridWildParty?.createPartyFromQuest) {
    alert("Party system is not loaded.");
    return;
  }

  try {
    if (quest.source === "db" || quest.dbId) {
      const questId = quest.dbId || quest.id;
      const accepted = await window.GridWildAPI.acceptQuest(questId);
      await window.GridWildAPI.setActiveQuest(questId);

      quest.status = "active";

      quest.startedAt = accepted.player_quest?.accepted_at || quest.startedAt || nowISO();

      window.__gwState = window.__gwState || {};
      window.__gwState.activeQuestId = questId;
      updateRuntimeQuestPlayerState(questId, accepted.player_quest, {
        status: "active",
        accepted_at: quest.startedAt
      });

      window.GridWildParty.createPartyFromQuest(quest);

      closeModal(root);
      renderQuestListIntoPage();
      window.refreshQuestBadge?.();

      if (window.GridWildQuestLayer) {
        window.GridWildQuestLayer.embark(quest);
      }

      return;
    }

    alert("This old local quest cannot start an online party.");
  } catch (err) {
    console.error("Could not start quest party:", err);
    alert(`Could not start quest party: ${err.message}`);
  }
});

    root.querySelector("#gwQuestCompleteBtn").onclick = async () => {
      try {
        if (quest.source === "db" || quest.dbId) {
          const result = await window.GridWildAPI.completeQuest(quest.dbId || quest.id);

          window.__gwState = window.__gwState || {};
          window.__gwState.player = result.player;
          updateRuntimeQuestPlayerState(quest.dbId || quest.id, result.player_quest, {
            status: "completed",
            completed_at: result.player_quest?.completed_at || new Date().toISOString()
          });

          window.GridWildPlayerUI?.refreshPlayerUI?.();

          quest.status = "completed";
          quest.completedAt = new Date().toISOString();

          window.refreshQuestBadge?.();
          closeModal(root);
          renderQuestListIntoPage();

          alert(
            result.already_rewarded
              ? "Quest already completed."
              : `Quest complete! +${result.reward} 🍃`
          );

          return;
        }

        alert("This old local quest cannot be completed online.");
      } catch (err) {
        console.error("Complete quest failed:", err);
        alert(`Could not complete quest: ${err.message}`);
      }
    };
  }

  function openQuestRecipeCreator() {
    injectStyles();

    const savedSurveys = window.GridWildSurveyDesigner?.loadSurveys?.() || [];

const allSurveyOptions = [
  ...Object.values(CAMPAIGNS),
  ...savedSurveys
];

const surveyRadiosHtml = allSurveyOptions.map(c => `
  <div class="gw-rowline">
    <label style="display:flex;align-items:center;gap:8px;margin:0;">
      <input
        type="radio"
        name="gwQuestSurvey"
        value="${esc(c.id)}"
        ${c.id === "none" ? "checked" : ""}
      >
      <span>${esc(c.name || "Untitled Survey")}</span>
    </label>

    <button
      class="gw-mini-btn gwSurveyInfoBtn"
      data-survey-id="${esc(c.id)}"
      type="button"
    >
      Info
    </button>
  </div>
`).join("");

    const root = document.createElement("div");
    root.className = "gw-quest-modal-backdrop";

    root.innerHTML = `
      <div class="gw-quest-modal">
        <div class="gw-quest-modal-title">Generate Quest</div>
        <div class="gw-quest-modal-subtitle">
          Build a quest recipe from simple ingredients. These controls are placeholders now;
          later they can drive real local biodiversity logic.
        </div>

        <div class="gw-quest-form">

        <div class="gw-quest-field">
            <label>Quest target location</label>
            <select id="gwQuestTargetLocation">
            <option value="specific_square">Specific square</option>
            <option value="area_3x3" selected>Area range: 3×3 squares</option>
            <option value="area_20x20">Area range: 20×20 squares</option>
            <option value="anywhere">Anywhere</option>
            </select>
        </div>

          <div class="gw-quest-field">
            <label>Range / arena</label>
            <select id="gwQuestRange">
              <option value="here">Here</option>
              <option value="1min">1 minute walk</option>
              <option value="5min">5 minute walk</option>
              <option value="15min">15 minute walk</option>
              <option value="anywhere">Anywhere</option>
            </select>
          </div>

          <div class="gw-quest-field">
            <label>Target taxon flavor</label>
            <select id="gwQuestTaxon">
              <option value="Any">Any life 🌎</option>
              <option value="Insecta">Insects 🐛</option>
              <option value="Plantae">Plants 🌿</option>
              <option value="Fungi">Fungi 🍄</option>
              <option value="Aves">Birds 🐦</option>
              <option value="Mammalia">Mammals 🦝</option>
            </select>
          </div>

          <div class="gw-quest-field">
            <label>Objective</label>
            <select id="gwQuestObjective">
              <option value="any_observation">Make any observation</option>
              <option value="new_square_taxon">New taxon for this square</option>
              <option value="underobserved">Under-observed life</option>
              <option value="revisit_fading">Revisit fading territory</option>
              <option value="leaderboard">Challenge local territory</option>
            </select>
          </div>

          <div class="gw-quest-field">
            <label>Difficulty: <span id="gwQuestDifficultyLabel">Easy</span></label>
            <input id="gwQuestDifficulty" type="range" min="1" max="5" step="1" value="1" />
          </div>

          <div class="gw-quest-field">
            <label>Timeframe</label>
            <select id="gwQuestTimeframe">
              <option value="now">Right now</option>
              <option value="today" selected>Today</option>
              <option value="week">This week</option>
              <option value="weekend">This weekend</option>
            </select>
          </div>

          <div class="gw-quest-field">
            <label>Evidence requirement</label>
            <select id="gwQuestEvidence">
              <option value="photo_gps20">Photo + GPS ≤20 m</option>
              <option value="photo">Photo only</option>
              <option value="observation">Observation only</option>
              <option value="research_grade">Research-grade eventually</option>
            </select>
          </div>
        </div>

        <div class="gw-quest-field">
        <label>Survey</label>
        <div id="gwQuestSurveyRadios">
            ${surveyRadiosHtml}
        </div>
        </div>

        <div class="gw-quest-actions">
          <button class="gw-quest-btn secondary" id="gwQuestCancelBtn">Cancel</button>
          <button class="gw-quest-btn primary" id="gwQuestCreateBtn">Create Quest</button>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    const diff = root.querySelector("#gwQuestDifficulty");
    const diffLabel = root.querySelector("#gwQuestDifficultyLabel");

    diff.addEventListener("input", () => {
      diffLabel.textContent = difficultyLabel(diff.value);
    });

    root.addEventListener("click", evt => {
      if (evt.target === root) closeModal(root);
    });

    root.querySelector("#gwQuestCancelBtn").onclick = () => closeModal(root);

    root.querySelector("#gwQuestCreateBtn").onclick = () => {
        const recipe = {
        targetLocation: root.querySelector("#gwQuestTargetLocation").value,
        surveyId: root.querySelector('input[name="gwQuestSurvey"]:checked')?.value || "none",
        iconicTaxon: root.querySelector("#gwQuestTaxon").value,
        objectiveType: root.querySelector("#gwQuestObjective").value,
        difficulty: Number(root.querySelector("#gwQuestDifficulty").value),
        timeframe: root.querySelector("#gwQuestTimeframe").value,
        evidence: root.querySelector("#gwQuestEvidence").value
        };

      const quests = loadQuests();
      const quest = makeQuest(recipe);
      quests.unshift(quest);
      saveQuests(quests);

      closeModal(root);
      renderQuestListIntoPage();
      openQuestStatus(quest.id);
    };
  }

    function renderQuestListHtml() {
    const quests = getVisibleQuests();

    if (!quests.length) {
        return `
        <div class="gw-muted">None yet.</div>
        <button class="gw-mini-btn gw-quest-archive-open-btn" type="button" style="margin-top:10px;width:100%;">
            View Archive
        </button>
        `;
    }

    return `
        <div class="gw-list">
        ${quests.map(q => {
            const r = q.recipe || {};
            const sClass = statusClass(q.status);

            return `
              <div class="gw-rowline gw-quest-row ${q.status === "active" ? "is-active-quest" : ""} ${q.status === "completed" ? "is-completed-quest" : ""}"
                data-quest-id="${esc(q.id)}">
                <span class="gw-quest-row-main">
                    <span class="gw-quest-icon">${esc(getFlavorIcon(q))}</span>

                    <span class="gw-quest-row-controls">
                        <span class="gw-quest-status-stack">
                        <span class="gw-quest-pill ${esc(sClass)}">${esc(statusLabel(q.status))}</span>
                        <span class="gw-muted gw-quest-difficulty">${esc(difficultyLabel(r.difficulty))}</span>
                        </span>
                        ${["completed", "complete"].includes(String(q.status || "").toLowerCase()) ? `
                          <button
                            class="gw-mini-btn gw-quest-row-archive-btn"
                            data-quest-id="${esc(q.id)}"
                            type="button"
                          >
                            Archive
                          </button>
                        ` : ""}
                    </span>

                    <span class="gw-quest-row-text">
                    <span class="gw-quest-row-title">${esc(q.title)}</span>
                      <span class="gw-muted gw-quest-row-sub">
                        ${
                          q.description
                            ? esc(q.description)
                            : `${esc(RANGE_LABELS[r.range] || r.range)} · ${esc(TIMEFRAME_LABELS[r.timeframe] || r.timeframe)}`
                        }
                      </span>
                    </span>
                </span>
                </div>
            `;
        }).join("")}
        </div>
        <button class="gw-mini-btn gw-quest-archive-open-btn" type="button" style="margin-top:10px;width:100%;">
            View Archive
        </button>
    `;
    }

    function bindQuestSheetControls(root = document) {
  injectStyles();

  if (root.dataset.questSheetBound === "true") return;
  root.dataset.questSheetBound = "true";

  root.addEventListener("click", evt => {
    const generateBtn = evt.target.closest("#gwGenerateQuestBtn");
    if (generateBtn && root.contains(generateBtn)) {
      openQuestRecipeCreator();
      return;
    }

    const surveysBtn = evt.target.closest("#gwExploreSurveysBtn");
    if (surveysBtn && root.contains(surveysBtn)) {
      openSurveyExplorer();
      return;
    }

    const rowArchiveBtn = evt.target.closest(".gw-quest-row-archive-btn");
    if (rowArchiveBtn && root.contains(rowArchiveBtn)) {
      evt.preventDefault();
      evt.stopPropagation();
      archiveQuest(rowArchiveBtn.dataset.questId);
      return;
    }

    const archiveOpenBtn = evt.target.closest(".gw-quest-archive-open-btn");
    if (archiveOpenBtn && root.contains(archiveOpenBtn)) {
      openQuestArchive();
      return;
    }

    const questRow = evt.target.closest(".gw-quest-row");
    if (questRow && root.contains(questRow)) {
      openQuestStatus(questRow.dataset.questId);
      return;
    }

    const dailyRow = evt.target.closest(".gw-daily-quest-row");
    if (dailyRow && root.contains(dailyRow)) {
      const idx = Number(dailyRow.dataset.dailyQuestIndex);
      const daily = DAILY_QUESTS[idx];
      if (daily) {
        startQuestFromRecipe(daily.recipe, {
          title: daily.title,
          source: "today"
        });
      }
    }
  });
}


function renderQuestListIntoPage() {
  const el = document.getElementById("gwQuestListBody");
  if (!el) return;

  el.innerHTML = renderQuestListHtml();

  // Only bind controls inside the newly replaced quest-list body.
  bindQuestSheetControls(el);
}

function renderDailyQuestsHtml() {
  return `
    <div class="gw-list">
      ${DAILY_QUESTS.map((q, idx) => {
        const r = q.recipe || {};
        const t = r.target || {};
        const targetText =
          r.targetLocation === "anywhere"
            ? "Anywhere"
            : `${TARGET_LOCATION_LABELS[r.targetLocation]} · ${t.placeName || t.cellKey || "test target"}`;

        return `
          <div class="gw-rowline gw-daily-quest-row" data-daily-quest-index="${idx}" style="cursor:pointer;">
            <span>
              <span>${esc(q.title)}</span>
              <span class="gw-muted" style="display:block;font-size:11px;">
                ${esc(targetText)} · ${esc(difficultyLabel(r.difficulty))}
              </span>
            </span>
            <span class="gw-quest-icon">${esc(TAXON_FLAVORS[r.iconicTaxon]?.icon || "🌎")}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function getSurveyById(surveyId) {
  const saved = window.GridWildSurveyDesigner?.loadSurveys?.() || [];
  return saved.find(c => c.id === surveyId) || CAMPAIGNS[surveyId] || null;
}

function isSavedSurvey(surveyId) {
  const saved = window.GridWildSurveyDesigner?.loadSurveys?.() || [];
  return saved.some(c => c.id === surveyId);
}

function currentPlayerId() {
  return window.GridWildAPI?.getPlayerId?.() || window.__gwState?.player?.id || null;
}

function isOwnedSurvey(c) {
  const ownerId = c?.owner_player_id || c?._dbRow?.owner_player_id || null;

  // Local fallback surveys have no DB owner metadata, so treat them as editable by
  // this client. DB-backed rows are owner-gated.
  if (!ownerId && isSavedSurvey(c?.id)) return true;

  return !!ownerId && ownerId === currentPlayerId();
}

function surveyVisibilityLabel(c) {
  if (CAMPAIGNS[c?.id]) return "Campaign";
  if (isOwnedSurvey(c)) return "Mine";

  const mode = c?.public_mode || c?.publicMode || c?._dbRow?.public_mode || "private";
  if (mode === "public") return "Public";
  if (mode === "unlisted") return "Unlisted";
  return "Private";
}

function surveyPublicMode(c) {
  return c?.public_mode || c?.publicMode || c?._dbRow?.public_mode || "private";
}

function canShareSurvey(c) {
  return isOwnedSurvey(c) && ["public", "unlisted"].includes(surveyPublicMode(c));
}

function surveyShareUrl(surveyId) {
  const url = new URL(window.location.href);
  url.searchParams.set("survey", surveyId);
  return url.toString();
}

async function copySurveyShareLink(surveyId) {
  const url = surveyShareUrl(surveyId);

  try {
    if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
    await navigator.clipboard.writeText(url);
    alert("Survey link copied.");
  } catch {
    prompt("Survey link", url);
  }
}

function addSurveyRowToRuntime(row) {
  if (!row?.id) return;

  window.__gwState = window.__gwState || {};
  window.__gwState.surveys = [
    row,
    ...(window.__gwState.surveys || []).filter(s => s.id !== row.id)
  ];
}

async function openLinkedSurveyFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const surveyId = params.get("survey");
  if (!surveyId) return;
  if (sharedSurveyOpened) return;

  if (getSurveyById(surveyId)) {
    sharedSurveyOpened = true;
    openSurveyInfo(surveyId);
    return;
  }

  try {
    const result = await window.GridWildAPI?.getSurveyById?.(surveyId);
    if (!result?.survey) return;

    addSurveyRowToRuntime(result.survey);
    window.GridWildSurveyLayer?.render?.();
    sharedSurveyOpened = true;
    openSurveyInfo(surveyId);
  } catch (err) {
    console.warn("Could not load shared survey:", err);
    alert("That survey link is not available.");
  }
}

function openSurveyInfo(surveyId) {
  injectStyles();

  const c = getSurveyById(surveyId);
  if (!c) return;

  const saved = isSavedSurvey(surveyId);
  const owned = isOwnedSurvey(c);
  const visibilityLabel = surveyVisibilityLabel(c);
  const shareable = canShareSurvey(c);
  const g = c.geometries || {};

  const anatomy = Array.isArray(c.anatomy) && c.anatomy.length
    ? c.anatomy
    : [
        `Boundary: ${g.boundary?.length ? "yes" : "none"}`,
        `Paths: ${(g.paths || []).length}`,
        `Exclusions: ${(g.exclusions || []).length}`,
        `Dense zones: ${(g.denseZones || []).length}`,
        `Assets: ${(g.assets || []).length}`
      ];

  const root = document.createElement("div");
  root.className = "gw-quest-modal-backdrop";

  root.innerHTML = `
    <div class="gw-quest-modal">
      <div class="gw-quest-modal-title">${esc(c.name || "Untitled Survey")}</div>
      <div class="gw-quest-modal-subtitle">
        ${esc(c.description || "No description yet.")}
        <span class="gw-quest-pill" style="margin-left:6px;">${esc(visibilityLabel)}</span>
      </div>

      <div class="gw-quest-status-grid">
        ${anatomy.map(x => `
          <div class="gw-quest-status-line">
            <span>Survey anatomy</span>
            <span>${esc(x)}</span>
          </div>
        `).join("")}
      </div>

      <div class="gw-quest-actions ${shareable ? "gw-quest-actions-four" : owned ? "three" : ""}">
        <button class="gw-quest-btn secondary" id="gwSurveyInfoClose">Close</button>

        ${owned ? `
          <button class="gw-quest-btn danger" id="gwSurveyInfoDelete">Delete</button>
          <button class="gw-quest-btn primary" id="gwSurveyInfoEdit">Edit</button>
        ` : ""}

        ${shareable ? `
          <button class="gw-quest-btn secondary" id="gwSurveyInfoShare">Share</button>
        ` : ""}
      </div>
    </div>
  `;

  document.body.appendChild(root);

  root.onclick = evt => {
    if (evt.target === root) root.remove();
  };

  root.querySelector("#gwSurveyInfoClose").onclick = () => root.remove();

  root.querySelector("#gwSurveyInfoShare")?.addEventListener("click", () => {
    copySurveyShareLink(surveyId);
  });

  root.querySelector("#gwSurveyInfoEdit")?.addEventListener("click", () => {
    document
      .querySelectorAll(".gw-quest-modal-backdrop")
      .forEach(el => el.remove());

    window.GridWildSurveyDesigner?.openExisting?.(surveyId);
  });

  root.querySelector("#gwSurveyInfoDelete")?.addEventListener("click", () => {
    const ok = confirm(`Delete survey "${c.name || "Untitled Survey"}"? This cannot be undone.`);
    if (!ok) return;

    window.GridWildSurveyDesigner?.deleteSurvey?.(surveyId)
    .then(ok => {
      if (!ok) return;

      root.remove();

      if (typeof openSurveyExplorer === "function") {
        openSurveyExplorer();
      }
    });
  });
}

function openSurveyExplorer() {
  injectStyles();

  const savedSurveys = window.GridWildSurveyDesigner?.loadSurveys?.() || [];
  const fallbackSurveys = Object.values(CAMPAIGNS).filter(c => c.id !== "none");

  const surveyRows = savedSurveys.length
    ? savedSurveys
    : fallbackSurveys;

  const root = document.createElement("div");
  root.className = "gw-quest-modal-backdrop";

  root.innerHTML = `
    <div class="gw-quest-modal">
      <div class="gw-quest-modal-title">Survey Explorer</div>
      <div class="gw-quest-modal-subtitle">
        Join surveys to enable their field geometry on the HUD map. Only joined surveys can be shown.
      </div>

      <div class="gw-list">
        ${surveyRows.map(c => {
          const joined = window.GridWildSurveyLayer?.isJoined?.(c.id) || false;
          const visible = window.GridWildSurveyLayer?.isVisible?.(c.id) || false;
          const hasSavedGeometry = savedSurveys.some(x => x.id === c.id);
          const visibilityLabel = surveyVisibilityLabel(c);

          return `
            <div class="gw-rowline gwSurveyExplorerRow" data-survey-id="${esc(c.id)}" style="cursor:pointer;">
              <span style="min-width:0;">
                <span>${esc(c.name || "Untitled Survey")}</span>
                <span class="gw-muted" style="display:block;font-size:11px;overflow:hidden;text-overflow:ellipsis;">
                  ${esc(c.description || "No description yet.")}
                </span>
              </span>

              <span style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
                <span class="gw-quest-pill">${esc(visibilityLabel)}</span>

                <button
                  class="gw-mini-btn gwSurveyJoinBtn"
                  data-survey-id="${esc(c.id)}"
                  type="button"
                >
                  ${joined ? "Leave" : "Join"}
                </button>

                <button
                  class="gw-mini-btn gwSurveyVisibilityBtn"
                  data-survey-id="${esc(c.id)}"
                  type="button"
                  ${joined && hasSavedGeometry ? "" : "disabled"}
                  title="${joined ? "Show or hide this survey on the HUD map" : "Join survey first"}"
                >
                  ${visible ? "Hide" : "Show"}
                </button>

                <span class="gw-quest-pill">View</span>
              </span>
            </div>
          `;
        }).join("")}
      </div>

      <div class="gw-quest-actions">
        <button class="gw-quest-btn secondary" id="gwSurveyExplorerClose">Close</button>
        <button class="gw-quest-btn primary" id="gwNewSurveyBtn">New Survey</button>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  root.onclick = evt => {
    if (evt.target === root) root.remove();
  };

  root.querySelector("#gwSurveyExplorerClose").onclick = () => root.remove();

  root.querySelector("#gwNewSurveyBtn").onclick = () => {
    root.remove();
    openNewSurveyConfigurator();
  };

  root.querySelectorAll(".gwSurveyExplorerRow").forEach(row => {
    row.onclick = () => {
      root.remove();
      openSurveyInfo(row.dataset.surveyId);
    };
  });

  root.querySelectorAll(".gwSurveyJoinBtn").forEach(btn => {
    btn.onclick = evt => {
      evt.preventDefault();
      evt.stopPropagation();

      const id = btn.dataset.surveyId;
      if (window.GridWildSurveyLayer?.isJoined?.(id)) {
        window.GridWildSurveyLayer.leave(id);
      } else {
        window.GridWildSurveyLayer?.join?.(id);
      }

      root.remove();
      openSurveyExplorer();
    };
  });

  root.querySelectorAll(".gwSurveyVisibilityBtn").forEach(btn => {
    btn.onclick = evt => {
      evt.preventDefault();
      evt.stopPropagation();

      const id = btn.dataset.surveyId;
      if (window.GridWildSurveyLayer?.isVisible?.(id)) {
        window.GridWildSurveyLayer.hide(id);
      } else {
        window.GridWildSurveyLayer?.show?.(id);
      }

      root.remove();
      openSurveyExplorer();
    };
  });
}

function openNewSurveyConfigurator() {
  if (window.GridWildSurveyDesigner?.open) {
    window.GridWildSurveyDesigner.open();
    return;
  }

  alert("Survey Designer module is not loaded. Check js/gw-survey-designer.js in index.html.");
}


  window.GridWildQuests = {
    loadQuests,
    saveQuests,
    renderQuestListHtml,
    renderQuestListIntoPage,
    renderDailyQuestsHtml,
    startQuestFromRecipe,
    generateDailyQuests,
    openSurveyExplorer,
    openSurveyInfo,
    openLinkedSurveyFromUrl,
    openNewSurveyConfigurator,
    bindQuestSheetControls,
    openQuestStatus,
    openQuestRecipeCreator,
    embarkQuest,
    acceptAndEmbarkQuest,
    archiveQuest,
    abandonQuest,
    openQuestArchive,
    getVisibleQuests,
    getArchivedQuests,
    isArchivedQuest,
    
    constants: {
      TAXON_FLAVORS,
      OBJECTIVES,
      RANGE_LABELS,
      TIMEFRAME_LABELS
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    injectStyles();
    setTimeout(openLinkedSurveyFromUrl, 0);
  });

  window.addEventListener("gwBootstrapReady", openLinkedSurveyFromUrl);
})();
