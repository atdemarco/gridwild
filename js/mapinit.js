    // Map init
  window.map = L.map("map", {
     zoomControl: false,
     attributionControl: true
  });
  const map = window.map; // local alias

    // Global GridWild state // yikes -- 3/8/26 
window.__gwState = {
  lockToLocation: true,
  showPoints: false, // off by default...
  showHeat: true,
  showFog: false,
  showShimmer: false,
  dynamicINatEnabled: false,   // OFF by default
  dynamicOSMEnabled: false,    // OFF by default
  logHeat: true,
  heatMetric: "count",   // "count" | "species" | "observers"

  lastUserCellKey: null,
  lastLoadedChunkKey: null,
  lastDynamicFetchCellKey: null,

  staticChunkSizeM: 1024,       // adjust later
  dynamicFetchCellRadius: 1,    // optional concept if you want neighborhood logic

  // New grid / zoom behavior
  centerMacroRadiusCells: 1,      // radius 1 => 3x3 center block
  stickyZoomEnabled: false,
  stickyZoomTolerance: 0.2,      // snap if released near target
  outsideViewZoomOffset: -1.25,   // optional "bigger view" when not stuck
  stickyZoomAnimating: false,
  godsEyeEnabled: false,
  lastGodsEyeCenterKey: null,

  showOsmFeatures: true,
  showOsmTrails: true,
  showOsmParks: true,
  showOsmBuildings: true,
  showOsmWater: true,
  showOsmRoads: true,
  showNicheSparkles: false,
  osmPriorsEnabled: false,
  osmPriorsMode: "path-adjacency",
  lockZoomMode: "close",
  lockZoom: 19,
  metricUnitsEnabled: false,
  showGpsCircle: false,
  activeLens: "classic"
};

window.GridWildUnits = window.GridWildUnits || (function () {
  const FT_PER_M = 3.280839895;
  const YD_PER_M = 1.0936132983;
  const MI_PER_M = 0.0006213711922;

  function metricEnabled() {
    return window.__gwState?.metricUnitsEnabled === true;
  }

  function formatDistance(meters, options = {}) {
    const value = Number(meters);
    if (!Number.isFinite(value)) return options.fallback || "-";

    if (metricEnabled()) {
      if (value < 1) return `${value.toFixed(1)} m`;
      if (value < 1000) return `${Math.round(value)} m`;
      return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)} km`;
    }

    const feet = value * FT_PER_M;
    if (value < 91.44) return `${feet < 10 ? feet.toFixed(1) : Math.round(feet)} ft`;
    if (value < 1609.344) return `${Math.round(value * YD_PER_M)} yd`;
    return `${(value * MI_PER_M).toFixed(value < 16093.44 ? 1 : 0)} mi`;
  }

  function setMetricEnabled(enabled) {
    window.__gwState = window.__gwState || {};
    window.__gwState.metricUnitsEnabled = enabled === true;
    window.dispatchEvent(new CustomEvent("gridwild:unitschange", {
      detail: { metricUnitsEnabled: window.__gwState.metricUnitsEnabled }
    }));
  }

  return { formatDistance, metricEnabled, setMetricEnabled };
})();

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 20,
    attribution:
      '&copy; OpenStreetMap contributors &copy; CARTO'
  }
  ).addTo(map);


    // Default view (in case location fails)
    //map.setView([38.9072, -77.0369], 17); // DC fallback
    map.setView([38.911325, -77.076678], 19); // GEORGETOWN POLLINATOR GARDEN HOME!

    const hud = document.getElementById("status");

    // User location marker + accuracy circle
    let userMarker = null;
    let accuracyCircle = null;
