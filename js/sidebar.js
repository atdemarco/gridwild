// ─────────────────────────────────────────────────────────────
// Sidebar UI wiring
// ─────────────────────────────────────────────────────────────

(function () {
  // Iconic taxa options (iNat uses these names in obs.taxon.iconic_taxon_name)
  const TAXA_OPTIONS = [
    { key: "Insecta", label: "Insects" },
    { key: "Plantae", label: "Plants" },
    { key: "Fungi", label: "Fungi" },
    { key: "Mammalia", label: "Mammals" },
    { key: "Aves", label: "Birds" },
    { key: "Reptilia", label: "Reptiles" },
    { key: "Amphibia", label: "Amphibians" },
    { key: "Actinopterygii", label: "Ray-finned fish" },
    { key: "Mollusca", label: "Mollusks" },
    { key: "Arachnida", label: "Arachnids" }
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

  function setQueryFromUI() {
    window.__gwFilters = window.__gwFilters || {};
    window.__gwFilters.showPoints = $("togglePoints")?.checked ?? true;
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
      const wantPoints = window.__gwFilters?.showPoints ?? true;
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

    // Sidebar collapse
    $("sidebarToggle")?.addEventListener("click", () => {
      $("sidebar")?.classList.toggle("gw-collapsed");
    });

    // Defaults
    window.__gwFilters = { showPoints: true, showHeat: true, iconicTaxa: [] };
    setQueryFromUI();
    applyLayerVisibility();

    // Wire up toggles
    $("togglePoints")?.addEventListener("change", () => {
      setQueryFromUI();
      applyLayerVisibility();
    });

    $("toggleHeat")?.addEventListener("change", () => {
      setQueryFromUI();
      applyLayerVisibility();
    });

    // Any taxa change triggers refetch
    $("taxaChecklist")?.addEventListener("change", () => {
      setQueryFromUI();
      applyLayerVisibility();
      refreshINat();
    });
  });
})();