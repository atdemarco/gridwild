    // --------------------------------------------------------------------
    // Bottom sheets
    // --------------------------------------------------------------------
    const gwBackdrop = document.getElementById("gwBackdrop");
    
    const sheets = {
      me: document.getElementById("sheetMe"),
      info: document.getElementById("sheetInfo"),
      community: document.getElementById("sheetCommunity"),
      quest: document.getElementById("sheetQuest"),
      legend: document.getElementById("sheetLegend"),
      lens: document.getElementById("sheetLens")
    };

    const navButtons = {
      me: document.getElementById("btnMe"),
      info: document.getElementById("btnInfo"),
      community: document.getElementById("btnCommunity"),
      quest: document.getElementById("btnQuest")
    };

    function closeAllSheets() {
      Object.values(sheets).forEach(el => el.classList.remove("is-open"));
      Object.values(navButtons).forEach(el => el.classList.remove("is-active"));
      gwBackdrop.classList.remove("is-open");
      window.GridWildPartyLive?.stopPartyPolling?.();
    }

    function setQuestBadge(visible) {
    const dot = document.getElementById("questNotifyDot");
    if (!dot) return;
    dot.hidden = !visible;
  }

function refreshQuestBadge() {
  const hasActiveQuest = !!window.__gwState?.activeQuestId;
  setQuestBadge(hasActiveQuest);
}

setQuestBadge(false);
window.refreshQuestBadge = refreshQuestBadge;

function runGridWildIdleTask(callback, delay = 700) {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(callback, { timeout: Math.max(1200, delay + 300) });
    return;
  }
  window.setTimeout(callback, delay);
}

const gwLazyScriptPromises = new Map();

function loadGridWildScript(src) {
  if (gwLazyScriptPromises.has(src)) return gwLazyScriptPromises.get(src);

  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing?.dataset.gwLoaded === "true") return Promise.resolve(existing);

  const promise = new Promise((resolve, reject) => {
    const script = existing || document.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset.gwLazy = "true";
    script.onload = () => {
      script.dataset.gwLoaded = "true";
      resolve(script);
    };
    script.onerror = () => {
      gwLazyScriptPromises.delete(src);
      reject(new Error(`Could not load ${src}`));
    };

    if (!existing) document.body.appendChild(script);
  });

  gwLazyScriptPromises.set(src, promise);
  return promise;
}

function refreshGridWildLocalNichesAfterLoad() {
  window.GridWildLocalNiches?.renderIntoPage?.();
  window.GridWildLocalNiches?.drawNicheLayer?.();
}

async function ensureGridWildHerePanelLoaded() {
  if (window.GridWildHerePanel) return window.GridWildHerePanel;
  await loadGridWildScript("js/gw-here-panel.js");
  return window.GridWildHerePanel || null;
}

async function ensureGridWildLocalNichesLoaded() {
  if (!window.GridWildLocalNiches) {
    await loadGridWildScript("js/gw-local-niches.js");
  }
  refreshGridWildLocalNichesAfterLoad();
  return window.GridWildLocalNiches || null;
}

async function ensureGridWildPartyLoaded() {
  if (!window.GridWildParty) {
    await loadGridWildScript("js/gw-party.js");
  }

  window.GridWildParty?.bindSheetControls?.(document);
  window.GridWildParty?.handleJoinFromUrl?.();
  window.GridWildParty?.refreshMapBeacon?.();
  window.GridWildPartyLive?.refreshPartySheet?.();

  return window.GridWildParty || null;
}

window.ensureGridWildHerePanelLoaded = ensureGridWildHerePanelLoaded;
window.ensureGridWildLocalNichesLoaded = ensureGridWildLocalNichesLoaded;
window.ensureGridWildPartyLoaded = ensureGridWildPartyLoaded;

let gwPlayerDetailsPromise = null;
async function ensurePlayerBootstrapDetailsLoaded(options = {}) {
  window.__gwState = window.__gwState || {};
  if (window.__gwState.playerDetailsLoaded && options.force !== true) return window.__gwState;
  if (gwPlayerDetailsPromise && options.force !== true) return gwPlayerDetailsPromise;

  gwPlayerDetailsPromise = (async () => {
    const data = await window.GridWildAPI.getPlayerBootstrapDetails();
    window.__gwState.playerInventory = data.player_inventory || [];
    window.__gwState.playerEquipment = data.player_equipment || null;
    window.__gwState.playerAchievements = data.player_achievements || [];
    window.__gwState.identificationClaims = data.identification_claims || [];
    window.__gwState.playerPresence = data.player_presence || null;
    window.__gwState.homeNicheId = data.home_niche_id || null;
    window.__gwState.homeNiche = data.home_niche || null;
    window.__gwState.playerDetailsLoaded = true;

    window.GridWildIdentificationEvidence?.mergeServerClaims?.(data.identification_claims || []);
    window.GridWildPlayerUI?.refreshPlayerUI?.();
    window.GridWildAchievements?.refreshAchievementSummary?.();
    window.GridWildEconomy?.refreshHud?.();
    window.GridWildCharacter?.renderSummary?.();
    window.initGridWildMobilePanels?.();

    window.dispatchEvent(new CustomEvent("gwBootstrapDetailsReady", {
      detail: { playerPresence: data.player_presence || null }
    }));

    return window.__gwState;
  })().catch((err) => {
    console.warn("Deferred player details failed:", err);
    window.__gwState.playerDetailsLoaded = false;
    throw err;
  }).finally(() => {
    gwPlayerDetailsPromise = null;
  });

  return gwPlayerDetailsPromise;
}

let gwQuestDataPromise = null;
async function ensureQuestDataLoaded(options = {}) {
  window.__gwState = window.__gwState || {};
  if (window.__gwState.questDataLoaded && options.force !== true) return window.__gwState.quests || [];
  if (gwQuestDataPromise && options.force !== true) return gwQuestDataPromise;

  gwQuestDataPromise = (async () => {
    const data = await window.GridWildAPI.getQuests();
    window.__gwState.quests = data.quests || [];
    window.__gwState.questEvidence = (data.quests || []).flatMap(q => q.quest_evidence || []);
    window.__gwState.questDataLoaded = true;

    window.GridWildQuests?.renderQuestListIntoPage?.();
    window.refreshQuestBadge?.();

    const activeQuest = window.GridWildQuests?.getVisibleQuests?.()
      ?.find(q => String(q.dbId || q.id) === String(window.__gwState.activeQuestId));
    if (activeQuest && window.GridWildQuestLayer) {
      window.GridWildQuestLayer.embark(activeQuest);
    }

    window.dispatchEvent(new CustomEvent("gwQuestDataReady", {
      detail: { quests: window.__gwState.quests }
    }));

    return window.__gwState.quests;
  })().catch((err) => {
    console.warn("Deferred quest load failed:", err);
    window.__gwState.questDataLoaded = false;
    throw err;
  }).finally(() => {
    gwQuestDataPromise = null;
  });

  return gwQuestDataPromise;
}

let gwSurveyDataPromise = null;
async function ensureSurveyDataLoaded(options = {}) {
  window.__gwState = window.__gwState || {};
  if (window.__gwState.surveyDataLoaded && options.force !== true) return window.__gwState.surveys || [];
  if (gwSurveyDataPromise && options.force !== true) return gwSurveyDataPromise;

  gwSurveyDataPromise = (async () => {
    const data = await window.GridWildAPI.getSurveys();
    window.__gwState.surveys = data.surveys || [];
    window.__gwState.playerSurveys = data.player_surveys || [];
    window.__gwState.surveyDataLoaded = true;

    window.GridWildQuests?.renderQuestListIntoPage?.();
    window.GridWildCampaignLayer?.refresh?.();
    window.dispatchEvent(new CustomEvent("gwSurveyDataReady", {
      detail: { surveys: window.__gwState.surveys }
    }));

    return window.__gwState.surveys;
  })().catch((err) => {
    console.warn("Deferred survey load failed:", err);
    window.__gwState.surveyDataLoaded = false;
    throw err;
  }).finally(() => {
    gwSurveyDataPromise = null;
  });

  return gwSurveyDataPromise;
}

window.ensureGridWildPlayerDetailsLoaded = ensurePlayerBootstrapDetailsLoaded;
window.ensureGridWildQuestDataLoaded = ensureQuestDataLoaded;
window.ensureGridWildSurveyDataLoaded = ensureSurveyDataLoaded;
   
  function openSheet(name) {
    closeAllSheets();
    const sheet = sheets[name];
    if (!sheet) return;

    sheet.classList.add("is-open");
    gwBackdrop.classList.add("is-open");

    if (navButtons[name]) {
      navButtons[name].classList.add("is-active");
    }

    if (name === "info") {
      window.GridWildField?.renderIntoPage?.();
      ensureSurveyDataLoaded()
        .catch((err) => console.warn("Could not load surveys for Field sheet.", err));
      ensureGridWildLocalNichesLoaded()
        .catch((err) => console.warn("Could not load Local Niches module for Field sheet.", err));
      window.GridWildPatches?.render?.();
      window.GridWildOsmFeaturesLayer?.scheduleFetch?.();
    }

    if (name === "legend") {
      if (typeof window.refreshGridWildMobileInfo === "function") {
        window.refreshGridWildMobileInfo();
      }
    }

    if (name === "me") {
      ensurePlayerBootstrapDetailsLoaded()
        .catch((err) => console.warn("Could not load player details for Me sheet.", err));
    }

    if (name === "community") {
      setTimeout(async () => {
        await ensureGridWildPartyLoaded()
          .catch((err) => console.warn("Could not load Party module.", err));
        await window.GridWildPartyLive?.loadParty?.();
        window.GridWildPartyLive?.refreshPartySheet?.();
        window.GridWildPartyLive?.startPartyPolling?.();
      }, 0);
    }

    if (name === "quest") {
      ensureQuestDataLoaded()
        .catch((err) => console.warn("Could not load quests for Quest sheet.", err));
      ensureSurveyDataLoaded()
        .catch((err) => console.warn("Could not load surveys for Quest sheet.", err));
      ensureGridWildLocalNichesLoaded()
        .catch((err) => console.warn("Could not load Local Niches module.", err));
    }

      if (name === "quest" && window.GridWildQuests) {
        window.GridWildQuests.renderQuestListIntoPage();

        const questBody = document.getElementById("sheetQuestBody");
        if (questBody) {
          window.GridWildQuests.bindQuestSheetControls(questBody);
          window.GridWildLocalNiches?.renderIntoPage?.();
        }
      }
    }

    const sheetOrder = ["me", "info", "community", "quest"];

    function getOpenSheetName() {
      for (const [name, el] of Object.entries(sheets)) {
        if (el.classList.contains("is-open")) return name;
      }
      return null;
    }

    window.GridWildSheets = {
      open: openSheet,
      closeAll: closeAllSheets,
      getOpen: getOpenSheetName
    };

    function openAdjacentSheet(direction) {
      const current = getOpenSheetName();
      if (!current) return;

      const idx = sheetOrder.indexOf(current);
      if (idx === -1) return;

      const nextIdx = idx + direction;
      if (nextIdx < 0 || nextIdx >= sheetOrder.length) return;

      openSheet(sheetOrder[nextIdx]);
    }

    let sheetTouchStartX = null;
    let sheetTouchStartY = null;

    function handleSheetTouchStart(e) {
      const t = e.changedTouches?.[0];
      if (!t) return;

      sheetTouchStartX = t.clientX;
      sheetTouchStartY = t.clientY;
    }

    function handleSheetTouchEnd(e) {
      const t = e.changedTouches?.[0];
      if (!t || sheetTouchStartX == null || sheetTouchStartY == null) return;

      const dx = t.clientX - sheetTouchStartX;
      const dy = t.clientY - sheetTouchStartY;

      sheetTouchStartX = null;
      sheetTouchStartY = null;

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // --------------------------------------------------
      // Swipe down closes the current sheet
      // --------------------------------------------------
      if (dy > 200 && absDy > absDx) {
        closeAllSheets();
        return;
      }

      // --------------------------------------------------
      // Horizontal swipe switches sheets
      // --------------------------------------------------
      if (absDx < 50) return;
      if (absDx < absDy) return;

      if (dx < 0) {
        openAdjacentSheet(1);   // swipe left -> next sheet
      } else {
        openAdjacentSheet(-1);  // swipe right -> previous sheet
      }
    }

    document.querySelectorAll(".gw-sheet-card").forEach(card => {
      card.addEventListener("touchstart", handleSheetTouchStart, { passive: true });
      card.addEventListener("touchend", handleSheetTouchEnd, { passive: true });
    });


    document.querySelectorAll("[data-close-sheet]").forEach(btn => {
      btn.addEventListener("click", closeAllSheets);
    });

    gwBackdrop.addEventListener("click", closeAllSheets);

    function toggleSheet(name) {
      const currentlyOpen = getOpenSheetName();

      if (currentlyOpen === name) {
        closeAllSheets();
        return;
      }

        openSheet(name);
      }


      document.getElementById("btnMe")
        .addEventListener("click", () => toggleSheet("me"));

      document.getElementById("btnInfo")
        .addEventListener("click", () => toggleSheet("info"));

      document.getElementById("btnCommunity")
        .addEventListener("click", () => toggleSheet("community"));

      document.getElementById("btnQuest")
        .addEventListener("click", () => toggleSheet("quest"));

      document.getElementById("legendPill")
      .addEventListener("click", () => toggleSheet("legend"));  

    const lensLabels = {
      classic: "Explorer",
      richness: "Biodiversity",
      rare: "Rare Finds",
      underexplored: "Frontier",
      observers: "Busy World",
      night: "Night Gold",
      emerald: "Emerald",
      treasure: "Treasure",
      cultivated: "Gardenworld",
      wildbalance: "Wild Balance",
      dominantlife: "Dominant Life",
      seasonalpulse: "Season Pulse",
      stability: "Stability",
      breadth: "Breadth",
      treasure2: "Hidden Treasure",
      freshness: "Freshness",
      wildtime: "Wildtime",
      timeconfidence: "Recency Strength",
      revisit: "Revisit",
      reactivated: "Reactivated",
      seasonalnow: "Season Watch",
      "osm-path-adjacency": "OSM Path Buffer",
      "osm-trail-side": "OSM Trail Side",
      "osm-wet-edge": "OSM Wet Edge",
      "osm-barrier-map": "OSM Barriers",
      "osm-landuse-class": "OSM Land Use",
      "osm-accessibility": "OSM Access",
    };

    // Compact HUD legend module. Remove #gwHudLegend plus this object to
    // return the topbar to the previous Legend-sheet-only behavior.
    window.GridWildHudLegend = (function () {
      const defaultSamples = [
        { count: 2, species: 2, observers: 1 },
        { count: 10, species: 8, observers: 3 },
        { count: 30, species: 18, observers: 6 }
      ];

      function daysAgo(days) {
        return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
      }

      const sampleByLens = {
        cultivated: [
          { count: 8, species: 3, observers: 2, n_captive: 1 },
          { count: 14, species: 8, observers: 3, n_captive: 7 },
          { count: 24, species: 15, observers: 4, n_captive: 22 }
        ],
        wildbalance: [
          { count: 18, species: 10, observers: 3, n_captive: 0 },
          { count: 18, species: 10, observers: 3, n_captive: 9 },
          { count: 18, species: 10, observers: 3, n_captive: 18 }
        ],
        dominantlife: [
          { count: 18, species: 10, observers: 3, dominant_iconic: "Plantae" },
          { count: 18, species: 10, observers: 3, dominant_iconic: "Aves" },
          { count: 18, species: 10, observers: 3, dominant_iconic: "Insecta" }
        ],
        seasonalpulse: [
          { count: 18, species: 10, observers: 3, peak_month: 1, seasonal_strength: 0.75 },
          { count: 18, species: 10, observers: 3, peak_month: 6, seasonal_strength: 0.75 },
          { count: 18, species: 10, observers: 3, peak_month: 11, seasonal_strength: 0.75 }
        ],
        stability: [
          { count: 18, species: 10, observers: 3, month_entropy: 0.2 },
          { count: 18, species: 10, observers: 3, month_entropy: 1.8 },
          { count: 18, species: 10, observers: 3, month_entropy: 3.6 }
        ],
        breadth: [
          { count: 12, species: 7, observers: 2, iconic_n: 1 },
          { count: 18, species: 12, observers: 3, iconic_n: 3 },
          { count: 28, species: 20, observers: 5, iconic_n: 6 }
        ],
        treasure2: [
          { count: 8, species: 3, observers: 1, nActiveSquares: 9 },
          { count: 12, species: 10, observers: 2, nActiveSquares: 5 },
          { count: 18, species: 18, observers: 2, nActiveSquares: 1 }
        ],
        freshness: [
          { count: 8, species: 6, observers: 2, last_observed: daysAgo(2400) },
          { count: 14, species: 10, observers: 3, last_observed: daysAgo(900) },
          { count: 24, species: 16, observers: 5, last_observed: daysAgo(30) }
        ],
        wildtime: [
          { count: 10, species: 7, observers: 2, median_last10_observed: daysAgo(2600) },
          { count: 18, species: 12, observers: 3, median_last10_observed: daysAgo(1000) },
          { count: 28, species: 20, observers: 5, median_last10_observed: daysAgo(80) }
        ],
        timeconfidence: [
          { count: 10, species: 7, observers: 2, last_observed: daysAgo(2400), median_last10_observed: daysAgo(2600) },
          { count: 18, species: 12, observers: 3, last_observed: daysAgo(30), median_last10_observed: daysAgo(2300) },
          { count: 28, species: 20, observers: 5, last_observed: daysAgo(25), median_last10_observed: daysAgo(90) }
        ],
        revisit: [
          { count: 8, species: 4, observers: 2, last_observed: daysAgo(600) },
          { count: 14, species: 12, observers: 3, last_observed: daysAgo(1600) },
          { count: 24, species: 22, observers: 5, last_observed: daysAgo(2600) }
        ],
        reactivated: [
          { count: 10, species: 7, observers: 2, last_observed: daysAgo(1800), median_last10_observed: daysAgo(2100) },
          { count: 18, species: 12, observers: 3, last_observed: daysAgo(80), median_last10_observed: daysAgo(900) },
          { count: 28, species: 20, observers: 5, last_observed: daysAgo(20), median_last10_observed: daysAgo(2400) }
        ],
        seasonalnow: [
          { count: 10, species: 7, observers: 2, last_observed: daysAgo(180) },
          { count: 18, species: 12, observers: 3, last_observed: daysAgo(90) },
          { count: 28, species: 20, observers: 5, last_observed: daysAgo(12) }
        ],
        "osm-path-adjacency": [
          { osm: { nearestPathDistanceM: 28, isPathAdjacent: false } },
          { osm: { nearestPathDistanceM: 12, isPathAdjacent: false } },
          { osm: { nearestPathDistanceM: 3, isPathAdjacent: true } }
        ],
        "osm-trail-side": [
          { osm: { nearestPathSide: "left", isPathAdjacent: true } },
          { osm: { nearestPathSide: "center", isPathAdjacent: true } },
          { osm: { nearestPathSide: "right", isPathAdjacent: true } }
        ],
        "osm-wet-edge": [
          { osm: { nearestWaterDistanceM: 18, isWetEdge: false, insideWater: false } },
          { osm: { nearestWaterDistanceM: 4, isWetEdge: true, insideWater: false } },
          { osm: { nearestWaterDistanceM: 0, isWetEdge: false, insideWater: true } }
        ],
        "osm-barrier-map": [
          { osm: { roadBarrierClass: "none", insideBuilding: false } },
          { osm: { roadBarrierClass: "near", insideBuilding: false } },
          { osm: { roadBarrierClass: "crossing", insideBuilding: false } }
        ],
        "osm-landuse-class": [
          { osm: { landuseClass: "park" } },
          { osm: { landuseClass: "grass" } },
          { osm: { landuseClass: "water" } }
        ],
        "osm-accessibility": [
          { osm: { accessibilityScore: 0.18 } },
          { osm: { accessibilityScore: 0.52 } },
          { osm: { accessibilityScore: 0.86 } }
        ]
      };

      function $(id) {
        return document.getElementById(id);
      }

      function sampleStyles(lens) {
        if (typeof window.metricsToFill !== "function") return [];
        return (sampleByLens[lens] || defaultSamples)
          .map(metrics => window.metricsToFill(metrics))
          .filter(Boolean);
      }

      function paintChip(el, style) {
        if (!el || !style) return;
        el.style.background = style.fillColor;
        el.style.opacity = style.fillOpacity ?? 1;
      }

      function refresh() {
        const root = $("gwHudLegend");
        if (!root) return;

        const lens = window.__gwState?.activeLens || "classic";
        const copy = window.GWLegendCopy?.[lens] || window.GWLegendCopy?.classic || {};
        const styles = sampleStyles(lens);

        $("gwHudLegendTitle").textContent = copy.title || lensLabels[lens] || "Overlay";
        $("gwHudLegendSubtitle").textContent = copy.subtitle || "Current overlay lens.";
        const linesEl = $("gwHudLegendLines");
        linesEl.replaceChildren(
          ...(copy.lines || []).slice(0, 4).map(line => {
            const el = document.createElement("div");
            el.textContent = line;
            return el;
          })
        );

        if (styles.length >= 3) {
          $("gwHudLegendBar").style.background = `linear-gradient(to right, ${styles[0].fillColor}, ${styles[1].fillColor}, ${styles[2].fillColor})`;
          paintChip($("gwHudLegendChipLow"), styles[0]);
          paintChip($("gwHudLegendChipMid"), styles[1]);
          paintChip($("gwHudLegendChipHigh"), styles[2]);
        }
      }

      function bind() {
        const root = $("gwHudLegend");
        if (!root || root.dataset.bound === "true") return;
        root.dataset.bound = "true";
        root.addEventListener("click", () => toggleSheet("lens"));
        root.addEventListener("keydown", evt => {
          if (evt.key === "Enter" || evt.key === " ") {
            evt.preventDefault();
            toggleSheet("lens");
          }
        });
      }

      return { bind, refresh, sampleStyles };
    })();
    window.GridWildHudLegend.bind();

    // Compact Overlay Pane. Remove #gwHudCompactLegend plus this object and
    // its refresh calls to cleanly remove the duplicate compact pane.
    window.GridWildHudCompactLegend = (function () {
      function $(id) {
        return document.getElementById(id);
      }

      function fogIsEnabled() {
        const fogCheckbox = document.getElementById("toggleFog");
        if (fogCheckbox) return fogCheckbox.checked;
        return window.__gwState?.showFog ?? false;
      }

      function refresh() {
        const root = $("gwHudCompactLegend");
        if (!root) return;

        const lens = window.__gwState?.activeLens || "classic";
        const copy = window.GWLegendCopy?.[lens] || window.GWLegendCopy?.classic || {};
        const styles = window.GridWildHudLegend?.sampleStyles?.(lens) || [];
        const fogBar = $("gwHudCompactFogBar");

        $("gwHudCompactLegendTitle").textContent = copy.title || lensLabels[lens] || "Overlay";
        if (fogBar) fogBar.hidden = !fogIsEnabled();

        if (styles.length >= 3) {
          $("gwHudCompactLegendBar").style.background =
            `linear-gradient(to right, ${styles[0].fillColor}, ${styles[1].fillColor}, ${styles[2].fillColor})`;
        }
      }

      function bind() {
        const root = $("gwHudCompactLegend");
        if (!root || root.dataset.bound === "true") return;
        root.dataset.bound = "true";
        root.addEventListener("click", () => toggleSheet("lens"));
        root.addEventListener("keydown", evt => {
          if (evt.key === "Enter" || evt.key === " ") {
            evt.preventDefault();
            toggleSheet("lens");
          }
        });
      }

      return { bind, refresh };
    })();
    window.GridWildHudCompactLegend.bind();

    // Compact HUD taxa filter. It mirrors the existing Legend-pane checkboxes
    // instead of replacing them, so removing #gwHudTaxaFilter plus this module
    // restores the previous controls unchanged.
    window.GridWildHudTaxaFilter = (function () {
      function buttons() {
        return Array.from(document.querySelectorAll("[data-gw-hud-iconic]"));
      }

      function toast(message) {
        if (typeof window.showGridWildToast === "function") {
          window.showGridWildToast(message);
          return;
        }

        const el = document.createElement("div");
        el.textContent = message;
        Object.assign(el.style, {
          position: "fixed",
          left: "50%",
          bottom: "118px",
          zIndex: "999999",
          transform: "translateX(-50%)",
          padding: "10px 14px",
          borderRadius: "999px",
          color: "#efe6d3",
          background: "rgba(20,17,15,0.94)",
          border: "1px solid rgba(215,183,116,0.34)",
          boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
          fontSize: "13px",
          fontWeight: "800",
          pointerEvents: "none"
        });
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1400);
      }

      function stateLabel(name, enabled) {
        return `${name} ${enabled ? "on" : "off"}`;
      }

      function invalidateHeatCaches() {
        window.GridWildMeOverlayFilter?.invalidate?.();
        window.GridWildCoarseHeatCache?.invalidate?.();
        window.GridWildCoarseHeatTileCache?.invalidate?.();
      }

      function saveUiState() {
        if (typeof saveUIState === "function") saveUIState();
      }

      function updateGridNow() {
        if (typeof window.updateGrid === "function") {
          window.updateGrid();
        } else if (typeof updateGrid === "function") {
          updateGrid();
        }
      }

      function realCheckbox(iconic) {
        return document.querySelector(`input[data-iconic="${iconic}"]`);
      }

      function selectedIconicTaxa() {
        return Array.from(document.querySelectorAll("input[data-iconic]"))
          .filter(input => input.checked)
          .map(input => input.dataset.iconic)
          .filter(Boolean);
      }

      function fogCheckbox() {
        return document.getElementById("toggleFog");
      }

      function fogButton() {
        return document.getElementById("gwHudFogToggle");
      }

      function osmCheckbox() {
        return document.getElementById("toggleOsmBuildings");
      }

      function osmButtons() {
        return Array.from(document.querySelectorAll("[data-gw-hud-osm]"));
      }

      function heatCheckbox() {
        return document.getElementById("toggleHeat");
      }

      function heatButton() {
        return document.getElementById("gwHudHeatToggle");
      }

      function surveyCheckbox() {
        return document.getElementById("toggleSurveyView");
      }

      function surveyButton() {
        return document.getElementById("gwHudSurveyLayerToggle");
      }

      function blastButton() {
        return document.getElementById("gwHudVisionBlastBtn");
      }

      function nicheButton() {
        return document.getElementById("gwHudNicheLayerToggle");
      }

      function sparkleButton() {
        return document.getElementById("gwHudNicheSparkleToggle");
      }

      function dayNightButton() {
        return document.getElementById("gwHudDayNightToggle");
      }

      function meButton() {
        return document.getElementById("gwHudMeToggle");
      }

      function applyIconicFilterChange() {
        window.__gwFilters = window.__gwFilters || {};
        window.__gwFilters.iconicTaxa = selectedIconicTaxa();

        invalidateHeatCaches();
        window.dispatchEvent(new CustomEvent("gridwild:filterschange", {
          detail: { iconicTaxa: window.__gwFilters.iconicTaxa }
        }));
        saveUiState();
        updateGridNow();

        if (window.__gwState?.dynamicINatEnabled &&
            typeof window.maybeRefreshDynamicINat === "function") {
          window.maybeRefreshDynamicINat(true);
        }
      }

      function applyFogChange(checked) {
        window.__gwState = window.__gwState || {};
        window.__gwState.showFog = checked === true;
        saveUiState();
        updateGridNow();
        window.GridWildFogCanvas?.render?.();
        window.GridWildFogCanvas?.scheduleRender?.();
        window.GridWildHudCompactLegend?.refresh?.();
      }

      function applyOsmChange(checked) {
        window.__gwState = window.__gwState || {};
        window.__gwState.showOsmFeatures = checked === true;
        window.__gwState.showOsmBuildings = checked === true;
        saveUiState();
        window.GridWildOsmFeaturesLayer?.setFeatureVisible?.("buildings", checked === true);
        window.GridWildOsmFeaturesLayer?.render?.();
        window.GridWildOsmFeaturesLayer?.scheduleRender?.();
        window.GridWildOsmPriorsLayer?.render?.();
        window.GridWildOsmPriorsLayer?.scheduleRender?.();
        updateGridNow();
      }

      function applyHeatChange(checked) {
        const enabled = checked === true;
        window.__gwFilters = window.__gwFilters || {};
        window.__gwFilters.showHeat = enabled;
        saveUiState();

        if (typeof window.applyGridWildHeatVisibility === "function") {
          window.applyGridWildHeatVisibility(enabled);
        } else if (typeof window.setHeatVisible === "function") {
          window.setHeatVisible(enabled);
        } else {
          updateGridNow();
        }

        const heatPane = window.map?.getPane?.("gridHeatPane");
        if (heatPane) {
          if (enabled) heatPane.style.removeProperty("display");
          else heatPane.style.setProperty("display", "none", "important");
        }

        const heatCanvas = document.getElementById("gwGridHeatCanvas");
        if (heatCanvas) {
          heatCanvas.style.setProperty("display", enabled ? "block" : "none", "important");
        }

        const heat = heatButton();
        if (heat) heat.dataset.gwHeatEnabled = enabled ? "true" : "false";
      }

      function applySurveyChange(checked) {
        const enabled = checked === true;
        window.__gwState = window.__gwState || {};
        window.__gwState.showSurveyView = enabled;

        const real = surveyCheckbox();
        if (real) real.checked = enabled;

        if (window.GridWildSurveyLayer?.setSurveyViewEnabled) {
          window.GridWildSurveyLayer.setSurveyViewEnabled(enabled);
        } else {
          window.GridWildSurveyLayer?.render?.();
          window.dispatchEvent(new CustomEvent("gridwild:surveyviewchange", {
            detail: { showSurveyView: enabled }
          }));
        }

        saveUiState();
      }

      window.reconcileGridWildHudHeat = function reconcileGridWildHudHeat() {
        applyHeatChange(heatCheckbox()?.checked === true);
        sync();
      };

      const BLAST_COOLDOWN_MS = 60000;
      let blastCooldownTimer = null;
      let blastReadyAt = 0;
      let suppressMirroredChange = false;

      function dispatchMirroredChange(el) {
        suppressMirroredChange = true;
        try {
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } finally {
          suppressMirroredChange = false;
        }
      }

      function sync() {
        buttons().forEach(btn => {
          const iconic = btn.dataset.gwHudIconic;
          const checked = !!realCheckbox(iconic)?.checked;
          btn.classList.toggle("is-on", checked);
          btn.setAttribute("aria-pressed", checked ? "true" : "false");
        });

        const fog = fogButton();
        const fogChecked = !!fogCheckbox()?.checked;
        if (fog) {
          fog.classList.toggle("is-on", fogChecked);
          fog.setAttribute("aria-pressed", fogChecked ? "true" : "false");
        }

        const osmChecked = !!osmCheckbox()?.checked;
        osmButtons().forEach(btn => {
          btn.classList.toggle("is-on", osmChecked);
          btn.setAttribute("aria-pressed", osmChecked ? "true" : "false");
        });

        const heat = heatButton();
        const heatChecked = !!heatCheckbox()?.checked;
        if (heat) {
          heat.classList.toggle("is-on", heatChecked);
          heat.setAttribute("aria-pressed", heatChecked ? "true" : "false");
        }

        const survey = surveyButton();
        const surveyChecked = surveyCheckbox()
          ? surveyCheckbox().checked === true
          : window.__gwState?.showSurveyView !== false;
        if (survey) {
          survey.classList.toggle("is-on", surveyChecked);
          survey.setAttribute("aria-pressed", surveyChecked ? "true" : "false");
        }

        syncBlastButton();

        const niche = nicheButton();
        const nicheChecked = window.GridWildLocalNiches?.isVisible?.() ??
          window.__gwState?.showLocalNiches !== false;
        if (niche) {
          niche.classList.toggle("is-on", nicheChecked);
          niche.setAttribute("aria-pressed", nicheChecked ? "true" : "false");
        }

        const sparkle = sparkleButton();
        const sparkleChecked = window.GridWildCellSeededNiches?.sparklesVisible?.() ??
          (window.__gwState?.showNicheSparkles === true);
        if (sparkle) {
          sparkle.classList.toggle("is-on", sparkleChecked);
          sparkle.setAttribute("aria-pressed", sparkleChecked ? "true" : "false");
        }

        const dayNight = dayNightButton();
        const nightMode = (window.GridWildMapMode?.getMode?.() || window.__gwState?.dayNightMode) === "night";
        if (dayNight) {
          dayNight.classList.toggle("is-on", nightMode);
          dayNight.setAttribute("aria-pressed", nightMode ? "true" : "false");
          dayNight.setAttribute("aria-label", nightMode ? "Switch to day map" : "Switch to night map");
          dayNight.title = nightMode ? "Day map" : "Night map";
        }

        const me = meButton();
        const meChecked = window.__gwFilters?.onlyMe === true;
        if (me) {
          me.classList.toggle("is-on", meChecked);
          me.setAttribute("aria-pressed", meChecked ? "true" : "false");
        }
      }

      function toggle(iconic) {
        const real = realCheckbox(iconic);
        if (!real) return;

        real.checked = !real.checked;
        dispatchMirroredChange(real);
        applyIconicFilterChange();
        sync();
        const label = document.querySelector(`[data-gw-hud-iconic="${iconic}"]`)?.title || iconic;
        toast(stateLabel(label, real.checked));
      }

      function toggleFog() {
        const real = fogCheckbox();
        if (!real) return;

        real.checked = !real.checked;
        dispatchMirroredChange(real);
        applyFogChange(real.checked);
        sync();
        toast(stateLabel("Fog", real.checked));
      }

      function toggleOsm() {
        const real = osmCheckbox();
        if (!real) return;

        real.checked = !real.checked;
        dispatchMirroredChange(real);
        applyOsmChange(real.checked);
        sync();
        toast(stateLabel("House layer", real.checked));
      }

      function toggleHeat() {
        const real = heatCheckbox();
        if (!real) return;

        real.checked = !real.checked;
        dispatchMirroredChange(real);
        applyHeatChange(real.checked);
        sync();
        toast(stateLabel("Heat", real.checked));
      }

      function toggleSurvey() {
        const real = surveyCheckbox();
        const current = real
          ? real.checked === true
          : window.__gwState?.showSurveyView !== false;
        const next = !current;

        if (real) {
          real.checked = next;
          dispatchMirroredChange(real);
        }

        applySurveyChange(next);
        sync();
        toast(stateLabel("Survey view", next));
      }

      function syncBlastButton() {
        const btn = blastButton();
        if (!btn) return;

        const remaining = Math.max(0, blastReadyAt - Date.now());
        const ready = remaining <= 0;

        btn.classList.toggle("is-ready", ready);
        btn.classList.toggle("is-on", ready);
        btn.classList.toggle("is-cooling", !ready);
        btn.setAttribute("aria-disabled", ready ? "false" : "true");
        btn.style.setProperty("--cooldown-progress", `${(remaining / BLAST_COOLDOWN_MS) * 100}%`);

        if (ready && blastCooldownTimer) {
          clearInterval(blastCooldownTimer);
          blastCooldownTimer = null;
        }
      }

      function startBlastCooldown() {
        blastReadyAt = Date.now() + BLAST_COOLDOWN_MS;
        syncBlastButton();
        if (blastCooldownTimer) clearInterval(blastCooldownTimer);
        blastCooldownTimer = setInterval(syncBlastButton, 250);
      }

      function triggerVisionBlast() {
        const remaining = Math.max(0, blastReadyAt - Date.now());
        if (remaining > 0) {
          toast(`Explosive vision ready in ${Math.ceil(remaining / 1000)}s`);
          return;
        }

        if (typeof window.triggerGodsEyeBlast !== "function") {
          toast("Explosive vision is not ready");
          return;
        }

        window.triggerGodsEyeBlast();
        toast("Explosive vision");
        startBlastCooldown();
      }

      function toggleNicheLayer() {
        window.__gwState = window.__gwState || {};
        if (!window.GridWildLocalNiches) {
          ensureGridWildLocalNichesLoaded()
            .then(() => toggleNicheLayer())
            .catch((err) => console.warn("Could not load Local Niches module.", err));
          toast("Loading local niches...");
          return;
        }

        const next = window.GridWildLocalNiches?.toggleVisible?.() ??
          (window.__gwState.showLocalNiches = window.__gwState.showLocalNiches === false);

        if (window.GridWildLocalNiches?.getNiches?.().length) {
          window.GridWildLocalNiches.drawNicheLayer?.();
        }

        sync();
        toast(stateLabel("Local niches", next));
      }

      function toggleNicheSparkles() {
        window.__gwState = window.__gwState || {};
        const next = window.GridWildCellSeededNiches?.toggleSparkles?.({ silent: true }) ??
          (window.__gwState.showNicheSparkles = window.__gwState.showNicheSparkles !== true);

        if (typeof saveUIState === "function") saveUIState();
        sync();
        toast(stateLabel("Niche Sparkle", next));
      }

      function toggleDayNightMode() {
        const current = window.GridWildMapMode?.getMode?.() || window.__gwState?.dayNightMode || "day";
        const next = current === "night" ? "day" : "night";

        if (window.GridWildMapMode?.setMode) {
          window.GridWildMapMode.setMode(next);
        } else {
          window.__gwState = window.__gwState || {};
          window.__gwState.dayNightMode = next;
          document.documentElement.classList.toggle("gw-map-night", next === "night");
          try {
            const state = JSON.parse(localStorage.getItem("gw_ui_state") || "{}");
            state.dayNightMode = next;
            localStorage.setItem("gw_ui_state", JSON.stringify(state));
          } catch {}
        }

        sync();
        toast(next === "night" ? "Night map" : "Day map");
      }

      function toggleMe() {
        window.__gwFilters = window.__gwFilters || {};
        window.__gwFilters.onlyMe = window.__gwFilters.onlyMe !== true;
        if (window.__gwState) window.__gwState.onlyMeFilterEnabled = window.__gwFilters.onlyMe;

        window.GridWildMeOverlayFilter?.invalidate?.();
        window.GridWildCoarseHeatCache?.invalidate?.();
        window.GridWildCoarseHeatTileCache?.invalidate?.();
        window.dispatchEvent(new CustomEvent("gridwild:filterschange", {
          detail: { onlyMe: window.__gwFilters.onlyMe === true }
        }));
        if (typeof saveUIState === "function") saveUIState();
        if (typeof window.updateGrid === "function") window.updateGrid();
        sync();
        toast(stateLabel("Me filter", window.__gwFilters.onlyMe === true));
      }

      function bind() {
        const root = document.getElementById("gwHudTaxaFilter");
        if (root?.dataset.bound === "true") return;

        if (root) root.dataset.bound = "true";
        buttons().forEach(btn => {
          btn.setAttribute("aria-pressed", "false");
          btn.addEventListener("click", () => toggle(btn.dataset.gwHudIconic));
        });
        fogButton()?.addEventListener("click", toggleFog);
        osmButtons().forEach(btn => {
          if (btn.dataset.gwOsmBound === "true") return;
          btn.dataset.gwOsmBound = "true";
          btn.setAttribute("aria-pressed", "false");
          btn.addEventListener("click", toggleOsm);
        });
        meButton()?.addEventListener("click", toggleMe);
        heatButton()?.addEventListener("click", toggleHeat);
        heatButton()?.addEventListener("click", () => {
          setTimeout(() => {
            applyHeatChange(heatCheckbox()?.checked === true);
            sync();
          }, 0);
        });
        surveyButton()?.addEventListener("click", toggleSurvey);
        blastButton()?.addEventListener("click", triggerVisionBlast);
        nicheButton()?.addEventListener("click", toggleNicheLayer);
        sparkleButton()?.addEventListener("click", toggleNicheSparkles);
        dayNightButton()?.addEventListener("click", toggleDayNightMode);
        syncBlastButton();

        document.addEventListener("change", evt => {
          if (evt.target?.matches?.('input[data-iconic]')) {
            if (!suppressMirroredChange) applyIconicFilterChange();
            sync();
          }
          if (evt.target?.id === "toggleFog") {
            if (!suppressMirroredChange) applyFogChange(evt.target.checked);
            sync();
          }
          if (evt.target?.id === "toggleOsmBuildings") {
            if (!suppressMirroredChange) applyOsmChange(evt.target.checked);
            sync();
          }
          if (evt.target?.id === "toggleHeat") {
            if (!suppressMirroredChange) applyHeatChange(evt.target.checked);
            sync();
          }
          if (evt.target?.id === "toggleSurveyView") {
            if (!suppressMirroredChange) applySurveyChange(evt.target.checked);
            sync();
          }
        });

        window.addEventListener("gridwild:localnicheschange", sync);
        window.addEventListener("gridwild:nichesparklechange", sync);
        window.addEventListener("gridwild:surveyviewchange", sync);
        window.addEventListener("gridwild:mapmodechange", sync);
        window.addEventListener("DOMContentLoaded", () => setTimeout(sync, 0));
        setTimeout(sync, 0);
      }

      return { bind, sync };
    })();
    window.GridWildHudTaxaFilter.bind();

    (function bindGridWildHudHeatVisibilityFallback() {
      const root = document.documentElement;
      if (root.dataset.gwHudHeatVisibilityFallbackBound === "true") return;
      root.dataset.gwHudHeatVisibilityFallbackBound = "true";

      function saveHeatPreference(enabled) {
        try {
          const state = JSON.parse(localStorage.getItem("gw_ui_state") || "{}");
          state.showHeat = enabled === true;
          localStorage.setItem("gw_ui_state", JSON.stringify(state));
        } catch {}
      }

      function apply(enabled) {
        window.__gwFilters = window.__gwFilters || {};
        window.__gwFilters.showHeat = enabled === true;
        saveHeatPreference(enabled === true);

        const pane = window.map?.getPane?.("gridHeatPane");
        if (pane) {
          if (enabled) pane.style.removeProperty("display");
          else pane.style.setProperty("display", "none", "important");
        }

        const canvas = document.getElementById("gwGridHeatCanvas");
        if (canvas) {
          canvas.style.setProperty("display", enabled ? "block" : "none", "important");
        }

        const btn = document.getElementById("gwHudHeatToggle");
        if (btn) {
          btn.dataset.gwHeatEnabled = enabled ? "true" : "false";
          btn.classList.toggle("is-on", enabled);
          btn.setAttribute("aria-pressed", enabled ? "true" : "false");
        }
      }

      function reconcile() {
        const checkbox = document.getElementById("toggleHeat");
        apply(checkbox ? checkbox.checked === true : true);
      }

      document.addEventListener("click", evt => {
        if (evt.target?.closest?.("#gwHudHeatToggle")) {
          setTimeout(reconcile, 0);
        }
      }, true);

      document.addEventListener("change", evt => {
        if (evt.target?.id === "toggleHeat") {
          setTimeout(reconcile, 0);
        }
      }, true);

      setTimeout(reconcile, 0);
    })();

    // Compact HUD high-contrast lens toggle. Remove #gwHudHighContrastToggle
    // plus this module and the GWLenses.applyHighContrast helper to undo it.
    window.GridWildHudHighContrast = (function () {
      function button() {
        return document.getElementById("gwHudHighContrastToggle");
      }

      function loadSaved() {
        try {
          const state = JSON.parse(localStorage.getItem("gw_ui_state") || "{}");
          return state.highContrastLensEnabled !== false;
        } catch {
          return true;
        }
      }

      function save() {
        try {
          const state = JSON.parse(localStorage.getItem("gw_ui_state") || "{}");
          state.highContrastLensEnabled = window.__gwState?.highContrastLensEnabled === true;
          localStorage.setItem("gw_ui_state", JSON.stringify(state));
        } catch {}
      }

      function toast(message) {
        if (typeof window.showGridWildToast === "function") {
          window.showGridWildToast(message);
        }
      }

      function sync() {
        const btn = button();
        const enabled = window.__gwState?.highContrastLensEnabled === true;
        if (!btn) return;

        btn.classList.toggle("is-on", enabled);
        btn.setAttribute("aria-pressed", enabled ? "true" : "false");
      }

      function apply(enabled) {
        window.__gwState = window.__gwState || {};
        window.__gwState.highContrastLensEnabled = enabled === true;
        sync();
        save();

        window.GridWildHudLegend?.refresh?.();
        window.GridWildHudCompactLegend?.refresh?.();
        if (typeof window.updateGrid === "function") window.updateGrid();
        window.dispatchEvent(new CustomEvent("gridwild:heatchange", {
          detail: { highContrastLensEnabled: window.__gwState.highContrastLensEnabled === true }
        }));
        if (typeof paintLegendFromHeatFunction === "function") paintLegendFromHeatFunction();
        toast(`Contrast ${window.__gwState.highContrastLensEnabled ? "on" : "off"}`);
      }

      function bind() {
        const btn = button();
        if (!btn || btn.dataset.bound === "true") return;

        window.__gwState = window.__gwState || {};
        window.__gwState.highContrastLensEnabled =
          window.__gwState.highContrastLensEnabled === true || loadSaved();

        btn.dataset.bound = "true";
        btn.setAttribute("aria-pressed", "false");
        btn.addEventListener("click", () => {
          apply(window.__gwState?.highContrastLensEnabled !== true);
        });
        sync();
      }

      return { bind, sync, apply };
    })();
    window.GridWildHudHighContrast.bind();

    // Compact HUD coarse-heat control. It mirrors the canonical hidden sidebar
    // checkbox so this experiment can be removed without touching map state code.
    window.GridWildHudCoarseHeatControl = (function () {
      function realCheckbox() {
        return document.getElementById("toggleSuperchunkHeat");
      }

      function hudCheckbox() {
        return document.getElementById("toggleSuperchunkHeat_hud");
      }

      function binButton() {
        return document.getElementById("gwCoarseHeatBinBtn");
      }

      function getBinSize() {
        const state = window.getGridWildCoarseHeatState?.();
        if (state) return state.effectiveBinSize;

        const raw = Number(window.__gwState?.coarseHeatBinSize);
        if (!Number.isFinite(raw)) return 8;
        return Math.max(2, Math.min(64, Math.round(raw)));
      }

      function setBinSize(value) {
        window.__gwState = window.__gwState || {};
        window.__gwState.coarseHeatBinSize = Math.max(2, Math.min(64, Math.round(Number(value) || 8)));
        localStorage.setItem("gwCoarseHeatBinSize", String(window.__gwState.coarseHeatBinSize));

        try {
          const state = JSON.parse(localStorage.getItem("gw_ui_state") || "{}");
          state.coarseHeatBinSize = window.__gwState.coarseHeatBinSize;
          localStorage.setItem("gw_ui_state", JSON.stringify(state));
        } catch {}

        sync();
        if (typeof window.updateGrid === "function") window.updateGrid();
      }

      function sync() {
        if (typeof window.syncGridWildCoarseHeatControls === "function") {
          window.syncGridWildCoarseHeatControls();
          return;
        }

        const real = realCheckbox();
        const hud = hudCheckbox();
        const btn = binButton();
        if (real && hud) hud.checked = real.checked;
        if (btn) btn.textContent = String(getBinSize());
      }

      function promptForBinSize(evt) {
        evt.preventDefault();
        evt.stopPropagation();

        const next = prompt("Coarse heat bin size in grid cells (2-64)", String(getBinSize()));
        if (next == null) return;
        setBinSize(next);
      }

      function bind() {
        const hud = hudCheckbox();
        if (!hud || hud.dataset.bound === "true") return;
        hud.dataset.bound = "true";

        hud.addEventListener("change", () => {
          const real = realCheckbox();
          if (!real) return;
          real.checked = hud.checked;
          real.dispatchEvent(new Event("change", { bubbles: true }));
        });

        realCheckbox()?.addEventListener("change", sync);
        binButton()?.addEventListener("click", promptForBinSize);
        window.addEventListener("DOMContentLoaded", () => setTimeout(sync, 0));
        setTimeout(sync, 0);
      }

      return { bind, sync, setBinSize };
    })();
    window.GridWildHudCoarseHeatControl.bind();

    window.GridWildHudZThresholdControl = (function () {
      const DEFAULT_MIN_SIZE = 10;
      const MAX_MORPH_SIZE = 999;

      function checkbox() {
        return document.getElementById("toggleHeatZThreshold");
      }

      function numberInput() {
        return document.getElementById("gwHeatZThresholdInput");
      }

      function slider() {
        return document.getElementById("gwHeatZThresholdSlider");
      }

      function directionButton() {
        return document.getElementById("gwHeatZThresholdDirectionBtn");
      }

      function minCheckbox() {
        return document.getElementById("toggleHeatMorphMin");
      }

      function minSizeInput() {
        return document.getElementById("gwHeatMorphMinSizeInput");
      }

      function clampZ(value) {
        const raw = Number(value);
        if (!Number.isFinite(raw)) return 0;
        return Math.max(-3, Math.min(3, raw));
      }

      function clampMorphSize(value, fallback) {
        const raw = Number(value);
        const next = Number.isFinite(raw) ? raw : fallback;
        return Math.max(1, Math.min(MAX_MORPH_SIZE, Math.round(next)));
      }

      function normalizeDirection(value) {
        return value === "below" ? "below" : "above";
      }

      function save() {
        try {
          const state = JSON.parse(localStorage.getItem("gw_ui_state") || "{}");
          state.heatZThresholdEnabled = window.__gwState?.heatZThresholdEnabled === true;
          state.heatZThreshold = window.__gwState?.heatZThreshold ?? 0;
          state.heatZThresholdDirection = normalizeDirection(window.__gwState?.heatZThresholdDirection);
          state.heatMorphMinEnabled = window.__gwState?.heatMorphMinEnabled === true;
          state.heatMorphMinSize = clampMorphSize(window.__gwState?.heatMorphMinSize, DEFAULT_MIN_SIZE);
          localStorage.setItem("gw_ui_state", JSON.stringify(state));
        } catch {}
      }

      function sync() {
        window.__gwState = window.__gwState || {};

        const enabled = window.__gwState.heatZThresholdEnabled === true;
        const z = clampZ(window.__gwState.heatZThreshold);
        const direction = normalizeDirection(window.__gwState.heatZThresholdDirection);
        const cb = checkbox();
        const num = numberInput();
        const range = slider();
        const dirBtn = directionButton();
        const minCb = minCheckbox();
        const minSize = minSizeInput();
        const morphMinEnabled = window.__gwState.heatMorphMinEnabled === true;
        const morphMinSize = clampMorphSize(window.__gwState.heatMorphMinSize, DEFAULT_MIN_SIZE);

        window.__gwState.heatZThreshold = z;
        window.__gwState.heatZThresholdDirection = direction;
        window.__gwState.heatMorphMinSize = morphMinSize;
        if (cb) cb.checked = enabled;
        if (num) num.value = z.toFixed(1);
        if (range) range.value = String(z);
        if (dirBtn) {
          const isBelow = direction === "below";
          dirBtn.innerHTML = isBelow ? "&le;" : "&ge;";
          dirBtn.setAttribute("aria-label", isBelow ? "Show heat cells below cutoff" : "Show heat cells above cutoff");
          dirBtn.title = isBelow ? "Show values below cutoff" : "Show values above cutoff";
        }
        if (minCb) minCb.checked = morphMinEnabled;
        if (minSize) minSize.value = String(morphMinSize);
      }

      function applyMorphChange(detail) {
        sync();
        save();
        if (typeof window.updateGrid === "function") window.updateGrid();
        window.dispatchEvent(new CustomEvent("gridwild:heatchange", { detail }));
      }

      function applyValue(value) {
        window.__gwState = window.__gwState || {};
        window.__gwState.heatZThreshold = clampZ(value);
        sync();
        save();
        if (typeof window.updateGrid === "function") window.updateGrid();
        window.dispatchEvent(new CustomEvent("gridwild:heatchange", {
          detail: { heatZThreshold: window.__gwState.heatZThreshold }
        }));
      }

      function applyEnabled(value) {
        window.__gwState = window.__gwState || {};
        window.__gwState.heatZThresholdEnabled = value === true;
        sync();
        save();
        if (typeof window.updateGrid === "function") window.updateGrid();
        window.dispatchEvent(new CustomEvent("gridwild:heatchange", {
          detail: { heatZThresholdEnabled: window.__gwState.heatZThresholdEnabled === true }
        }));
      }

      function toggleDirection() {
        window.__gwState = window.__gwState || {};
        const direction = normalizeDirection(window.__gwState.heatZThresholdDirection);
        window.__gwState.heatZThresholdDirection = direction === "below" ? "above" : "below";
        sync();
        save();
        if (typeof window.updateGrid === "function") window.updateGrid();
        window.dispatchEvent(new CustomEvent("gridwild:heatchange", {
          detail: { heatZThresholdDirection: window.__gwState.heatZThresholdDirection }
        }));
      }

      function applyMinEnabled(value) {
        window.__gwState = window.__gwState || {};
        window.__gwState.heatMorphMinEnabled = value === true;
        applyMorphChange({
          heatMorphMinEnabled: window.__gwState.heatMorphMinEnabled === true
        });
      }

      function applyMinSize(value) {
        window.__gwState = window.__gwState || {};
        window.__gwState.heatMorphMinSize = clampMorphSize(value, DEFAULT_MIN_SIZE);
        applyMorphChange({ heatMorphMinSize: window.__gwState.heatMorphMinSize });
      }

      function bind() {
        const cb = checkbox();
        const num = numberInput();
        const range = slider();
        const dirBtn = directionButton();
        const minCb = minCheckbox();
        const minSize = minSizeInput();
        if (!cb || cb.dataset.bound === "true") return;

        cb.dataset.bound = "true";
        cb.addEventListener("change", () => applyEnabled(cb.checked));
        num?.addEventListener("change", () => applyValue(num.value));
        range?.addEventListener("input", () => applyValue(range.value));
        dirBtn?.addEventListener("click", toggleDirection);
        minCb?.addEventListener("change", () => applyMinEnabled(minCb.checked));
        minSize?.addEventListener("change", () => applyMinSize(minSize.value));

        setTimeout(sync, 0);
      }

      return { bind, sync };
    })();
    window.GridWildHudZThresholdControl.bind();

    window.GridWildHudGeometryFoldout = (function () {
      function button() {
        return document.getElementById("gwHudGeometryToggle");
      }

      function controlsButton() {
        return document.getElementById("gwHudAdvancedLayerToggle");
      }

      function panel() {
        return document.getElementById("gwHudGeometryFoldout");
      }

      function taxaPanel() {
        return document.getElementById("gwHudTaxaFilter");
      }

      function applyControls(open) {
        const btn = controlsButton();
        const root = panel();
        const isOpen = open === true;

        if (root) root.hidden = !isOpen;
        if (btn) {
          btn.classList.toggle("is-on", isOpen);
          btn.setAttribute("aria-pressed", isOpen ? "true" : "false");
        }
      }

      function applyLayers(open) {
        const btn = button();
        const taxa = taxaPanel();
        const isOpen = open === true;

        if (taxa) taxa.hidden = !isOpen;
        applyControls(false);
        if (btn) {
          btn.classList.toggle("is-on", isOpen);
          btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
        }
      }

      function apply(open) {
        applyLayers(open);
      }

      function bind() {
        const btn = button();
        const controlsBtn = controlsButton();

        if (btn && btn.dataset.bound !== "true") {
          btn.dataset.bound = "true";
          btn.addEventListener("click", () => {
            applyLayers(taxaPanel()?.hidden !== false);
          });
        }

        if (controlsBtn && controlsBtn.dataset.bound !== "true") {
          controlsBtn.dataset.bound = "true";
          controlsBtn.addEventListener("click", () => {
            applyControls(panel()?.hidden !== false);
          });
        }

        applyLayers(false);
        applyControls(false);
      }

      return { bind, apply, applyControls, applyLayers };
    })();
    window.GridWildHudGeometryFoldout.bind();

  function bindLensCards(){

    document.querySelectorAll(".gw-lens-card").forEach(card => {

      card.onclick = () => {

        const lens = card.dataset.lens;

        window.__gwState.activeLens = lens;
        localStorage.setItem("gwActiveLens", lens);
        updateLegendText();
        window.GridWildHudLegend?.refresh?.();
        window.GridWildHudCompactLegend?.refresh?.();
        window.GridWildOsmPriorsLayer?.handleLensChange?.(lens);

        if (typeof updateGrid === "function") {
          updateGrid();
        }

        if (typeof paintLegendFromHeatFunction === "function") {
          paintLegendFromHeatFunction();
        }

        document.querySelectorAll(".gw-lens-card")
          .forEach(c => c.classList.remove("is-active"));

        card.classList.add("is-active");

        closeAllSheets();
      };

    });

  }

  bindLensCards();
      // --------------------------------------------------------------------
      // Camera → Draft Observation workflow
      // --------------------------------------------------------------------
      const btnCamera = document.getElementById("btnCamera");
      const cameraInput = document.getElementById("cameraInput");

      btnCamera.addEventListener("click", () => {
        window.GridWildDraftObservations?.startCaptureForNewObservation?.();
      });

      cameraInput.addEventListener("change", async () => {
        if (!cameraInput.files || cameraInput.files.length === 0) return;

        try {
          await window.GridWildDraftObservations.addFilesToActiveDraft(cameraInput.files);
          cameraInput.value = "";

          if (typeof window.initGridWildMobilePanels === "function") {
            window.initGridWildMobilePanels();
          }

          window.GridWildObservationEditor?.openActiveDraft?.();
        } catch (err) {
          console.warn("Draft photo capture failed:", err);
          alert(`Could not add photo: ${err.message}`);
        }
      });

    // --------------------------------------------------------------------
    // Recenter
    // --------------------------------------------------------------------
    const recenterFab = document.getElementById("recenterFab");

  recenterFab?.addEventListener("click", () => {
    if (typeof window.cycleLocationLock === "function") {
      window.cycleLocationLock({
        recenterNow: true,
        force: true
      });
    } else if (typeof window.enableLocationLock === "function") {
      window.enableLocationLock({
        zoom: 19,
        recenterNow: true,
        force: true
      });
    } else if (typeof window.requestLocationOnce === "function") {
      window.requestLocationOnce();
    }

    if (typeof window.refreshGridWildMobileInfo === "function") {
      window.refreshGridWildMobileInfo();
    }
  });
    // --------------------------------------------------------------------
    // Init
    // --------------------------------------------------------------------
      (async function initGridWildMobileShell() {

      try {
        const data = await window.GridWildAPI.getBootstrap();

        window.__gwState = window.__gwState || {};
        window.__gwState.player = data.player;
        window.__gwState.quests = data.quests || window.__gwState.quests || [];
        window.__gwState.questEvidence = (data.quests || window.__gwState.quests || [])
          .flatMap(q => q.quest_evidence || []);
        window.__gwState.questDataLoaded = Array.isArray(data.quests);

        window.__gwState.activeQuestId = data.state?.active_quest_id || null;
        window.__gwState.activePartyId = data.state?.active_party_id || null;

        window.__gwState.surveys = data.surveys || window.__gwState.surveys || [];
        window.__gwState.playerSurveys = data.player_surveys || window.__gwState.playerSurveys || [];
        window.__gwState.surveyDataLoaded = Array.isArray(data.surveys);

        window.__gwState.playerInventory = data.player_inventory || window.__gwState.playerInventory || [];
        window.__gwState.playerEquipment = data.player_equipment || window.__gwState.playerEquipment || null;

        window.__gwState.playerAchievements = data.player_achievements || window.__gwState.playerAchievements || [];
        window.__gwState.identificationClaims = data.identification_claims || window.__gwState.identificationClaims || [];
        window.__gwState.playerDetailsLoaded = Array.isArray(data.player_inventory);
        if (Array.isArray(data.identification_claims)) {
          window.GridWildIdentificationEvidence?.mergeServerClaims?.(data.identification_claims || []);
        }
        window.__gwState.playerPresence = data.player_presence || window.__gwState.playerPresence || null;
        window.__gwState.homeNicheId = data.home_niche_id || window.__gwState.homeNicheId || null;
        window.__gwState.homeNiche = data.home_niche || window.__gwState.homeNiche || null;

        window.GridWildAPI.setPlayerId(data.player.id);
        if (data.player_session) {
          window.GridWildAPI.setPlayerSession(data.player_session);
        }
        window.GridWildPlayerUI?.refreshPlayerUI?.();
        
        window.GridWildAchievements?.refreshAchievementSummary?.();

        window.GridWildEconomy?.refreshHud?.();
        window.GridWildCharacter?.renderSummary?.();

        window.dispatchEvent(new CustomEvent("gwBootstrapReady", {
          detail: { player: data.player, playerPresence: data.player_presence || null }
        }));

        window.refreshQuestBadge?.();

        runGridWildIdleTask(() => {
          ensureGridWildHerePanelLoaded()
            .catch((err) => console.warn("Idle Here panel load failed:", err));

          ensureGridWildLocalNichesLoaded()
            .catch((err) => console.warn("Idle Local Niches load failed:", err));

          if (window.__gwState.activePartyId) {
            ensureGridWildPartyLoaded()
              .catch((err) => console.warn("Idle Party module load failed:", err));
          }

          ensurePlayerBootstrapDetailsLoaded()
            .catch((err) => console.warn("Idle player details load failed:", err));

          if (window.__gwState.activeQuestId) {
            ensureQuestDataLoaded()
              .catch((err) => console.warn("Idle quest load failed:", err));
          }
        }, 900);

      } catch (err) {
        console.error("Bootstrap failed:", err);
      }
      
      const savedLens = localStorage.getItem("gwActiveLens");
      if (savedLens) {
        window.__gwState.activeLens = savedLens;
      }
      if (typeof updateGrid === "function") updateGrid();
      if (typeof paintLegendFromHeatFunction === "function") {
        paintLegendFromHeatFunction();
      }
      window.GridWildHudLegend?.refresh?.();
      window.GridWildHudCompactLegend?.refresh?.();
      window.GridWildOsmPriorsLayer?.handleLensChange?.(window.__gwState.activeLens);


      setTimeout(() => {
        if (typeof window.initGridWildMobilePanels === "function") {
          window.initGridWildMobilePanels();
        }
      }, 50);

      window.requestLocationOnce?.();
      const watchId = window.startWatchingLocation?.();
      window.__gwWatchId = watchId;

      if (typeof window.setLockButtonVisual === "function") {
        window.setLockButtonVisual();
      }
    })();
