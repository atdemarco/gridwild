    // Map init
  window.map = L.map("map", {
     zoomControl: false,
     attributionControl: true
  });
  const map = window.map; // local alias

const GRIDWILD_BASE_MAP_STORAGE_KEY = "gridwildBaseMap";

function normalizeGridWildBaseMapChoice(value) {
  return value === "terrain" ? "terrain" : "street";
}

function readSavedGridWildBaseMapChoice() {
  try {
    const uiState = JSON.parse(localStorage.getItem("gw_ui_state") || "{}");
    if (uiState.baseMap) return normalizeGridWildBaseMapChoice(uiState.baseMap);
  } catch {}

  try {
    return normalizeGridWildBaseMapChoice(localStorage.getItem(GRIDWILD_BASE_MAP_STORAGE_KEY));
  } catch {
    return "street";
  }
}

    // Global GridWild state // yikes -- 3/8/26 
window.__gwState = {
  lockToLocation: true,
  baseMap: readSavedGridWildBaseMapChoice(),
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

function createStreetBaseLayer() {
  return L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 20,
    attribution:
      '&copy; OpenStreetMap contributors &copy; CARTO'
  });
}

function createTerrainBaseLayer() {
  return L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxNativeZoom: 17,
    maxZoom: 20,
    attribution:
      'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap'
  });
}

const streetBaseLayer = createStreetBaseLayer();
const terrainBaseLayer = createTerrainBaseLayer();
const gridWildBaseLayers = {
  street: streetBaseLayer,
  terrain: terrainBaseLayer
};
let currentGridWildBaseLayer = null;

function persistGridWildBaseMapChoice(choice) {
  try {
    localStorage.setItem(GRIDWILD_BASE_MAP_STORAGE_KEY, choice);
  } catch {}

  try {
    const uiState = JSON.parse(localStorage.getItem("gw_ui_state") || "{}");
    uiState.baseMap = choice;
    localStorage.setItem("gw_ui_state", JSON.stringify(uiState));
  } catch {}
}

function syncGridWildBaseMapControls(choice) {
  document.querySelectorAll('input[name="gwBaseMap"]').forEach(input => {
    input.checked = input.value === choice;
  });
}

function setGridWildBaseMap(choice, options = {}) {
  const baseMap = normalizeGridWildBaseMapChoice(choice);
  const nextLayer = gridWildBaseLayers[baseMap];
  if (!nextLayer) return window.__gwState?.baseMap || "street";

  if (
    currentGridWildBaseLayer &&
    currentGridWildBaseLayer !== nextLayer &&
    map.hasLayer(currentGridWildBaseLayer)
  ) {
    map.removeLayer(currentGridWildBaseLayer);
  }

  Object.entries(gridWildBaseLayers).forEach(([key, layer]) => {
    if (key !== baseMap && map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
  });

  if (!map.hasLayer(nextLayer)) {
    nextLayer.addTo(map);
  }

  currentGridWildBaseLayer = nextLayer;
  window.__gwState = window.__gwState || {};
  window.__gwState.baseMap = baseMap;

  if (options.persist !== false) {
    persistGridWildBaseMapChoice(baseMap);
  }

  if (options.syncControls !== false) {
    syncGridWildBaseMapControls(baseMap);
  }

  window.dispatchEvent(new CustomEvent("gridwild:basemapchange", {
    detail: { baseMap }
  }));

  return baseMap;
}

window.createStreetBaseLayer = createStreetBaseLayer;
window.createTerrainBaseLayer = createTerrainBaseLayer;
window.streetBaseLayer = streetBaseLayer;
window.terrainBaseLayer = terrainBaseLayer;
window.GridWildBaseMaps = {
  getBaseMap: () => window.__gwState?.baseMap || "street",
  setBaseMap: setGridWildBaseMap,
  syncControls: () => syncGridWildBaseMapControls(window.__gwState?.baseMap || "street"),
  normalizeChoice: normalizeGridWildBaseMapChoice,
  layers: gridWildBaseLayers
};

setGridWildBaseMap(window.__gwState.baseMap, { persist: false });


    // Default view (in case location fails)
    //map.setView([38.9072, -77.0369], 17); // DC fallback
    map.setView([38.911325, -77.076678], 19); // GEORGETOWN POLLINATOR GARDEN HOME!

    const hud = document.getElementById("status");

    // User location marker + accuracy circle
    let userMarker = null;
    let accuracyCircle = null;
