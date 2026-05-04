// Sidebar UI wiring
(function () {
  // Iconic taxa options (iNat uses these names in obs.taxon.iconic_taxon_name)
  const TAXA_OPTIONS = [
    { key: "Insecta", label: "Insects" },
    { key: "Plantae", label: "Plants" },
    { key: "Fungi", label: "Fungi" },
    { key: "Mammalia", label: "Mammals" },
    { key: "Aves", label: "Birds" },
  ];

  function $(id) { return document.getElementById(id); }

  function getSelectedIconicTaxa() {
    const selected = [];
    for (const opt of TAXA_OPTIONS) {
      const cb = document.querySelector(`input[data-iconic="${opt.key}"]`);
      if (cb && cb.checked) selected.push(opt.key);
    }
    return selected;
  }


  // add state:
  function syncStateFromUI() {
    
  window.__gwFilters = window.__gwFilters || {};
  window.__gwState = window.__gwState || {};

  window.__gwFilters.showPoints = $("togglePoints")?.checked ?? false;
  window.__gwFilters.showHeat = $("toggleHeat")?.checked ?? true;
  
  window.__gwState.showOsmFeatures = $("toggleOsmBuildings")?.checked ?? true;
  window.__gwState.showOsmBuildings = window.__gwState.showOsmFeatures;

  window.__gwState.heatMetric = getSelectedHeatMetric();
  window.__gwFilters.iconicTaxa = getSelectedIconicTaxa();

  window.__gwState.showPoints = $("togglePoints")?.checked ?? true;
  window.__gwState.dynamicINatEnabled = $("toggleDynamicINat")?.checked ?? false;
  window.__gwState.showShimmer = $("toggleShimmer")?.checked ?? false;
  window.__gwState.showFog = $("toggleFog")?.checked ?? true;
  window.__gwState.fogSmoothingEnabled = $("toggleFogSmoothing")?.checked ?? true;
  window.__gwState.godsEyeEnabled = $("toggleGodsEye")?.checked ?? false;
  window.__gwState.lockToLocation = $("toggleLockLocation")?.checked ?? true;

  updateLegendText();
 saveUIState();
  if (typeof paintLegendFromHeatFunction === "function") {
  paintLegendFromHeatFunction();
}
}

  function setQueryFromUI() {
 //this function is old- replaced by STATE   
    window.__gwFilters = window.__gwFilters || {};
    window.__gwFilters.showPoints = $("togglePoints")?.checked ?? false;
    window.__gwFilters.showHeat = $("toggleHeat")?.checked ?? true;
    window.__gwFilters.iconicTaxa = getSelectedIconicTaxa(); // [] means “no filter”
  }

  function refreshINat() {
    if (typeof window.fetchINatObservationsNearCenter === "function") {
      window.fetchINatObservationsNearCenter();
    }
  }

  // Build checklist UI
  function buildChecklist() {
    const host = $("taxaChecklist");
    if (!host) return;

    host.innerHTML = "";
    for (const opt of TAXA_OPTIONS) {
      const id = `taxa_${opt.key}`;
      const row = document.createElement("label");
      row.innerHTML = `
        <input type="checkbox" id="${id}" data-iconic="${opt.key}" />
        <span>${opt.label}</span>
      `;
      host.appendChild(row);
    }
  }

  // Apply layer visibility to Leaflet layers exposed by other modules
  function applyLayerVisibility() {
    // Points
    if (window.iNatLayer) {
      const wantPoints = window.__gwFilters?.showPoints ?? false;
      if (wantPoints) {
        if (!map.hasLayer(window.iNatLayer)) window.iNatLayer.addTo(map);
      } else {
        if (map.hasLayer(window.iNatLayer)) map.removeLayer(window.iNatLayer);
      }
    }

    // Heat overlay (initgrid exposes window.setHeatVisible below)
    if (typeof window.setHeatVisible === "function") {
      window.setHeatVisible(window.__gwFilters?.showHeat ?? true);
    }

    // Shimmer layer if applicable...
    if (typeof window.setShimmerVisible === "function") {
      window.setShimmerVisible(window.__gwState?.showShimmer ?? false);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    buildChecklist();


    // heamap radiobutton list
    document.querySelectorAll('input[name="heatMetric"]').forEach(el => {
  el.addEventListener("change", () => {
    syncStateFromUI();
    if (typeof window.updateGrid === "function") {
      window.updateGrid();
    }
  });
});

    // Sidebar collapse
    $("sidebarToggle")?.addEventListener("click", () => {
      $("sidebar")?.classList.toggle("gw-collapsed");
    });

    // Defaults
   // window.__gwFilters = { showPoints: false, showHeat: true, iconicTaxa: [] };
    window.__gwFilters = window.__gwFilters || {};
    applySavedUIState();
    syncStateFromUI();
    applyLayerVisibility();
    paintLegendFromHeatFunction();

[
  "togglePoints",
  "toggleHeat",
  "toggleShimmer",
  "toggleDynamicINat",
  "toggleFog",
  "toggleFogSmoothing",
  "toggleGodsEye",
  "toggleLockLocation",
  "toggleOsmBuildings"
].forEach(id => {
  $(id)?.addEventListener("change", () => {
    syncStateFromUI();

   if (id === "toggleLockLocation") {
    if (window.__gwState.lockToLocation) {
      window.__gwState.suspendAutoCenterUntil = 0;
    } else {
      window.__gwState.suspendAutoCenterUntil = Number.POSITIVE_INFINITY;
    }

    if (typeof window.setLockButtonVisual === "function") {
      window.setLockButtonVisual();
    }
  }
    applyLayerVisibility();

  if (id === "toggleOsmBuildings") {
    window.GridWildOsmFeaturesLayer?.setFeatureVisible?.(
      "buildings",
      window.__gwState.showOsmBuildings
    );
  }

    if (id === "toggleDynamicINat" && window.__gwState.dynamicINatEnabled) {
      if (typeof window.maybeRefreshDynamicINat === "function") {
        window.maybeRefreshDynamicINat(true);
      }
    }

    if (id === "toggleFog" && typeof window.updateGrid === "function") {
      window.updateGrid();
    }

    // show shimmer -- is this redundant wth the if statement right above here???
    if (id === "toggleFog" || id === "toggleFogSmoothing" || id === "toggleShimmer") {
      if (typeof window.updateGrid === "function") {
        window.updateGrid();
      }
    }
  });
});

    $("toggleHeat")?.addEventListener("change", () => {
      syncStateFromUI();
      applyLayerVisibility();
    });

    // Any taxa change triggers refetch
    $("taxaChecklist")?.addEventListener("change", () => {
  syncStateFromUI();
  applyLayerVisibility();

  if (window.__gwState?.dynamicINatEnabled &&
      typeof window.maybeRefreshDynamicINat === "function") {
    window.maybeRefreshDynamicINat(true);
  }
    });
  });
})();


window.initJumpToGpsControl = function initJumpToGpsControl() {
  const input = document.getElementById("gwJumpGpsInput");
  const btn = document.getElementById("gwJumpToGpsBtn");
  const status = document.getElementById("gwJumpGpsStatus");

  if (!input || !btn || btn.dataset.gwJumpBound === "1") return;
  btn.dataset.gwJumpBound = "1";

  function parseLatLng(text) {
    const nums = String(text).trim().match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length < 2) return null;

    const lat = Number(nums[0]);
    const lng = Number(nums[1]);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

    return { lat, lng };
  }

  function jumpNow() {
    const parsed = parseLatLng(input.value);

    if (!parsed) {
      if (status) status.textContent = "Use format like 38.8895,-77.0353";
      return;
    }

    map.setView([parsed.lat, parsed.lng], Math.max(map.getZoom(), 18), {
      animate: true
    });

    if (window.__gwState) {
      window.__gwState.lockToLocation = false;
      window.__gwState.suspendAutoCenterUntil = Number.POSITIVE_INFINITY;
    }

    const lockToggle = document.getElementById("toggleLockLocation");
    const lockClone = document.getElementById("toggleLockLocation_clone");

    if (lockToggle) lockToggle.checked = false;
    if (lockClone) lockClone.checked = false;

    if (typeof window.setLockButtonVisual === "function") {
      window.setLockButtonVisual();
    }

    if (typeof window.updateGrid === "function") {
      window.updateGrid();
    }

    if (typeof window.refreshGridWildMobileInfo === "function") {
      window.refreshGridWildMobileInfo();
    }

    if (status) {
      status.textContent = `Jumped to ${parsed.lat.toFixed(5)}, ${parsed.lng.toFixed(5)}`;
    }
  }

  btn.addEventListener("click", jumpNow);

  input.addEventListener("keydown", e => {
    if (e.key === "Enter") jumpNow();
  });
};

  function getSelectedHeatMetric() {
  const selected = document.querySelector('input[name="heatMetric"]:checked');
  return selected?.value || "count";
}

// below for state-based 
function loadUIState() {
  try {
    const raw = localStorage.getItem("gw_ui_state");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveUIState() {
  const byId = (id) => document.getElementById(id);

  const state = {
    showPoints: byId("togglePoints")?.checked ?? false,
    showHeat: byId("toggleHeat")?.checked ?? true,
    dynamicINatEnabled: byId("toggleDynamicINat")?.checked ?? false,
    showShimmer: byId("toggleShimmer")?.checked ?? false,
    showFog: byId("toggleFog")?.checked ?? true,
    fogSmoothingEnabled: byId("toggleFogSmoothing")?.checked ?? true,
    godsEyeEnabled: byId("toggleGodsEye")?.checked ?? false,
    lockToLocation: byId("toggleLockLocation")?.checked ?? true,
    heatMetric: getSelectedHeatMetric(),
    showOsmBuildings: byId("toggleOsmBuildings")?.checked ?? true
    };

  localStorage.setItem("gw_ui_state", JSON.stringify(state));
}

function applySavedUIState() {
  const byId = (id) => document.getElementById(id);
  const s = loadUIState();

  if (byId("togglePoints"))       byId("togglePoints").checked = s.showPoints ?? false;
  if (byId("toggleHeat"))         byId("toggleHeat").checked = s.showHeat ?? true;
  if (byId("toggleDynamicINat"))  byId("toggleDynamicINat").checked = s.dynamicINatEnabled ?? false;
  if (byId("toggleShimmer"))      byId("toggleShimmer").checked = s.showShimmer ?? false;
  if (byId("toggleFog"))          byId("toggleFog").checked = s.showFog ?? true;
  if (byId("toggleGodsEye"))      byId("toggleGodsEye").checked = s.godsEyeEnabled ?? false;
  if (byId("toggleLockLocation")) byId("toggleLockLocation").checked = s.lockToLocation ?? true;
  if (byId("toggleFogSmoothing")) byId("toggleFogSmoothing").checked = s.fogSmoothingEnabled ?? false;
  if (byId("toggleOsmBuildings")) byId("toggleOsmBuildings").checked = s.showOsmBuildings ?? false;

  const metric = s.heatMetric ?? "count";
  const radio = document.querySelector(`input[name="heatMetric"][value="${metric}"]`);
  if (radio) radio.checked = true;
}

function updateLegendText() {

  const foot = document.getElementById("gwLegendFoot");
  const subtitle = document.querySelector(".gw-legend-subtitle");

  if (!foot || !subtitle) return;

  const lens =
    window.__gwState?.activeLens || "classic";

  const copy =
    window.GWLegendCopy?.[lens] ||
    window.GWLegendCopy?.classic;

  if (!copy) return;

  subtitle.hidden = false;
  foot.hidden = false;

  subtitle.textContent =
    copy.subtitle || "";

  foot.innerHTML =
    (copy.lines || [])
      .map(line => `<div>${line}</div>`)
      .join("");
}

function updateLegendTextOLD() {
  const foot = document.getElementById("gwLegendFoot");
  const subtitle = document.querySelector(".gw-legend-subtitle");
  if (!foot || !subtitle) return;

  const useLog = window.__gwState?.logHeat ?? true;
  const showSmallText = typeof window.shouldShowSmallText === "function"
    ? window.shouldShowSmallText()
    : true;

  subtitle.hidden = !showSmallText;
  foot.hidden = !showSmallText;

  subtitle.textContent =
    "Hue = observers • vividness = species • opacity = observations";

  foot.textContent = useLog
    ? "More opaque = more observations (log-scaled)"
    : "More opaque = more observations";
}

// programmatically update the map color legend
function paintLegendFromHeatFunction() {
  if (typeof window.metricsToFill !== "function") return;

  const dull = document.querySelector(".chip-dull");
  const mid = document.querySelector(".chip-mid");
  const vivid = document.querySelector(".chip-vivid");

  const faint = document.querySelector(".chip-faint");
  const medium = document.querySelector(".chip-medium");
  const opaque = document.querySelector(".chip-opaque");

  const huebar = document.querySelector(".gw-huebar");

  const lowObsr  = window.metricsToFill({ count: 10, species: 8, observers: 1 });
  const midObsr  = window.metricsToFill({ count: 10, species: 8, observers: 3 });
  const highObsr = window.metricsToFill({ count: 10, species: 8, observers: 6 });

  if (huebar) {
    huebar.style.background = `linear-gradient(
      to right,
      ${lowObsr.fillColor},
      ${midObsr.fillColor},
      ${highObsr.fillColor}
    )`;
  }

  if (dull)  dull.style.background  = window.metricsToFill({ count: 10, species: 2,  observers: 3 }).fillColor;
  if (mid)   mid.style.background   = window.metricsToFill({ count: 10, species: 7,  observers: 3 }).fillColor;
  if (vivid) vivid.style.background = window.metricsToFill({ count: 10, species: 15, observers: 3 }).fillColor;

  if (faint) {
    const s = window.metricsToFill({ count: 1, species: 8, observers: 3 });
    faint.style.background = s.fillColor;
    faint.style.opacity = s.fillOpacity;
  }

  if (medium) {
    const s = window.metricsToFill({ count: 8, species: 8, observers: 3 });
    medium.style.background = s.fillColor;
    medium.style.opacity = s.fillOpacity;
  }

  if (opaque) {
    const s = window.metricsToFill({ count: 30, species: 8, observers: 3 });
    opaque.style.background = s.fillColor;
    opaque.style.opacity = s.fillOpacity;
  }
}
