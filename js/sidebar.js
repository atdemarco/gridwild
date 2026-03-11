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
  window.__gwState.heatMetric = getSelectedHeatMetric();

  window.__gwFilters.iconicTaxa = getSelectedIconicTaxa();

  window.__gwState.showPoints = $("togglePoints")?.checked ?? true;
  window.__gwState.dynamicINatEnabled = $("toggleDynamicINat")?.checked ?? false;
  window.__gwState.showFog = $("toggleFog")?.checked ?? true;
  window.__gwState.lockToLocation = $("toggleLockLocation")?.checked ?? true;

  saveUIState();
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

// NEW 
[
  "togglePoints",
  "toggleHeat",
  "toggleDynamicINat",
  "toggleFog",
  "toggleLockLocation"
].forEach(id => {
  $(id)?.addEventListener("change", () => {
    syncStateFromUI();
    applyLayerVisibility();

    if (id === "toggleDynamicINat" && window.__gwState.dynamicINatEnabled) {
      if (typeof window.maybeRefreshDynamicINat === "function") {
        window.maybeRefreshDynamicINat(true);
      }
    }

    if (id === "toggleFog" && typeof window.updateGrid === "function") {
      window.updateGrid();
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
    showFog: byId("toggleFog")?.checked ?? true,
    lockToLocation: byId("toggleLockLocation")?.checked ?? true,
    heatMetric: getSelectedHeatMetric()
    };

  localStorage.setItem("gw_ui_state", JSON.stringify(state));
}

function applySavedUIState() {
  const byId = (id) => document.getElementById(id);
  const s = loadUIState();

  if (byId("togglePoints"))       byId("togglePoints").checked = s.showPoints ?? false;
  if (byId("toggleHeat"))         byId("toggleHeat").checked = s.showHeat ?? true;
  if (byId("toggleDynamicINat"))  byId("toggleDynamicINat").checked = s.dynamicINatEnabled ?? false;
  if (byId("toggleFog"))          byId("toggleFog").checked = s.showFog ?? true;
  if (byId("toggleLockLocation")) byId("toggleLockLocation").checked = s.lockToLocation ?? true;

  const metric = s.heatMetric ?? "count";
  const radio = document.querySelector(`input[name="heatMetric"][value="${metric}"]`);
  if (radio) radio.checked = true;
}