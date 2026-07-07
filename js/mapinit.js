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
const GRIDWILD_OSM_BASEMAP_MANIFEST_URL_STORAGE_KEY = "GRIDWILD_OSM_BASEMAP_MANIFEST_URL";
const GRIDWILD_OSM_BASEMAP_DEBUG_STORAGE_KEY = "GRIDWILD_OSM_BASEMAP_DEBUG";
const GRIDWILD_OSM_BASEMAP_MANIFEST_URL =
  "https://assets.gridwild.com/osm/protomaps/shards/current.json";
const GRIDWILD_OSM_BASEMAP_LEGACY_PMTILES_URL =
  "https://assets.gridwild.com/osm/protomaps/mid_atlantic_broad/gridwild_osm_protomaps_mid_atlantic_broad_v001_20260624/gridwild_osm_protomaps_mid_atlantic_broad_v001_20260624.pmtiles";
const GRIDWILD_OSM_BASEMAP_PMTILES_URL = GRIDWILD_OSM_BASEMAP_LEGACY_PMTILES_URL;
const GRIDWILD_OSM_BASEMAP_PMTILES_MODULE_URL = "/vendor/pmtiles/pmtiles-3.2.1.esm.js";
const GRIDWILD_OSM_BASEMAP_CACHE_CONTROL = "public, max-age=31536000, immutable";
const GRIDWILD_OSM_BASEMAP_FETCH_CACHE_MODE = "no-store";
const GRIDWILD_OSM_BASEMAP_RETRY_DELAYS_MS = [80, 250, 700, 1600, 3200];
const GRIDWILD_OSM_BASEMAP_MANIFEST_TIMEOUT_MS = 4500;
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

function normalizeGridWildBasemapUrl(value) {
  return String(value || "").trim();
}

function gridWildOsmBasemapManifestUrlConfig() {
  const queryUrl =
    readGridWildBasemapParam("gwBasemapManifest") ||
    readGridWildBasemapParam("gwBasemapManifestUrl");
  const normalizedQueryUrl = normalizeGridWildBasemapUrl(queryUrl);
  if (normalizedQueryUrl) {
    return { url: normalizedQueryUrl, source: "query" };
  }

  const globalUrl = normalizeGridWildBasemapUrl(window.GRIDWILD_OSM_BASEMAP_MANIFEST_URL);
  if (globalUrl) {
    return { url: globalUrl, source: "global" };
  }

  const storedUrl = normalizeGridWildBasemapUrl(
    readGridWildLocalStorageValue(GRIDWILD_OSM_BASEMAP_MANIFEST_URL_STORAGE_KEY)
  );
  if (storedUrl) {
    return { url: storedUrl, source: "localStorage" };
  }

  return { url: GRIDWILD_OSM_BASEMAP_MANIFEST_URL, source: "default" };
}

function gridWildOsmBasemapOverrideUrlConfig() {
  const queryUrl = readGridWildBasemapParam("gwBasemapUrl");
  const normalizedQueryUrl = normalizeGridWildBasemapUrl(queryUrl);
  if (normalizedQueryUrl) {
    return { url: normalizedQueryUrl, source: "query" };
  }

  const globalUrl = normalizeGridWildBasemapUrl(window.GRIDWILD_OSM_BASEMAP_URL);
  if (globalUrl) {
    return { url: globalUrl, source: "global" };
  }

  const storedUrl = normalizeGridWildBasemapUrl(
    readGridWildLocalStorageValue(GRIDWILD_OSM_BASEMAP_URL_STORAGE_KEY)
  );
  if (storedUrl) {
    return { url: storedUrl, source: "localStorage" };
  }

  if (gridWildTruthyParam(readGridWildBasemapParam("gwBasemapLegacy"))) {
    return { url: GRIDWILD_OSM_BASEMAP_LEGACY_PMTILES_URL, source: "legacy-default" };
  }

  return null;
}

function gridWildOsmBasemapUrlConfig() {
  const override = gridWildOsmBasemapOverrideUrlConfig();
  if (override) return override;

  if (gridWildBasemapActiveShard?.url) {
    return {
      url: gridWildBasemapActiveShard.url,
      source: "shard-manifest",
      shardId: gridWildBasemapActiveShard.id || null,
      manifestUrl: gridWildBasemapActiveShard.manifestUrl || null
    };
  }

  return { url: "", source: "pending-shard-manifest" };
}

function gridWildOsmBasemapUrl() {
  return gridWildOsmBasemapUrlConfig().url;
}

let gridWildBasemapShardManifest = null;
let gridWildBasemapShardManifestPromise = null;
let gridWildBasemapShardManifestError = null;
let gridWildBasemapActiveShard = null;
let gridWildBasemapShardSelectionTimer = null;

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
  defaultManifestUrl: GRIDWILD_OSM_BASEMAP_MANIFEST_URL,
  manifestUrl: gridWildOsmBasemapManifestUrlConfig().url,
  manifestUrlSource: gridWildOsmBasemapManifestUrlConfig().source,
  activeShardId: gridWildInitialBasemapUrlConfig.shardId || null,
  expectedCacheControl: GRIDWILD_OSM_BASEMAP_CACHE_CONTROL,
  fetchCacheMode: GRIDWILD_OSM_BASEMAP_FETCH_CACHE_MODE,
  rangeSource: "pending",
  attempts: 0,
  lastError: null,
  updatedAt: new Date().toISOString()
};
let gridWildBasemapRetryTimer = null;
let gridWildBasemapRetryIndex = 0;
let gridWildBasemapPMTilesCtor = null;
let gridWildBasemapPMTilesCtorPromise = null;
const gridWildBasemapPMTilesArchives = new Map();
const gridWildBasemapByteServingFailures = new Map();

function cloneGridWildBasemapStatus() {
  return {
    ...gridWildBasemapStatus
  };
}

function gridWildBasemapDebugEnabled() {
  return (
    gridWildTruthyParam(readGridWildBasemapParam("gwBasemapDebug")) ||
    gridWildTruthyParam(readGridWildLocalStorageValue(GRIDWILD_OSM_BASEMAP_DEBUG_STORAGE_KEY)) ||
    window.GRIDWILD_OSM_BASEMAP_DEBUG === true
  );
}

function shortGridWildBasemapUrl(url) {
  try {
    const parsed = new URL(url, window.location.href);
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts.slice(-2).join("/") || parsed.hostname;
  } catch {
    return String(url || "").slice(-72);
  }
}

function removeGridWildBasemapDebugBadge() {
  document.getElementById("gwBasemapDebugBadge")?.remove();
}

function updateGridWildBasemapDebugBadge(status = gridWildBasemapStatus) {
  if (!gridWildBasemapDebugEnabled()) {
    removeGridWildBasemapDebugBadge();
    return;
  }

  let badge = document.getElementById("gwBasemapDebugBadge");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "gwBasemapDebugBadge";
    badge.style.cssText = [
      "position:fixed",
      "left:12px",
      "bottom:12px",
      "z-index:12000",
      "max-width:min(520px,calc(100vw - 24px))",
      "padding:8px 10px",
      "border:1px solid rgba(10,20,18,.22)",
      "border-radius:6px",
      "background:rgba(248,252,246,.94)",
      "color:#173126",
      "font:12px/1.35 ui-monospace,SFMono-Regular,Consolas,monospace",
      "box-shadow:0 8px 24px rgba(0,0,0,.16)",
      "pointer-events:none"
    ].join(";");
    document.body.appendChild(badge);
  }

  const active = status.activeLayerUrl || status.url;
  badge.textContent = [
    `basemap=${status.activeBaseMap || window.__gwState?.baseMap || "street"}`,
    `source=${status.source || "unknown"}`,
    `urlSource=${status.urlSource || "unknown"}`,
    `shard=${status.activeShardId || "none"}`,
    `range=${status.rangeSource || "unknown"}`,
    `cache=${status.fetchCacheMode || "unknown"}`,
    `fallback=${status.fallback === true ? "yes" : "no"}`,
    `reason=${status.reason || "unknown"}`,
    shortGridWildBasemapUrl(active)
  ].join(" | ");
}

function publishGridWildBasemapStatus(patch = {}) {
  const urlConfig = gridWildOsmBasemapUrlConfig();
  const manifestConfig = gridWildOsmBasemapManifestUrlConfig();
  Object.assign(gridWildBasemapStatus, patch, {
    enabled: gridWildVectorBasemapEnabled(),
    url: urlConfig.url,
    urlSource: urlConfig.source,
    manifestUrl: manifestConfig.url,
    manifestUrlSource: manifestConfig.source,
    defaultUrl: GRIDWILD_OSM_BASEMAP_PMTILES_URL,
    defaultManifestUrl: GRIDWILD_OSM_BASEMAP_MANIFEST_URL,
    activeShardId:
      urlConfig.shardId || patch.activeShardId || gridWildBasemapActiveShard?.id || null,
    updatedAt: new Date().toISOString()
  });

  document.documentElement.dataset.gwBasemapSource = gridWildBasemapStatus.source || "";
  document.documentElement.dataset.gwBasemapUrlSource = gridWildBasemapStatus.urlSource || "";
  document.documentElement.dataset.gwBasemapFallback = String(
    gridWildBasemapStatus.fallback === true
  );
  updateGridWildBasemapDebugBadge(gridWildBasemapStatus);

  window.dispatchEvent(
    new CustomEvent("gridwild:basemapstatuschange", {
      detail: cloneGridWildBasemapStatus()
    })
  );
}

function describeGridWildBasemapError(error) {
  return error?.message || String(error || "");
}

function gridWildBasemapJsonUrl(url, options = {}) {
  const version =
    readGridWildBasemapParam("gwBasemapVersion") ||
    readGridWildBasemapParam("v") ||
    (options.forceCacheBust ? String(Date.now()) : "");
  if (!version) return url;
  try {
    const parsed = new URL(url, window.location.href);
    parsed.searchParams.set("gw_json_v", version);
    return parsed.href;
  } catch {
    const separator = String(url).includes("?") ? "&" : "?";
    return `${url}${separator}gw_json_v=${encodeURIComponent(version)}`;
  }
}

function normalizeGridWildBasemapShardBounds(shard) {
  const rawBounds = shard?.bounds;
  if (
    Array.isArray(rawBounds) &&
    rawBounds.length === 2 &&
    Array.isArray(rawBounds[0]) &&
    Array.isArray(rawBounds[1])
  ) {
    return L.latLngBounds(rawBounds);
  }

  const bbox = shard?.bbox;
  if (Array.isArray(bbox) && bbox.length === 4) {
    return L.latLngBounds([
      [Number(bbox[1]), Number(bbox[0])],
      [Number(bbox[3]), Number(bbox[2])]
    ]);
  }

  return null;
}

function gridWildBasemapBoundsArea(bounds) {
  if (!bounds?.isValid?.()) return Number.POSITIVE_INFINITY;
  return (
    Math.max(0, bounds.getEast() - bounds.getWest()) *
    Math.max(0, bounds.getNorth() - bounds.getSouth())
  );
}

function gridWildBasemapBoundsContain(outer, inner) {
  if (!outer?.isValid?.() || !inner?.isValid?.()) return false;
  return (
    outer.getSouth() <= inner.getSouth() &&
    outer.getWest() <= inner.getWest() &&
    outer.getNorth() >= inner.getNorth() &&
    outer.getEast() >= inner.getEast()
  );
}

function gridWildBasemapBoundsIntersect(a, b) {
  if (!a?.isValid?.() || !b?.isValid?.()) return false;
  return !(
    a.getWest() > b.getEast() ||
    a.getEast() < b.getWest() ||
    a.getSouth() > b.getNorth() ||
    a.getNorth() < b.getSouth()
  );
}

function gridWildBasemapBoundsIntersectionArea(a, b) {
  if (!gridWildBasemapBoundsIntersect(a, b)) return 0;
  const west = Math.max(a.getWest(), b.getWest());
  const east = Math.min(a.getEast(), b.getEast());
  const south = Math.max(a.getSouth(), b.getSouth());
  const north = Math.min(a.getNorth(), b.getNorth());
  return Math.max(0, east - west) * Math.max(0, north - south);
}

function normalizeGridWildBasemapShardManifest(data, manifestUrl) {
  if (!data || typeof data !== "object") {
    throw new Error("Basemap shard manifest is not an object.");
  }

  const shards = (Array.isArray(data.shards) ? data.shards : [])
    .map((shard) => {
      const bounds = normalizeGridWildBasemapShardBounds(shard);
      const rawUrl = normalizeGridWildBasemapUrl(shard?.url);
      const file = normalizeGridWildBasemapUrl(shard?.file);
      const url = rawUrl || (file ? new URL(file, manifestUrl).href : "");
      if (!url || !bounds?.isValid?.()) return null;
      return {
        ...shard,
        id: shard.id || file || url,
        url,
        manifestUrl,
        bounds,
        minzoom: Number.isFinite(Number(shard.minzoom)) ? Number(shard.minzoom) : 0,
        maxzoom: Number.isFinite(Number(shard.maxzoom)) ? Number(shard.maxzoom) : 15,
        area: gridWildBasemapBoundsArea(bounds)
      };
    })
    .filter(Boolean);

  if (!shards.length) {
    throw new Error("Basemap shard manifest did not include usable shards.");
  }

  return {
    ...data,
    manifestUrl,
    shards
  };
}

function loadGridWildBasemapShardManifest() {
  if (gridWildBasemapShardManifest) return Promise.resolve(gridWildBasemapShardManifest);
  if (gridWildBasemapShardManifestPromise) return gridWildBasemapShardManifestPromise;

  const manifestConfig = gridWildOsmBasemapManifestUrlConfig();
  if (!manifestConfig.url) return Promise.resolve(null);

  publishGridWildBasemapStatus({
    source: "pending",
    fallback: true,
    ready: false,
    reason: "loading-shard-manifest",
    manifestUrl: manifestConfig.url,
    manifestUrlSource: manifestConfig.source
  });

  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    GRIDWILD_OSM_BASEMAP_MANIFEST_TIMEOUT_MS
  );

  const forceCacheBust = /\/current\.json(?:$|\?)/.test(manifestConfig.url);
  gridWildBasemapShardManifestPromise = fetch(
    gridWildBasemapJsonUrl(manifestConfig.url, { forceCacheBust }),
    {
      cache: "no-store",
      signal: controller.signal
    }
  )
    .then((resp) => {
      if (!resp.ok) throw new Error(`Basemap shard manifest HTTP ${resp.status}.`);
      return resp.json();
    })
    .then((data) => {
      gridWildBasemapShardManifest = normalizeGridWildBasemapShardManifest(
        data,
        manifestConfig.url
      );
      gridWildBasemapShardManifestError = null;
      return gridWildBasemapShardManifest;
    })
    .catch((error) => {
      gridWildBasemapShardManifest = null;
      gridWildBasemapShardManifestError = describeGridWildBasemapError(error);
      publishGridWildBasemapStatus({
        source: "pending",
        fallback: true,
        ready: false,
        reason: "shard-manifest-unavailable",
        manifestUrl: manifestConfig.url,
        manifestUrlSource: manifestConfig.source,
        lastError: gridWildBasemapShardManifestError
      });
      throw error;
    })
    .finally(() => {
      window.clearTimeout(timeout);
      gridWildBasemapShardManifestPromise = null;
    });

  return gridWildBasemapShardManifestPromise;
}

function chooseGridWildBasemapShard(manifest) {
  const shards = manifest?.shards || [];
  if (!shards.length || gridWildOsmBasemapOverrideUrlConfig()) return null;

  const viewBounds = map.getBounds();
  const viewArea = Math.max(gridWildBasemapBoundsArea(viewBounds), Number.EPSILON);
  const center = map.getCenter();
  const zoom = Number(map.getZoom());
  const scored = shards
    .map((shard) => {
      const zoomFits = zoom >= shard.minzoom && zoom <= shard.maxzoom + 6;
      const containsView = gridWildBasemapBoundsContain(shard.bounds, viewBounds);
      const containsCenter = shard.bounds.contains(center);
      const intersectsView = gridWildBasemapBoundsIntersect(shard.bounds, viewBounds);
      if (!zoomFits || (!containsCenter && !intersectsView)) return null;
      const coverageRatio =
        gridWildBasemapBoundsIntersectionArea(shard.bounds, viewBounds) / viewArea;
      return {
        shard,
        score:
          (containsView ? 1000000 : 0) +
          (containsCenter ? 100000 : 0) +
          (intersectsView ? 10000 : 0) +
          coverageRatio * 50000 +
          (containsView ? -shard.area : shard.area * 0.01)
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.shard || null;
}

function ensureGridWildBasemapShardForView(reason = "select-shard") {
  if (gridWildOsmBasemapOverrideUrlConfig()) return Promise.resolve(null);
  return loadGridWildBasemapShardManifest()
    .then((manifest) => {
      const nextShard = chooseGridWildBasemapShard(manifest);
      if (!nextShard) {
        const hadShard = Boolean(gridWildBasemapActiveShard);
        gridWildBasemapActiveShard = null;
        publishGridWildBasemapStatus({
          source: "pending",
          fallback: true,
          ready: false,
          reason: "no-shard-for-view",
          activeShardId: null,
          activeLayerUrl: null
        });
        if (hadShard) refreshGridWildBasemapLayers("no-shard-for-view", { force: true });
        return null;
      }

      if (gridWildBasemapActiveShard?.id === nextShard.id) return nextShard;

      gridWildBasemapActiveShard = nextShard;
      gridWildBasemapRetryIndex = 0;
      publishGridWildBasemapStatus({
        source: "shard-manifest",
        fallback: false,
        ready: false,
        reason,
        activeShardId: nextShard.id,
        activeLayerUrl: nextShard.url,
        activeLayerUrlSource: "shard-manifest",
        lastError: null
      });
      refreshGridWildBasemapLayers(reason, { force: true });
      return nextShard;
    })
    .catch(() => null);
}

function scheduleGridWildBasemapShardSelection(reason = "select-shard") {
  if (!gridWildVectorBasemapEnabled() || gridWildOsmBasemapOverrideUrlConfig()) return;
  window.clearTimeout(gridWildBasemapShardSelectionTimer);
  gridWildBasemapShardSelectionTimer = window.setTimeout(() => {
    gridWildBasemapShardSelectionTimer = null;
    ensureGridWildBasemapShardForView(reason);
  }, 80);
}

function gridWildBasemapByteServingFailureFor(url) {
  return gridWildBasemapByteServingFailures.get(normalizeGridWildBasemapUrl(url)) || null;
}

function recordGridWildBasemapByteServingFailure(url, error) {
  const sourceUrl = normalizeGridWildBasemapUrl(url);
  const message = describeGridWildBasemapError(error);
  gridWildBasemapByteServingFailures.set(sourceUrl, message);
  publishGridWildBasemapStatus({
    source: "fallback",
    ready: false,
    fallback: true,
    reason: "byte-serving-unavailable",
    rangeSource: "gridwild-range-source",
    activeLayerUrl: sourceUrl,
    lastError: message
  });
  window.setTimeout(() => {
    refreshGridWildBasemapLayers("byte-serving-unavailable", { force: true });
  }, 0);
  return error;
}

function retryGridWildOsmBasemap(reason = "retry") {
  gridWildBasemapByteServingFailures.clear();
  gridWildBasemapRetryIndex = 0;
  refreshGridWildBasemapLayers(reason, { force: true });
  return cloneGridWildBasemapStatus();
}

function gridWildBasemapFetchCacheMode() {
  const requested = String(readGridWildBasemapParam("gwBasemapCache") || "")
    .trim()
    .toLowerCase();
  if (["default", "force-cache", "no-cache", "no-store", "reload"].includes(requested)) {
    return requested;
  }
  return GRIDWILD_OSM_BASEMAP_FETCH_CACHE_MODE;
}

function loadGridWildBasemapPMTilesCtor() {
  if (gridWildBasemapPMTilesCtor) return Promise.resolve(gridWildBasemapPMTilesCtor);
  if (gridWildBasemapPMTilesCtorPromise) return gridWildBasemapPMTilesCtorPromise;

  publishGridWildBasemapStatus({
    rangeSource: "loading-pmtiles-module",
    fetchCacheMode: gridWildBasemapFetchCacheMode()
  });

  gridWildBasemapPMTilesCtorPromise = import(GRIDWILD_OSM_BASEMAP_PMTILES_MODULE_URL)
    .then((module) => {
      const PMTilesCtor = module.PMTiles || module.default?.PMTiles;
      if (!PMTilesCtor) throw new Error("Basemap PMTiles module did not expose PMTiles.");
      gridWildBasemapPMTilesCtor = PMTilesCtor;
      return gridWildBasemapPMTilesCtor;
    })
    .catch((error) => {
      publishGridWildBasemapStatus({
        source: "fallback",
        ready: false,
        fallback: true,
        reason: "pmtiles-module-failed",
        rangeSource: "failed",
        lastError: describeGridWildBasemapError(error)
      });
      throw error;
    })
    .finally(() => {
      gridWildBasemapPMTilesCtorPromise = null;
    });

  return gridWildBasemapPMTilesCtorPromise;
}

function createGridWildBasemapRangeSource(url) {
  const sourceUrl = normalizeGridWildBasemapUrl(url);
  let fatalRangeError = null;

  async function cancelResponseBody(resp) {
    try {
      await resp.body?.cancel?.();
    } catch {
      // Best-effort guard against accidentally downloading the whole basemap archive.
    }
  }

  return {
    getKey() {
      return sourceUrl;
    },

    async getBytes(offset, length, signal, expectedEtag) {
      if (fatalRangeError) throw fatalRangeError;

      const headers = new window.Headers();
      const rangeHeader = `bytes=${offset}-${offset + length - 1}`;
      headers.set("Range", rangeHeader);

      let resp;
      try {
        resp = await fetch(sourceUrl, {
          signal,
          cache: gridWildBasemapFetchCacheMode(),
          mode: "cors",
          headers
        });
      } catch (error) {
        publishGridWildBasemapStatus({
          ready: false,
          fallback: false,
          reason: "range-fetch-failed",
          rangeSource: "gridwild-range-source",
          lastError: describeGridWildBasemapError(error)
        });
        throw error;
      }

      const contentLengthHeader = resp.headers.get("Content-Length");
      const contentRangeHeader = resp.headers.get("Content-Range");
      const contentLength = Number(contentLengthHeader);
      let etag = resp.headers.get("ETag") || undefined;
      if (etag?.startsWith("W/")) etag = undefined;

      if (resp.status >= 300) {
        await cancelResponseBody(resp);
        throw new Error(`Basemap PMTiles range request failed: HTTP ${resp.status}`);
      }

      if (expectedEtag && etag && etag !== expectedEtag) {
        throw new Error("Basemap PMTiles range request returned a different ETag.");
      }

      if (Number.isFinite(contentLength) && contentLength > length) {
        await cancelResponseBody(resp);
        fatalRangeError = recordGridWildBasemapByteServingFailure(
          sourceUrl,
          new Error(
            `Basemap PMTiles range request returned too much content: status=${resp.status}, range=${rangeHeader}, contentRange=${contentRangeHeader || "missing"}, contentLength=${contentLengthHeader}, requested=${length}.`
          )
        );
        throw fatalRangeError;
      }

      if (resp.status === 200 && !Number.isFinite(contentLength)) {
        await cancelResponseBody(resp);
        fatalRangeError = recordGridWildBasemapByteServingFailure(
          sourceUrl,
          new Error(
            `Basemap PMTiles range request returned full content without Content-Length: status=${resp.status}, range=${rangeHeader}, contentRange=${contentRangeHeader || "missing"}, requested=${length}.`
          )
        );
        throw fatalRangeError;
      }

      if (resp.status === 200 && !contentRangeHeader && contentLength === length) {
        fatalRangeError = recordGridWildBasemapByteServingFailure(
          sourceUrl,
          new Error(
            `Basemap PMTiles range request returned HTTP 200 instead of 206 Partial Content: range=${rangeHeader}, contentLength=${contentLengthHeader}, requested=${length}.`
          )
        );
        throw fatalRangeError;
      }

      if (resp.status !== 206 && resp.status !== 200) {
        throw new Error(
          `Basemap PMTiles range request returned unexpected status: status=${resp.status}, range=${rangeHeader}, contentRange=${contentRangeHeader || "missing"}, contentLength=${contentLengthHeader || "missing"}, requested=${length}.`
        );
      }

      return {
        data: await resp.arrayBuffer(),
        etag,
        cacheControl: resp.headers.get("Cache-Control") || undefined,
        expires: resp.headers.get("Expires") || undefined
      };
    }
  };
}

function createGridWildBasemapPMTilesArchive(url) {
  const sourceUrl = normalizeGridWildBasemapUrl(url);
  const cached = gridWildBasemapPMTilesArchives.get(sourceUrl);
  if (cached) return cached;

  let archive = null;
  let archivePromise = null;
  const archiveLike = {
    getKey() {
      return sourceUrl;
    },

    async getHeader() {
      const pmtiles = await ensureArchive();
      return pmtiles.getHeader();
    },

    async getZxy(z, x, y, signal) {
      const pmtiles = await ensureArchive();
      return pmtiles.getZxy(z, x, y, signal);
    }
  };

  async function ensureArchive() {
    if (archive) return archive;
    if (!archivePromise) {
      archivePromise = loadGridWildBasemapPMTilesCtor()
        .then((PMTilesCtor) => {
          archive = new PMTilesCtor(createGridWildBasemapRangeSource(sourceUrl));
          return archive;
        })
        .catch((error) => {
          publishGridWildBasemapStatus({
            ready: false,
            fallback: false,
            reason: "pmtiles-archive-failed",
            rangeSource: "gridwild-range-source",
            lastError: describeGridWildBasemapError(error)
          });
          throw error;
        })
        .finally(() => {
          archivePromise = null;
        });
    }
    return archivePromise;
  }

  gridWildBasemapPMTilesArchives.set(sourceUrl, archiveLike);
  return archiveLike;
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
  layer.gridWildBasemapUrl = null;
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

  const urlConfig = gridWildOsmBasemapUrlConfig();
  const url = urlConfig.url;
  if (!url) {
    scheduleGridWildBasemapShardSelection("awaiting-shard-manifest");
    return null;
  }
  const byteServingFailure = gridWildBasemapByteServingFailureFor(url);
  if (byteServingFailure) {
    const fallbackLayer = createBlankBaseLayer(
      "byte-serving-unavailable",
      "byte-serving-unavailable"
    );
    fallbackLayer.gridWildBaseMap = options.baseMap || "street";
    fallbackLayer.gridWildBasemapUrl = url;
    fallbackLayer.gridWildBasemapUrlSource = urlConfig.source;
    publishGridWildBasemapStatus({
      source: fallbackLayer.gridWildBasemapSource,
      ready: false,
      fallback: true,
      reason: fallbackLayer.gridWildBasemapReason,
      activeBaseMap: fallbackLayer.gridWildBaseMap,
      activeLayerUrl: fallbackLayer.gridWildBasemapUrl,
      activeLayerUrlSource: fallbackLayer.gridWildBasemapUrlSource,
      rangeSource: "gridwild-range-source",
      lastError: byteServingFailure
    });
    return fallbackLayer;
  }

  const { baseMap, ...layerOptions } = options;
  const activeShardMaxDataZoom =
    gridWildBasemapActiveShard?.url === url &&
    Number.isFinite(Number(gridWildBasemapActiveShard.maxzoom))
      ? Math.max(0, Math.min(30, Number(gridWildBasemapActiveShard.maxzoom)))
      : 15;
  const activeShardBounds =
    gridWildBasemapActiveShard?.url === url && gridWildBasemapActiveShard.bounds?.isValid?.()
      ? [
          [
            gridWildBasemapActiveShard.bounds.getSouth(),
            gridWildBasemapActiveShard.bounds.getWest()
          ],
          [
            gridWildBasemapActiveShard.bounds.getNorth(),
            gridWildBasemapActiveShard.bounds.getEast()
          ]
        ]
      : GRIDWILD_OSM_BASEMAP_BOUNDS;
  let layer = null;
  try {
    const pmtilesArchive = createGridWildBasemapPMTilesArchive(url);
    layer = window.protomapsL.leafletLayer({
      ...layerOptions,
      url: pmtilesArchive,
      flavor: layerOptions.flavor || "light",
      lang: layerOptions.lang || "en",
      maxDataZoom: activeShardMaxDataZoom,
      maxZoom: 20,
      levelDiff: 0,
      tileDelay: 0,
      noWrap: true,
      bounds: activeShardBounds,
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

  layer.gridWildBasemapSource =
    urlConfig.source === "shard-manifest" ? "r2-pmtiles-shard" : "r2-pmtiles";
  layer.gridWildBasemapUrl = url;
  layer.gridWildBasemapUrlSource = urlConfig.source;
  layer.gridWildBaseMap = baseMap || "street";
  layer.gridWildBasemapFallback = false;
  publishGridWildBasemapStatus({
    source: layer.gridWildBasemapSource,
    ready: false,
    fallback: false,
    reason: "created",
    activeBaseMap: layer.gridWildBaseMap,
    activeLayerUrl: layer.gridWildBasemapUrl,
    activeLayerUrlSource: layer.gridWildBasemapUrlSource,
    fetchCacheMode: gridWildBasemapFetchCacheMode(),
    rangeSource: "gridwild-range-source",
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
  if (gridWildBasemapSourceIsVector(layer.gridWildBasemapSource)) {
    layer.gridWildBasemapSource = `${layer.gridWildBasemapSource}-terrain`;
  }
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

function gridWildBasemapLayerMatchesCurrentUrl(layer) {
  if (isGridWildBasemapFallbackLayer(layer)) return false;
  return normalizeGridWildBasemapUrl(layer?.gridWildBasemapUrl) === gridWildOsmBasemapUrl();
}

function refreshGridWildBasemapLayers(reason = "refresh", options = {}) {
  if (!gridWildVectorBasemapEnabled()) return false;
  if (!window.protomapsL?.leafletLayer) {
    scheduleGridWildBasemapRetry(reason);
    return false;
  }

  const force = options.force === true;
  let replacedActiveLayer = false;
  if (force || !gridWildBasemapLayerMatchesCurrentUrl(streetBaseLayer)) {
    const nextStreetLayer =
      createGridWildOsmBasemapLayer({ flavor: "light", baseMap: "street" }) ||
      createBlankBaseLayer("pending-protomaps", "street-fallback");
    replacedActiveLayer =
      replaceGridWildBaseLayer("street", nextStreetLayer) || replacedActiveLayer;
  }

  if (force || !gridWildBasemapLayerMatchesCurrentUrl(terrainBaseLayer)) {
    const nextTerrainLayer =
      createGridWildOsmBasemapLayer({ flavor: "light", baseMap: "terrain" }) ||
      createBlankBaseLayer("pending-protomaps", "terrain-fallback");
    if (gridWildBasemapSourceIsVector(nextTerrainLayer?.gridWildBasemapSource)) {
      nextTerrainLayer.gridWildBasemapSource = `${nextTerrainLayer.gridWildBasemapSource}-terrain`;
    }
    replacedActiveLayer =
      replaceGridWildBaseLayer("terrain", nextTerrainLayer) || replacedActiveLayer;
  }

  const activeBaseMap = normalizeGridWildBaseMapChoice(window.__gwState?.baseMap || "street");
  if (replacedActiveLayer) {
    setGridWildBaseMap(activeBaseMap, { persist: false });
  } else {
    publishGridWildBasemapStatus({
      reason,
      activeBaseMap,
      activeLayerUrl: currentGridWildBaseLayer?.gridWildBasemapUrl || null,
      activeLayerUrlSource: currentGridWildBaseLayer?.gridWildBasemapUrlSource || null,
      activeLayerFallback: currentGridWildBaseLayer?.gridWildBasemapFallback === true,
      source: currentGridWildBaseLayer?.gridWildBasemapSource || "blank",
      fallback: currentGridWildBaseLayer?.gridWildBasemapFallback === true
    });
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
  publishGridWildBasemapStatus({
    source: nextLayer.gridWildBasemapSource || "blank",
    fallback: nextLayer.gridWildBasemapFallback === true,
    reason: nextLayer.gridWildBasemapFallback === true ? nextLayer.gridWildBasemapReason : "active",
    activeBaseMap: baseMap,
    activeLayerUrl: nextLayer.gridWildBasemapUrl || null,
    activeLayerUrlSource: nextLayer.gridWildBasemapUrlSource || null,
    activeLayerFallback: nextLayer.gridWildBasemapFallback === true
  });

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

function setGridWildOsmBasemapUrl(url, options = {}) {
  const normalizedUrl = normalizeGridWildBasemapUrl(url);
  if (options.persist !== false) {
    writeGridWildLocalStorageValue(GRIDWILD_OSM_BASEMAP_URL_STORAGE_KEY, normalizedUrl);
  }

  if (options.runtime !== false) {
    if (normalizedUrl) window.GRIDWILD_OSM_BASEMAP_URL = normalizedUrl;
    else {
      try {
        delete window.GRIDWILD_OSM_BASEMAP_URL;
      } catch {
        window.GRIDWILD_OSM_BASEMAP_URL = "";
      }
    }
  }

  gridWildBasemapRetryIndex = 0;
  refreshGridWildBasemapLayers(normalizedUrl ? "url-set" : "url-cleared", { force: true });
  if (!normalizedUrl) scheduleGridWildBasemapShardSelection("url-cleared");
  return cloneGridWildBasemapStatus();
}

function clearGridWildOsmBasemapUrl(options = {}) {
  return setGridWildOsmBasemapUrl("", options);
}

function setGridWildOsmBasemapManifestUrl(url, options = {}) {
  const normalizedUrl = normalizeGridWildBasemapUrl(url);
  if (options.persist !== false) {
    writeGridWildLocalStorageValue(GRIDWILD_OSM_BASEMAP_MANIFEST_URL_STORAGE_KEY, normalizedUrl);
  }

  if (options.runtime !== false) {
    if (normalizedUrl) window.GRIDWILD_OSM_BASEMAP_MANIFEST_URL = normalizedUrl;
    else {
      try {
        delete window.GRIDWILD_OSM_BASEMAP_MANIFEST_URL;
      } catch {
        window.GRIDWILD_OSM_BASEMAP_MANIFEST_URL = "";
      }
    }
  }

  gridWildBasemapShardManifest = null;
  gridWildBasemapShardManifestPromise = null;
  gridWildBasemapShardManifestError = null;
  gridWildBasemapActiveShard = null;
  gridWildBasemapRetryIndex = 0;
  refreshGridWildBasemapLayers(normalizedUrl ? "manifest-url-set" : "manifest-url-cleared", {
    force: true
  });
  scheduleGridWildBasemapShardSelection(
    normalizedUrl ? "manifest-url-set" : "manifest-url-cleared"
  );
  return cloneGridWildBasemapStatus();
}

function setGridWildBasemapDebug(enabled) {
  const on = enabled === true;
  writeGridWildLocalStorageValue(GRIDWILD_OSM_BASEMAP_DEBUG_STORAGE_KEY, on ? "1" : "");
  window.GRIDWILD_OSM_BASEMAP_DEBUG = on;
  updateGridWildBasemapDebugBadge(gridWildBasemapStatus);
  return on;
}

window.createStreetBaseLayer = createStreetBaseLayer;
window.createTerrainBaseLayer = createTerrainBaseLayer;
window.createGridWildDefaultBaseLayer = createGridWildDefaultBaseLayer;
window.createGridWildBlankBaseLayer = createBlankBaseLayer;
window.createGridWildOsmBasemapLayer = createGridWildOsmBasemapLayer;
window.GridWildOsmBasemap = {
  url: gridWildOsmBasemapUrl,
  urlSource: () => gridWildOsmBasemapUrlConfig().source,
  defaultUrl: () => GRIDWILD_OSM_BASEMAP_PMTILES_URL,
  defaultManifestUrl: () => GRIDWILD_OSM_BASEMAP_MANIFEST_URL,
  bounds: () => GRIDWILD_OSM_BASEMAP_BOUNDS.map((point) => point.slice()),
  enabled: gridWildVectorBasemapEnabled,
  activeLayer: () => ({
    baseMap: window.__gwState?.baseMap || "street",
    source: currentGridWildBaseLayer?.gridWildBasemapSource || "blank",
    url: currentGridWildBaseLayer?.gridWildBasemapUrl || null,
    urlSource: currentGridWildBaseLayer?.gridWildBasemapUrlSource || null,
    shardId: gridWildBasemapActiveShard?.id || null,
    fallback: currentGridWildBaseLayer?.gridWildBasemapFallback === true,
    reason: currentGridWildBaseLayer?.gridWildBasemapReason || null
  }),
  clearUrl: clearGridWildOsmBasemapUrl,
  currentSource: () => currentGridWildBaseLayer?.gridWildBasemapSource || "blank",
  debug: setGridWildBasemapDebug,
  expectedCacheControl: () => GRIDWILD_OSM_BASEMAP_CACHE_CONTROL,
  fetchCacheMode: gridWildBasemapFetchCacheMode,
  manifest: () => gridWildBasemapShardManifest,
  manifestError: () => gridWildBasemapShardManifestError,
  manifestUrl: () => gridWildOsmBasemapManifestUrlConfig().url,
  pmtilesModuleUrl: () => GRIDWILD_OSM_BASEMAP_PMTILES_MODULE_URL,
  refresh: refreshGridWildBasemapLayers,
  rangeSource: () => "gridwild-range-source",
  retry: retryGridWildOsmBasemap,
  selectShard: ensureGridWildBasemapShardForView,
  setManifestUrl: setGridWildOsmBasemapManifestUrl,
  setUrl: setGridWildOsmBasemapUrl,
  shard: () => gridWildBasemapActiveShard,
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
map.on("moveend zoomend", () => scheduleGridWildBasemapShardSelection("view-changed"));
scheduleGridWildBasemapShardSelection("initial-view");

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
