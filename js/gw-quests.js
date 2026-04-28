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
    description: "No campaign association. This is a standalone quest.",
    anatomy: ["Standalone quest", "No campaign scoring", "No shared campaign boundary"]
  },
  front_yard: {
    id: "front_yard",
    name: "My Front Yard",
    description: "A tiny personal biodiversity atlas for the immediate home territory.",
    anatomy: ["Permanent home campaign", "Small location radius", "Good for daily phenology"]
  },
  georgetown_ark: {
    id: "georgetown_ark",
    name: "Georgetown Ark Project",
    description: "A campus-scale biodiversity rescue and discovery campaign.",
    anatomy: ["Urban campus campaign", "Student-friendly quests", "Restoration / stewardship framing"]
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
    description: "Short, time-boxed burst campaign for rapid local biodiversity discovery.",
    anatomy: ["Temporary campaign", "High activity window", "Good for group events"]
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
      campaignId: recipe.campaignId || "none",
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


const DAILY_QUESTS_ORIGINAL = [
  {
    title: "Photograph one plant in the current area",
    recipe: { iconicTaxon: "Plantae", objectiveType: "any_observation", difficulty: 1, targetLocation: "area_3x3", timeframe: "today", campaignId: "none" }
  },
  {
    title: "Find an insect or spider near you",
    recipe: { iconicTaxon: "Insecta", objectiveType: "underobserved", difficulty: 2, targetLocation: "area_3x3", timeframe: "today", campaignId: "none" }
  },
  {
    title: "Refresh one fading fog cell",
    recipe: { iconicTaxon: "Any", objectiveType: "revisit_fading", difficulty: 2, targetLocation: "specific_square", timeframe: "today", campaignId: "none" }
  },
  {
    title: "Look for fungi, lichens, or decomposers",
    recipe: { iconicTaxon: "Fungi", objectiveType: "underobserved", difficulty: 3, targetLocation: "area_20x20", timeframe: "today", campaignId: "none" }
  },
  {
    title: "Add one new taxon to this neighborhood",
    recipe: { iconicTaxon: "Any", objectiveType: "new_square_taxon", difficulty: 4, targetLocation: "area_20x20", timeframe: "today", campaignId: "none" }
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
    if (s === "paused" || s === "draft") return "Paused";
    if (s === "stale" || s === "expired") return "Stale";
    if (s === "unavailable") return "Unavailable";
    if (s === "completed" || s === "complete") return "Completed";

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
  return q?.archived === true || q?.archived === "true" || !!q?.archivedAt;
}

function getVisibleQuests() {
  return loadQuests().filter(q => !isArchivedQuest(q));
}

function getArchivedQuests() {
  return loadQuests().filter(q => isArchivedQuest(q));
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

function archiveQuest(questId) {
  const quests = loadQuests();
  const q = quests.find(x => x.id === questId);
  if (!q) return;

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
}

function openQuestArchive() {
  injectStyles();

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

                    <span class="gw-quest-pill ${esc(statusClass(q.status))}">
                      ${esc(statusLabel(q.status))}
                    </span>
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
    campaignId: recipe.campaignId || "none"
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

function startQuestFromRecipe(recipe, options = {}) {
  const quests = loadQuests();

  const title = options.title || buildQuestTitle(recipe);
  const source = options.source || "manual";

  const recentDuplicate = quests.find(q =>
    q.title === title &&
    q.source === source &&
    !isArchivedQuest(q) &&
    Date.now() - new Date(q.createdAt || 0).getTime() < 1500
  );

  if (recentDuplicate) {
    openQuestStatus(recentDuplicate.id);
    return recentDuplicate;
  }

  const quest = makeQuest(recipe);
  quest.title = title;
  quest.source = source;

  quests.unshift(quest);
  saveQuests(quests);

  renderQuestListIntoPage();
  openQuestStatus(quest.id);

  window.dispatchEvent(new CustomEvent("gwQuestStarted", {
    detail: { quest }
  }));

  return quest;
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
      .gw-quest-row {
        cursor: pointer;
      }

      .gw-quest-row:hover {
        background: rgba(240,209,138,0.06);
      }

      .gw-quest-icon {
        width: 34px;
        height: 34px;
        border-radius: 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
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
  grid-template-columns: minmax(0, 1fr) auto;
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
  display: flex;
  flex-direction: column;
  line-height: 1.18;
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
    grid-template-columns: minmax(0, 1fr) max-content;
    gap: 4px;
    padding-top: 8px;
    padding-bottom: 8px;
  }

  .gw-quest-icon {
    display: none;
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

  .gw-quest-difficulty {
    display: none;
  }

  .gw-quest-icon {
    display: none;
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

    .gw-quest-archive-btn {
    font-size: 10px;
    padding: 6px 8px;
    border-radius: 999px;
    opacity: 0.82;
    }
    `;

    document.head.appendChild(style);
  }

  function closeModal(root) {
    root?.remove();
  }

  function openQuestStatus(questId) {

    document
      .querySelectorAll(".gw-quest-modal-backdrop")
      .forEach(el => el.remove());

    injectStyles();

    const quest = loadQuests().find(q => q.id === questId);
    if (!quest) return;

    const r = quest.recipe || {};
    const obj = OBJECTIVES[r.objectiveType] || OBJECTIVES.any_observation;
    const tax = TAXON_FLAVORS[r.iconicTaxon] || TAXON_FLAVORS.Any;

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

        <div class="gw-quest-actions three">
        <button class="gw-quest-btn secondary" id="gwQuestCloseBtn">Close</button>
        <button class="gw-quest-btn primary" id="gwQuestEmbarkBtn">Embark!</button>
        <button class="gw-quest-btn secondary" id="gwQuestCompleteBtn">Mark Complete</button>
        </div>
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

    root.querySelector("#gwQuestEmbarkBtn").onclick = () => {
    embarkQuest(quest.id);
    closeModal(root);
    };

    root.querySelector("#gwQuestCompleteBtn").onclick = () => {
    const quests = loadQuests();
    const q = quests.find(x => x.id === quest.id);

    if (q) {
        q.status = "completed";
        q.completedAt = nowISO();
        saveQuests(quests);
    }

    closeModal(root);
    renderQuestListIntoPage();

    window.dispatchEvent(new CustomEvent("gwQuestEvidenceChanged")); // ????? RIGHT PLACE?

    if (window.GridWildQuestLayer) {
        window.GridWildQuestLayer.completeQuest(q || quest);
    }
    };
  }

  function openQuestRecipeCreator() {
    injectStyles();

    const savedCampaigns = window.GridWildCampaignDesigner?.loadCampaigns?.() || [];

const allCampaignOptions = [
  ...Object.values(CAMPAIGNS),
  ...savedCampaigns
];

const campaignRadiosHtml = allCampaignOptions.map(c => `
  <div class="gw-rowline">
    <label style="display:flex;align-items:center;gap:8px;margin:0;">
      <input
        type="radio"
        name="gwQuestCampaign"
        value="${esc(c.id)}"
        ${c.id === "none" ? "checked" : ""}
      >
      <span>${esc(c.name || "Untitled Campaign")}</span>
    </label>

    <button
      class="gw-mini-btn gwCampaignInfoBtn"
      data-campaign-id="${esc(c.id)}"
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
        <label>Campaign</label>
        <div id="gwQuestCampaignRadios">
            ${campaignRadiosHtml}
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
        campaignId: root.querySelector('input[name="gwQuestCampaign"]:checked')?.value || "none",
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
            Archive of Quests
        </button>
        `;
    }

    return `
        <div class="gw-list">
        ${quests.map(q => {
            const r = q.recipe || {};
            const sClass = statusClass(q.status);

            return `
                <div class="gw-rowline gw-quest-row ${sClass === "active" ? "is-active-quest" : ""}" data-quest-id="${esc(q.id)}">
                <span class="gw-quest-row-main">
                    <span class="gw-quest-icon">${esc(getFlavorIcon(q))}</span>

                    <span class="gw-quest-row-text">
                    <span class="gw-quest-row-title">${esc(q.title)}</span>
                    <span class="gw-muted gw-quest-row-sub">
                        ${esc(RANGE_LABELS[r.range] || r.range)} · ${esc(TIMEFRAME_LABELS[r.timeframe] || r.timeframe)}
                    </span>
                    </span>
                </span>

                <span class="gw-quest-row-controls">
                    <button
                    class="gw-mini-btn gw-quest-archive-btn"
                    data-quest-id="${esc(q.id)}"
                    type="button"
                    title="Send quest to archive"
                    >
                    Hide
                    </button>

                    <span class="gw-quest-status-stack">
                    <span class="gw-quest-pill ${esc(sClass)}">${esc(statusLabel(q.status))}</span>
                    <span class="gw-muted gw-quest-difficulty">${esc(difficultyLabel(r.difficulty))}</span>
                    </span>
                </span>
                </div>
            `;
        }).join("")}
        </div>

        <button class="gw-mini-btn gw-quest-archive-open-btn" type="button" style="margin-top:12px;width:100%;">
        Archive of Quests
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

    const campaignsBtn = evt.target.closest("#gwExploreCampaignsBtn");
    if (campaignsBtn && root.contains(campaignsBtn)) {
      openCampaignExplorer();
      return;
    }

    const archiveOpenBtn = evt.target.closest(".gw-quest-archive-open-btn");
    if (archiveOpenBtn && root.contains(archiveOpenBtn)) {
      evt.preventDefault();
      evt.stopPropagation();
      openQuestArchive();
      return;
    }

    const archiveBtn = evt.target.closest(".gw-quest-archive-btn");
    if (archiveBtn && root.contains(archiveBtn)) {
      evt.preventDefault();
      evt.stopPropagation();
      archiveQuest(archiveBtn.dataset.questId);
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

function openCampaignInfo(campaignId) {
  injectStyles();
  const c = CAMPAIGNS[campaignId] || CAMPAIGNS.none;

  const root = document.createElement("div");
  root.className = "gw-quest-modal-backdrop";
  root.innerHTML = `
    <div class="gw-quest-modal">
      <div class="gw-quest-modal-title">${esc(c.name)}</div>
      <div class="gw-quest-modal-subtitle">${esc(c.description)}</div>

      <div class="gw-quest-status-grid">
        ${c.anatomy.map(x => `
          <div class="gw-quest-status-line">
            <span>Campaign anatomy</span>
            <span>${esc(x)}</span>
          </div>
        `).join("")}
      </div>

      <div class="gw-quest-actions">
        <button class="gw-quest-btn primary" id="gwCampaignInfoClose">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(root);
  root.onclick = evt => { if (evt.target === root) root.remove(); };
  root.querySelector("#gwCampaignInfoClose").onclick = () => root.remove();
}

function openCampaignExplorer() {
  injectStyles();

  const savedCampaigns = window.GridWildCampaignDesigner?.loadCampaigns?.() || [];
  const fallbackCampaigns = Object.values(CAMPAIGNS).filter(c => c.id !== "none");

  const campaignRows = savedCampaigns.length
    ? savedCampaigns
    : fallbackCampaigns;

  const root = document.createElement("div");
  root.className = "gw-quest-modal-backdrop";

  root.innerHTML = `
    <div class="gw-quest-modal">
      <div class="gw-quest-modal-title">Campaign Explorer</div>
      <div class="gw-quest-modal-subtitle">
        Campaigns define a named biodiversity effort: location, timeframe, participants, and quest logic.
      </div>

      <div class="gw-list">
        ${campaignRows.map(c => `
          <div class="gw-rowline gwCampaignExplorerRow" data-campaign-id="${esc(c.id)}" style="cursor:pointer;">
            <span style="min-width:0;">
              <span>${esc(c.name || "Untitled Campaign")}</span>
              <span class="gw-muted" style="display:block;font-size:11px;overflow:hidden;text-overflow:ellipsis;">
                ${esc(c.description || "No description yet.")}
              </span>
            </span>

            <span style="display:flex;gap:6px;align-items:center;">
              ${savedCampaigns.some(x => x.id === c.id)
                ? `<button class="gw-mini-btn gwShowCampaignMapBtn" data-campaign-id="${esc(c.id)}" type="button">Map</button>`
                : ""
              }
              <span class="gw-quest-pill">View</span>
            </span>
          </div>
        `).join("")}
      </div>

      <div class="gw-quest-actions">
        <button class="gw-quest-btn secondary" id="gwCampaignExplorerClose">Close</button>
        <button class="gw-quest-btn primary" id="gwNewCampaignBtn">New Campaign</button>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  root.onclick = evt => {
    if (evt.target === root) root.remove();
  };

  root.querySelector("#gwCampaignExplorerClose").onclick = () => root.remove();

  root.querySelector("#gwNewCampaignBtn").onclick = () => {
    root.remove();
    openNewCampaignConfigurator();
  };

  root.querySelectorAll(".gwCampaignExplorerRow").forEach(row => {
    row.onclick = () => openCampaignInfo(row.dataset.campaignId);
  });

  root.querySelectorAll(".gwShowCampaignMapBtn").forEach(btn => {
    btn.onclick = evt => {
      evt.stopPropagation();
      window.GridWildCampaignDesigner?.showCampaignOnMap?.(btn.dataset.campaignId);
      root.remove();
    };
  });
}

// OPEN FULL INTERFACE
function openNewCampaignConfigurator() {
  if (window.GridWildCampaignDesigner?.open) {
    window.GridWildCampaignDesigner.open();
    return;
  }

  alert("Campaign Designer module is not loaded. Check js/gw-campaign-designer.js in index.html.");
}

function openNewCampaignConfiguratorOLD() {
  injectStyles();

  const root = document.createElement("div");
  root.className = "gw-quest-modal-backdrop";
  root.innerHTML = `
    <div class="gw-quest-modal">
      <div class="gw-quest-modal-title">New Campaign</div>
      <div class="gw-quest-modal-subtitle">
        Placeholder configurator. Future version: upload KML, draw station outline, or select grid cells directly.
      </div>

      <div class="gw-quest-form">
        <div class="gw-quest-field">
          <label>Campaign name</label>
          <select id="gwCampaignNamePreset">
            <option>My New Campaign</option>
            <option>Station Biomarathon</option>
            <option>Neighborhood Bioblitz</option>
            <option>Campus Ark</option>
          </select>
        </div>

        <div class="gw-quest-field">
          <label>Time range</label>
          <select id="gwCampaignTimeRange">
            <option value="permanent">Permanent</option>
            <option value="today">Today</option>
            <option value="weekend">Weekend</option>
            <option value="custom">Custom later</option>
          </select>
        </div>

        <div class="gw-quest-field">
          <label>Location scope</label>
          <select id="gwCampaignLocationScope">
            <option value="specific_square">Specific square</option>
            <option value="area_3x3">Area range: 3×3 squares</option>
            <option value="area_20x20">Area range: 20×20 squares</option>
            <option value="polygon_future">Drawn/KML polygon later</option>
          </select>
        </div>
      </div>

      <div class="gw-quest-actions">
        <button class="gw-quest-btn secondary" id="gwNewCampaignCancel">Cancel</button>
        <button class="gw-quest-btn primary" id="gwNewCampaignSave">Save Placeholder</button>
      </div>
    </div>
  `;

  document.body.appendChild(root);
  root.onclick = evt => { if (evt.target === root) root.remove(); };
  root.querySelector("#gwNewCampaignCancel").onclick = () => root.remove();
  root.querySelector("#gwNewCampaignSave").onclick = () => {
    alert("Placeholder campaign saved later — not persisted yet.");
    root.remove();
  };
}

  window.GridWildQuests = {
    loadQuests,
    saveQuests,
    renderQuestListHtml,
    renderQuestListIntoPage,
    renderDailyQuestsHtml,
    startQuestFromRecipe,
    generateDailyQuests,
    openCampaignExplorer,
    openCampaignInfo,
    openNewCampaignConfigurator,
    bindQuestSheetControls,
    openQuestStatus,
    openQuestRecipeCreator,
    embarkQuest,
    archiveQuest,
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
  });
})();