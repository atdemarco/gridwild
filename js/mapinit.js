// Map init
window.map = L.map("map", {
  zoomControl: false,
  attributionControl: true,
  touchZoom: true,
  zoomSnap: 0.25,
  zoomDelta: 0.75,
  wheelPxPerZoomLevel: 42,
  wheelDebounceTime: 24,
  inertia: true,
  inertiaDeceleration: 2400,
  inertiaMaxSpeed: 2200,
  easeLinearity: 0.25
});
const map = window.map; // local alias

window.GridWildVerboseConsole =
  window.GridWildVerboseConsole ||
  (function () {
    const MIN_DURATION_MS = 100;

    function enabled() {
      return window.__gwState?.verboseConsoleEnabled === true;
    }

    function now() {
      return window.performance?.now?.() ?? Date.now();
    }

    function log(label, durationMs, detail = null) {
      if (!enabled()) return;
      if (!(durationMs >= MIN_DURATION_MS)) return;

      const message = `GridWild verbose ${label}: ${durationMs.toFixed(1)}ms`;
      if (detail == null) console.info(message);
      else console.info(message, detail);
    }

    function time(label, fn, detail = null) {
      if (!enabled() || typeof fn !== "function") return fn?.();

      const start = now();
      const finish = () =>
        log(label, now() - start, typeof detail === "function" ? detail() : detail);

      try {
        const result = fn();
        if (result?.then && typeof result.finally === "function") {
          return result.finally(finish);
        }
        finish();
        return result;
      } catch (err) {
        finish();
        throw err;
      }
    }

    return {
      enabled,
      log,
      time,
      thresholdMs: MIN_DURATION_MS
    };
  })();

window.GridWildMapMotionQueue = (function (existing = {}) {
  const DEFAULT_EVENTS = ["move", "zoom", "resize", "viewreset", "zoomend", "moveend"];
  const subscribers = new Map();
  const boundEvents = new Set();
  const frameTasks = new Map();
  let frameRaf = null;

  function normalizeEvents(events) {
    if (Array.isArray(events)) return events.filter(Boolean);
    if (typeof events === "string") return events.trim().split(/\s+/).filter(Boolean);
    return DEFAULT_EVENTS;
  }

  function makeSnapshot() {
    return {
      at: performance.now(),
      bounds: map.getBounds(),
      center: map.getCenter(),
      size: map.getSize(),
      zoom: map.getZoom()
    };
  }

  function flushFrameTasks() {
    frameRaf = null;
    const snapshot = makeSnapshot();
    const tasks = Array.from(frameTasks.entries());
    frameTasks.clear();

    window.GridWildVerboseConsole.time(
      `GridWildMapMotionQueue.flushFrameTasks(${tasks.length})`,
      () => {
        for (const [key, task] of tasks) {
          try {
            window.GridWildVerboseConsole.time(`GridWildMapMotionQueue.frameTask:${key}`, () =>
              task(snapshot)
            );
          } catch (err) {
            console.warn("GridWild map motion render task failed:", err);
          }
        }
      }
    );
  }

  function requestFrame(key, callback) {
    if (!key || typeof callback !== "function") return;
    frameTasks.set(key, callback);
    if (frameRaf) return;
    frameRaf = requestAnimationFrame(flushFrameTasks);
  }

  function dispatchMapMotion(evt) {
    window.GridWildVerboseConsole.time(
      `GridWildMapMotionQueue.dispatch(${evt?.type || "event"})`,
      () => {
        for (const [key, entry] of subscribers.entries()) {
          if (!entry.events.has(evt?.type)) continue;
          try {
            window.GridWildVerboseConsole.time(
              `GridWildMapMotionQueue.subscriber:${key}:${evt?.type || "event"}`,
              () => entry.callback(evt)
            );
          } catch (err) {
            console.warn("GridWild map motion subscriber failed:", err);
          }
        }
      }
    );
  }

  function ensureBound(events) {
    for (const type of events) {
      if (boundEvents.has(type)) continue;
      boundEvents.add(type);
      map.on(type, dispatchMapMotion);
    }
  }

  function subscribe(key, callback, options = {}) {
    if (!key || typeof callback !== "function") return () => {};
    const events = normalizeEvents(options.events);
    ensureBound(events);
    subscribers.set(key, {
      callback,
      events: new Set(events)
    });
    return () => {
      subscribers.delete(key);
    };
  }

  return {
    ...existing,
    requestFrame,
    snapshot: makeSnapshot,
    subscribe
  };
})(window.GridWildMapMotionQueue);

function installGridWildViewportGestureGuard() {
  if (window.__gwViewportGestureGuardInstalled) return;
  window.__gwViewportGestureGuardInstalled = true;

  const mapSelector = "#map, .leaflet-container";
  const mapEl = document.getElementById("map");

  function isMapGestureTarget(target) {
    return !!target?.closest?.(mapSelector);
  }

  function preventIfCancelable(evt) {
    if (evt.cancelable) evt.preventDefault();
  }

  mapEl?.style.setProperty("touch-action", "none");

  // iOS Safari exposes page pinch as GestureEvents. Blocking their default
  // keeps the browser viewport at 1x while Leaflet still receives touch events.
  ["gesturestart", "gesturechange", "gestureend"].forEach((type) => {
    document.addEventListener(type, preventIfCancelable, {
      capture: true,
      passive: false
    });
  });

  document.addEventListener(
    "touchmove",
    (evt) => {
      if ((evt.touches?.length || 0) < 2) return;
      if (isMapGestureTarget(evt.target)) return;
      preventIfCancelable(evt);
    },
    {
      capture: true,
      passive: false
    }
  );

  document.addEventListener(
    "wheel",
    (evt) => {
      if (!evt.ctrlKey && !evt.metaKey) return;
      if (isMapGestureTarget(evt.target)) return;
      preventIfCancelable(evt);
    },
    {
      capture: true,
      passive: false
    }
  );
}

installGridWildViewportGestureGuard();

const GRIDWILD_BASE_MAP_STORAGE_KEY = "gridwildBaseMap";
const GRIDWILD_DAY_NIGHT_MODE_STORAGE_KEY = "gridwildDayNightMode";
const GRIDWILD_MAP_VIEW_STORAGE_KEY = "gridwildMapView";

function normalizeGridWildBaseMapChoice(value) {
  return value === "terrain" ? "terrain" : "street";
}

function normalizeGridWildDayNightMode(value) {
  return value === "night" || value === "dark" ? "night" : "day";
}

function readGridWildInitialMapLinkView() {
  try {
    const params = new URLSearchParams(window.location.search);
    const rawLat = params.get("gwLat");
    const rawLng = params.get("gwLng");
    const rawZoom = params.get("gwZoom");

    if (!rawLat?.trim() || !rawLng?.trim()) return null;

    const lat = Number(rawLat);
    const lng = Number(rawLng);
    const zoom = Number(rawZoom);

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) return null;

    return {
      lat,
      lng,
      zoom: Number.isFinite(zoom) ? Math.max(2, Math.min(22, zoom)) : 18
    };
  } catch {
    return null;
  }
}

const GRIDWILD_INITIAL_MAP_LINK_VIEW = readGridWildInitialMapLinkView();

function readSavedGridWildMapView() {
  try {
    const raw = JSON.parse(localStorage.getItem(GRIDWILD_MAP_VIEW_STORAGE_KEY) || "null");
    const lat = Number(raw?.lat);
    const lng = Number(raw?.lng);
    const zoom = Number(raw?.zoom);

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) return null;

    return {
      lat,
      lng,
      zoom: Number.isFinite(zoom) ? Math.max(2, Math.min(22, zoom)) : 18
    };
  } catch {
    return null;
  }
}

function persistGridWildMapView() {
  try {
    const center = map.getCenter();
    const zoom = map.getZoom();
    if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return;
    if (!Number.isFinite(zoom)) return;

    localStorage.setItem(
      GRIDWILD_MAP_VIEW_STORAGE_KEY,
      JSON.stringify({
        lat: Number(center.lat.toFixed(7)),
        lng: Number(center.lng.toFixed(7)),
        zoom: Number(zoom.toFixed(3)),
        savedAt: Date.now()
      })
    );
  } catch {}
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

function readSavedGridWildDayNightMode() {
  try {
    const uiState = JSON.parse(localStorage.getItem("gw_ui_state") || "{}");
    if (uiState.dayNightMode) return normalizeGridWildDayNightMode(uiState.dayNightMode);
  } catch {}

  try {
    return normalizeGridWildDayNightMode(localStorage.getItem(GRIDWILD_DAY_NIGHT_MODE_STORAGE_KEY));
  } catch {
    return "day";
  }
}

// Global GridWild state // yikes -- 3/8/26
window.__gwState = {
  lockToLocation: !GRIDWILD_INITIAL_MAP_LINK_VIEW,
  baseMap: readSavedGridWildBaseMapChoice(),
  showPoints: false, // off by default...
  showHeat: true,
  showFog: false,
  showShimmer: false,
  dynamicINatEnabled: false, // OFF by default
  dynamicOSMEnabled: false, // OFF by default
  logHeat: true,
  heatMetric: "count", // "count" | "species" | "observers"

  lastUserCellKey: null,
  lastLoadedChunkKey: null,
  lastDynamicFetchCellKey: null,

  staticChunkSizeM: 1024, // adjust later
  dynamicFetchCellRadius: 1, // optional concept if you want neighborhood logic

  // New grid / zoom behavior
  centerMacroRadiusCells: 1, // radius 1 => 3x3 center block
  stickyZoomEnabled: false,
  stickyZoomTolerance: 0.2, // snap if released near target
  outsideViewZoomOffset: -1.25, // optional "bigger view" when not stuck
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
  verboseConsoleEnabled: false,
  dayNightMode: readSavedGridWildDayNightMode(),
  activeLens: "classic"
};

window.GridWildUnits =
  window.GridWildUnits ||
  (function () {
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
      window.dispatchEvent(
        new CustomEvent("gridwild:unitschange", {
          detail: { metricUnitsEnabled: window.__gwState.metricUnitsEnabled }
        })
      );
    }

    return { formatDistance, metricEnabled, setMetricEnabled };
  })();

function createStreetBaseLayer() {
  return L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 20,
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
  });
}

function createTerrainBaseLayer() {
  return L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
    maxNativeZoom: 17,
    maxZoom: 20,
    attribution: "Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap"
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
  document.querySelectorAll('input[name="gwBaseMap"]').forEach((input) => {
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

  window.dispatchEvent(
    new CustomEvent("gridwild:basemapchange", {
      detail: { baseMap }
    })
  );

  return baseMap;
}

window.createStreetBaseLayer = createStreetBaseLayer;
window.createTerrainBaseLayer = createTerrainBaseLayer;
window.streetBaseLayer = streetBaseLayer;
window.terrainBaseLayer = terrainBaseLayer;

function persistGridWildDayNightMode(mode) {
  try {
    localStorage.setItem(GRIDWILD_DAY_NIGHT_MODE_STORAGE_KEY, mode);
  } catch {}

  try {
    const uiState = JSON.parse(localStorage.getItem("gw_ui_state") || "{}");
    uiState.dayNightMode = mode;
    localStorage.setItem("gw_ui_state", JSON.stringify(uiState));
  } catch {}
}

function setGridWildDayNightMode(mode, options = {}) {
  const nextMode = normalizeGridWildDayNightMode(mode);

  window.__gwState = window.__gwState || {};
  window.__gwState.dayNightMode = nextMode;
  document.documentElement.classList.toggle("gw-map-night", nextMode === "night");
  document.documentElement.dataset.gwMapMode = nextMode;

  if (options.persist !== false) {
    persistGridWildDayNightMode(nextMode);
  }

  window.dispatchEvent(
    new CustomEvent("gridwild:mapmodechange", {
      detail: { dayNightMode: nextMode }
    })
  );

  return nextMode;
}

window.GridWildMapMode = {
  getMode: () => window.__gwState?.dayNightMode || "day",
  setMode: setGridWildDayNightMode,
  toggle: () =>
    setGridWildDayNightMode(window.__gwState?.dayNightMode === "night" ? "day" : "night"),
  normalizeChoice: normalizeGridWildDayNightMode
};

window.GridWildBaseMaps = {
  getBaseMap: () => window.__gwState?.baseMap || "street",
  setBaseMap: setGridWildBaseMap,
  syncControls: () => syncGridWildBaseMapControls(window.__gwState?.baseMap || "street"),
  normalizeChoice: normalizeGridWildBaseMapChoice,
  layers: gridWildBaseLayers
};

setGridWildBaseMap(window.__gwState.baseMap, { persist: false });
setGridWildDayNightMode(window.__gwState.dayNightMode, { persist: false });

// Default view (in case location fails)
//map.setView([38.9072, -77.0369], 17); // DC fallback
const GRIDWILD_SAVED_MAP_VIEW = readSavedGridWildMapView();
if (GRIDWILD_INITIAL_MAP_LINK_VIEW) {
  map.setView(
    [GRIDWILD_INITIAL_MAP_LINK_VIEW.lat, GRIDWILD_INITIAL_MAP_LINK_VIEW.lng],
    GRIDWILD_INITIAL_MAP_LINK_VIEW.zoom
  );
} else if (GRIDWILD_SAVED_MAP_VIEW) {
  map.setView(
    [GRIDWILD_SAVED_MAP_VIEW.lat, GRIDWILD_SAVED_MAP_VIEW.lng],
    GRIDWILD_SAVED_MAP_VIEW.zoom
  );
} else {
  map.setView([38.911325, -77.076678], 19); // GEORGETOWN POLLINATOR GARDEN HOME!
}

map.on("moveend zoomend", persistGridWildMapView);

const hud = document.getElementById("status");

// User location marker + accuracy circle
let userMarker = null;
let accuracyCircle = null;
