// Map init
window.map = L.map("map", {
  zoomControl: false,
  attributionControl: true,
  fadeAnimation: false,
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
const GRIDWILD_OSM_BASEMAP_URL_STORAGE_KEY = "GRIDWILD_OSM_BASEMAP_URL";
const GRIDWILD_OSM_BASEMAP_DEBUG_STORAGE_KEY = "GRIDWILD_OSM_BASEMAP_DEBUG";
const GRIDWILD_OSM_BASEMAP_PMTILES_URL =
  "https://assets.gridwild.com/osm/protomaps/mid_atlantic_broad/gridwild_osm_protomaps_mid_atlantic_broad_v001_20260624/gridwild_osm_protomaps_mid_atlantic_broad_v001_20260624.pmtiles";
const GRIDWILD_OSM_BASEMAP_CACHE_CONTROL = "public, max-age=31536000, immutable";
const GRIDWILD_OSM_BASEMAP_RETRY_DELAYS_MS = [80, 250, 700, 1600, 3200];
const GRIDWILD_OSM_BASEMAP_BOUNDS = [
  [35.6, -83.8],
  [42.8, -71.2]
];
const GRIDWILD_PUBLIC_OSM_SERVICE_ENDPOINTS = {
  overpass: "https://overpass-api.de/api/interpreter",
  nominatimSearch: "https://nominatim.openstreetmap.org/search",
  nominatimReverse: "https://nominatim.openstreetmap.org/reverse"
};
const GRIDWILD_FALLBACK_MAP_VIEW = {
  lat: 38.911325,
  lng: -77.076678,
  zoom: 19
};

function normalizeGridWildBaseMapChoice(value) {
  return value === "terrain" ? "terrain" : "street";
}

function normalizeGridWildDayNightMode(value) {
  return value === "night" || value === "dark" ? "night" : "day";
}

function readGridWildBasemapParam(name) {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

function normalizeGridWildServiceUrl(value) {
  return String(value || "").trim();
}

function gridWildTruthyParam(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "")
      .trim()
      .toLowerCase()
  );
}

function configureGridWildExternalServices() {
  const existing = window.GridWildExternalServices || {};
  const existingOsm = existing.osm || {};
  const customGetOsmEndpoint =
    typeof existing.getOsmEndpoint === "function" ? existing.getOsmEndpoint.bind(existing) : null;
  const publicOsmApis =
    gridWildTruthyParam(readGridWildBasemapParam("gwPublicOsm")) ||
    existing.publicOsmApis === true ||
    existingOsm.usePublicEndpoints === true;

  const osm = {
    ...existingOsm,
    overpassUrl: normalizeGridWildServiceUrl(
      readGridWildBasemapParam("gwOverpassUrl") ||
        existingOsm.overpassUrl ||
        (publicOsmApis ? GRIDWILD_PUBLIC_OSM_SERVICE_ENDPOINTS.overpass : "")
    ),
    nominatimSearchUrl: normalizeGridWildServiceUrl(
      readGridWildBasemapParam("gwNominatimSearchUrl") ||
        existingOsm.nominatimSearchUrl ||
        existingOsm.nominatimUrl ||
        (publicOsmApis ? GRIDWILD_PUBLIC_OSM_SERVICE_ENDPOINTS.nominatimSearch : "")
    ),
    nominatimReverseUrl: normalizeGridWildServiceUrl(
      readGridWildBasemapParam("gwNominatimReverseUrl") ||
        existingOsm.nominatimReverseUrl ||
        existingOsm.nominatimUrl ||
        (publicOsmApis ? GRIDWILD_PUBLIC_OSM_SERVICE_ENDPOINTS.nominatimReverse : "")
    )
  };

  window.GridWildExternalServices = {
    ...existing,
    publicOsmApis,
    osm,
    getOsmEndpoint(kind) {
      const key =
        {
          overpass: "overpassUrl",
          nominatimSearch: "nominatimSearchUrl",
          nominatimReverse: "nominatimReverseUrl"
        }[kind] || kind;
      return normalizeGridWildServiceUrl(osm[key] || customGetOsmEndpoint?.(kind));
    },
    publicOsmEnabled() {
      return publicOsmApis;
    }
  };
}

configureGridWildExternalServices();

function gridWildVectorBasemapEnabled() {
  const mode = String(readGridWildBasemapParam("gwBasemap") || "")
    .trim()
    .toLowerCase();
  return !["blank", "none", "0", "false", "off"].includes(mode);
}

function readGridWildLocalStorageValue(key) {
  try {
    return window.localStorage?.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeGridWildLocalStorageValue(key, value) {
  try {
    if (value) window.localStorage?.setItem(key, value);
    else window.localStorage?.removeItem(key);
  } catch {}
}

function gridWildOsmBasemapUrlConfig() {
  const queryUrl = readGridWildBasemapParam("gwBasemapUrl");
  if (String(queryUrl || "").trim()) {
    return { url: String(queryUrl).trim(), source: "query" };
  }

  if (String(window.GRIDWILD_OSM_BASEMAP_URL || "").trim()) {
    return { url: String(window.GRIDWILD_OSM_BASEMAP_URL).trim(), source: "global" };
  }

  const storedUrl = readGridWildLocalStorageValue(GRIDWILD_OSM_BASEMAP_URL_STORAGE_KEY);
  if (String(storedUrl || "").trim()) {
    return { url: String(storedUrl).trim(), source: "localStorage" };
  }

  return { url: GRIDWILD_OSM_BASEMAP_PMTILES_URL, source: "default" };
}

function gridWildOsmBasemapUrl() {
  return gridWildOsmBasemapUrlConfig().url;
}

const gridWildInitialBasemapUrlConfig = gridWildOsmBasemapUrlConfig();
const gridWildBasemapStatus = {
  enabled: gridWildVectorBasemapEnabled(),
  intendedSource: "r2-pmtiles",
  source: "pending",
  ready: false,
  fallback: false,
  reason: "initializing",
  url: gridWildInitialBasemapUrlConfig.url,
  urlSource: gridWildInitialBasemapUrlConfig.source,
  defaultUrl: GRIDWILD_OSM_BASEMAP_PMTILES_URL,
  expectedCacheControl: GRIDWILD_OSM_BASEMAP_CACHE_CONTROL,
  attempts: 0,
  lastError: null,
  updatedAt: new Date().toISOString()
};
let gridWildBasemapRetryTimer = null;
let gridWildBasemapRetryIndex = 0;

function cloneGridWildBasemapStatus() {
  return {
    ...gridWildBasemapStatus
  };
}

function publishGridWildBasemapStatus(patch = {}) {
  const urlConfig = gridWildOsmBasemapUrlConfig();
  Object.assign(gridWildBasemapStatus, patch, {
    enabled: gridWildVectorBasemapEnabled(),
    url: urlConfig.url,
    urlSource: urlConfig.source,
    defaultUrl: GRIDWILD_OSM_BASEMAP_PMTILES_URL,
    updatedAt: new Date().toISOString()
  });

  window.dispatchEvent(
    new CustomEvent("gridwild:basemapstatuschange", {
      detail: cloneGridWildBasemapStatus()
    })
  );
}

function describeGridWildBasemapError(error) {
  return error?.message || String(error || "");
}

function gridWildBasemapSourceIsVector(source) {
  return /^r2-pmtiles/i.test(String(source || ""));
}

function isGridWildBasemapFallbackLayer(layer) {
  return (
    !layer ||
    layer.gridWildBasemapFallback === true ||
    !gridWildBasemapSourceIsVector(layer.gridWildBasemapSource)
  );
}

function bindGridWildBasemapLayerStatus(layer) {
  if (!layer || layer.__gridWildBasemapStatusBound === true) return layer;
  layer.__gridWildBasemapStatusBound = true;

  layer.on?.("loading", () => {
    publishGridWildBasemapStatus({
      source: layer.gridWildBasemapSource || "r2-pmtiles",
      ready: false,
      fallback: false,
      reason: "loading"
    });
  });

  layer.on?.("load", () => {
    gridWildBasemapRetryIndex = 0;
    publishGridWildBasemapStatus({
      source: layer.gridWildBasemapSource || "r2-pmtiles",
      ready: true,
      fallback: false,
      reason: "ready",
      lastError: null
    });
  });

  layer.on?.("tileerror", (event) => {
    publishGridWildBasemapStatus({
      source: layer.gridWildBasemapSource || "r2-pmtiles",
      ready: false,
      fallback: false,
      reason: "tileerror",
      lastError: describeGridWildBasemapError(event?.error)
    });
  });

  return layer;
}

function scheduleGridWildBasemapRetry(reason = "retry") {
  if (!gridWildVectorBasemapEnabled() || gridWildBasemapRetryTimer) return;
  if (gridWildBasemapRetryIndex >= GRIDWILD_OSM_BASEMAP_RETRY_DELAYS_MS.length) {
    publishGridWildBasemapStatus({
      source: "fallback",
      ready: false,
      fallback: true,
      reason: `${reason}:exhausted`
    });
    return;
  }

  const delay = GRIDWILD_OSM_BASEMAP_RETRY_DELAYS_MS[gridWildBasemapRetryIndex++];
  publishGridWildBasemapStatus({
    source: "pending",
    ready: false,
    fallback: true,
    reason,
    attempts: gridWildBasemapRetryIndex
  });

  gridWildBasemapRetryTimer = window.setTimeout(() => {
    gridWildBasemapRetryTimer = null;
    refreshGridWildBasemapLayers(reason);
  }, delay);
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

function createBlankBaseLayer(source = "blank", reason = source) {
  const layer = L.layerGroup();
  layer.gridWildBasemapSource = source;
  layer.gridWildBasemapFallback = true;
  layer.gridWildBasemapReason = reason;
  return layer;
}

function createGridWildOsmBasemapLayer(options = {}) {
  if (!gridWildVectorBasemapEnabled()) {
    publishGridWildBasemapStatus({
      source: "disabled",
      ready: false,
      fallback: true,
      reason: "disabled"
    });
    return null;
  }
  if (!window.protomapsL?.leafletLayer) {
    scheduleGridWildBasemapRetry("protomaps-leaflet-unavailable");
    return null;
  }

  const url = gridWildOsmBasemapUrl();
  if (!url) return null;

  const { baseMap, ...layerOptions } = options;
  let layer = null;
  try {
    layer = window.protomapsL.leafletLayer({
      ...layerOptions,
      url,
      flavor: layerOptions.flavor || "light",
      lang: layerOptions.lang || "en",
      maxDataZoom: 15,
      maxZoom: 20,
      levelDiff: 0,
      tileDelay: 0,
      noWrap: true,
      bounds: GRIDWILD_OSM_BASEMAP_BOUNDS,
      attribution:
        '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">&copy; OpenStreetMap</a> <a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>'
    });
  } catch (error) {
    publishGridWildBasemapStatus({
      source: "fallback",
      ready: false,
      fallback: true,
      reason: "create-failed",
      lastError: describeGridWildBasemapError(error)
    });
    scheduleGridWildBasemapRetry("create-failed");
    return null;
  }

  layer.gridWildBasemapSource = "r2-pmtiles";
  layer.gridWildBasemapUrl = url;
  layer.gridWildBaseMap = baseMap || "street";
  layer.gridWildBasemapFallback = false;
  publishGridWildBasemapStatus({
    source: layer.gridWildBasemapSource,
    ready: false,
    fallback: false,
    reason: "created",
    lastError: null
  });
  return bindGridWildBasemapLayerStatus(layer);
}

function createStreetBaseLayer() {
  return (
    createGridWildOsmBasemapLayer({ flavor: "light", baseMap: "street" }) ||
    createBlankBaseLayer("pending-protomaps", "street-fallback")
  );
}

function createTerrainBaseLayer() {
  const layer =
    createGridWildOsmBasemapLayer({ flavor: "light", baseMap: "terrain" }) ||
    createBlankBaseLayer("pending-protomaps", "terrain-fallback");
  layer.gridWildBasemapSource =
    layer.gridWildBasemapSource === "r2-pmtiles"
      ? "r2-pmtiles-terrain"
      : layer.gridWildBasemapSource;
  return layer;
}

function createGridWildDefaultBaseLayer(options = {}) {
  return createGridWildOsmBasemapLayer(options) || createBlankBaseLayer();
}

let streetBaseLayer = createStreetBaseLayer();
let terrainBaseLayer = createTerrainBaseLayer();
const gridWildBaseLayers = {
  street: streetBaseLayer,
  terrain: terrainBaseLayer
};
let currentGridWildBaseLayer = null;

function replaceGridWildBaseLayer(key, nextLayer) {
  if (!nextLayer || !gridWildBaseLayers[key]) return false;
  const previousLayer = gridWildBaseLayers[key];
  const wasActive = map.hasLayer(previousLayer);

  if (wasActive) {
    map.removeLayer(previousLayer);
  }

  gridWildBaseLayers[key] = nextLayer;
  if (key === "street") {
    streetBaseLayer = nextLayer;
    window.streetBaseLayer = streetBaseLayer;
  } else if (key === "terrain") {
    terrainBaseLayer = nextLayer;
    window.terrainBaseLayer = terrainBaseLayer;
  }

  if (currentGridWildBaseLayer === previousLayer) {
    currentGridWildBaseLayer = null;
  }

  return wasActive;
}

function refreshGridWildBasemapLayers(reason = "refresh") {
  if (!gridWildVectorBasemapEnabled()) return false;
  if (!window.protomapsL?.leafletLayer) {
    scheduleGridWildBasemapRetry(reason);
    return false;
  }

  let replacedActiveLayer = false;
  if (isGridWildBasemapFallbackLayer(streetBaseLayer)) {
    const nextStreetLayer = createGridWildOsmBasemapLayer({ flavor: "light", baseMap: "street" });
    replacedActiveLayer =
      replaceGridWildBaseLayer("street", nextStreetLayer) || replacedActiveLayer;
  }

  if (isGridWildBasemapFallbackLayer(terrainBaseLayer)) {
    const nextTerrainLayer = createGridWildOsmBasemapLayer({ flavor: "light", baseMap: "terrain" });
    if (nextTerrainLayer) nextTerrainLayer.gridWildBasemapSource = "r2-pmtiles-terrain";
    replacedActiveLayer =
      replaceGridWildBaseLayer("terrain", nextTerrainLayer) || replacedActiveLayer;
  }

  const activeBaseMap = normalizeGridWildBaseMapChoice(window.__gwState?.baseMap || "street");
  if (replacedActiveLayer) {
    setGridWildBaseMap(activeBaseMap, { persist: false });
  }

  return replacedActiveLayer;
}

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
window.createGridWildDefaultBaseLayer = createGridWildDefaultBaseLayer;
window.createGridWildBlankBaseLayer = createBlankBaseLayer;
window.createGridWildOsmBasemapLayer = createGridWildOsmBasemapLayer;
window.GridWildOsmBasemap = {
  url: gridWildOsmBasemapUrl,
  bounds: () => GRIDWILD_OSM_BASEMAP_BOUNDS.map((point) => point.slice()),
  enabled: gridWildVectorBasemapEnabled,
  currentSource: () => currentGridWildBaseLayer?.gridWildBasemapSource || "blank",
  expectedCacheControl: () => GRIDWILD_OSM_BASEMAP_CACHE_CONTROL,
  refresh: refreshGridWildBasemapLayers,
  status: cloneGridWildBasemapStatus
};
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
if (GRIDWILD_INITIAL_MAP_LINK_VIEW) {
  map.setView(
    [GRIDWILD_INITIAL_MAP_LINK_VIEW.lat, GRIDWILD_INITIAL_MAP_LINK_VIEW.lng],
    GRIDWILD_INITIAL_MAP_LINK_VIEW.zoom
  );
} else {
  map.setView(
    [GRIDWILD_FALLBACK_MAP_VIEW.lat, GRIDWILD_FALLBACK_MAP_VIEW.lng],
    GRIDWILD_FALLBACK_MAP_VIEW.zoom
  ); // GEORGETOWN POLLINATOR GARDEN HOME!
}

map.on("moveend zoomend", persistGridWildMapView);

const hud = document.getElementById("status");

// User location marker + accuracy circle
let userMarker = null;
let accuracyCircle = null;
