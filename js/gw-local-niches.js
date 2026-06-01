// -----------------------------------------------------------------------------
// GridWild Local Niches
// Place-aware ecological opportunities + sample_niche quest generation.
// -----------------------------------------------------------------------------

(function () {
  const STORAGE_KEY = "gw_local_niche_controls_v1";
  const LAYER_VISIBLE_KEY = "gw_local_niche_layer_visible";
  const CONTROLS_VERSION = 2;
  const PANE = "gwLocalNichePane";
  const LABEL_PANE = "gwLocalNicheLabelPane";
  const NOMINATIM_REVERSE_ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
  const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
  const NICHE_OSM_CONTEXT_ENABLED = true;
  const SAMPLING_RESULT_TOAST_MS = 1800;
  const SAMPLING_FINISH_TOAST_MS = 5200;
  const placeContextCache = new Map();
  let overpassPlaceLookupDisabledUntil = 0;
  const nicheBoundaryCache = new Map();
  const nicheSummaryHydrationCache = new Map();
  const nicheSummaryHydrationPending = new Map();
  const NICHE_BOUNDARY_RENDERING = {
    enabled: true,
    smoothingSigmaCells: 1.0,
    contourThreshold: 0.45,
    simplifyToleranceCells: 0.3,
    chaikinIterations: 1
  };
  const OSM_TRANSFORMATION_RULE = {
    version: "osm_transform_v1",
    minAreaRatio: 0.3,
    roadBufferM: 2.4,
    pathBufferM: 1.8,
    structureBufferM: 1.6,
    maxCellsPerNiche: 1800
  };
  const THRESHOLD_SUBDIVIDE_RULE = {
    version: "threshold_subdivide_niche_v1",
    tileCells: 20
  };
  const GROW_LOCAL_NICHE_RULE = {
    version: "grow_local_niche_v1",
    defaultTileCells: 20,
    defaultMinOccupiedPct: 50,
    osmSubdivisionVersion: "grow_osm_subdivision_v1",
    osmMaxCellsPerNiche: 60000,
    osmVectorVisualGapPx: 1
  };
  const CELL_SEEDED_NICHE_ALGORITHM = "cell_seeded_niche_v1";
  const CONSTRAINED_GEOMETRY_RULES = [
    { scale: "micro", scaleClass: "micro-niche", sigma: 0.65, peakFactor: 0.34, floorFactor: 0.18, suppressCells: 3, maxRadiusCells: 3, minCells: 1, maxCells: 4, maxElongation: 3.2, maxComplexity: 2.7, quantCells: 3 },
    { scale: "patch", scaleClass: "patch niche", sigma: 1.05, peakFactor: 0.30, floorFactor: 0.14, suppressCells: 5, maxRadiusCells: 7, minCells: 5, maxCells: 32, maxElongation: 3.1, maxComplexity: 3.1, quantCells: 5 },
    { scale: "place", scaleClass: "place niche", sigma: 1.75, peakFactor: 0.24, floorFactor: 0.10, suppressCells: 9, maxRadiusCells: 12, minCells: 12, maxCells: 96, maxElongation: 3.7, maxComplexity: 3.4, quantCells: 9 }
  ];
  const TRAIL_CORRIDOR_RULE = {
    enabled: false,
    bufferM: 85,
    binM: 28,
    minLengthM: 20,
    maxLengthM: 5000,
    minCells: 1,
    maxCells: 2200,
    minMeanScore: 0,
    minPeakScore: 0,
    wholeTrailMode: true,
    zWeight: 0.34,
    signalWeight: 0.66
  };
  const HEAT_TENDRIL_RULE = {
    enabled: true,
    minCells: 4,
    maxCells: 1800,
    minScore: 0.06,
    minPeakScore: 0.12,
    minElongation: 1.55,
    minMajorCells: 4,
    maxMinorCells: 18,
    maxPerimeterComplexity: 12,
    fallbackEnabled: true,
    fallbackMinCells: 5,
    fallbackMinPeakScore: 0.1,
    maxFallbackComponents: 3,
    vectorMode: true,
    minVectorLengthCells: 5,
    maxEndpointCandidates: 34,
    simplifyVectorToleranceCells: 0.55,
    skeletonizeBeforeVector: true,
    skeletonSigmaCells: 0.9,
    skeletonThreshold: 0.26,
    skeletonMaxIterations: 60,
    extendAlongAxis: false,
    extensionPadCells: 18,
    extensionWidthCells: 2.15,
    extensionMinScore: 0.045,
    extensionIncludeActiveCells: false,
    extensionMaxAddedCells: 650,
    candidatePasses: [
      { name: "edge", minScore: 0.06, minHeat: 0.02, minEdge: 0.035, heatWeight: 0.44, edgeWeight: 0.56 },
      { name: "hot-ridge", minScore: 0.48, minHeat: 0.52, minEdge: 0.014, heatWeight: 0.7, edgeWeight: 0.3 },
      { name: "super-hot", minScore: 0.78, minHeat: 0.78, minEdge: 0, heatWeight: 0.88, edgeWeight: 0.12, allowPlateau: true }
    ],
    saturatedHeatThreshold: 0.86,
    saturatedMinEdgeScore: 0.012,
    signalWeight: 0.68,
    zWeight: 0.32
  };
  const DEFAULT_CONTROLS = {
    version: CONTROLS_VERSION,
    radiusM: "fov",
    scale: "walk",
    maxCandidates: 8,
    emphasis: "balanced",
    lensZThreshold: 2.5,
    componentMinCells: 10,
    growTileCells: GROW_LOCAL_NICHE_RULE.defaultTileCells,
    growMinOccupiedPct: GROW_LOCAL_NICHE_RULE.defaultMinOccupiedPct,
    growClipStructuresEnabled: false,
    growMergeEnabled: false,
    growOsmSubdivisionEnabled: false,
    showDetectorMask: false,
    smartNicheHudPlots: false,
    osmTransformation: false,
    thresholdSubdivideApproach: false
  };

  const state = {
    niches: [],
    selectedId: null,
    loading: false,
    loadingAction: null,
    lastError: null,
    persistWarning: null,
    controls: loadControls(),
    layer: null,
    labelLayer: null,
    layerVisible: loadLayerVisible(),
    detectorDebug: null,
    constrainedGeometryDebug: null,
    samplingToast: null
  };

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function isHomeNiche(niche) {
    const id = String(niche?.id || "");
    const homeId = String(window.__gwState?.homeNicheId || "");
    return Boolean(niche?.is_home_niche || (id && homeId && id === homeId));
  }

  function homeUserCount(niche) {
    return Math.max(0, Number(niche?.home_user_count || 0));
  }

  function stewardLabel(count) {
    const n = Math.max(0, Number(count || 0));
    return `${n} ${n === 1 ? "steward" : "stewards"}`;
  }

  function formatStewardDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  }

  function homeNicheTitle(niche) {
    return niche?.short_title || niche?.title || displayNicheTitle(niche);
  }

  function showNicheToast(message) {
    if (typeof window.showGridWildToast === "function") {
      window.showGridWildToast(message);
      return;
    }
    showSamplingToast(message, 100);
  }

  function currentHomeNiche() {
    const homeId = String(window.__gwState?.homeNicheId || "");
    const local = state.niches.find((niche) => String(niche.id || "") === homeId) || null;
    return local || window.__gwState?.homeNiche || null;
  }

  function nicheKey(niche) {
    return String(niche?.id || niche?.source_key || "");
  }

  function isSelectedNiche(niche) {
    const selected = String(state.selectedId || "");
    return Boolean(selected && selected === nicheKey(niche));
  }

  function isHeatTendrilNiche(niche) {
    return String(niche?.metrics?.algorithm || "") === "heat_tendril_niche_v1";
  }

  function isCorridorNiche(niche) {
    return ["trail_corridor_niche_v1", "heat_tendril_niche_v1"]
      .includes(String(niche?.metrics?.algorithm || ""));
  }

  function isCellSeededNiche(niche) {
    return String(niche?.metrics?.algorithm || "") === CELL_SEEDED_NICHE_ALGORITHM ||
      String(niche?.generated_by || "").includes("cell_seeded_niche");
  }

  function homeIconSvg() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M3 11.5 12 4l9 7.5"></path>
        <path d="M5.5 10.5V20h13v-9.5"></path>
        <path d="M9.5 20v-6h5v6"></path>
      </svg>
    `;
  }

  function loadControls() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      const controls = { ...DEFAULT_CONTROLS, ...(parsed && typeof parsed === "object" ? parsed : {}) };
      if (!parsed || parsed.version !== CONTROLS_VERSION) {
        controls.version = CONTROLS_VERSION;
        controls.radiusM = "fov";
        controls.lensZThreshold = 2.5;
        controls.componentMinCells = 10;
      }
      return controls;
    } catch {
      return { ...DEFAULT_CONTROLS };
    }
  }

  function saveControls() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.controls));
    } catch {}
  }

  function loadLayerVisible() {
    try {
      const saved = localStorage.getItem(LAYER_VISIBLE_KEY);
      if (saved === "0") return false;
      if (saved === "1") return true;
    } catch {}
    return true;
  }

  function saveLayerVisible() {
    window.__gwState = window.__gwState || {};
    window.__gwState.showLocalNiches = state.layerVisible;
    try {
      localStorage.setItem(LAYER_VISIBLE_KEY, state.layerVisible ? "1" : "0");
    } catch {}
  }

  function yieldToPaint() {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
  }

  function yieldToastMoment(ms = 180) {
    return new Promise(resolve => {
      requestAnimationFrame(() => setTimeout(resolve, ms));
    });
  }

  function showSamplingToast(message, progress = 0, detail = "") {
    injectStyles();

    let root = state.samplingToast;
    if (!root || !document.body.contains(root)) {
      root = document.createElement("div");
      root.id = "gwNicheSamplingToast";
      root.className = "gw-niche-sampling-toast";
      root.innerHTML = `
        <div class="gw-niche-sampling-title"></div>
        <div class="gw-niche-sampling-detail"></div>
        <div class="gw-niche-sampling-track"><span></span></div>
      `;
      document.body.appendChild(root);
      state.samplingToast = root;
    }

    root.classList.remove("is-done", "is-error");
    root.querySelector(".gw-niche-sampling-title").textContent = message;
    root.querySelector(".gw-niche-sampling-detail").textContent = detail || "";
    root.querySelector(".gw-niche-sampling-track span").style.width = `${Math.max(2, Math.min(100, progress))}%`;
  }

  function finishSamplingToast(message = "Niche sampling complete", detail = "") {
    const root = state.samplingToast;
    if (!root || !document.body.contains(root)) return;

    root.classList.add("is-done");
    root.querySelector(".gw-niche-sampling-title").textContent = message;
    root.querySelector(".gw-niche-sampling-detail").textContent = detail;
    root.querySelector(".gw-niche-sampling-track span").style.width = "100%";

    setTimeout(() => {
      if (state.samplingToast === root) state.samplingToast = null;
      root.remove();
    }, SAMPLING_FINISH_TOAST_MS);
  }

  function failSamplingToast(message = "Niche sampling failed", detail = "") {
    const root = state.samplingToast;
    if (!root || !document.body.contains(root)) return;

    root.classList.add("is-error");
    root.querySelector(".gw-niche-sampling-title").textContent = message;
    root.querySelector(".gw-niche-sampling-detail").textContent = detail;

    setTimeout(() => {
      if (state.samplingToast === root) state.samplingToast = null;
      root.remove();
    }, 2600);
  }

  function getOrigin() {
    if (typeof lastFix !== "undefined" && lastFix) {
      return {
        lat: Number(lastFix.latitude),
        lng: Number(lastFix.longitude),
        source: "gps"
      };
    }

    if (typeof map !== "undefined" && map?.getCenter) {
      const c = map.getCenter();
      return { lat: c.lat, lng: c.lng, source: "map" };
    }

    return { lat: 38.911325, lng: -77.076678, source: "fallback" };
  }

  function cellForLatLng(lat, lng) {
    const p = map.options.crs.project(L.latLng(lat, lng));
    return {
      ix: Math.floor(p.x / GRID_SIZE_M),
      iy: Math.floor(p.y / GRID_SIZE_M)
    };
  }

  function latLngForCell(ix, iy) {
    const x = (ix + 0.5) * GRID_SIZE_M;
    const y = (iy + 0.5) * GRID_SIZE_M;
    const ll = map.options.crs.unproject(L.point(x, y));
    return { lat: ll.lat, lng: ll.lng };
  }

  function boundsForCells(minIx, minIy, maxIx, maxIy) {
    const sw = map.options.crs.unproject(L.point(minIx * GRID_SIZE_M, minIy * GRID_SIZE_M));
    const ne = map.options.crs.unproject(L.point((maxIx + 1) * GRID_SIZE_M, (maxIy + 1) * GRID_SIZE_M));
    return {
      type: "Polygon",
      coordinates: [[
        [sw.lng, sw.lat],
        [ne.lng, sw.lat],
        [ne.lng, ne.lat],
        [sw.lng, ne.lat],
        [sw.lng, sw.lat]
      ]]
    };
  }

  function leafletBoundsForCells(minIx, minIy, maxIx, maxIy) {
    const sw = map.options.crs.unproject(L.point(minIx * GRID_SIZE_M, minIy * GRID_SIZE_M));
    const ne = map.options.crs.unproject(L.point((maxIx + 1) * GRID_SIZE_M, (maxIy + 1) * GRID_SIZE_M));
    return L.latLngBounds(sw, ne);
  }

  function staticMetrics(ix, iy) {
    const m = window.__staticGridCounts?.get(`${ix},${iy}`) || {};
    return {
      count: Number(m.count) || 0,
      species: Number(m.species) || 0,
      observers: Number(m.observers) || 0,
      n_captive: Number(m.n_captive) || 0,
      last_observed: m.last_observed || null,
      last_observed_ms: Number(m.last_observed_ms) || 0
    };
  }

  function displayMetrics(ix, iy) {
    const key = `${ix},${iy}`;
    const rich = window.__richGridMetrics instanceof Map
      ? window.__richGridMetrics.get(key)
      : null;
    const base = rich || staticMetrics(ix, iy);

    if (typeof getDisplayMetricsForCell === "function") {
      return getDisplayMetricsForCell(ix, iy, base) || base;
    }

    return window.GridWildIconicOverlayFilter?.metricsForCell?.(ix, iy, base) || base;
  }

  function currentLensSignal(metrics) {
    if (!metrics || (Number(metrics.count) || 0) <= 0) return 0;

    const composed = window.GWLenses?.compose?.(metrics);
    if (composed && Number.isFinite(Number(composed.fillOpacity))) {
      return clamp01(Number(composed.fillOpacity));
    }

    const metric = window.__gwState?.heatMetric || "count";
    const value =
      metric === "species" ? Number(metrics.species) || 0 :
      metric === "observers" ? Number(metrics.observers) || 0 :
      Number(metrics.count) || 0;

    return clamp01(Math.log1p(value) / Math.log1p(metric === "count" ? 30 : 20));
  }

  function currentHudHeatValue(metrics) {
    if (!metrics) return 0;
    if (typeof getHeatValueForCell === "function") {
      return Math.max(0, Number(getHeatValueForCell(metrics)) || 0);
    }

    const metric = window.__gwState?.heatMetric || "count";
    if (metric === "species") return Math.max(0, Number(metrics.species) || 0);
    if (metric === "observers") return Math.max(0, Number(metrics.observers) || 0);
    return Math.max(0, Number(metrics.count) || 0);
  }

  function isFovSampling() {
    return String(state.controls.radiusM || "fov") === "fov";
  }

  function numericRadiusM(fallback = 500) {
    const n = Number(state.controls.radiusM);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  function growTileCells() {
    const raw = Number(state.controls.growTileCells);
    return Math.max(2, Math.min(80, Math.round(Number.isFinite(raw) ? raw : GROW_LOCAL_NICHE_RULE.defaultTileCells)));
  }

  function growMinOccupiedPct() {
    const raw = Number(state.controls.growMinOccupiedPct);
    return Math.max(0, Math.min(100, Number.isFinite(raw) ? raw : GROW_LOCAL_NICHE_RULE.defaultMinOccupiedPct));
  }

  function getScanCellBounds(origin, radiusCells) {
    const center = cellForLatLng(origin.lat, origin.lng);
    let minIx = center.ix - radiusCells;
    let maxIx = center.ix + radiusCells;
    let minIy = center.iy - radiusCells;
    let maxIy = center.iy + radiusCells;

    if (typeof map !== "undefined" && map?.getBounds) {
      const b = map.getBounds();
      const sw = map.options.crs.project(b.getSouthWest());
      const ne = map.options.crs.project(b.getNorthEast());
      const viewMinIx = Math.floor(Math.min(sw.x, ne.x) / GRID_SIZE_M) - 2;
      const viewMaxIx = Math.floor(Math.max(sw.x, ne.x) / GRID_SIZE_M) + 2;
      const viewMinIy = Math.floor(Math.min(sw.y, ne.y) / GRID_SIZE_M) - 2;
      const viewMaxIy = Math.floor(Math.max(sw.y, ne.y) / GRID_SIZE_M) + 2;

      if (isFovSampling()) {
        minIx = viewMinIx;
        maxIx = viewMaxIx;
        minIy = viewMinIy;
        maxIy = viewMaxIy;
      } else {
        minIx = Math.max(minIx, viewMinIx);
        maxIx = Math.min(maxIx, viewMaxIx);
        minIy = Math.max(minIy, viewMinIy);
        maxIy = Math.min(maxIy, viewMaxIy);
      }
    }

    return { minIx, maxIx, minIy, maxIy, center };
  }

  function getFovCellBounds() {
    const center = typeof map !== "undefined" && map?.getCenter
      ? cellForLatLng(map.getCenter().lat, map.getCenter().lng)
      : cellForLatLng(getOrigin().lat, getOrigin().lng);

    if (typeof map === "undefined" || !map?.getBounds) {
      return {
        minIx: center.ix - 10,
        maxIx: center.ix + 10,
        minIy: center.iy - 10,
        maxIy: center.iy + 10,
        center
      };
    }

    const b = map.getBounds();
    const sw = map.options.crs.project(b.getSouthWest());
    const ne = map.options.crs.project(b.getNorthEast());
    return {
      minIx: Math.floor(Math.min(sw.x, ne.x) / GRID_SIZE_M),
      maxIx: Math.floor(Math.max(sw.x, ne.x) / GRID_SIZE_M),
      minIy: Math.floor(Math.min(sw.y, ne.y) / GRID_SIZE_M),
      maxIy: Math.floor(Math.max(sw.y, ne.y) / GRID_SIZE_M),
      center
    };
  }

  function daysSince(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return 999;
    return Math.max(0, (Date.now() - ms) / 86400000);
  }

  function clamp01(n) {
    n = Number(n);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }

  function aggregatePatch(centerIx, centerIy, patchRadius) {
    const cells = [];
    const metrics = {
      count: 0,
      species: 0,
      observers: 0,
      activeCells: 0,
      emptyCells: 0,
      captive: 0,
      latestObservedMs: 0
    };

    for (let ix = centerIx - patchRadius; ix <= centerIx + patchRadius; ix++) {
      for (let iy = centerIy - patchRadius; iy <= centerIy + patchRadius; iy++) {
        const m = staticMetrics(ix, iy);
        cells.push(`${ix},${iy}`);
        metrics.count += m.count;
        metrics.species += m.species;
        metrics.observers += m.observers;
        metrics.captive += m.n_captive;
        metrics.latestObservedMs = Math.max(metrics.latestObservedMs, m.last_observed_ms || 0);
        if (m.count > 0) metrics.activeCells += 1;
        else metrics.emptyCells += 1;
      }
    }

    metrics.totalCells = cells.length;
    metrics.meanObs = metrics.totalCells ? metrics.count / metrics.totalCells : 0;
    metrics.meanSpecies = metrics.totalCells ? metrics.species / metrics.totalCells : 0;
    metrics.activeRatio = metrics.totalCells ? metrics.activeCells / metrics.totalCells : 0;

    return { cells, metrics };
  }

  function scanCaps(center, radiusCells) {
    const counts = [];
    const species = [];
    const observers = [];

    for (let ix = center.ix - radiusCells; ix <= center.ix + radiusCells; ix++) {
      for (let iy = center.iy - radiusCells; iy <= center.iy + radiusCells; iy++) {
        const m = staticMetrics(ix, iy);
        if (m.count > 0) counts.push(m.count);
        if (m.species > 0) species.push(m.species);
        if (m.observers > 0) observers.push(m.observers);
      }
    }

    return {
      count: Math.max(3, percentile(counts, 0.9)),
      species: Math.max(2, percentile(species, 0.9)),
      observers: Math.max(1, percentile(observers, 0.9))
    };
  }

  function percentile(values, p) {
    const nums = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!nums.length) return 0;
    const idx = Math.max(0, Math.min(nums.length - 1, Math.floor((nums.length - 1) * p)));
    return nums[idx];
  }

  function hashString(value) {
    let h = 2166136261;
    const s = String(value || "");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function hashNumber(value) {
    let h = 2166136261;
    const s = String(value || "");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function componentColor(componentId, fallbackIndex = 0) {
    const idx = componentId
      ? hashNumber(componentId) % COMPONENT_PALETTE.length
      : fallbackIndex % COMPONENT_PALETTE.length;
    return COMPONENT_PALETTE[idx];
  }

  function strongerComponentColor(color) {
    const value = String(color || "").trim();
    const hex = value.match(/^#?([0-9a-f]{6})$/i)?.[1];
    if (!hex) return value || "#6fbf91";

    const rgb = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
    const adjusted = rgb.map(channel => {
      const saturated = channel < 128 ? channel * 0.82 : channel * 0.68;
      return Math.max(24, Math.min(210, Math.round(saturated)));
    });
    return `#${adjusted.map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
  }

  function nicheVisualStyle(niche, fallbackColor) {
    const algorithm = String(niche?.metrics?.algorithm || "");
    if (algorithm === "heat_tendril_niche_v1") {
      return {
        baseColor: "#00d8ff",
        outlineColor: "#00f0ff",
        haloColor: "rgba(0,216,255,0.38)",
        coreFill: "#d7fbff",
        outlineClass: "gw-niche-visible-component-outline is-soft is-heat-tendril",
        haloClass: "gw-niche-visible-component-outline-halo is-soft is-heat-tendril",
        circleClass: "is-heat-tendril",
        coreClass: "is-heat-tendril",
        dashArray: "10 5",
        weightBoost: 1.3,
        haloBoost: 2.5
      };
    }
    if (algorithm === "trail_corridor_niche_v1") {
      return {
        baseColor: "#ffb000",
        outlineColor: "#ffc233",
        haloColor: "rgba(255,176,0,0.34)",
        coreFill: "#fff1be",
        outlineClass: "gw-niche-visible-component-outline is-soft is-trail-corridor",
        haloClass: "gw-niche-visible-component-outline-halo is-soft is-trail-corridor",
        circleClass: "is-trail-corridor",
        coreClass: "is-trail-corridor",
        dashArray: null,
        weightBoost: 1.0,
        haloBoost: 1.7
      };
    }
    return {
      baseColor: fallbackColor,
      outlineColor: strongerComponentColor(fallbackColor),
      haloColor: null,
      coreFill: "#fff7d1",
      outlineClass: "gw-niche-visible-component-outline",
      haloClass: "gw-niche-visible-component-outline-halo",
      circleClass: "",
      coreClass: "",
      dashArray: null,
      weightBoost: 0,
      haloBoost: 0
    };
  }

  function featureLabel(feature) {
    const tags = feature?.tags || {};
    return tags.name || tags["addr:housename"] || tags.brand || tags.operator || "";
  }

  function featureKindLabel(kind, feature) {
    const tags = feature?.tags || {};
    if (kind === "water") return tags.waterway ? "stream / waterway" : "waterbody";
    if (kind === "parks") return tags.leisure === "garden" ? "garden / park" : "park / natural feature";
    if (kind === "trails") return "trail / path";
    if (kind === "buildings") return "building / campus feature";
    return kind;
  }

  function minDistanceToFeature(lat, lng, feature) {
    if (!Array.isArray(feature?.points) || !feature.points.length) return Infinity;
    const here = L.latLng(lat, lng);
    let best = Infinity;
    for (const p of feature.points) {
      best = Math.min(best, here.distanceTo(p));
    }
    return best;
  }

  function distanceMetersBetween(latA, lngA, latB, lngB) {
    const aLat = Number(latA);
    const aLng = Number(lngA);
    const bLat = Number(latB);
    const bLng = Number(lngB);
    if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) return Infinity;
    if (typeof L !== "undefined" && L?.latLng) {
      return L.latLng(aLat, aLng).distanceTo(L.latLng(bLat, bLng));
    }

    const toRad = deg => deg * Math.PI / 180;
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const lat1 = toRad(aLat);
    const lat2 = toRad(bLat);
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  }

  function angleDiffDeg(a, b) {
    let diff = Math.abs(Number(a) - Number(b)) % 180;
    if (diff > 90) diff = 180 - diff;
    return diff;
  }

  function componentShapeContext(members = []) {
    const points = members
      .map(cell => ({ x: Number(cell.ix), y: Number(cell.iy) }))
      .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (points.length < 4) {
      return { elongated: false, cell_count: points.length };
    }

    const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    let xx = 0;
    let yy = 0;
    let xy = 0;

    for (const point of points) {
      const dx = point.x - meanX;
      const dy = point.y - meanY;
      xx += dx * dx;
      yy += dy * dy;
      xy += dx * dy;
    }

    xx /= points.length;
    yy /= points.length;
    xy /= points.length;

    const trace = xx + yy;
    const delta = Math.sqrt(Math.max(0, (xx - yy) * (xx - yy) + 4 * xy * xy));
    const major = Math.max(0, (trace + delta) / 2);
    const minor = Math.max(0.0001, (trace - delta) / 2);
    const ratio = Math.sqrt(major / minor);
    const angleDeg = ((0.5 * Math.atan2(2 * xy, xx - yy)) * 180 / Math.PI + 180) % 180;
    const elongated = points.length >= 8 && ratio >= 2.35;

    return {
      elongated,
      axis_angle_deg: Number(angleDeg.toFixed(1)),
      elongation_ratio: Number(ratio.toFixed(2)),
      cell_count: points.length,
      major_cells: Number((Math.sqrt(major) * 2).toFixed(1)),
      minor_cells: Number((Math.sqrt(minor) * 2).toFixed(1))
    };
  }

  function nearestSegmentInfo(lat, lng, feature) {
    if (!Array.isArray(feature?.points) || feature.points.length < 2) return null;
    const here = map.options.crs.project(L.latLng(lat, lng));
    let best = null;

    for (let i = 1; i < feature.points.length; i++) {
      const a = map.options.crs.project(feature.points[i - 1]);
      const b = map.options.crs.project(feature.points[i]);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      if (len2 <= 0) continue;

      const t = Math.max(0, Math.min(1, ((here.x - a.x) * dx + (here.y - a.y) * dy) / len2));
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      const distanceM = Math.sqrt((here.x - px) * (here.x - px) + (here.y - py) * (here.y - py));
      const angleDeg = (Math.atan2(dy, dx) * 180 / Math.PI + 180) % 180;

      if (!best || distanceM < best.distanceM) {
        best = {
          distanceM,
          angleDeg,
          segmentIndex: i - 1
        };
      }
    }

    return best;
  }

  function featureSegmentSamples(feature) {
    if (!Array.isArray(feature?.points) || feature.points.length < 2 || typeof map === "undefined") return [];
    const segments = [];
    let cumulativeM = 0;

    for (let i = 1; i < feature.points.length; i++) {
      const aLl = feature.points[i - 1];
      const bLl = feature.points[i];
      const a = map.options.crs.project(aLl);
      const b = map.options.crs.project(bLl);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthM = Math.hypot(dx, dy);
      if (lengthM <= 0.5) continue;
      segments.push({
        a,
        b,
        aLl,
        bLl,
        dx,
        dy,
        lengthM,
        startM: cumulativeM,
        endM: cumulativeM + lengthM
      });
      cumulativeM += lengthM;
    }

    return segments;
  }

  function nearestTrailProjection(cell, segments = []) {
    if (!cell || !segments.length || typeof map === "undefined") return null;
    const p = map.options.crs.project(L.latLng(cell.lat, cell.lng));
    let best = null;

    for (const segment of segments) {
      const len2 = segment.dx * segment.dx + segment.dy * segment.dy;
      if (len2 <= 0) continue;
      const t = Math.max(0, Math.min(1, ((p.x - segment.a.x) * segment.dx + (p.y - segment.a.y) * segment.dy) / len2));
      const x = segment.a.x + segment.dx * t;
      const y = segment.a.y + segment.dy * t;
      const distanceM = Math.hypot(p.x - x, p.y - y);
      const alongM = segment.startM + segment.lengthM * t;
      if (!best || distanceM < best.distanceM) {
        best = {
          distanceM,
          alongM,
          segment,
          t,
          projected: { x, y }
        };
      }
    }

    return best;
  }

  function alignedCorridorContext(lat, lng, shapeContext) {
    if (!shapeContext?.elongated || typeof map === "undefined") return null;
    const groups = window.GridWildOsmFeaturesLayer?.getFeatures?.() || {};
    const candidates = [];

    const rules = [
      { kind: "trails", maxM: 70, maxAngle: 28, base: 0.82 },
      { kind: "water", maxM: 95, maxAngle: 34, base: 0.78 }
    ];

    for (const rule of rules) {
      for (const feature of groups[rule.kind] || []) {
        const info = nearestSegmentInfo(lat, lng, feature);
        if (!info || info.distanceM > rule.maxM) continue;
        const angleDiff = angleDiffDeg(shapeContext.axis_angle_deg, info.angleDeg);
        if (angleDiff > rule.maxAngle) continue;

        const label = featureLabel(feature);
        const distanceScore = 1 - Math.min(info.distanceM, rule.maxM) / rule.maxM;
        const angleScore = 1 - angleDiff / rule.maxAngle;
        candidates.push({
          feature,
          kind: rule.kind,
          label,
          distanceM: info.distanceM,
          feature_angle_deg: Number(info.angleDeg.toFixed(1)),
          angle_diff_deg: Number(angleDiff.toFixed(1)),
          confidence: clamp01(rule.base * 0.52 + distanceScore * 0.24 + angleScore * 0.24),
          relation: rule.kind === "trails" && info.distanceM > 26 ? "beside" : "along"
        });
      }
    }

    candidates.sort((a, b) => b.confidence - a.confidence || a.distanceM - b.distanceM);
    return candidates[0] || null;
  }

  function applyGeometryContextToPlace(placeContext, shapeContext, corridor) {
    const current = placeContext || {};
    const geometryContext = {
      ...shapeContext,
      corridor_kind: corridor?.kind || null,
      corridor_label: corridor?.label || null,
      corridor_relation: corridor?.relation || null,
      corridor_distance_m: Number.isFinite(Number(corridor?.distanceM)) ? Math.round(corridor.distanceM) : null,
      corridor_angle_diff_deg: corridor?.angle_diff_deg ?? null,
      corridor_confidence: corridor?.confidence ?? null
    };

    if (!corridor) {
      return {
        ...current,
        geometry_context: geometryContext
      };
    }

    const hasCorridorLabel = !!corridor.label;
    const currentLabel = String(current.primary_label || "").trim();
    const genericCurrent = isGenericPlaceContext(current);
    const fallbackLabel = currentLabel && !genericCurrent ? currentLabel : "";
    const relation = corridor.relation || "along";
    const genericCorridor = corridor.kind === "water" ? "water edge" : "path";
    const labelPhrase = hasCorridorLabel
      ? `${relation} ${corridor.label}`
      : fallbackLabel
        ? `${relation} the ${genericCorridor} near ${fallbackLabel}`
        : `${relation} a nearby ${genericCorridor}`;

    return {
      ...current,
      primary_label: hasCorridorLabel ? corridor.label : current.primary_label,
      secondary_label: hasCorridorLabel ? (current.primary_label || current.secondary_label || null) : current.secondary_label,
      place_type: corridor.kind === "water" ? "elongated stream-edge corridor" : "elongated path corridor",
      spatial_relation: relation,
      geometry_context: {
        ...geometryContext,
        label_phrase: labelPhrase
      },
      osm_feature_ids: [
        ...(Array.isArray(current.osm_feature_ids) ? current.osm_feature_ids : []),
        corridor.feature?.id
      ].filter(Boolean),
      label_confidence: Number(Math.max(Number(current.label_confidence) || 0, corridor.confidence || 0).toFixed(2)),
      label_source: `${current.label_source || "local"}+geometry_corridor`
    };
  }

  function resolveGeometricPlaceContext(lat, lng, component, baseContext) {
    const shapeContext = componentShapeContext(component?.members || []);
    const corridor = NICHE_OSM_CONTEXT_ENABLED
      ? alignedCorridorContext(lat, lng, shapeContext)
      : null;
    return applyGeometryContextToPlace(baseContext, shapeContext, corridor);
  }

  function preserveGeometryContext(placeContext, storedGeometryContext) {
    if (!storedGeometryContext || typeof storedGeometryContext !== "object") return placeContext;

    const ctx = {
      ...(placeContext || {}),
      geometry_context: {
        ...storedGeometryContext
      }
    };

    const relation = storedGeometryContext.corridor_relation;
    if (storedGeometryContext.elongated && relation) {
      const corridorLabel = String(storedGeometryContext.corridor_label || "").trim();
      const primary = String(ctx.primary_label || "").trim();
      const generic = isGenericPlaceContext(ctx);
      const genericCorridor = storedGeometryContext.corridor_kind === "water" ? "water edge" : "path";
      ctx.geometry_context.label_phrase = corridorLabel
        ? `${relation} ${corridorLabel}`
        : primary && !generic
          ? `${relation} the ${genericCorridor} near ${primary}`
          : `${relation} a nearby ${genericCorridor}`;
      ctx.spatial_relation = relation;
      ctx.place_type = storedGeometryContext.corridor_kind === "water"
        ? "elongated stream-edge corridor"
        : "elongated path corridor";
      ctx.label_confidence = Number(Math.max(
        Number(ctx.label_confidence) || 0,
        Number(storedGeometryContext.corridor_confidence) || 0
      ).toFixed(2));
    }

    return ctx;
  }

  function abbreviateMapLabel(value) {
    let text = String(value || "").trim();
    if (!text) return "";

    const replacements = [
      [/\bNorthwest\b/gi, "NW"],
      [/\bNortheast\b/gi, "NE"],
      [/\bSouthwest\b/gi, "SW"],
      [/\bSoutheast\b/gi, "SE"],
      [/\bNorth West\b/gi, "NW"],
      [/\bNorth East\b/gi, "NE"],
      [/\bSouth West\b/gi, "SW"],
      [/\bSouth East\b/gi, "SE"],
      [/\bN\.?\s*W\.?\b/gi, "NW"],
      [/\bN\.?\s*E\.?\b/gi, "NE"],
      [/\bS\.?\s*W\.?\b/gi, "SW"],
      [/\bS\.?\s*E\.?\b/gi, "SE"],
      [/\bStreet\b/gi, "St"],
      [/\bAvenue\b/gi, "Ave"],
      [/\bRoad\b/gi, "Rd"],
      [/\bBoulevard\b/gi, "Blvd"],
      [/\bDrive\b/gi, "Dr"],
      [/\bLane\b/gi, "Ln"],
      [/\bCourt\b/gi, "Ct"],
      [/\bPlace\b/gi, "Pl"],
      [/\bTerrace\b/gi, "Ter"],
      [/\bCircle\b/gi, "Cir"],
      [/\bParkway\b/gi, "Pkwy"],
      [/\bHighway\b/gi, "Hwy"],
      [/\bExpressway\b/gi, "Expy"],
      [/\bFreeway\b/gi, "Fwy"],
      [/\bTurnpike\b/gi, "Tpke"],
      [/\bTrail\b/gi, "Trl"],
      [/\bMount\b/gi, "Mt"],
      [/\bFort\b/gi, "Ft"]
    ];

    for (const [pattern, replacement] of replacements) {
      text = text.replace(pattern, replacement);
    }

    return text
      .replace(/\b(NW|NE|SW|SE|St|Ave|Rd|Blvd|Dr|Ln|Ct|Pl|Ter|Cir|Pkwy|Hwy|Expy|Fwy|Tpke|Trl|Mt|Ft)\./g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  }

  function displayNicheTitle(niche) {
    return abbreviateMapLabel(niche?.title || buildNicheDisplayTitle(niche || {}) || "Local niche");
  }

  function displayNicheShortTitle(niche) {
    const raw = niche?.short_title || niche?.title || "Local niche";
    return abbreviateMapLabel(raw);
  }

  function compactHudTaxonLabel(value) {
    return titleSubjectCase(plainTaxonLabel(value))
      .replace(/\bfamily\b/gi, "")
      .replace(/\s*&\s*/g, " & ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function hudTaxonKey(value) {
    return compactHudTaxonLabel(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function joinHudExemplars(items = []) {
    const list = items.filter(Boolean).slice(0, 3);
    if (list.length <= 1) return list[0] || "";
    if (list.length === 2) return `${list[0]} & ${list[1]}`;
    return `${list[0]}, ${list[1]} & ${list[2]}`;
  }

  function hudTaxonCandidate(entry, rank) {
    const usable = usableTaxonEntry(entry);
    if (!usable) return null;
    const item = taxonDisplayEntry(usable, rank);
    const label = compactHudTaxonLabel(item.common || item.scientific);
    if (!label || label.length > 24) return null;
    return {
      label,
      key: hudTaxonKey(label),
      rank,
      count: item.count,
      aliased: item.aliased || rank === "iconic_taxon"
    };
  }

  function nicheHudExemplarPhrase(niche) {
    const metrics = niche?.metrics || {};
    const summary = metrics.taxonomy_summary || metrics.taxonomySummary || {};
    const candidates = [];

    const collect = (entries, rank, limit, commonOnly = false) => {
      if (!Array.isArray(entries)) return;
      for (const entry of entries) {
        if (candidates.length >= limit) return;
        const candidate = hudTaxonCandidate(entry, rank);
        if (!candidate || (commonOnly && !candidate.aliased)) continue;
        if (candidates.some((existing) => existing.key === candidate.key)) continue;
        candidates.push(candidate);
      }
    };

    collect(summary.genera, "genus", 4, true);
    if (candidates.length < 2) collect(summary.families, "family", 4, true);
    if (candidates.length < 2) collect(summary.orders, "order", 4, true);
    if (candidates.length < 2) collect(summary.genera, "genus", 4, false);
    if (candidates.length < 2) collect(summary.families, "family", 4, false);
    if (candidates.length < 2) collect(summary.orders, "order", 4, false);

    if (candidates.length < 2) {
      const iconic = Object.entries(metrics.iconic_counts || {})
        .map(([name, count]) => ({ name, count: Number(count) || 0 }))
        .filter((entry) => entry.count > 0 && !/^unknown$/i.test(entry.name))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
      for (const entry of iconic) {
        const item = taxonDisplayEntry(entry, "iconic_taxon");
        const label = compactHudTaxonLabel(item.common);
        const key = hudTaxonKey(label);
        if (label && !candidates.some((candidate) => candidate.key === key)) {
          candidates.push({ label, key, rank: "iconic_taxon", count: item.count });
        }
      }
    }

    return joinHudExemplars(candidates.map((candidate) => candidate.label));
  }

  function splitPlacePhrase(phrase) {
    const text = abbreviateMapLabel(phrase).trim();
    if (!text) return { relation: "", place: "" };

    const words = text.split(/\s+/);
    const first = String(words[0] || "").toLowerCase();
    const second = String(words[1] || "").toLowerCase();
    const directional = /^(north|south|east|west|northeast|northwest|southeast|southwest)$/i.test(first);
    const relationWords = directional && second === "of"
      ? words.slice(0, 2)
      : words.slice(0, 1);
    const placeWords = words.slice(relationWords.length);

    return {
      relation: relationWords.join(" "),
      place: placeWords.join(" ")
    };
  }

  function nicheMapLabelHtml(niche) {
    const exemplarPhrase = nicheHudExemplarPhrase(niche);
    const homeClass = isHomeNiche(niche) ? " is-home-niche" : "";
    const action = abbreviateMapLabel(exemplarPhrase ||
      phraseForNiche(niche || {})
        .replace(/^(Sample|Survey|Look for|Revisit|Check)\s+/i, "")
    );
    const place = splitPlacePhrase(placeSuffix(niche?.place_context || {
      primary_label: niche?.primary_place_label,
      label_confidence: niche?.place_label_confidence
    }));

    if (!place.place) {
      return `<span class="gw-niche-label-chip${homeClass}"><span class="gw-niche-label-main">${esc(displayNicheShortTitle(niche))}</span></span>`;
    }

    return `
      <span class="gw-niche-label-chip${homeClass}">
        <span class="gw-niche-label-main">${esc(action || displayNicheShortTitle(niche))}</span>
        <span class="gw-niche-label-place"><i>${esc(place.relation)}</i><b>${esc(place.place)}</b></span>
      </span>
    `;
  }

  function displayPlaceLabel(value, fallback = "nearby area") {
    return abbreviateMapLabel(value || fallback);
  }

  function resolvePlaceContext(lat, lng) {
    if (!NICHE_OSM_CONTEXT_ENABLED) {
      return {
        primary_label: "this niche area",
        secondary_label: null,
        place_type: "niche centroid area",
        spatial_relation: "near",
        centroid: { lat, lng },
        label_confidence: 0.25,
        label_source: "niche_coordinate_fallback"
      };
    }

    const groups = window.GridWildOsmFeaturesLayer?.getFeatures?.() || {};
    const priority = [
      { kind: "buildings", maxM: 70, base: 0.9 },
      { kind: "water", maxM: 100, base: 0.86 },
      { kind: "parks", maxM: 140, base: 0.8 },
      { kind: "trails", maxM: 90, base: 0.78 }
    ];

    const candidates = [];
    for (const rule of priority) {
      for (const feature of groups[rule.kind] || []) {
        const label = featureLabel(feature);
        if (!label) continue;
        const distanceM = minDistanceToFeature(lat, lng, feature);
        if (distanceM > rule.maxM) continue;
        candidates.push({
          feature,
          kind: rule.kind,
          label,
          distanceM,
          confidence: clamp01(rule.base - distanceM / (rule.maxM * 3))
        });
      }
    }

    candidates.sort((a, b) => b.confidence - a.confidence || a.distanceM - b.distanceM);
    const best = candidates[0];

    if (best) {
      const relation =
        best.kind === "water" ? "beside" :
        best.kind === "trails" ? "along" :
        best.kind === "buildings" && best.distanceM < 30 ? "at" :
        "near";

      return {
        primary_label: best.label,
        secondary_label: null,
        place_type: featureKindLabel(best.kind, best.feature),
        nearby_poi: best.kind === "buildings" ? best.label : null,
        osm_feature_ids: [best.feature.id].filter(Boolean),
        spatial_relation: relation,
        distance_m: Math.round(best.distanceM),
        centroid: { lat, lng },
        label_confidence: Number(best.confidence.toFixed(2)),
        label_source: "osm_visible_context"
      };
    }

    return {
      primary_label: "this niche area",
      secondary_label: null,
      place_type: "niche centroid area",
      spatial_relation: "near",
      centroid: { lat, lng },
      label_confidence: 0.25,
      label_source: "niche_coordinate_fallback"
    };
  }

  function compactPlaceName(value) {
    return String(value || "")
      .split(",")
      .map(part => part.trim())
      .filter(Boolean)[0] || "";
  }

  function numericHouseNumber(value) {
    const match = String(value || "").match(/\d+/);
    return match ? Number(match[0]) : NaN;
  }

  function streetBlockLabel(address = {}) {
    const road = address.road || address.pedestrian || address.footway || address.path || address.cycleway;
    if (!road) return "";

    const house = numericHouseNumber(address.house_number);
    if (Number.isFinite(house) && house > 0) {
      const block = Math.floor(house / 100) * 100;
      return `the ${block} block of ${road}`;
    }

    return road;
  }

  function neighborhoodLabel(address = {}) {
    return address.neighbourhood ||
      address.suburb ||
      address.quarter ||
      address.city_district ||
      address.borough ||
      address.hamlet ||
      "";
  }

  function cityLabel(address = {}) {
    return address.city || address.town || address.village || address.municipality || "";
  }

  function osmId(data = {}) {
    return data.osm_type && data.osm_id ? `${data.osm_type}/${data.osm_id}` : null;
  }

  function reverseContextUrl(lat, lng) {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: "jsonv2",
      zoom: "18",
      addressdetails: "1",
      namedetails: "1"
    });
    return `${NOMINATIM_REVERSE_ENDPOINT}?${params.toString()}`;
  }

  function placeContextFromReverse(data = {}, lat, lng) {
    const address = data.address || {};
    const named = data.namedetails || {};
    const osmClass = String(data.category || data.class || "").toLowerCase();
    const osmType = String(data.type || "").toLowerCase();
    const namedFeature = compactPlaceName(data.name || named.name);
    const block = streetBlockLabel(address);
    const neighborhood = neighborhoodLabel(address);
    const city = cityLabel(address);
    const admin = address.state || address.region || address.county || "";
    const ids = [osmId(data)].filter(Boolean);

    let primary = "";
    let relation = "near";
    let placeType = osmType || osmClass || "map feature";
    let confidence = 0.46;

    if (namedFeature && !["house", "residential"].includes(osmType)) {
      primary = namedFeature;
      confidence = ["amenity", "building", "tourism", "leisure", "shop", "historic"].includes(osmClass)
        ? 0.76
        : 0.68;
      if (osmClass === "building" || osmType.includes("library") || osmType.includes("school")) relation = "near";
      if (osmClass === "waterway" || osmType.includes("stream") || osmType.includes("canal")) relation = "along";
      if (osmClass === "highway") relation = "on";
    } else if (block) {
      primary = block;
      placeType = "street block";
      relation = "on";
      confidence = 0.66;
    } else if (neighborhood) {
      primary = neighborhood;
      placeType = "neighborhood";
      relation = "near";
      confidence = 0.5;
    } else if (city) {
      primary = city;
      placeType = "city";
      relation = "near";
      confidence = 0.42;
    } else if (admin) {
      primary = admin;
      placeType = "region";
      relation = "near";
      confidence = 0.36;
    }

    if (!primary) return null;

    return {
      primary_label: primary,
      secondary_label: neighborhood && neighborhood !== primary ? neighborhood : city || null,
      place_type: placeType,
      neighborhood: neighborhood || null,
      city: city || null,
      admin_area: admin || null,
      nearby_poi: namedFeature || null,
      street_or_block: block || null,
      osm_feature_ids: ids,
      spatial_relation: relation,
      centroid: { lat, lng },
      label_confidence: Number(confidence.toFixed(2)),
      label_source: "nominatim_reverse_context"
    };
  }

  function overpassQuery(lat, lng) {
    return `
      [out:json][timeout:10];
      (
        node(around:90,${lat},${lng})["name"];
        way(around:90,${lat},${lng})["name"];
        relation(around:90,${lat},${lng})["name"];
        way(around:55,${lat},${lng})["highway"]["name"];
      );
      out tags center 40;
    `;
  }

  function overpassBatchQuery(bounds) {
    const south = Number(bounds?.south);
    const west = Number(bounds?.west);
    const north = Number(bounds?.north);
    const east = Number(bounds?.east);
    if (![south, west, north, east].every(Number.isFinite)) return "";

    return `
      [out:json][timeout:14];
      (
        node["name"](${south},${west},${north},${east});
        way["name"](${south},${west},${north},${east});
        relation["name"](${south},${west},${north},${east});
        way["highway"]["name"](${south},${west},${north},${east});
      );
      out tags center 220;
    `;
  }

  function nicheCentroidBounds(niches = [], paddingM = 140) {
    const points = niches
      .map((niche) => ({
        lat: Number(niche.centroid_lat),
        lng: Number(niche.centroid_lng)
      }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
    if (!points.length) return null;

    const minLat = Math.min(...points.map(point => point.lat));
    const maxLat = Math.max(...points.map(point => point.lat));
    const minLng = Math.min(...points.map(point => point.lng));
    const maxLng = Math.max(...points.map(point => point.lng));
    const midLat = (minLat + maxLat) / 2;
    const latPad = paddingM / 111320;
    const lngPad = paddingM / Math.max(1, 111320 * Math.cos(midLat * Math.PI / 180));

    const south = minLat - latPad;
    const north = maxLat + latPad;
    const west = minLng - lngPad;
    const east = maxLng + lngPad;

    if ((north - south) * (east - west) > 0.018) return null;
    return { south, west, north, east };
  }

  function overpassElementPoint(element) {
    if (Number.isFinite(Number(element.lat)) && Number.isFinite(Number(element.lon))) {
      return L.latLng(Number(element.lat), Number(element.lon));
    }
    if (element.center && Number.isFinite(Number(element.center.lat)) && Number.isFinite(Number(element.center.lon))) {
      return L.latLng(Number(element.center.lat), Number(element.center.lon));
    }
    return null;
  }

  function overpassContext(elements = [], lat, lng) {
    const here = L.latLng(lat, lng);
    const candidates = [];

    for (const element of elements) {
      const tags = element.tags || {};
      const name = compactPlaceName(tags.name || tags["addr:housename"] || tags.brand || tags.operator);
      if (!name) continue;

      const point = overpassElementPoint(element);
      const distanceM = point ? here.distanceTo(point) : 90;
      const isRoad = !!tags.highway;
      const isWater = !!tags.waterway || !!tags.water || tags.natural === "water";
      const isPark = !!tags.leisure || !!tags.boundary || !!tags.natural;
      const isBuilding = !!tags.building || !!tags.amenity || !!tags.tourism || !!tags.shop || !!tags.historic;
      const priority =
        isBuilding ? 4 :
        isWater ? 3.7 :
        isPark ? 3.3 :
        isRoad ? 2.7 :
        2;

      candidates.push({
        name,
        element,
        distanceM,
        isRoad,
        isWater,
        isPark,
        isBuilding,
        score: priority - Math.min(distanceM, 120) / 80
      });
    }

    candidates.sort((a, b) => b.score - a.score || a.distanceM - b.distanceM);
    const best = candidates[0];
    if (!best) return null;

    const nearbyRoads = [];
    for (const road of candidates.filter(item => item.isRoad && item.distanceM <= 75)) {
      if (!nearbyRoads.some(existing => existing.name === road.name)) nearbyRoads.push(road);
      if (nearbyRoads.length >= 2) break;
    }
    if (best.isRoad && nearbyRoads.length >= 2) {
      const osmFeatureIds = nearbyRoads
        .map(road => road.element.type && road.element.id ? `${road.element.type}/${road.element.id}` : null)
        .filter(Boolean);
      return {
        primary_label: `${nearbyRoads[0].name} & ${nearbyRoads[1].name}`,
        secondary_label: null,
        place_type: "street corner / intersection",
        street_or_block: `${nearbyRoads[0].name} & ${nearbyRoads[1].name}`,
        osm_feature_ids: osmFeatureIds,
        spatial_relation: "near",
        distance_m: Math.round(Math.min(nearbyRoads[0].distanceM, nearbyRoads[1].distanceM)),
        centroid: { lat, lng },
        label_confidence: 0.68,
        label_source: "overpass_nearby_context"
      };
    }

    const tags = best.element.tags || {};
    const relation =
      best.isWater ? "along" :
      best.isRoad ? "on" :
      best.distanceM <= 20 && best.isBuilding ? "at" :
      "near";
    const placeType =
      best.isRoad ? "street / path" :
      best.isWater ? "stream / waterway" :
      best.isPark ? "park / natural feature" :
      best.isBuilding ? "building / place" :
      "named map feature";
    const osmFeatureId = best.element.type && best.element.id
      ? `${best.element.type}/${best.element.id}`
      : null;

    return {
      primary_label: best.name,
      secondary_label: null,
      place_type: placeType,
      nearby_poi: best.isRoad ? null : best.name,
      street_or_block: best.isRoad ? best.name : null,
      osm_feature_ids: [osmFeatureId].filter(Boolean),
      spatial_relation: relation,
      distance_m: Math.round(best.distanceM),
      centroid: { lat, lng },
      label_confidence: Number(clamp01(0.78 - Math.min(best.distanceM, 100) / 260).toFixed(2)),
      label_source: "overpass_nearby_context"
    };
  }

  function isGenericPlaceContext(placeContext = {}) {
    const label = String(placeContext.primary_label || "").trim().toLowerCase();
    const confidence = Number(placeContext.label_confidence) || 0;
    const source = String(placeContext.label_source || "");
    return confidence < 0.58 ||
      !label ||
      ["this nearby area", "this niche area", "your area", "current map area", "near your current location"].includes(label) ||
      source === "quest_locale_fallback" ||
      source === "niche_coordinate_fallback";
  }

  function placeContextCentroidDistanceM(placeContext = {}, lat, lng) {
    const centroid = placeContext?.centroid || {};
    const centroidLat = Number(centroid.lat);
    const centroidLng = Number(centroid.lng ?? centroid.lon);
    if (!Number.isFinite(centroidLat) || !Number.isFinite(centroidLng)) return null;
    return distanceMetersBetween(lat, lng, centroidLat, centroidLng);
  }

  function placeContextBelongsToNiche(placeContext = {}, lat, lng) {
    if (!placeContext || typeof placeContext !== "object") return false;
    const source = String(placeContext.label_source || "");
    if (source === "quest_locale_fallback") return false;

    const distanceM = placeContextCentroidDistanceM(placeContext, lat, lng);
    if (distanceM == null) return true;

    const featureDistanceM = Number(placeContext.distance_m);
    const allowanceM = Math.max(
      180,
      (Number.isFinite(featureDistanceM) ? featureDistanceM : 0) + 120
    );
    return distanceM <= allowanceM;
  }

  function betterPlaceContext(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    const aScore = Number(a.label_confidence) || 0;
    const bScore = Number(b.label_confidence) || 0;
    return bScore > aScore + 0.04 ? b : a;
  }

  async function lookupNominatimPlaceContext(lat, lng) {
    const response = await fetch(reverseContextUrl(lat, lng), {
      headers: { "Accept": "application/json" }
    });
    if (!response.ok) throw new Error(`Nominatim reverse lookup failed (${response.status})`);
    const data = await response.json();
    return placeContextFromReverse(data, lat, lng);
  }

  async function lookupOverpassPlaceContext(lat, lng) {
    if (Date.now() < overpassPlaceLookupDisabledUntil) return null;
    const response = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: new URLSearchParams({ data: overpassQuery(lat, lng) })
    });
    if (!response.ok) {
      if (response.status === 429) overpassPlaceLookupDisabledUntil = Date.now() + 120000;
      throw new Error(`Overpass lookup failed (${response.status})`);
    }
    const data = await response.json();
    return overpassContext(Array.isArray(data?.elements) ? data.elements : [], lat, lng);
  }

  async function lookupOverpassPlaceContextsForNiches(niches = []) {
    if (Date.now() < overpassPlaceLookupDisabledUntil) return new Map();
    const bounds = nicheCentroidBounds(niches);
    const query = overpassBatchQuery(bounds);
    if (!query) return new Map();

    const response = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: new URLSearchParams({ data: query })
    });
    if (!response.ok) {
      if (response.status === 429) overpassPlaceLookupDisabledUntil = Date.now() + 120000;
      throw new Error(`Overpass batch lookup failed (${response.status})`);
    }

    const data = await response.json();
    const elements = Array.isArray(data?.elements) ? data.elements : [];
    const contexts = new Map();
    for (const niche of niches) {
      const lat = Number(niche.centroid_lat);
      const lng = Number(niche.centroid_lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const context = overpassContext(elements, lat, lng);
      if (context) contexts.set(nicheKey(niche) || `${lat},${lng}`, context);
    }
    return contexts;
  }

  async function resolvePlaceContextAsync(lat, lng, currentContext = null, options = {}) {
    const current = placeContextBelongsToNiche(currentContext, lat, lng)
      ? currentContext
      : resolvePlaceContext(lat, lng);
    if (!isGenericPlaceContext(current)) return current;

    const key = `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
    if (placeContextCache.has(key)) {
      return betterPlaceContext(current, placeContextCache.get(key));
    }

    let resolved = null;
    if (!options.skipOverpass && Date.now() >= overpassPlaceLookupDisabledUntil) {
      try {
        resolved = betterPlaceContext(resolved, await lookupOverpassPlaceContext(lat, lng));
      } catch (err) {
        console.warn("GridWild niche Overpass place lookup failed:", err);
      }
    }

    if (!options.skipReverse) {
      try {
        resolved = betterPlaceContext(resolved, await lookupNominatimPlaceContext(lat, lng));
      } catch (err) {
        console.warn("GridWild niche reverse place lookup failed:", err);
      }
    }

    placeContextCache.set(key, resolved);
    return betterPlaceContext(current, resolved);
  }

  async function enrichNichePlaceContexts(niches = []) {
    if (!NICHE_OSM_CONTEXT_ENABLED) return niches;

    const enriched = [];
    const batchCandidates = niches.filter((niche) => {
      const lat = Number(niche.centroid_lat);
      const lng = Number(niche.centroid_lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
      const current = placeContextBelongsToNiche(niche.place_context, lat, lng)
        ? niche.place_context
        : resolvePlaceContext(lat, lng);
      return isGenericPlaceContext(current);
    });
    let overpassBatchContexts = new Map();
    if (batchCandidates.length) {
      try {
        overpassBatchContexts = await lookupOverpassPlaceContextsForNiches(batchCandidates);
      } catch (err) {
        console.warn("GridWild niche Overpass batch place lookup failed:", err);
      }
    }

    for (const niche of niches) {
      const lat = Number(niche.centroid_lat);
      const lng = Number(niche.centroid_lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        enriched.push(niche);
        continue;
      }

      const storedGeometryContext = niche.place_context?.geometry_context || niche.metrics?.geometry_context || null;
      const currentContext = placeContextBelongsToNiche(niche.place_context, lat, lng)
        ? niche.place_context
        : resolvePlaceContext(lat, lng);
      const batchContext = overpassBatchContexts.get(nicheKey(niche) || `${lat},${lng}`) || null;
      const seededContext = betterPlaceContext(currentContext, batchContext);
      const placeContext = preserveGeometryContext(
        await resolvePlaceContextAsync(lat, lng, seededContext, {
          skipOverpass: batchCandidates.length > 0,
          skipReverse: batchCandidates.length > 1
        }),
        storedGeometryContext
      );
      const updated = {
        ...niche,
        place_context: placeContext,
        primary_place_label: placeContext?.primary_label || niche.primary_place_label || null,
        secondary_place_label: placeContext?.secondary_label || niche.secondary_place_label || null,
        place_label_confidence: placeContext?.label_confidence || niche.place_label_confidence || 0
      };

      updated.evidence_summary = evidenceFor(updated.niche_type, updated.metrics || {}, placeContext);
      updated.confidence = clamp01(Number(updated.confidence || 0) + Math.max(0, Number(updated.place_label_confidence || 0) - Number(niche.place_label_confidence || 0)) * 0.12);
      updated.title = buildNicheDisplayTitle(updated);
      updated.short_title = updated.title.replace(/^(Sample|Survey|Look for|Revisit|Check)\s+/i, "");
      enriched.push(updated);
    }

    return enriched;
  }

  function placeSuffix(placeContext = {}) {
    const label = String(placeContext.primary_label || "").trim();
    const confidence = clamp01(placeContext.label_confidence);
    const type = String(placeContext.place_type || "").toLowerCase();
    const relation = String(placeContext.spatial_relation || "").trim();
    const geometryPhrase = String(placeContext.geometry_context?.label_phrase || "").trim();

    if (geometryPhrase && confidence >= 0.55) return abbreviateMapLabel(geometryPhrase);
    if (!label) return confidence < 0.35 ? "near this niche area" : "in this niche area";
    const shortLabel = abbreviateMapLabel(label);
    if (confidence >= 0.78) {
      if (relation) return `${relation} ${shortLabel}`;
      if (type.includes("trail") || type.includes("stream")) return `along ${shortLabel}`;
      if (type.includes("water")) return `beside ${shortLabel}`;
      if (type.includes("building") || type.includes("campus")) return `near ${shortLabel}`;
      if (type.includes("park")) return `near ${shortLabel}`;
      return `at ${shortLabel}`;
    }
    if (confidence >= 0.45) return `near ${shortLabel}`;
    return `around ${shortLabel}`;
  }

  function plainTaxonLabel(value) {
    return String(value || "")
      .replace(/\s*\([^)]*\)\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function titleSubjectCase(value) {
    const text = plainTaxonLabel(value);
    if (!text) return "";
    return text.charAt(0).toLowerCase() + text.slice(1);
  }

  function isBroadFocusLabel(value) {
    return /^(life|local life|mixed life|dominant life groups|plants|insects|birds|fungi|mammals|animals|reptiles|amphibians|arachnids|mollusks|fish|ray-finned fish)$/i
      .test(plainTaxonLabel(value));
  }

  function lensDescriptor(metrics = {}) {
    const lens = String(metrics.active_lens || window.__gwState?.activeLens || "classic").toLowerCase();
    const heatMetric = String(metrics.heat_metric || window.__gwState?.heatMetric || "count").toLowerCase();

    if (lens === "dominantlife") return "dominant";
    if (lens === "breadth") return "broad";
    if (lens === "seasonalpulse" || lens === "seasonalnow") return "seasonal";
    if (lens === "revisit" || lens === "freshness" || lens === "wildtime" || lens === "timeconfidence") return "recent";
    if (heatMetric === "species") return "genus-rich";
    if (heatMetric === "observers") return "well-watched";
    return "";
  }

  function usableTaxonEntry(entry) {
    const name = String(entry?.name || "").trim();
    if (!name || /^unknown$/i.test(name)) return null;
    return entry;
  }

  function topTaxonomySubject(metrics = {}) {
    const summary = metrics.taxonomy_summary || metrics.taxonomySummary || {};
    const ranked = [
      ["genus", summary.genera],
      ["family", summary.families],
      ["order", summary.orders]
    ];

    for (const [rank, entries] of ranked) {
      const entry = Array.isArray(entries) ? entries.map(usableTaxonEntry).find(Boolean) : null;
      if (!entry) continue;
      const item = taxonDisplayEntry(entry, rank);
      const label = plainTaxonLabel(item.common || item.scientific);
      if (label) return { label, rank, count: item.count };
    }

    const iconic = Object.entries(metrics.iconic_counts || {})
      .map(([name, count]) => ({ name, count: Number(count) || 0 }))
      .filter(entry => entry.count > 0 && !/^unknown$/i.test(entry.name))
      .sort((a, b) => b.count - a.count)[0];
    if (iconic) {
      const item = taxonDisplayEntry(iconic, "iconic_taxon");
      return { label: item.common, rank: "iconic_taxon", count: item.count };
    }

    return null;
  }

  function nicheFocusLabel(niche, fallback = "life") {
    const metrics = niche?.metrics || {};
    const explicit = plainTaxonLabel(niche?.taxon_focus?.label || "");

    const topSubject = topTaxonomySubject(metrics);
    if (topSubject?.label) return topSubject.label;
    if (explicit) return explicit;

    const activeLens = String(metrics.active_lens || window.__gwState?.activeLens || "").toLowerCase();
    if (activeLens === "breadth") return "mixed life";
    if (activeLens === "dominantlife") return "dominant life groups";
    return fallback;
  }

  function richNichePhrase(niche) {
    const metrics = niche?.metrics || {};
    const subject = titleSubjectCase(nicheFocusLabel(niche, "life"));
    const descriptor = lensDescriptor(metrics);

    if (!subject || subject === "life") {
      if (descriptor === "broad") return "Survey broad life diversity";
      if (descriptor === "genus-rich") return "Survey genus-rich life";
      return "Survey rich life";
    }

    if (descriptor === "broad") return `Survey broad ${subject} diversity`;
    if (descriptor === "seasonal") return `Survey seasonal ${subject}`;
    if (descriptor === "recent") return `Revisit rich ${subject}`;
    if (descriptor === "genus-rich") return `Survey genus-rich ${subject}`;
    if (descriptor === "well-watched") return `Survey well-watched ${subject}`;
    return `Survey rich ${subject}`;
  }

  function phraseForNiche(niche) {
    const type = String(niche.niche_type || "");
    const theme = String(niche.theme || "").toLowerCase();
    const focus = titleSubjectCase(nicheFocusLabel(niche, ""));

    if (niche.metrics?.algorithm === "heat_tendril_niche_v1") {
      return focus ? `Sample heat-corridor ${focus}` : "Sample heat-corridor life";
    }
    if (niche.metrics?.algorithm === "trail_corridor_niche_v1") {
      return focus ? `Sample trail-edge ${focus}` : "Sample trail-edge life";
    }
    if (niche.metrics?.algorithm === GROW_LOCAL_NICHE_RULE.version) {
      return focus ? `Grow ${focus}` : "Grow local life";
    }
    if (niche.metrics?.algorithm === CELL_SEEDED_NICHE_ALGORITHM) {
      const metrics = niche.metrics || {};
      if (metrics.quiet_seed) return "Mark quiet cell";
      if (Number(metrics.water_boundary_score || 0) >= 0.36 || Number(metrics.wet_edge_cells || 0) > 0) {
        return focus ? `Trace wet-edge ${focus}` : "Trace wet-edge life";
      }
      if (Number(metrics.road_bounded_cells || 0) > 0 || Number(metrics.blocked_edges?.road || 0) > 0) {
        return focus ? `Sample road-bounded ${focus}` : "Sample road-bounded life";
      }
      return focus ? `Sample cell-seeded ${focus}` : "Sample cell-seeded life";
    }
    if (type === "edge_habitat_niche" || theme.includes("wet")) return "Sample wet-edge plants";
    if (type === "taxon_specific_hotspot") return focus ? `Look for ${focus}` : "Look for focal taxa";
    if (type === "seasonal_hotspot") return focus ? `Revisit seasonal ${focus}` : "Revisit seasonal life";
    if (type === "recently_stale_hotspot") return "Revisit this stale hotspot";
    if (type === "high_richness_hotspot") return richNichePhrase(niche);
    if (theme.includes("sidewalk")) return "Survey sidewalk flora";
    return focus ? `Sample under-covered ${focus}` : "Sample under-covered life";
  }

  function buildNicheDisplayTitle(niche) {
    return abbreviateMapLabel(`${phraseForNiche(niche)} ${placeSuffix(niche.place_context || {})}`.replace(/\s+/g, " ").trim());
  }

  function retitleNiche(niche) {
    const title = buildNicheDisplayTitle(niche);
    return {
      ...niche,
      title,
      short_title: title.replace(/^(Sample|Survey|Look for|Revisit|Check)\s+/i, "")
    };
  }

  function evidenceFor(type, metrics, placeContext) {
    const facts = [];
    const constrained = metrics.algorithm === "constrained_geometry_niche_v1";
    const trailCorridor = metrics.algorithm === "trail_corridor_niche_v1";
    const heatTendril = metrics.algorithm === "heat_tendril_niche_v1";
    const thresholdSubdivide = metrics.algorithm === THRESHOLD_SUBDIVIDE_RULE.version;
    const growLocal = metrics.algorithm === GROW_LOCAL_NICHE_RULE.version;
    const cellSeeded = metrics.algorithm === CELL_SEEDED_NICHE_ALGORITHM;
    if (growLocal) {
      const tileCells = Number(metrics.grow_tile_cells || GROW_LOCAL_NICHE_RULE.defaultTileCells);
      const tileCount = Math.max(1, Number(metrics.grow_tile_count || 1));
      const tilePhrase = tileCount > 1 ? `${tileCount} neighboring ${tileCells}x${tileCells} active-lens tiles` : `a globally anchored ${tileCells}x${tileCells} active-lens tile`;
      facts.push(`This temporary niche is ${tilePhrase} with ${Number(metrics.grow_occupied_pct || 0).toFixed(1)}% occupied evidence squares.`);
      if (Number(metrics.grow_structure_clip?.clipped_cells || 0) > 0) {
        facts.push(`${Math.round(Number(metrics.grow_structure_clip.clipped_cells || 0))} grid cells overlapping cached OSM building outlines were clipped before tile merging.`);
      }
    }
    if (cellSeeded) {
      facts.push(`This niche was computed at runtime from clicked global 20 ft cell ${metrics.clicked_cell || "unknown"}; the parsed seed was the strongest cell within ${Number(metrics.seed_search_radius_cells || 5)} cells.`);
      facts.push(`The growth algorithm linked ${Number(metrics.component_cell_count || metrics.totalCells || 1)} contiguous biodiversity squares, with diagonal links weighted weakly.`);
      if (Number(metrics.blocked_edges?.road || 0) > 0 || Number(metrics.blocked_edges?.structure || 0) > 0) {
        facts.push("Cached OSM roads and structures cut off attempted expansion edges.");
      }
      if (Number(metrics.water_boundary_score || 0) > 0) {
        facts.push("OSM water-boundary interpretation shaped the biodiversity growth score.");
      }
    }
    if (Number(metrics.lensPeakAbsZ) > 0) {
      facts.push(heatTendril
        ? metrics.heat_path_length_m
          ? `This niche follows a solved Lens-heat path vector about ${Math.round(Number(metrics.heat_path_length_m || 0))} m long.`
          : `This niche follows a long, thin Lens-heat tendril inside the current FOV.`
        : trailCorridor
        ? `This niche follows a hot trail-edge run about ${Math.round(Number(metrics.trail_length_m || 0))} m long.`
        : growLocal
        ? `No z cutoff was applied; the tile used the active HUD Explorer lens directly.`
        : thresholdSubdivide
        ? `This face comes from HUD-parity heat cells with z >= ${Number(metrics.z_threshold || state.controls.lensZThreshold || 2.5).toFixed(1)}, flood-filled and clipped to a ${THRESHOLD_SUBDIVIDE_RULE.tileCells}x${THRESHOLD_SUBDIVIDE_RULE.tileCells} grid tile.`
        : constrained
        ? `This niche is anchored to a local Lens peak and constrained by radius, area, shape, and boundary complexity.`
        : `This locus is part of an absolute Z > ${Number(state.controls.lensZThreshold || 2.5).toFixed(1)} connected component in the current Lens heatmap.`);
    }
    if (metrics.grow_osm_subdivision?.enabled) {
      facts.push(metrics.grow_osm_subdivision?.vector_cut
        ? "Cached OSM road and path centerlines subdivided this Grow niche as vector faces; structure footprints were ignored."
        : "Cached OSM roads and paths subdivided this Grow niche; structure footprints were ignored.");
    } else if (metrics.osm_transform?.enabled) {
      facts.push("Cached OSM roads, paths, and structure footprints subdivided this niche into map-fitted surviving areas.");
    }
    if (metrics.species > 0) facts.push(`Nearby cells contain ${Math.round(metrics.species)} genus/species signals.`);
    if (metrics.activeRatio < 0.35) facts.push("This cell cluster is under-sampled relative to its walking context.");
    if (daysSince(metrics.latestObservedMs) > 120) facts.push("The area has not been sampled recently.");
    if (metrics.observers >= 3) facts.push("Multiple observers have contributed records nearby.");
    if (placeContext?.primary_label) facts.push(`The niche is tied to ${placeContext.primary_label}.`);
    if (placeContext?.geometry_context?.label_phrase) {
      facts.push(`The niche shape is elongated and tracks ${placeContext.geometry_context.label_phrase}.`);
    }

    if (type === "edge_habitat_niche") {
      facts.unshift(heatTendril
        ? "A narrow heatmap corridor may mark a walkable line of concentrated observations."
        : "A nearby edge feature may concentrate plants, insects, or fungi.");
    }

    return {
      human: facts.slice(0, 4),
      machine: {
        count: metrics.count,
        species: metrics.species,
        observers: metrics.observers,
        active_ratio: metrics.activeRatio,
        stale_days: Math.round(daysSince(metrics.latestObservedMs))
      }
    };
  }

  function scoreWeights() {
    const emphasis = state.controls.emphasis;
    if (emphasis === "under_sampled") return { bio: 0.18, need: 0.48, stale: 0.16, edge: 0.18 };
    if (emphasis === "richness") return { bio: 0.5, need: 0.16, stale: 0.12, edge: 0.22 };
    if (emphasis === "edge") return { bio: 0.2, need: 0.18, stale: 0.12, edge: 0.5 };
    return { bio: 0.34, need: 0.28, stale: 0.14, edge: 0.24 };
  }

  function lensSignalMap(origin) {
    const radiusCells = isFovSampling()
      ? 0
      : Math.max(6, Math.round(numericRadiusM(500) / GRID_SIZE_M));
    const bounds = getScanCellBounds(origin, radiusCells);
    const cells = new Map();
    const values = [];
    const here = L.latLng(origin.lat, origin.lng);
    const radiusM = numericRadiusM(500);

    for (let ix = bounds.minIx; ix <= bounds.maxIx; ix++) {
      for (let iy = bounds.minIy; iy <= bounds.maxIy; iy++) {
        const ll = latLngForCell(ix, iy);
        const distanceM = here.distanceTo(L.latLng(ll.lat, ll.lng));
        if (!isFovSampling() && distanceM > radiusM) continue;

        const metrics = displayMetrics(ix, iy);
        const key = `${ix},${iy}`;
        const signal = currentLensSignal(metrics);
        const cell = { key, ix, iy, lat: ll.lat, lng: ll.lng, distanceM, metrics, signal, z: 0 };
        cells.set(key, cell);
        values.push(signal);
      }
    }

    const stats = zStats(values);
    if (stats) {
      for (const cell of cells.values()) {
        cell.z = stats.sd > 0 ? (cell.signal - stats.mean) / stats.sd : 0;
      }
    }

    return { cells, values, bounds };
  }

  function fovLensSignalMap(origin) {
    const bounds = getFovCellBounds();
    const cells = new Map();
    const values = [];
    const here = L.latLng(origin.lat, origin.lng);

    for (let ix = bounds.minIx; ix <= bounds.maxIx; ix++) {
      for (let iy = bounds.minIy; iy <= bounds.maxIy; iy++) {
        const ll = latLngForCell(ix, iy);
        const metrics = displayMetrics(ix, iy);
        const signal = currentLensSignal(metrics);
        const cell = {
          key: `${ix},${iy}`,
          ix,
          iy,
          lat: ll.lat,
          lng: ll.lng,
          distanceM: here.distanceTo(L.latLng(ll.lat, ll.lng)),
          metrics,
          signal,
          z: 0
        };
        cells.set(cell.key, cell);
        values.push(signal);
      }
    }

    const stats = zStats(values);
    if (stats) {
      for (const cell of cells.values()) {
        cell.z = stats.sd > 0 ? (cell.signal - stats.mean) / stats.sd : 0;
      }
    }

    return { cells, values, bounds, stats, signalSource: "active_lens_fov" };
  }

  function lensCellForTile(signalData, origin, ix, iy) {
    const key = `${ix},${iy}`;
    const existing = signalData?.cells?.get?.(key);
    if (existing) return existing;

    const ll = latLngForCell(ix, iy);
    const metrics = displayMetrics(ix, iy);
    const signal = currentLensSignal(metrics);
    const stats = signalData?.stats || null;
    return {
      key,
      ix,
      iy,
      lat: ll.lat,
      lng: ll.lng,
      distanceM: L.latLng(origin.lat, origin.lng).distanceTo(L.latLng(ll.lat, ll.lng)),
      metrics,
      signal,
      z: stats?.sd > 0 ? (signal - stats.mean) / stats.sd : 0
    };
  }

  function hudHeatZSignalMap(origin) {
    const radiusCells = isFovSampling()
      ? 0
      : Math.max(6, Math.round(numericRadiusM(500) / GRID_SIZE_M));
    const bounds = getScanCellBounds(origin, radiusCells);
    const cells = new Map();
    const values = [];
    const here = L.latLng(origin.lat, origin.lng);
    const radiusM = numericRadiusM(500);

    for (let ix = bounds.minIx; ix <= bounds.maxIx; ix++) {
      for (let iy = bounds.minIy; iy <= bounds.maxIy; iy++) {
        const ll = latLngForCell(ix, iy);
        const distanceM = here.distanceTo(L.latLng(ll.lat, ll.lng));
        if (!isFovSampling() && distanceM > radiusM) continue;

        const metrics = displayMetrics(ix, iy);
        const key = `${ix},${iy}`;
        const signal = currentHudHeatValue(metrics);
        const cell = { key, ix, iy, lat: ll.lat, lng: ll.lng, distanceM, metrics, signal, z: 0 };
        cells.set(key, cell);
        if (signal > 0) values.push(signal);
      }
    }

    const stats = zStats(values);
    if (stats) {
      for (const cell of cells.values()) {
        cell.z = cell.signal > 0 && stats.sd > 0
          ? (cell.signal - stats.mean) / stats.sd
          : 0;
      }
    }

    return { cells, values, bounds, stats, signalSource: "hud_heat_value" };
  }

  function zStats(values) {
    const nums = values.map(Number).filter(Number.isFinite);
    if (!nums.length) return null;
    const mean = nums.reduce((sum, value) => sum + value, 0) / nums.length;
    const variance = nums.reduce((sum, value) => {
      const d = value - mean;
      return sum + d * d;
    }, 0) / nums.length;
    return { mean, sd: Math.sqrt(variance) };
  }

  function zThresholdMask(signalData) {
    const threshold = Number.isFinite(Number(state.controls.lensZThreshold))
      ? Number(state.controls.lensZThreshold)
      : 2.5;

    return new Set(
      [...signalData.cells.values()]
        .filter(cell => Math.abs(cell.z) > threshold)
        .map(cell => cell.key)
    );
  }

  function connectedComponents(signalData) {
    const mask = zThresholdMask(signalData);
    const minCells = Math.max(1, Math.min(100, Number(state.controls.componentMinCells) || 10));
    const visited = new Set();
    const components = [];
    const offsets = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0],           [1, 0],
      [-1, 1],  [0, 1],  [1, 1]
    ];

    for (const key of mask) {
      if (visited.has(key)) continue;

      const stack = [key];
      const members = [];
      visited.add(key);

      while (stack.length) {
        const currentKey = stack.pop();
        const cell = signalData.cells.get(currentKey);
        if (!cell) continue;
        members.push(cell);

        for (const [dx, dy] of offsets) {
          const nextKey = `${cell.ix + dx},${cell.iy + dy}`;
          if (!mask.has(nextKey) || visited.has(nextKey)) continue;
          visited.add(nextKey);
          stack.push(nextKey);
        }
      }

      if (members.length >= minCells) {
        const peak = members.reduce((best, cell) => (
          !best || Math.abs(cell.z) > Math.abs(best.z) ? cell : best
        ), null);

        components.push({
          peak,
          members,
          peakSignal: peak?.signal || 0,
          peakZ: peak?.z || 0,
          peakAbsZ: Math.abs(peak?.z || 0),
          meanSignal: members.reduce((sum, cell) => sum + cell.signal, 0) / members.length,
          meanZ: members.reduce((sum, cell) => sum + cell.z, 0) / members.length,
          meanAbsZ: members.reduce((sum, cell) => sum + Math.abs(cell.z), 0) / members.length,
          componentCellCount: members.length
        });
      }
    }

    const maxCells = Math.max(1, ...components.map((component) => Number(component.componentCellCount) || 0));
    const maxMeanAbsZ = Math.max(0.01, ...components.map((component) => Number(component.meanAbsZ) || 0));

    return components
      .map((component) => {
        const sizeScore = clamp01((Number(component.componentCellCount) || 0) / maxCells);
        const peakScore = clamp01((Number(component.meanAbsZ) || 0) / maxMeanAbsZ);
        return {
          ...component,
          clusterSizeScore: sizeScore,
          clusterPeakScore: peakScore,
          clusterPreferenceScore: clamp01((sizeScore + peakScore) / 2)
        };
      })
      .sort((a, b) =>
        b.clusterPreferenceScore - a.clusterPreferenceScore ||
        b.componentCellCount - a.componentCellCount ||
        b.meanAbsZ - a.meanAbsZ ||
        b.peakAbsZ - a.peakAbsZ
      );
  }

  function thresholdSubdivideMask(signalData) {
    const threshold = Number.isFinite(Number(state.controls.lensZThreshold))
      ? Number(state.controls.lensZThreshold)
      : 2.5;

    return new Set(
      [...signalData.cells.values()]
        .filter(cell => Number(cell.signal || 0) > 0 && Number(cell.z || 0) >= threshold)
        .map(cell => cell.key)
    );
  }

  function componentStatsFromMembers(members = []) {
    const peak = members.reduce((best, cell) => (
      !best ||
      Number(cell.z || 0) > Number(best.z || 0) ||
      (Number(cell.z || 0) === Number(best.z || 0) && Number(cell.signal || 0) > Number(best.signal || 0))
        ? cell
        : best
    ), null);

    if (!peak || !members.length) return null;
    const meanSignal = members.reduce((sum, cell) => sum + Number(cell.signal || 0), 0) / members.length;
    const meanZ = members.reduce((sum, cell) => sum + Number(cell.z || 0), 0) / members.length;
    const meanAbsZ = members.reduce((sum, cell) => sum + Math.abs(Number(cell.z || 0)), 0) / members.length;

    return {
      peak,
      members,
      peakSignal: Number(peak.signal || 0),
      peakZ: Number(peak.z || 0),
      peakAbsZ: Math.abs(Number(peak.z || 0)),
      meanSignal,
      meanZ,
      meanAbsZ,
      componentCellCount: members.length
    };
  }

  function thresholdFloodFillComponents(signalData) {
    const mask = thresholdSubdivideMask(signalData);
    const minCells = Math.max(1, Math.min(100, Number(state.controls.componentMinCells) || 10));
    const visited = new Set();
    const components = [];
    const offsets = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0],           [1, 0],
      [-1, 1],  [0, 1],  [1, 1]
    ];

    for (const key of mask) {
      if (visited.has(key)) continue;
      const stack = [key];
      const members = [];
      visited.add(key);

      while (stack.length) {
        const currentKey = stack.pop();
        const cell = signalData.cells.get(currentKey);
        if (!cell) continue;
        members.push(cell);

        for (const [dx, dy] of offsets) {
          const nextKey = `${cell.ix + dx},${cell.iy + dy}`;
          if (!mask.has(nextKey) || visited.has(nextKey)) continue;
          visited.add(nextKey);
          stack.push(nextKey);
        }
      }

      if (members.length < minCells) continue;
      const component = componentStatsFromMembers(members);
      if (component) components.push(component);
    }

    return components.sort((a, b) =>
      b.peakZ - a.peakZ ||
      b.meanZ - a.meanZ ||
      b.componentCellCount - a.componentCellCount
    );
  }

  function thresholdTileAnchor(value, size = THRESHOLD_SUBDIVIDE_RULE.tileCells) {
    return Math.floor(Number(value) / size) * size;
  }

  function subdivideThresholdComponent(component) {
    const tileSize = Math.max(1, Number(THRESHOLD_SUBDIVIDE_RULE.tileCells) || 5);
    const minCells = Math.max(1, Math.min(100, Number(state.controls.componentMinCells) || 10));
    const groups = new Map();

    for (const cell of component.members || []) {
      const anchorIx = thresholdTileAnchor(cell.ix, tileSize);
      const anchorIy = thresholdTileAnchor(cell.iy, tileSize);
      const key = `${anchorIx},${anchorIy}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(cell);
    }

    const allTiles = [...groups.entries()]
      .map(([tileKey, members]) => ({ tileKey, members }))
      .sort((a, b) => b.members.length - a.members.length || a.tileKey.localeCompare(b.tileKey));
    const surviving = allTiles.filter(tile => tile.members.length >= minCells);
    const selectedTiles = surviving.length
      ? surviving
      : allTiles.slice(0, 1);

    return selectedTiles
      .map(tile => {
        const next = componentStatsFromMembers(tile.members);
        if (!next) return null;
        return {
          ...next,
          thresholdParentCellCount: component.members.length,
          thresholdTileKey: tile.tileKey,
          thresholdTileCount: allTiles.length,
          thresholdDroppedTileCount: Math.max(0, allTiles.length - selectedTiles.length)
        };
      })
      .filter(Boolean);
  }

  function aggregateComponent(component) {
    const metrics = {
      count: 0,
      species: 0,
      observers: 0,
      activeCells: 0,
      emptyCells: 0,
      captive: 0,
      month_totals: Array(12).fill(0),
      monthTotalsExactCells: 0,
      monthTotalsMissingCells: 0,
      iconic_counts: {},
      latestObservedMs: 0,
      lensPeakSignal: component.peakSignal,
      lensMeanSignal: component.meanSignal,
      lensPeakZ: component.peakZ,
      lensPeakAbsZ: component.peakAbsZ,
      lensMeanZ: component.meanZ,
      lensMeanAbsZ: component.meanAbsZ,
      clusterSizeScore: component.clusterSizeScore,
      clusterPeakScore: component.clusterPeakScore,
      clusterPreferenceScore: component.clusterPreferenceScore,
      componentCellCount: component.componentCellCount
    };
    let sumIx = 0;
    let sumIy = 0;
    let minIx = Infinity;
    let minIy = Infinity;
    let maxIx = -Infinity;
    let maxIy = -Infinity;

    for (const cell of component.members) {
      sumIx += cell.ix;
      sumIy += cell.iy;
      minIx = Math.min(minIx, cell.ix);
      minIy = Math.min(minIy, cell.iy);
      maxIx = Math.max(maxIx, cell.ix);
      maxIy = Math.max(maxIy, cell.iy);

      const m = cell.metrics || {};
      metrics.count += Number(m.count) || 0;
      metrics.species += Number(m.species) || 0;
      metrics.observers += Number(m.observers) || 0;
      metrics.captive += Number(m.n_captive) || 0;
      metrics.latestObservedMs = Math.max(metrics.latestObservedMs, Number(m.last_observed_ms) || 0);

      if (Array.isArray(m.month_totals) && m.month_totals.some(v => Number(v) > 0)) {
        m.month_totals.slice(0, 12).forEach((value, idx) => {
          metrics.month_totals[idx] += Number(value) || 0;
        });
        metrics.monthTotalsExactCells += 1;
      } else {
        metrics.monthTotalsMissingCells += 1;
      }

      for (const [key, value] of Object.entries(m.iconic_counts || {})) {
        metrics.iconic_counts[key] = (metrics.iconic_counts[key] || 0) + (Number(value) || 0);
      }

      if (!Object.keys(m.iconic_counts || {}).length && m.dominant_iconic) {
        metrics.iconic_counts[m.dominant_iconic] =
          (metrics.iconic_counts[m.dominant_iconic] || 0) + (Number(m.count) || 1);
      }

      if ((Number(m.count) || 0) > 0) metrics.activeCells += 1;
      else metrics.emptyCells += 1;
    }

    metrics.totalCells = component.members.length;
    metrics.meanObs = metrics.totalCells ? metrics.count / metrics.totalCells : 0;
    metrics.meanSpecies = metrics.totalCells ? metrics.species / metrics.totalCells : 0;
    metrics.activeRatio = metrics.totalCells ? metrics.activeCells / metrics.totalCells : 0;

    const ix = Math.round(metrics.totalCells ? sumIx / metrics.totalCells : component.peak.ix);
    const iy = Math.round(metrics.totalCells ? sumIy / metrics.totalCells : component.peak.iy);

    const componentId = hashString(component.members
      .map(cell => cell.key)
      .sort()
      .join("|"));

    return {
      componentId,
      cells: component.members.map(cell => cell.key),
      center: latLngForCell(ix, iy),
      ix,
      iy,
      minIx,
      minIy,
      maxIx,
      maxIy,
      metrics
    };
  }

  function detectEdgeScore(lat, lng) {
    const groups = window.GridWildOsmFeaturesLayer?.getFeatures?.() || {};
    let best = 0;
    for (const kind of ["water", "parks", "trails", "buildings"]) {
      for (const feature of groups[kind] || []) {
        const d = minDistanceToFeature(lat, lng, feature);
        const max = kind === "water" ? 100 : kind === "trails" ? 65 : 85;
        if (d <= max) best = Math.max(best, 1 - d / max);
      }
    }
    return clamp01(best);
  }

  function chooseType(scores, metrics, placeContext) {
    const typeLabel = String(placeContext.place_type || "").toLowerCase();
    if (scores.edge > 0.62 || typeLabel.includes("stream") || typeLabel.includes("water")) return "edge_habitat_niche";
    if (scores.need > 0.7) return "under_sampled_nearby_opportunity";
    if (scores.stale > 0.65 && metrics.count > 0) return "recently_stale_hotspot";
    if (scores.bio > 0.62) return "high_richness_hotspot";
    return "under_sampled_nearby_opportunity";
  }

  function themeFor(type, placeContext) {
    const placeType = String(placeContext.place_type || "").toLowerCase();
    if (type === "edge_habitat_niche" && (placeType.includes("stream") || placeType.includes("water"))) return "Plants / wet edge";
    if (type === "edge_habitat_niche") return "Edge habitat";
    if (type === "high_richness_hotspot") return "High richness";
    if (type === "recently_stale_hotspot") return "Recently stale";
    if (placeType.includes("building")) return "Urban microhabitat";
    return "Under-sampled";
  }

  function thresholdSubdivideNicheFromComponent({ component, origin, caps, activeLens, heatMetric, chunkIndex, tileIndex }) {
    const agg = aggregateComponent(component);
    const ll = agg.center;
    const distanceM = L.latLng(origin.lat, origin.lng).distanceTo(L.latLng(ll.lat, ll.lng));
    const m = agg.metrics;
    const weights = scoreWeights();
    const heatCap =
      heatMetric === "species" ? caps.species :
      heatMetric === "observers" ? caps.observers :
      caps.count;
    const bio = clamp01((Math.log1p(m.species) / Math.log1p(caps.species * 4)) * 0.66 + m.activeRatio * 0.16 + clamp01(m.lensPeakZ / 5) * 0.18);
    const need = clamp01((1 - m.activeRatio) * 0.54 + (m.count > 0 && m.count < caps.count ? 0.22 : 0) + (m.observers <= 1 ? 0.09 : 0) + (1 - clamp01(m.lensMeanSignal / Math.max(1, heatCap))) * 0.15);
    const stale = clamp01(daysSince(m.latestObservedMs) / 240);
    const edge = detectEdgeScore(ll.lat, ll.lng);
    const zStrength = clamp01((Number(m.lensPeakZ) || 0) / 5);
    const componentSizeScore = clamp01(Math.log1p(Number(m.componentCellCount) || 1) / Math.log1p(THRESHOLD_SUBDIVIDE_RULE.tileCells ** 2));
    const clusterPriority = clamp01(zStrength * 0.48 + componentSizeScore * 0.24 + clamp01(Number(m.lensMeanZ || 0) / 4) * 0.18 + m.activeRatio * 0.1);
    const questability = clamp01(
      clusterPriority * 0.38 +
      zStrength * 0.18 +
      bio * weights.bio * 0.72 +
      need * weights.need * 0.72 +
      stale * weights.stale * 0.72 +
      edge * weights.edge * 0.72
    );
    const placeContext = resolveGeometricPlaceContext(
      ll.lat,
      ll.lng,
      component,
      resolvePlaceContext(ll.lat, ll.lng)
    );
    const nicheType = chooseType({ bio, need, stale, edge }, m, placeContext);
    const geometryType = "threshold-subdivide-tile";
    const scaleClass = "threshold tile";
    const theme = `${themeFor(nicheType, placeContext)} / ${scaleClass}`;
    const initialFocus = topTaxonomySubject({
      ...m,
      active_lens: activeLens,
      heat_metric: heatMetric
    });
    const taxonFocus = theme.includes("Plants") || nicheType === "edge_habitat_niche"
      ? { iconic: "Plantae", label: "plants" }
      : initialFocus?.label
        ? { iconic: initialFocus.rank || "Any", label: titleSubjectCase(initialFocus.label), source_rank: initialFocus.rank || null }
        : { iconic: "Any", label: "life" };
    const coreCell = component.peak ? `${component.peak.ix},${component.peak.iy}` : "";
    const threshold = Number(state.controls.lensZThreshold || 2.5);
    const sourceKey = [
      "gw-local-niche-v4",
      activeLens,
      heatMetric,
      isFovSampling() ? "fov" : `${numericRadiusM(500)}m`,
      "threshold-subdivide",
      `z${threshold.toFixed(1)}`,
      component.thresholdTileKey || `chunk-${chunkIndex}-tile-${tileIndex}`,
      agg.componentId
    ].join(":");
    const nextMetrics = {
      ...m,
      algorithm: THRESHOLD_SUBDIVIDE_RULE.version,
      active_lens: activeLens,
      heat_metric: heatMetric,
      sampling_extent: isFovSampling() ? "fov" : "radius_m",
      sampling_radius_m: isFovSampling() ? null : numericRadiusM(500),
      emphasis: state.controls.emphasis,
      z_threshold: threshold,
      threshold_direction: "above",
      threshold_signal_source: "hud_heat_value",
      threshold_tile_cells: THRESHOLD_SUBDIVIDE_RULE.tileCells,
      threshold_tile_key: component.thresholdTileKey || null,
      threshold_parent_cell_count: Number(component.thresholdParentCellCount || agg.cells.length),
      threshold_parent_tile_count: Number(component.thresholdTileCount || 1),
      threshold_dropped_tile_count: Number(component.thresholdDroppedTileCount || 0),
      threshold_chunk_index: Number(chunkIndex || 0),
      threshold_tile_index: Number(tileIndex || 0),
      core_cell: coreCell,
      peak_cell: coreCell,
      peak_signal: Number((m.lensPeakSignal || 0).toFixed(3)),
      peak_z: Number((m.lensPeakZ || 0).toFixed(3)),
      peak_abs_z: Number((m.lensPeakAbsZ || 0).toFixed(3)),
      component_id: agg.componentId,
      component_cell_count: Number(m.componentCellCount || agg.cells.length),
      cluster_priority_score: Number(clusterPriority.toFixed(3)),
      geometry_type: geometryType,
      scale_class: scaleClass,
      display_geometry: geometryType,
      interaction_radius_m: Math.round(Math.max(26, Math.sqrt(Math.max(1, agg.cells.length)) * GRID_SIZE_M * 1.25)),
      geometry_context: placeContext.geometry_context || null,
      member_cells_are_analysis_object: true
    };

    const niche = {
      source_key: sourceKey,
      title: "",
      short_title: "",
      description: `A GridWild interpreted sampling opportunity generated from HUD-parity z-thresholded heat cells and ${THRESHOLD_SUBDIVIDE_RULE.tileCells}x${THRESHOLD_SUBDIVIDE_RULE.tileCells} grid subdivision.`,
      niche_type: nicheType,
      theme,
      centroid_lat: ll.lat,
      centroid_lng: ll.lng,
      geometry: boundsForCells(agg.minIx, agg.minIy, agg.maxIx, agg.maxIy),
      grid_cell_ids: agg.cells,
      radius_m: Math.round(Math.max(18, Math.sqrt(Math.max(1, agg.cells.length)) * GRID_SIZE_M * 1.08)),
      scale_level: `threshold-subdivide:${scaleClass}`,
      taxon_focus: taxonFocus,
      seasonal_profile: { mode: "threshold_subdivide_runtime_v1" },
      evidence_summary: evidenceFor(nicheType, nextMetrics, placeContext),
      metrics: nextMetrics,
      confidence: clamp01(0.34 + placeContext.label_confidence * 0.18 + questability * 0.28 + clusterPriority * 0.2),
      novelty_score: need,
      sampling_need_score: need,
      biodiversity_score: bio,
      questability_score: questability,
      place_context: placeContext,
      primary_place_label: placeContext.primary_label || null,
      secondary_place_label: placeContext.secondary_label || null,
      place_label_confidence: placeContext.label_confidence || 0,
      generated_by: "gridwild_threshold_subdivide_niche_v1",
      visibility: "public",
      status: "active",
      distance_m: Math.round(distanceM),
      comment_count: 0,
      _runtimeOnly: true
    };

    niche.title = buildNicheDisplayTitle(niche);
    niche.short_title = niche.title.replace(/^(Sample|Survey|Look for|Revisit|Check)\s+/i, "");
    return niche;
  }

  function generateThresholdSubdivideCandidates(origin = getOrigin()) {
    if (typeof map === "undefined" || typeof GRID_SIZE_M === "undefined") return [];

    const signalData = hudHeatZSignalMap(origin);
    const center = cellForLatLng(origin.lat, origin.lng);
    const capRadiusCells = isFovSampling()
      ? Math.max(
          6,
          Math.ceil(Math.max(
            signalData.bounds.maxIx - signalData.bounds.minIx,
            signalData.bounds.maxIy - signalData.bounds.minIy
          ) / 2)
        )
      : Math.max(6, Math.round(numericRadiusM(500) / GRID_SIZE_M));
    const caps = scanCaps(center, capRadiusCells);
    const activeLens = window.__gwState?.activeLens || "classic";
    const heatMetric = window.__gwState?.heatMetric || "count";
    const chunks = thresholdFloodFillComponents(signalData);
    const components = [];
    const rows = [];
    let droppedTiles = 0;

    chunks.forEach((chunk, chunkIndex) => {
      const tiles = subdivideThresholdComponent(chunk);
      droppedTiles += tiles.length ? Number(tiles[0].thresholdDroppedTileCount || 0) : 0;
      tiles.forEach((component, tileIndex) => {
        components.push(component);
        rows.push(thresholdSubdivideNicheFromComponent({
          component,
          origin,
          caps,
          activeLens,
          heatMetric,
          chunkIndex,
          tileIndex
        }));
      });
    });

    const sortedRows = rows
      .filter(Boolean)
      .sort((a, b) =>
        nicheClusterPriority(b) - nicheClusterPriority(a) ||
        Number(b.questability_score || 0) - Number(a.questability_score || 0)
      );

    state.detectorDebug = {
      signalData,
      components,
      zThreshold: Number(state.controls.lensZThreshold || 2.5),
      thresholdMode: "above",
      sampledCellCount: signalData.cells.size,
      thresholdCellCount: thresholdSubdivideMask(signalData).size,
      constrainedGeometry: {
        algorithm: THRESHOLD_SUBDIVIDE_RULE.version,
        activeLens,
        heatMetric,
        approach: "threshold_subdivide",
        coreGrowthSkipped: true,
        thresholdDirection: "above",
        thresholdSignalSource: "hud_heat_value",
        threshold: Number(state.controls.lensZThreshold || 2.5),
        minCells: Math.max(1, Math.min(100, Number(state.controls.componentMinCells) || 10)),
        sourceChunks: chunks.length,
        resultCount: sortedRows.length,
        tileCells: THRESHOLD_SUBDIVIDE_RULE.tileCells,
        droppedTiles
      }
    };
    state.constrainedGeometryDebug = state.detectorDebug.constrainedGeometry;

    return sortedRows;
  }

  function growTileAnchor(value, tileSize) {
    return Math.floor(Number(value) / tileSize) * tileSize;
  }

  function growTileMembers(signalData, origin, anchorIx, anchorIy, tileSize) {
    const members = [];
    for (let ix = anchorIx; ix < anchorIx + tileSize; ix++) {
      for (let iy = anchorIy; iy < anchorIy + tileSize; iy++) {
        members.push(lensCellForTile(signalData, origin, ix, iy));
      }
    }
    return members;
  }

  function growTileKey(anchorIx, anchorIy) {
    return `${anchorIx},${anchorIy}`;
  }

  function growStructureClipContext() {
    if (state.controls.growClipStructuresEnabled !== true) return null;
    const context = buildOsmTransformationContext();
    const structuresByKey = new Map();
    for (const feature of context?.structures || []) {
      const key = feature?.feature?.id || `${feature.points?.[0]?.x?.toFixed?.(1)},${feature.points?.[0]?.y?.toFixed?.(1)}:${feature.points?.length || 0}`;
      structuresByKey.set(String(key), feature);
    }
    const structureLayerBuildings = window.GridWildStructuresLayer?.getBuildings?.() || [];
    for (const building of structureLayerBuildings) {
      const projected = projectOsmFeature(building, "structure");
      if (!projected || projected.points.length < 3) continue;
      const key = building?.id || `${projected.points[0]?.x?.toFixed?.(1)},${projected.points[0]?.y?.toFixed?.(1)}:${projected.points.length}`;
      if (!structuresByKey.has(String(key))) structuresByKey.set(String(key), projected);
    }
    const structures = [...structuresByKey.values()];
    return structures.length
      ? { structures, cacheStatus: context?.cacheStatus || null }
      : { structures: [], cacheStatus: context?.cacheStatus || null };
  }

  function growStructureCutoutPath(feature) {
    const ring = closedProjectedRing(feature?.points || []);
    if (ring.length < 4) return null;
    return meterPathToLatLng(ring);
  }

  function clipGrowMembersByStructures(members = [], clipContext = null) {
    const structures = clipContext?.structures || [];
    if (!structures.length || !members.length) {
      return {
        members,
        clippedCells: 0,
        structureFeatures: structures.length,
        cutoutPaths: []
      };
    }

    const bounds = membersBoundsMeters(members, GRID_SIZE_M);
    const relevant = structures.filter(feature => boundsOverlap(bounds, projectedBoundsForPoints(feature.points, GRID_SIZE_M)));
    if (!relevant.length) {
      return {
        members,
        clippedCells: 0,
        structureFeatures: structures.length,
        cutoutPaths: []
      };
    }

    const clipped = new Set();
    const cutoutPaths = [];
    for (const feature of relevant) {
      const ring = closedProjectedRing(feature.points);
      let touched = false;
      for (const cell of members) {
        if (clipped.has(cell.key)) continue;
        if (polygonOverlapsRect(ring, cellRectMeters(cell))) {
          clipped.add(cell.key);
          touched = true;
        }
      }
      if (touched) {
        const path = growStructureCutoutPath(feature);
        if (path?.length >= 4) cutoutPaths.push(path);
      }
    }

    return {
      members: members.filter(cell => !clipped.has(cell.key)),
      clippedCells: clipped.size,
      structureFeatures: structures.length,
      cutoutPaths
    };
  }

  function uniqueLatLngPaths(paths = []) {
    const byKey = new Map();
    for (const path of paths || []) {
      const normalized = normalizeLatLngPath(path);
      if (normalized.length < 2) continue;
      const key = normalized
        .map(([lat, lng]) => `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`)
        .join("|");
      if (!byKey.has(key)) byKey.set(key, normalized);
    }
    return [...byKey.values()].slice(0, 24);
  }

  function growTileGroupFromTiles(tiles = [], tileSize = growTileCells()) {
    const sortedTiles = tiles
      .slice()
      .sort((a, b) => a.anchorIx - b.anchorIx || a.anchorIy - b.anchorIy);
    const members = [];
    const seenCells = new Set();
    let occupiedCells = 0;
    let totalCells = 0;
    let originalTotalCells = 0;
    let preClipOccupiedCells = 0;
    let structureClippedCells = 0;
    let structureFeatures = 0;
    const structureCutoutPaths = [];

    for (const tile of sortedTiles) {
      occupiedCells += Number(tile.occupiedCells || 0);
      totalCells += Number(tile.totalCells || tile.members?.length || tileSize * tileSize);
      originalTotalCells += Number(tile.originalTotalCells || tile.totalCells || tile.members?.length || tileSize * tileSize);
      preClipOccupiedCells += Number(tile.preClipOccupiedCells || tile.occupiedCells || 0);
      structureClippedCells += Number(tile.structureClippedCells || 0);
      structureFeatures = Math.max(structureFeatures, Number(tile.structureFeatures || 0));
      structureCutoutPaths.push(...(tile.structureCutoutPaths || []));
      for (const cell of tile.members || []) {
        if (!cell?.key || seenCells.has(cell.key)) continue;
        seenCells.add(cell.key);
        members.push(cell);
      }
    }

    const component = componentStatsFromMembers(members);
    if (!component) return null;

    const tileAnchors = sortedTiles.map(tile => tile.tileKey || growTileKey(tile.anchorIx, tile.anchorIy));
    const occupiedRatio = totalCells ? occupiedCells / totalCells : 0;
    const sizeScore = clamp01(component.componentCellCount / Math.max(1, totalCells || tileSize * tileSize));
    const peakScore = clamp01(Number(component.peakSignal || 0));

    component.clusterSizeScore = sizeScore;
    component.clusterPeakScore = peakScore;
    component.clusterPreferenceScore = clamp01(occupiedRatio * 0.5 + peakScore * 0.3 + Number(component.meanSignal || 0) * 0.2);
    component.growTileAnchor = tileAnchors[0] || "";
    component.growTileAnchors = tileAnchors;
    component.growTileCount = sortedTiles.length;
    component.growOccupiedRatio = occupiedRatio;

    return {
      component,
      anchorIx: Math.min(...sortedTiles.map(tile => tile.anchorIx)),
      anchorIy: Math.min(...sortedTiles.map(tile => tile.anchorIy)),
      occupiedCells,
      occupiedRatio,
      tileAnchors,
      tileCount: sortedTiles.length,
      totalCells,
      originalTotalCells,
      preClipOccupiedCells,
      structureClippedCells,
      structureFeatures,
      structureCutoutPaths: uniqueLatLngPaths(structureCutoutPaths)
    };
  }

  function growTileGroupsFromTiles(tiles = [], tileSize = growTileCells(), mergeEnabled = false) {
    if (!mergeEnabled) {
      return tiles
        .map(tile => growTileGroupFromTiles([tile], tileSize))
        .filter(Boolean);
    }

    const byKey = new Map(tiles.map(tile => [tile.tileKey, tile]));
    const visited = new Set();
    const offsets = [
      [-tileSize, -tileSize], [0, -tileSize], [tileSize, -tileSize],
      [-tileSize, 0],                         [tileSize, 0],
      [-tileSize, tileSize],  [0, tileSize],  [tileSize, tileSize]
    ];
    const groups = [];

    for (const tile of tiles) {
      if (visited.has(tile.tileKey)) continue;
      const stack = [tile];
      const connected = [];
      visited.add(tile.tileKey);

      while (stack.length) {
        const current = stack.pop();
        connected.push(current);
        for (const [dx, dy] of offsets) {
          const nextKey = growTileKey(current.anchorIx + dx, current.anchorIy + dy);
          const next = byKey.get(nextKey);
          if (!next || visited.has(nextKey)) continue;
          visited.add(nextKey);
          stack.push(next);
        }
      }

      const group = growTileGroupFromTiles(connected, tileSize);
      if (group) groups.push(group);
    }

    return groups.sort((a, b) =>
      Number(b.component?.clusterPreferenceScore || 0) - Number(a.component?.clusterPreferenceScore || 0) ||
      Number(b.occupiedRatio || 0) - Number(a.occupiedRatio || 0) ||
      Number(b.tileCount || 0) - Number(a.tileCount || 0)
    );
  }

  function growLocalNicheFromComponent({
    component,
    origin,
    caps,
    activeLens,
    heatMetric,
    tileSize,
    anchorIx,
    anchorIy,
    occupiedCells,
    occupiedRatio,
    tileAnchors = null,
    tileCount = 1,
    totalCells = null,
    originalTotalCells = null,
    preClipOccupiedCells = null,
    structureClippedCells = 0,
    structureFeatures = 0,
    structureCutoutPaths = [],
    structureClipEnabled = false,
    mergeEnabled = false,
    tileIndex
  }) {
    const agg = aggregateComponent(component);
    const ll = agg.center;
    const distanceM = L.latLng(origin.lat, origin.lng).distanceTo(L.latLng(ll.lat, ll.lng));
    const m = agg.metrics;
    const weights = scoreWeights();
    const bio = clamp01((Math.log1p(m.species) / Math.log1p(caps.species * 4)) * 0.58 + occupiedRatio * 0.18 + m.lensMeanSignal * 0.24);
    const need = clamp01((1 - occupiedRatio) * 0.34 + (1 - m.lensMeanSignal) * 0.28 + (m.observers <= 1 ? 0.12 : 0) + (m.count > 0 && m.count < caps.count ? 0.18 : 0));
    const stale = clamp01(daysSince(m.latestObservedMs) / 240);
    const edge = detectEdgeScore(ll.lat, ll.lng);
    const lensPeak = clamp01(m.lensPeakSignal);
    const zStrength = clamp01((Number(m.lensPeakAbsZ) || 0) / 5);
    const clusterPriority = clamp01(occupiedRatio * 0.42 + m.lensMeanSignal * 0.28 + lensPeak * 0.18 + bio * 0.12);
    const questability = clamp01(
      clusterPriority * 0.38 +
      lensPeak * 0.08 +
      zStrength * 0.08 +
      bio * weights.bio * 0.72 +
      need * weights.need * 0.62 +
      stale * weights.stale * 0.58 +
      edge * weights.edge * 0.58
    );

    const placeContext = resolveGeometricPlaceContext(
      ll.lat,
      ll.lng,
      component,
      resolvePlaceContext(ll.lat, ll.lng)
    );
    const nicheType = chooseType({ bio, need, stale, edge }, m, placeContext);
    const anchorKey = growTileKey(anchorIx, anchorIy);
    const tileAnchorList = Array.isArray(tileAnchors) && tileAnchors.length ? tileAnchors : [anchorKey];
    const normalizedTileCount = Math.max(1, Number(tileCount || tileAnchorList.length || 1));
    const normalizedTotalCells = Math.max(1, Number(totalCells || normalizedTileCount * tileSize * tileSize));
    const normalizedOriginalCells = Math.max(normalizedTotalCells, Number(originalTotalCells || normalizedTotalCells));
    const clippedStructureCells = Math.max(0, Number(structureClippedCells || 0));
    const mergedTiles = mergeEnabled === true && normalizedTileCount > 1;
    const scaleClass = mergedTiles
      ? `${normalizedTileCount} merged ${tileSize}x${tileSize} grow tiles`
      : `${tileSize}x${tileSize} grow tile`;
    const theme = `${themeFor(nicheType, placeContext)} / ${mergedTiles ? "merged grow tiles" : "grow tile"}`;
    const initialFocus = topTaxonomySubject({
      ...m,
      active_lens: activeLens,
      heat_metric: heatMetric
    });
    const taxonFocus = theme.includes("Plants") || nicheType === "edge_habitat_niche"
      ? { iconic: "Plantae", label: "plants" }
      : initialFocus?.label
        ? { iconic: initialFocus.rank || "Any", label: titleSubjectCase(initialFocus.label), source_rank: initialFocus.rank || null }
        : { iconic: "Any", label: "life" };
    const coreCell = component.peak ? `${component.peak.ix},${component.peak.iy}` : anchorKey;
    const tileKeyPart = mergedTiles ? `merge-${hashString(tileAnchorList.join("|"))}` : anchorKey;
    const sourceKey = [
      "gw-local-niche-v4",
      activeLens,
      heatMetric,
      "fov",
      `${mergedTiles ? "grow-merge" : "grow"}${structureClipEnabled ? "-clip-structures" : ""}`,
      `${tileSize}x${tileSize}`,
      tileKeyPart
    ].join(":");
    const nextMetrics = {
      ...m,
      algorithm: GROW_LOCAL_NICHE_RULE.version,
      active_lens: activeLens,
      heat_metric: heatMetric,
      sampling_extent: "fov",
      sampling_radius_m: null,
      emphasis: state.controls.emphasis,
      core_cell: coreCell,
      peak_cell: coreCell,
      peak_signal: Number(lensPeak.toFixed(3)),
      peak_z: Number((m.lensPeakZ || 0).toFixed(3)),
      peak_abs_z: Number((m.lensPeakAbsZ || 0).toFixed(3)),
      component_id: agg.componentId,
      component_cell_count: Number(m.componentCellCount || agg.cells.length),
      cluster_priority_score: Number(clusterPriority.toFixed(3)),
      geometry_type: mergedTiles ? "grow-local-niche-merged-tiles" : "grow-local-niche-tile",
      scale_class: scaleClass,
      display_geometry: mergedTiles ? "grow-local-niche-merged-tiles" : "grow-local-niche-tile",
      interaction_radius_m: Math.round(Math.max(32, Math.sqrt(Math.max(1, agg.cells.length)) * GRID_SIZE_M * 0.72)),
      geometry_context: placeContext.geometry_context || null,
      member_cells_are_analysis_object: true,
      grow_tile_cells: tileSize,
      grow_tile_anchor: anchorKey,
      grow_tile_anchors: tileAnchorList,
      grow_tile_count: normalizedTileCount,
      grow_merge_enabled: mergedTiles,
      grow_clip_structures_enabled: structureClipEnabled === true,
      grow_tile_index: Number(tileIndex || 0),
      grow_occupied_cells: occupiedCells,
      grow_total_cells: normalizedTotalCells,
      grow_original_total_cells: normalizedOriginalCells,
      grow_pre_clip_occupied_cells: Math.max(0, Number(preClipOccupiedCells ?? occupiedCells)),
      grow_pre_clip_occupied_pct: Number(((Number(preClipOccupiedCells ?? occupiedCells) || 0) / Math.max(1, normalizedOriginalCells) * 100).toFixed(1)),
      grow_occupied_pct: Number((occupiedRatio * 100).toFixed(1)),
      grow_min_occupied_pct: growMinOccupiedPct(),
      grow_structure_clip: {
        enabled: structureClipEnabled === true,
        clipped_cells: clippedStructureCells,
        original_cell_count: normalizedOriginalCells,
        surviving_cell_count: normalizedTotalCells,
        structure_feature_count: Math.max(0, Number(structureFeatures || 0)),
        cutout_paths: uniqueLatLngPaths(structureCutoutPaths)
      },
      threshold_signal_source: "active_lens_fov",
      threshold_direction: "none"
    };

    const niche = {
      source_key: sourceKey,
      title: "",
      short_title: "",
      description: mergedTiles
        ? "A temporary GridWild niche grown from neighboring globally anchored active-lens FOV tiles."
        : "A temporary GridWild niche grown from a globally anchored active-lens FOV tile.",
      niche_type: nicheType,
      theme,
      centroid_lat: ll.lat,
      centroid_lng: ll.lng,
      geometry: boundsForCells(agg.minIx, agg.minIy, agg.maxIx, agg.maxIy),
      grid_cell_ids: agg.cells,
      radius_m: Math.round(Math.max(22, Math.sqrt(Math.max(1, agg.cells.length)) * GRID_SIZE_M * 0.66)),
      scale_level: `grow-local-niche:${scaleClass}`,
      taxon_focus: taxonFocus,
      seasonal_profile: { mode: "grow_local_niche_runtime_v1" },
      evidence_summary: evidenceFor(nicheType, nextMetrics, placeContext),
      metrics: nextMetrics,
      confidence: clamp01(0.32 + placeContext.label_confidence * 0.16 + questability * 0.3 + clusterPriority * 0.22),
      novelty_score: need,
      sampling_need_score: need,
      biodiversity_score: bio,
      questability_score: questability,
      place_context: placeContext,
      primary_place_label: placeContext.primary_label || null,
      secondary_place_label: placeContext.secondary_label || null,
      place_label_confidence: placeContext.label_confidence || 0,
      generated_by: "gridwild_grow_local_niche_v1",
      visibility: "public",
      status: "active",
      distance_m: Math.round(distanceM),
      comment_count: 0,
      _runtimeOnly: true
    };

    niche.title = buildNicheDisplayTitle(niche);
    niche.short_title = niche.title.replace(/^(Sample|Survey|Look for|Revisit|Check)\s+/i, "");
    return niche;
  }

  function generateGrowLocalNicheCandidates(origin = getOrigin()) {
    if (typeof map === "undefined" || typeof GRID_SIZE_M === "undefined") return [];

    const tileSize = growTileCells();
    const minOccupiedRatio = growMinOccupiedPct() / 100;
    const signalData = fovLensSignalMap(origin);
    const bounds = signalData.bounds || getFovCellBounds();
    const center = bounds.center || cellForLatLng(origin.lat, origin.lng);
    const capRadiusCells = Math.max(
      6,
      Math.ceil(Math.max(
        Math.abs(bounds.maxIx - bounds.minIx),
        Math.abs(bounds.maxIy - bounds.minIy)
      ) / 2)
    );
    const caps = scanCaps(center, capRadiusCells);
    const activeLens = window.__gwState?.activeLens || "classic";
    const heatMetric = window.__gwState?.heatMetric || "count";
    const mergeEnabled = state.controls.growMergeEnabled === true;
    const structureClipEnabled = state.controls.growClipStructuresEnabled === true;
    const structureClipContext = growStructureClipContext();
    const acceptedTiles = [];
    let droppedLowEvidence = 0;
    let droppedFullyClippedByStructures = 0;
    let structureClippedCells = 0;
    let structureClippedTiles = 0;
    let scannedTiles = 0;

    const startAnchorIx = growTileAnchor(bounds.minIx, tileSize);
    const endAnchorIx = growTileAnchor(bounds.maxIx, tileSize);
    const startAnchorIy = growTileAnchor(bounds.minIy, tileSize);
    const endAnchorIy = growTileAnchor(bounds.maxIy, tileSize);

    for (let anchorIx = startAnchorIx; anchorIx <= endAnchorIx; anchorIx += tileSize) {
      for (let anchorIy = startAnchorIy; anchorIy <= endAnchorIy; anchorIy += tileSize) {
        scannedTiles++;
        const rawMembers = growTileMembers(signalData, origin, anchorIx, anchorIy, tileSize);
        const preClipOccupiedCells = rawMembers.filter(cell => Number(cell.signal || 0) > 0).length;
        const preClipOccupiedRatio = rawMembers.length ? preClipOccupiedCells / rawMembers.length : 0;
        if (preClipOccupiedRatio < minOccupiedRatio) {
          droppedLowEvidence++;
          continue;
        }

        const clipped = structureClipEnabled
          ? clipGrowMembersByStructures(rawMembers, structureClipContext)
          : { members: rawMembers, clippedCells: 0, structureFeatures: structureClipContext?.structures?.length || 0, cutoutPaths: [] };
        if (clipped.clippedCells > 0) {
          structureClippedCells += clipped.clippedCells;
          structureClippedTiles += 1;
        }
        if (!clipped.members.length) {
          droppedFullyClippedByStructures++;
          continue;
        }

        const occupiedCells = clipped.members.filter(cell => Number(cell.signal || 0) > 0).length;
        const occupiedRatio = clipped.members.length ? occupiedCells / clipped.members.length : 0;
        acceptedTiles.push({
          anchorIx,
          anchorIy,
          tileKey: growTileKey(anchorIx, anchorIy),
          members: clipped.members,
          occupiedCells,
          occupiedRatio,
          totalCells: clipped.members.length,
          originalTotalCells: rawMembers.length,
          preClipOccupiedCells,
          preClipOccupiedRatio,
          structureClippedCells: clipped.clippedCells,
          structureFeatures: clipped.structureFeatures,
          structureCutoutPaths: clipped.cutoutPaths
        });
      }
    }

    const tileGroups = growTileGroupsFromTiles(acceptedTiles, tileSize, mergeEnabled);
    const components = tileGroups.map(group => group.component).filter(Boolean);
    const rows = tileGroups.map((group, tileIndex) => growLocalNicheFromComponent({
      component: group.component,
      origin,
      caps,
      activeLens,
      heatMetric,
      tileSize,
      anchorIx: group.anchorIx,
      anchorIy: group.anchorIy,
      occupiedCells: group.occupiedCells,
      occupiedRatio: group.occupiedRatio,
      tileAnchors: group.tileAnchors,
      tileCount: group.tileCount,
      totalCells: group.totalCells,
      originalTotalCells: group.originalTotalCells,
      preClipOccupiedCells: group.preClipOccupiedCells,
      structureClippedCells: group.structureClippedCells,
      structureFeatures: group.structureFeatures,
      structureCutoutPaths: group.structureCutoutPaths,
      structureClipEnabled,
      mergeEnabled,
      tileIndex
    }));

    const sortedRows = rows
      .filter(Boolean)
      .sort((a, b) =>
        nicheClusterPriority(b) - nicheClusterPriority(a) ||
        Number(b.metrics?.grow_occupied_pct || 0) - Number(a.metrics?.grow_occupied_pct || 0)
      );

    state.detectorDebug = {
      signalData,
      components,
      thresholdMode: "grow",
      sampledCellCount: signalData.cells.size,
      thresholdCellCount: signalData.values.filter(value => Number(value) > 0).length,
      constrainedGeometry: {
        algorithm: GROW_LOCAL_NICHE_RULE.version,
        activeLens,
        heatMetric,
        tileCells: tileSize,
        minOccupiedPct: growMinOccupiedPct(),
        structureClipEnabled,
        structureFeatureCount: structureClipContext?.structures?.length || 0,
        structureClippedCells,
        structureClippedTiles,
        mergeEnabled,
        scannedTiles,
        acceptedTiles: acceptedTiles.length,
        mergedGroups: tileGroups.length,
        droppedLowEvidence,
        droppedFullyClippedByStructures,
        resultCount: sortedRows.length
      }
    };
    state.constrainedGeometryDebug = state.detectorDebug.constrainedGeometry;

    return sortedRows;
  }

  function generateLocalCandidates(origin = getOrigin(), options = {}) {
    const mode = options.mode === "corridors" ? "corridors" : "niches";
    if (mode === "niches" && state.controls.thresholdSubdivideApproach === true) {
      return generateThresholdSubdivideCandidates(origin);
    }
    return generateConstrainedGeometryCandidates(origin, {
      includeConstrained: mode === "niches",
      includeCorridors: mode === "corridors"
    });
  }

  function parseGridCellKey(cellKey) {
    const [ix, iy] = String(cellKey || "").split(",").map(Number);
    if (!Number.isFinite(ix) || !Number.isFinite(iy)) return null;
    return { ix, iy, key: `${ix},${iy}` };
  }

  function cellMemberForKey(cellKey, sourceNiche = null) {
    const parsed = parseGridCellKey(cellKey);
    if (!parsed) return null;
    const ll = latLngForCell(parsed.ix, parsed.iy);
    const metrics = displayMetrics(parsed.ix, parsed.iy) || {};
    const signal = currentLensSignal(metrics);
    const peakKey = String(sourceNiche?.metrics?.peak_cell || sourceNiche?.metrics?.core_cell || "");
    const sourcePeakZ = Number(sourceNiche?.metrics?.peak_z ?? sourceNiche?.metrics?.lensPeakZ ?? 0);
    return {
      ...parsed,
      lat: ll.lat,
      lng: ll.lng,
      metrics,
      signal,
      z: parsed.key === peakKey && Number.isFinite(sourcePeakZ) ? sourcePeakZ : 0
    };
  }

  function membersForNicheCells(niche) {
    return (Array.isArray(niche?.grid_cell_ids) ? niche.grid_cell_ids : [])
      .map((cellKey) => cellMemberForKey(cellKey, niche))
      .filter(Boolean);
  }

  function projectedPointForLatLngLike(value) {
    if (typeof map === "undefined" || typeof L === "undefined") return null;
    const lat = Array.isArray(value) ? Number(value[0]) : Number(value?.lat);
    const lng = Array.isArray(value) ? Number(value[1]) : Number(value?.lng ?? value?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const projected = map.options.crs.project(L.latLng(lat, lng));
    return { x: projected.x, y: projected.y };
  }

  function projectedBoundsForPoints(points = [], padM = 0) {
    if (!points.length) return null;
    return {
      minX: Math.min(...points.map(point => point.x)) - padM,
      maxX: Math.max(...points.map(point => point.x)) + padM,
      minY: Math.min(...points.map(point => point.y)) - padM,
      maxY: Math.max(...points.map(point => point.y)) + padM
    };
  }

  function boundsOverlap(a, b) {
    if (!a || !b) return false;
    return a.minX <= b.maxX &&
      a.maxX >= b.minX &&
      a.minY <= b.maxY &&
      a.maxY >= b.minY;
  }

  function projectOsmFeature(feature, kind) {
    const points = (feature?.points || [])
      .map(projectedPointForLatLngLike)
      .filter(Boolean);
    if (points.length < 2) return null;
    return {
      feature,
      kind,
      points,
      closed: feature?.closed === true,
      bounds: projectedBoundsForPoints(points)
    };
  }

  function buildOsmTransformationContext() {
    if (typeof map === "undefined" || typeof L === "undefined") return null;
    const groups = window.GridWildOsmFeaturesLayer?.getFeatures?.() || {};
    const roadLike = [
      ...(Array.isArray(groups.roads) ? groups.roads.map(feature => projectOsmFeature(feature, "road")) : []),
      ...(Array.isArray(groups.trails) ? groups.trails.map(feature => projectOsmFeature(feature, "path")) : [])
    ].filter(Boolean);
    const structures = (Array.isArray(groups.buildings) ? groups.buildings : [])
      .map(feature => projectOsmFeature(feature, "structure"))
      .filter(feature => feature && feature.points.length >= 3);

    return {
      roadLike,
      structures,
      cacheStatus: window.GridWildOsmFeaturesLayer?.getCacheStatus?.() || null
    };
  }

  function cellRectMeters(cell, padM = 0) {
    const x0 = Number(cell.ix) * GRID_SIZE_M - padM;
    const y0 = Number(cell.iy) * GRID_SIZE_M - padM;
    return {
      minX: x0,
      minY: y0,
      maxX: x0 + GRID_SIZE_M + padM * 2,
      maxY: y0 + GRID_SIZE_M + padM * 2
    };
  }

  function membersBoundsMeters(members = [], padM = 0) {
    if (!members.length) return null;
    return {
      minX: Math.min(...members.map(cell => Number(cell.ix) * GRID_SIZE_M)) - padM,
      maxX: Math.max(...members.map(cell => (Number(cell.ix) + 1) * GRID_SIZE_M)) + padM,
      minY: Math.min(...members.map(cell => Number(cell.iy) * GRID_SIZE_M)) - padM,
      maxY: Math.max(...members.map(cell => (Number(cell.iy) + 1) * GRID_SIZE_M)) + padM
    };
  }

  function rectCenter(rect) {
    return {
      x: (rect.minX + rect.maxX) / 2,
      y: (rect.minY + rect.maxY) / 2
    };
  }

  function rectCorners(rect) {
    return [
      { x: rect.minX, y: rect.minY },
      { x: rect.maxX, y: rect.minY },
      { x: rect.maxX, y: rect.maxY },
      { x: rect.minX, y: rect.maxY }
    ];
  }

  function pointInRect(point, rect) {
    return point.x >= rect.minX &&
      point.x <= rect.maxX &&
      point.y >= rect.minY &&
      point.y <= rect.maxY;
  }

  function expandRect(rect, padM) {
    return {
      minX: rect.minX - padM,
      minY: rect.minY - padM,
      maxX: rect.maxX + padM,
      maxY: rect.maxY + padM
    };
  }

  function cross2d(a, b, c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }

  function pointOnSegment(point, a, b) {
    const eps = 1e-7;
    if (Math.abs(cross2d(a, b, point)) > eps) return false;
    return point.x >= Math.min(a.x, b.x) - eps &&
      point.x <= Math.max(a.x, b.x) + eps &&
      point.y >= Math.min(a.y, b.y) - eps &&
      point.y <= Math.max(a.y, b.y) + eps;
  }

  function segmentsIntersect(a, b, c, d) {
    const abC = cross2d(a, b, c);
    const abD = cross2d(a, b, d);
    const cdA = cross2d(c, d, a);
    const cdB = cross2d(c, d, b);
    if ((abC > 0 && abD < 0 || abC < 0 && abD > 0) &&
        (cdA > 0 && cdB < 0 || cdA < 0 && cdB > 0)) {
      return true;
    }
    return pointOnSegment(c, a, b) ||
      pointOnSegment(d, a, b) ||
      pointOnSegment(a, c, d) ||
      pointOnSegment(b, c, d);
  }

  function segmentIntersectsRect(a, b, rect) {
    if (pointInRect(a, rect) || pointInRect(b, rect)) return true;
    const corners = rectCorners(rect);
    for (let i = 0; i < corners.length; i++) {
      if (segmentsIntersect(a, b, corners[i], corners[(i + 1) % corners.length])) return true;
    }
    return false;
  }

  function distancePointToSegment(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 <= 0) return Math.hypot(point.x - a.x, point.y - a.y);
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2));
    return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
  }

  function polylineTouchesRect(points = [], rect, bufferM = 0) {
    if (points.length < 2) return false;
    const expanded = expandRect(rect, Math.max(0, bufferM));
    const probes = [rectCenter(rect), ...rectCorners(rect)];

    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      if (segmentIntersectsRect(a, b, expanded)) return true;
      if (bufferM > 0 && probes.some(point => distancePointToSegment(point, a, b) <= bufferM)) return true;
    }
    return false;
  }

  function closedProjectedRing(points = []) {
    if (points.length < 3) return points.slice();
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < 0.01) return points.slice();
    return [...points, first];
  }

  function pointInPolygon(point, ring = []) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      const crosses = ((a.y > point.y) !== (b.y > point.y)) &&
        (point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || 1e-9) + a.x);
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function polygonOverlapsRect(points = [], rect) {
    const ring = closedProjectedRing(points);
    if (ring.length < 4) return false;
    const probes = [rectCenter(rect), ...rectCorners(rect)];
    if (probes.some(point => pointInPolygon(point, ring))) return true;
    if (ring.some(point => pointInRect(point, rect))) return true;
    for (let i = 1; i < ring.length; i++) {
      if (segmentIntersectsRect(ring[i - 1], ring[i], rect)) return true;
    }
    return false;
  }

  function connectedOsmTransformComponents(cells = []) {
    const byKey = new Map(cells.map(cell => [cell.key, cell]));
    const visited = new Set();
    const groups = [];

    for (const cell of cells) {
      if (visited.has(cell.key)) continue;
      const group = [];
      const queue = [cell];
      visited.add(cell.key);

      while (queue.length) {
        const current = queue.shift();
        group.push(current);
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
          const key = `${current.ix + dx},${current.iy + dy}`;
          if (visited.has(key) || !byKey.has(key)) continue;
          visited.add(key);
          queue.push(byKey.get(key));
        }
      }
      groups.push(group);
    }

    return groups.sort((a, b) => b.length - a.length);
  }

  function analyzeOsmSubdivision(members = [], context, options = {}) {
    const originalCount = members.length;
    const minAreaRatio = Number.isFinite(Number(options.minAreaRatio))
      ? Math.max(0, Number(options.minAreaRatio))
      : OSM_TRANSFORMATION_RULE.minAreaRatio;
    const maxCellsPerNiche = Number.isFinite(Number(options.maxCellsPerNiche))
      ? Math.max(1, Number(options.maxCellsPerNiche))
      : OSM_TRANSFORMATION_RULE.maxCellsPerNiche;
    const includeStructures = options.includeStructures !== false;
    const minCells = Math.max(1, Math.ceil(originalCount * minAreaRatio));
    const summary = {
      originalCount,
      minCells,
      roadCutCells: 0,
      buildingEdgeCutCells: 0,
      buildingOverlapCells: 0,
      droppedSmallComponents: 0,
      survivingComponents: 0,
      roadFeatures: 0,
      structureFeatures: 0,
      transformed: false
    };

    if (!originalCount || originalCount > maxCellsPerNiche) {
      return { summary, components: [members], transformed: false };
    }

    const maxPad = Math.max(
      OSM_TRANSFORMATION_RULE.roadBufferM,
      OSM_TRANSFORMATION_RULE.pathBufferM,
      includeStructures ? OSM_TRANSFORMATION_RULE.structureBufferM : 0
    ) + GRID_SIZE_M;
    const nicheBounds = membersBoundsMeters(members, maxPad);
    const roadFeatures = (context?.roadLike || []).filter(feature => boundsOverlap(nicheBounds, projectedBoundsForPoints(feature.points, maxPad)));
    const structureFeatures = includeStructures
      ? (context?.structures || []).filter(feature => boundsOverlap(nicheBounds, projectedBoundsForPoints(feature.points, maxPad)))
      : [];
    summary.roadFeatures = roadFeatures.length;
    summary.structureFeatures = structureFeatures.length;

    if (!roadFeatures.length && !structureFeatures.length) {
      return { summary, components: [members], transformed: false };
    }

    const roadCutKeys = new Set();
    const buildingEdgeCutKeys = new Set();
    const buildingOverlapKeys = new Set();

    for (const cell of members) {
      const rect = cellRectMeters(cell);

      for (const feature of roadFeatures) {
        const bufferM = feature.kind === "path"
          ? OSM_TRANSFORMATION_RULE.pathBufferM
          : OSM_TRANSFORMATION_RULE.roadBufferM;
        if (polylineTouchesRect(feature.points, rect, bufferM)) {
          roadCutKeys.add(cell.key);
          break;
        }
      }

      for (const feature of structureFeatures) {
        const ring = closedProjectedRing(feature.points);
        if (polygonOverlapsRect(ring, rect)) {
          buildingOverlapKeys.add(cell.key);
        }
        if (polylineTouchesRect(ring, rect, OSM_TRANSFORMATION_RULE.structureBufferM)) {
          buildingEdgeCutKeys.add(cell.key);
        }
      }
    }

    const blockedKeys = new Set([
      ...roadCutKeys,
      ...buildingEdgeCutKeys,
      ...buildingOverlapKeys
    ]);
    const openCells = members.filter(cell => !blockedKeys.has(cell.key));
    const components = connectedOsmTransformComponents(openCells);
    const surviving = components.filter(component => component.length >= minCells);
    const changed = blockedKeys.size > 0 || surviving.length !== 1 || surviving[0]?.length !== originalCount;

    summary.roadCutCells = roadCutKeys.size;
    summary.buildingEdgeCutCells = buildingEdgeCutKeys.size;
    summary.buildingOverlapCells = buildingOverlapKeys.size;
    summary.droppedSmallComponents = components.length - surviving.length;
    summary.survivingComponents = surviving.length;
    summary.transformed = changed;

    return {
      summary,
      components: surviving,
      transformed: changed
    };
  }

  function bestPeakForTransformedCells(cells = [], sourceNiche = null) {
    const peakKey = String(sourceNiche?.metrics?.peak_cell || sourceNiche?.metrics?.core_cell || "");
    return cells.find(cell => cell.key === peakKey) ||
      cells.slice().sort((a, b) =>
        Number(b.signal || 0) - Number(a.signal || 0) ||
        Number(b.metrics?.count || 0) - Number(a.metrics?.count || 0)
      )[0] ||
      cells[0] ||
      null;
  }

  function buildOsmTransformedNiche(source, cells, componentIndex, subdivisionCount, analysisSummary, origin) {
    const peak = bestPeakForTransformedCells(cells, source);
    const component = constrainedComponentFromMembers(cells, peak, {
      maxCells: Math.max(cells.length, OSM_TRANSFORMATION_RULE.maxCellsPerNiche)
    }) || componentFromMembers(cells, peak);
    if (!component) return null;

    const agg = aggregateComponent(component);
    const ll = agg.center;
    const sourceMetrics = source.metrics || {};
    const geometryType = cells.length <= 4 ? "point-halo" : "osm-fitted-polygon";
    const scaleClass = constrainedScaleClass(component, geometryType);
    const areaRatio = cells.length / Math.max(1, analysisSummary.originalCount || cells.length);
    const placeContext = preserveGeometryContext(
      resolveGeometricPlaceContext(
        ll.lat,
        ll.lng,
        component,
        resolvePlaceContext(ll.lat, ll.lng)
      ),
      {
        ...(source.place_context?.geometry_context || sourceMetrics.geometry_context || {}),
        osm_transformed: true,
        osm_subdivision_index: componentIndex + 1,
        osm_subdivision_count: subdivisionCount
      }
    );
    const distanceM = L.latLng(origin.lat, origin.lng).distanceTo(L.latLng(ll.lat, ll.lng));
    const sourceKeyBase = source.source_key || source.id || `${source.centroid_lat},${source.centroid_lng}`;
    const coreCell = peak ? `${peak.ix},${peak.iy}` : "";
    const sourceAlgorithm = String(sourceMetrics.algorithm || "constrained_geometry_niche_v1");
    const nextMetrics = {
      ...sourceMetrics,
      ...agg.metrics,
      algorithm: sourceAlgorithm,
      component_id: agg.componentId,
      component_cell_count: cells.length,
      active_lens: sourceMetrics.active_lens || window.__gwState?.activeLens || "classic",
      heat_metric: sourceMetrics.heat_metric || window.__gwState?.heatMetric || "count",
      core_cell: coreCell,
      peak_cell: coreCell,
      peak_signal: Number(Math.max(Number(sourceMetrics.peak_signal || 0), Number(agg.metrics.lensPeakSignal || 0)).toFixed(3)),
      peak_z: Number(sourceMetrics.peak_z ?? sourceMetrics.lensPeakZ ?? agg.metrics.lensPeakZ ?? 0),
      peak_abs_z: Number(sourceMetrics.peak_abs_z ?? sourceMetrics.lensPeakAbsZ ?? agg.metrics.lensPeakAbsZ ?? 0),
      lensPeakAbsZ: Math.max(Number(sourceMetrics.lensPeakAbsZ || 0), Number(agg.metrics.lensPeakAbsZ || 0)),
      geometry_type: geometryType,
      scale_class: scaleClass,
      display_geometry: "osm-fitted-polygon",
      interaction_radius_m: Math.round(Math.max(26, Math.sqrt(Math.max(1, cells.length)) * GRID_SIZE_M * 1.3)),
      geometry_context: placeContext.geometry_context || null,
      osm_transform: {
        enabled: true,
        version: OSM_TRANSFORMATION_RULE.version,
        parent_source_key: sourceKeyBase,
        subdivision_index: componentIndex + 1,
        subdivision_count: subdivisionCount,
        original_cell_count: analysisSummary.originalCount,
        surviving_cell_count: cells.length,
        surviving_area_ratio: Number(areaRatio.toFixed(3)),
        min_area_ratio: OSM_TRANSFORMATION_RULE.minAreaRatio,
        road_cut_cells: analysisSummary.roadCutCells,
        building_edge_cut_cells: analysisSummary.buildingEdgeCutCells,
        building_overlap_cells: analysisSummary.buildingOverlapCells,
        road_buffer_m: OSM_TRANSFORMATION_RULE.roadBufferM,
        path_buffer_m: OSM_TRANSFORMATION_RULE.pathBufferM,
        structure_buffer_m: OSM_TRANSFORMATION_RULE.structureBufferM,
        road_feature_count: analysisSummary.roadFeatures,
        structure_feature_count: analysisSummary.structureFeatures
      },
      member_cells_are_analysis_object: true
    };

    const transformed = {
      ...source,
      source_key: `${sourceKeyBase}:osm-transform:${componentIndex + 1}:${agg.componentId}`,
      id: source._runtimeOnly === false ? undefined : source.id,
      centroid_lat: ll.lat,
      centroid_lng: ll.lng,
      geometry: boundsForCells(agg.minIx, agg.minIy, agg.maxIx, agg.maxIy),
      grid_cell_ids: agg.cells,
      radius_m: Math.round(Math.max(18, Math.sqrt(Math.max(1, cells.length)) * GRID_SIZE_M * 1.08)),
      scale_level: sourceAlgorithm === THRESHOLD_SUBDIVIDE_RULE.version
        ? `threshold-subdivide:${scaleClass}:osm-fit`
        : `constrained-geometry:${scaleClass}:osm-fit`,
      metrics: nextMetrics,
      evidence_summary: evidenceFor(source.niche_type, nextMetrics, placeContext),
      confidence: clamp01(Number(source.confidence || 0) * 0.94 + Math.min(1, areaRatio) * 0.04 + 0.02),
      questability_score: clamp01(Number(source.questability_score || 0) * (0.86 + Math.min(1, areaRatio) * 0.14)),
      place_context: placeContext,
      primary_place_label: placeContext.primary_label || source.primary_place_label || null,
      secondary_place_label: placeContext.secondary_label || source.secondary_place_label || null,
      place_label_confidence: placeContext.label_confidence || source.place_label_confidence || 0,
      generated_by: `${source.generated_by || "gridwild_constrained_geometry_niche_v1"}+${OSM_TRANSFORMATION_RULE.version}`,
      distance_m: Math.round(distanceM),
      _runtimeOnly: true
    };

    transformed.title = buildNicheDisplayTitle(transformed);
    transformed.short_title = transformed.title.replace(/^(Sample|Survey|Look for|Revisit|Check)\s+/i, "");
    return transformed;
  }

  function shouldOsmTransformNiche(niche) {
    return ["constrained_geometry_niche_v1", THRESHOLD_SUBDIVIDE_RULE.version].includes(String(niche?.metrics?.algorithm || "")) &&
      Array.isArray(niche?.grid_cell_ids) &&
      niche.grid_cell_ids.length > 0;
  }

  function osmTransformSummaryText(summary, fallbackCount) {
    if (!summary?.enabled) return "";
    if (!summary.available) return "No cached OSM roads, paths, or structures available for this view.";
    if (!summary.changed) return `${fallbackCount} niche objects; cached OSM features did not intersect the blobs.`;
    return `${summary.outputCount} OSM-fit niche areas from ${summary.inputCount} blobs; ${summary.roadCutCells} road/path cuts, ${summary.buildingOverlapCells} structure overlaps.`;
  }

  function applyOsmTransformationsToNiches(niches = [], origin = getOrigin()) {
    const summary = {
      enabled: state.controls.osmTransformation === true,
      available: false,
      changed: false,
      inputCount: niches.length,
      outputCount: niches.length,
      transformedParents: 0,
      droppedParents: 0,
      droppedSmallComponents: 0,
      roadCutCells: 0,
      buildingEdgeCutCells: 0,
      buildingOverlapCells: 0,
      roadFeatures: 0,
      structureFeatures: 0
    };

    if (!summary.enabled) return { niches, summary };
    const context = buildOsmTransformationContext();
    summary.roadFeatures = context?.roadLike?.length || 0;
    summary.structureFeatures = context?.structures?.length || 0;
    summary.available = summary.roadFeatures > 0 || summary.structureFeatures > 0;
    if (!summary.available) return { niches, summary };

    const transformedRows = [];
    for (const niche of niches) {
      if (!shouldOsmTransformNiche(niche)) {
        transformedRows.push(niche);
        continue;
      }

      const members = membersForNicheCells(niche);
      const analysis = analyzeOsmSubdivision(members, context);
      const detail = analysis.summary;
      summary.roadCutCells += detail.roadCutCells;
      summary.buildingEdgeCutCells += detail.buildingEdgeCutCells;
      summary.buildingOverlapCells += detail.buildingOverlapCells;
      summary.droppedSmallComponents += detail.droppedSmallComponents;

      if (!analysis.transformed) {
        transformedRows.push(niche);
        continue;
      }

      summary.changed = true;
      summary.transformedParents += 1;
      if (!analysis.components.length) {
        summary.droppedParents += 1;
        continue;
      }

      const subdivisionCount = analysis.components.length;
      for (let i = 0; i < analysis.components.length; i++) {
        const next = buildOsmTransformedNiche(niche, analysis.components[i], i, subdivisionCount, detail, origin);
        if (next) transformedRows.push(next);
      }
    }

    summary.outputCount = transformedRows.length;
    if (state.detectorDebug?.constrainedGeometry) {
      state.detectorDebug.constrainedGeometry.osmTransformation = summary;
    }
    state.constrainedGeometryDebug = state.detectorDebug?.constrainedGeometry || state.constrainedGeometryDebug;
    return { niches: transformedRows, summary };
  }

  function meterPointDistance(a, b) {
    return Math.hypot(Number(a?.x || 0) - Number(b?.x || 0), Number(a?.y || 0) - Number(b?.y || 0));
  }

  function meterPointsClose(a, b, epsM = 0.08) {
    return meterPointDistance(a, b) <= epsM;
  }

  function closeMeterRing(points = []) {
    const ring = (Array.isArray(points) ? points : [])
      .map(point => ({ x: Number(point?.x), y: Number(point?.y) }))
      .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
    const cleaned = [];
    for (const point of ring) {
      if (!cleaned.length || !meterPointsClose(cleaned[cleaned.length - 1], point, 0.03)) {
        cleaned.push(point);
      }
    }
    if (cleaned.length < 3) return [];
    if (!meterPointsClose(cleaned[0], cleaned[cleaned.length - 1], 0.03)) {
      cleaned.push({ ...cleaned[0] });
    } else {
      cleaned[cleaned.length - 1] = { ...cleaned[0] };
    }
    return cleaned;
  }

  function openMeterRing(ring = []) {
    const closed = closeMeterRing(ring);
    if (closed.length && meterPointsClose(closed[0], closed[closed.length - 1], 0.03)) {
      return closed.slice(0, -1);
    }
    return closed;
  }

  function meterRingArea(ring = []) {
    const closed = closeMeterRing(ring);
    if (closed.length < 4) return 0;
    let area = 0;
    for (let i = 1; i < closed.length; i++) {
      const a = closed[i - 1];
      const b = closed[i];
      area += a.x * b.y - b.x * a.y;
    }
    return area / 2;
  }

  function meterRingCentroid(ring = []) {
    const closed = closeMeterRing(ring);
    if (closed.length < 4) {
      const pts = closed.length ? closed : [{ x: 0, y: 0 }];
      return {
        x: pts.reduce((sum, point) => sum + point.x, 0) / pts.length,
        y: pts.reduce((sum, point) => sum + point.y, 0) / pts.length
      };
    }

    let crossSum = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 1; i < closed.length; i++) {
      const a = closed[i - 1];
      const b = closed[i];
      const cross = a.x * b.y - b.x * a.y;
      crossSum += cross;
      cx += (a.x + b.x) * cross;
      cy += (a.y + b.y) * cross;
    }
    if (Math.abs(crossSum) < 1e-6) {
      const open = openMeterRing(closed);
      return {
        x: open.reduce((sum, point) => sum + point.x, 0) / Math.max(1, open.length),
        y: open.reduce((sum, point) => sum + point.y, 0) / Math.max(1, open.length)
      };
    }
    return { x: cx / (3 * crossSum), y: cy / (3 * crossSum) };
  }

  function meterPointToLatLng(point) {
    const ll = map.options.crs.unproject(L.point(point.x, point.y));
    return { lat: ll.lat, lng: ll.lng };
  }

  function meterPathToLatLng(path = []) {
    return path
      .map(meterPointToLatLng)
      .map(point => [point.lat, point.lng]);
  }

  function meterRingToGeoJSONPolygon(ring = []) {
    const coords = closeMeterRing(ring)
      .map(meterPointToLatLng)
      .map(point => [point.lng, point.lat]);
    return coords.length >= 4
      ? { type: "Polygon", coordinates: [coords] }
      : null;
  }

  function meterRingBounds(ring = [], padM = 0) {
    const open = openMeterRing(ring);
    if (!open.length) return null;
    return {
      minX: Math.min(...open.map(point => point.x)) - padM,
      maxX: Math.max(...open.map(point => point.x)) + padM,
      minY: Math.min(...open.map(point => point.y)) - padM,
      maxY: Math.max(...open.map(point => point.y)) + padM
    };
  }

  function interpolateMeterPoint(a, b, t) {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t
    };
  }

  function segmentIntersectionPoint(a, b, c, d) {
    const r = { x: b.x - a.x, y: b.y - a.y };
    const s = { x: d.x - c.x, y: d.y - c.y };
    const denom = r.x * s.y - r.y * s.x;
    if (Math.abs(denom) < 1e-9) return null;
    const q = { x: c.x - a.x, y: c.y - a.y };
    const t = (q.x * s.y - q.y * s.x) / denom;
    const u = (q.x * r.y - q.y * r.x) / denom;
    if (t < -1e-7 || t > 1 + 1e-7 || u < -1e-7 || u > 1 + 1e-7) return null;
    return {
      point: interpolateMeterPoint(a, b, Math.max(0, Math.min(1, t))),
      t: Math.max(0, Math.min(1, t)),
      u: Math.max(0, Math.min(1, u))
    };
  }

  function pointNearRingBoundary(point, ring = [], epsM = 0.12) {
    const open = openMeterRing(ring);
    for (let i = 0; i < open.length; i++) {
      const a = open[i];
      const b = open[(i + 1) % open.length];
      if (distancePointToSegment(point, a, b) <= epsM) return true;
    }
    return false;
  }

  function clippedSegmentToRing(a, b, ring = []) {
    const open = openMeterRing(ring);
    if (open.length < 3 || meterPointDistance(a, b) < 0.05) return [];

    const tValues = [0, 1];
    for (let i = 0; i < open.length; i++) {
      const hit = segmentIntersectionPoint(a, b, open[i], open[(i + 1) % open.length]);
      if (hit) tValues.push(hit.t);
    }

    const sorted = [...new Set(tValues.map(t => Number(Math.max(0, Math.min(1, t)).toFixed(8))))]
      .sort((x, y) => x - y);
    const segments = [];
    for (let i = 1; i < sorted.length; i++) {
      const t0 = sorted[i - 1];
      const t1 = sorted[i];
      if (t1 - t0 < 1e-6) continue;
      const mid = interpolateMeterPoint(a, b, (t0 + t1) / 2);
      if (!pointInPolygon(mid, ring) && !pointNearRingBoundary(mid, ring, 0.08)) continue;
      const start = interpolateMeterPoint(a, b, t0);
      const end = interpolateMeterPoint(a, b, t1);
      if (meterPointDistance(start, end) >= 0.2) segments.push([start, end]);
    }
    return segments;
  }

  function clippedPolylinePathsToRing(points = [], ring = []) {
    const paths = [];
    let current = [];
    const flush = () => {
      if (current.length >= 2) paths.push(current);
      current = [];
    };

    for (let i = 1; i < points.length; i++) {
      const pieces = clippedSegmentToRing(points[i - 1], points[i], ring);
      if (!pieces.length) {
        flush();
        continue;
      }

      for (const [a, b] of pieces) {
        if (!current.length) {
          current = [a, b];
        } else if (meterPointsClose(current[current.length - 1], a, 0.6)) {
          current.push(b);
        } else {
          flush();
          current = [a, b];
        }
      }
    }
    flush();
    return paths
      .map(path => {
        const cleaned = [];
        for (const point of path) {
          if (!cleaned.length || !meterPointsClose(cleaned[cleaned.length - 1], point, 0.06)) cleaned.push(point);
        }
        return cleaned;
      })
      .filter(path => path.length >= 2);
  }

  function cutPathCanSplitRing(path = [], ring = []) {
    if (path.length < 2) return false;
    if (!pointNearRingBoundary(path[0], ring, 0.35)) return false;
    if (!pointNearRingBoundary(path[path.length - 1], ring, 0.35)) return false;
    if (meterPointDistance(path[0], path[path.length - 1]) < GRID_SIZE_M * 0.35) return false;

    for (let i = 1; i < path.length; i++) {
      const mid = interpolateMeterPoint(path[i - 1], path[i], 0.5);
      if (pointInPolygon(mid, ring) && !pointNearRingBoundary(mid, ring, 0.2)) return true;
    }
    return false;
  }

  function ringInsertPosition(point, ring = []) {
    const open = openMeterRing(ring);
    let best = null;
    for (let i = 0; i < open.length; i++) {
      const a = open[i];
      const b = open[(i + 1) % open.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const rawT = len2 <= 0 ? 0 : ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2;
      const t = Math.max(0, Math.min(1, rawT));
      const projected = interpolateMeterPoint(a, b, t);
      const distance = meterPointDistance(point, projected);
      if (!best || distance < best.distance) {
        best = { edgeIndex: i, t, point: projected, distance };
      }
    }
    return best;
  }

  function ringWithInsertedCutEndpoints(ring = [], path = []) {
    const open = openMeterRing(ring);
    if (open.length < 3 || path.length < 2) return null;

    const placements = [
      { label: "start", ...ringInsertPosition(path[0], open) },
      { label: "end", ...ringInsertPosition(path[path.length - 1], open) }
    ].filter(position => position && position.distance <= 0.75);
    if (placements.length < 2) return null;

    const vertices = [];
    for (let i = 0; i < open.length; i++) {
      vertices.push({ ...open[i] });
      placements
        .filter(position => position.edgeIndex === i)
        .sort((a, b) => a.t - b.t)
        .forEach((position) => {
          const point = { ...position.point, _cutLabel: position.label };
          if (!meterPointsClose(vertices[vertices.length - 1], point, 0.04)) vertices.push(point);
          else vertices[vertices.length - 1]._cutLabel = position.label;
        });
    }

    const deduped = [];
    for (const point of vertices) {
      if (!deduped.length || !meterPointsClose(deduped[deduped.length - 1], point, 0.04)) deduped.push(point);
      else if (point._cutLabel) deduped[deduped.length - 1]._cutLabel = point._cutLabel;
    }
    if (deduped.length > 1 && meterPointsClose(deduped[0], deduped[deduped.length - 1], 0.04)) deduped.pop();

    let startIndex = deduped.findIndex(point => point._cutLabel === "start");
    let endIndex = deduped.findIndex(point => point._cutLabel === "end");
    if (startIndex < 0) {
      startIndex = deduped.reduce((best, point, index) =>
        meterPointDistance(point, path[0]) < meterPointDistance(deduped[best], path[0]) ? index : best, 0);
    }
    if (endIndex < 0) {
      endIndex = deduped.reduce((best, point, index) =>
        meterPointDistance(point, path[path.length - 1]) < meterPointDistance(deduped[best], path[path.length - 1]) ? index : best, 0);
    }
    if (startIndex === endIndex) return null;

    return { vertices: deduped.map(({ _cutLabel, ...point }) => point), startIndex, endIndex };
  }

  function ringArc(vertices = [], startIndex = 0, endIndex = 0) {
    if (!vertices.length) return [];
    const arc = [{ ...vertices[startIndex] }];
    let index = startIndex;
    let guard = 0;
    while (index !== endIndex && guard < vertices.length + 2) {
      index = (index + 1) % vertices.length;
      arc.push({ ...vertices[index] });
      guard++;
    }
    return arc;
  }

  function splitMeterRingByCutPath(ring = [], path = []) {
    if (!cutPathCanSplitRing(path, ring)) return null;
    const inserted = ringWithInsertedCutEndpoints(ring, path);
    if (!inserted) return null;

    const start = inserted.vertices[inserted.startIndex];
    const end = inserted.vertices[inserted.endIndex];
    const cutPath = [
      start,
      ...path.slice(1, -1).map(point => ({ x: point.x, y: point.y })),
      end
    ];
    const arcAB = ringArc(inserted.vertices, inserted.startIndex, inserted.endIndex);
    const arcBA = ringArc(inserted.vertices, inserted.endIndex, inserted.startIndex);
    const ringA = closeMeterRing(arcAB.concat(cutPath.slice(0, -1).reverse()));
    const ringB = closeMeterRing(cutPath.concat(arcBA.slice(1)));
    const minArea = Math.max(2, GRID_SIZE_M * GRID_SIZE_M * 0.02);
    const rings = [ringA, ringB].filter(next => next.length >= 4 && Math.abs(meterRingArea(next)) >= minArea);
    return rings.length === 2 ? rings : null;
  }

  function componentBoundaryRingsMeters(members = []) {
    const edges = gridBoundaryEdges(members).map((edge, index) => ({
      ...edge,
      id: index,
      used: false
    }));
    if (!edges.length) return [];

    const adjacency = new Map();
    const addAdjacent = (point, edge) => {
      const key = gridPointKey(point);
      if (!adjacency.has(key)) adjacency.set(key, []);
      adjacency.get(key).push(edge);
    };

    edges.forEach((edge) => {
      addAdjacent(edge.a, edge);
      addAdjacent(edge.b, edge);
    });

    if ([...adjacency.values()].some(list => list.length !== 2)) return [];

    const rings = [];
    for (const start of edges) {
      if (start.used) continue;

      start.used = true;
      const startKey = gridPointKey(start.a);
      let current = start.b;
      const ring = [start.a, start.b];

      while (gridPointKey(current) !== startKey) {
        const currentKey = gridPointKey(current);
        const next = (adjacency.get(currentKey) || []).find(edge => !edge.used);
        if (!next) break;

        next.used = true;
        const nextAKey = gridPointKey(next.a);
        current = nextAKey === currentKey ? next.b : next.a;
        ring.push(current);
      }

      if (ring.length >= 5 && gridPointKey(ring[0]) === gridPointKey(ring[ring.length - 1])) {
        rings.push(ring.map(point => ({ x: point.x * GRID_SIZE_M, y: point.y * GRID_SIZE_M })));
      }
    }

    return rings.sort((a, b) => Math.abs(meterRingArea(b)) - Math.abs(meterRingArea(a)));
  }

  function pathLengthMeters(path = []) {
    let total = 0;
    for (let i = 1; i < path.length; i++) total += meterPointDistance(path[i - 1], path[i]);
    return total;
  }

  function pointOnMeterPath(point, path = [], epsM = 0.12) {
    for (let i = 1; i < path.length; i++) {
      if (distancePointToSegment(point, path[i - 1], path[i]) <= epsM) return true;
    }
    return false;
  }

  function segmentOnAnyCutPath(a, b, cutPaths = []) {
    const mid = interpolateMeterPoint(a, b, 0.5);
    return cutPaths.some(path =>
      pointOnMeterPath(a, path, 0.18) &&
      pointOnMeterPath(b, path, 0.18) &&
      pointOnMeterPath(mid, path, 0.18)
    );
  }

  function faceOuterPathsLatLng(face) {
    const ring = closeMeterRing(face?.ring || []);
    const cutPaths = face?.cutPaths || [];
    if (ring.length < 4) return [];
    const paths = [];
    let current = [];

    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1];
      const b = ring[i];
      if (segmentOnAnyCutPath(a, b, cutPaths)) {
        if (current.length >= 2) paths.push(current);
        current = [];
        continue;
      }
      if (!current.length) current.push(a);
      current.push(b);
    }
    if (current.length >= 2) paths.push(current);
    return paths.map(meterPathToLatLng).filter(path => path.length >= 2);
  }

  function cellsOverlappingMeterRing(members = [], ring = []) {
    return (members || []).filter(cell => polygonOverlapsRect(ring, cellRectMeters(cell)));
  }

  function analyzeGrowVectorOsmSubdivision(source, context) {
    const members = membersForNicheCells(source);
    const summary = {
      originalCount: members.length,
      survivingComponents: 0,
      roadFeatures: 0,
      vectorCutCount: 0,
      roadCutCells: 0,
      transformed: false
    };
    if (!members.length) return { summary, faces: [], transformed: false };

    const outerRing = componentBoundaryRingsMeters(members)[0];
    if (!outerRing?.length) return { summary, faces: [], transformed: false };

    const ringBounds = meterRingBounds(outerRing, GRID_SIZE_M);
    const roadFeatures = (context?.roadLike || [])
      .filter(feature => boundsOverlap(ringBounds, projectedBoundsForPoints(feature.points, GRID_SIZE_M)));
    summary.roadFeatures = roadFeatures.length;
    if (!roadFeatures.length) return { summary, faces: [{ ring: outerRing, cutPaths: [], members }], transformed: false };

    let faces = [{ ring: outerRing, cutPaths: [], members }];
    for (const feature of roadFeatures) {
      const nextFaces = [];
      for (const face of faces) {
        let working = [face];
        let pass = 0;
        while (pass < 8) {
          let changed = false;
          const updated = [];
          for (const candidate of working) {
            const paths = clippedPolylinePathsToRing(feature.points, candidate.ring)
              .filter(path => pathLengthMeters(path) >= GRID_SIZE_M * 0.35)
              .filter(path => cutPathCanSplitRing(path, candidate.ring));
            let split = null;
            let splitPath = null;
            for (const path of paths) {
              split = splitMeterRingByCutPath(candidate.ring, path);
              if (split) {
                splitPath = path;
                break;
              }
            }
            if (!split || !splitPath) {
              updated.push(candidate);
              continue;
            }
            changed = true;
            summary.vectorCutCount += 1;
            const inheritedCutPaths = candidate.cutPaths || [];
            updated.push(
              { ring: split[0], cutPaths: [...inheritedCutPaths, splitPath], members: [] },
              { ring: split[1], cutPaths: [...inheritedCutPaths, splitPath], members: [] }
            );
          }
          working = updated;
          if (!changed || working.length > 80) break;
          pass++;
        }
        nextFaces.push(...working);
      }
      faces = nextFaces;
      if (faces.length > 80) break;
    }

    const cutPaths = faces.flatMap(face => face.cutPaths || []);
    summary.roadCutCells = members.filter(cell => cutPaths.some(path =>
      polylineTouchesRect(path, cellRectMeters(cell), 0)
    )).length;

    const outputFaces = faces
      .map(face => ({
        ...face,
        ring: closeMeterRing(face.ring),
        members: cellsOverlappingMeterRing(members, face.ring),
        outerPaths: faceOuterPathsLatLng(face),
        cutPathsLatLng: (face.cutPaths || []).map(meterPathToLatLng).filter(path => path.length >= 2),
        areaM2: Math.abs(meterRingArea(face.ring))
      }))
      .filter(face => face.ring.length >= 4 && face.members.length > 0 && face.areaM2 >= 2);

    summary.survivingComponents = outputFaces.length;
    summary.transformed = outputFaces.length > 1;
    return {
      summary,
      faces: outputFaces,
      transformed: summary.transformed
    };
  }

  function buildGrowVectorSubdividedNiche(source, face, componentIndex, subdivisionCount, analysisSummary, origin) {
    const peak = bestPeakForTransformedCells(face.members, source);
    const component = componentFromMembers(face.members, peak);
    if (!component) return null;

    const agg = aggregateComponent(component);
    const centroid = meterRingCentroid(face.ring);
    const ll = meterPointToLatLng(centroid);
    const sourceMetrics = source.metrics || {};
    const sourceKeyBase = source.source_key || source.id || `${source.centroid_lat},${source.centroid_lng}`;
    const geometry = meterRingToGeoJSONPolygon(face.ring);
    if (!geometry) return null;

    const tileSize = Number(sourceMetrics.grow_tile_cells || GROW_LOCAL_NICHE_RULE.defaultTileCells);
    const tileCount = Math.max(1, Number(sourceMetrics.grow_tile_count || 1));
    const scaleClass = tileCount > 1
      ? `${tileCount} merged ${tileSize}x${tileSize} grow tiles, OSM vector face`
      : `${tileSize}x${tileSize} grow tile, OSM vector face`;
    const placeContext = preserveGeometryContext(
      resolveGeometricPlaceContext(
        ll.lat,
        ll.lng,
        component,
        resolvePlaceContext(ll.lat, ll.lng)
      ),
      {
        ...(source.place_context?.geometry_context || sourceMetrics.geometry_context || {}),
        grow_osm_vector_subdivision: true,
        osm_centerline_only: true,
        visual_gap_px: GROW_LOCAL_NICHE_RULE.osmVectorVisualGapPx,
        osm_subdivision_index: componentIndex + 1,
        osm_subdivision_count: subdivisionCount
      }
    );
    const coreCell = peak ? `${peak.ix},${peak.iy}` : String(sourceMetrics.core_cell || "");
    const areaRatio = face.areaM2 / Math.max(1, Math.abs(meterRingArea(componentBoundaryRingsMeters(membersForNicheCells(source))[0] || [])));
    const distanceM = L.latLng(origin.lat, origin.lng).distanceTo(L.latLng(ll.lat, ll.lng));
    const nextMetrics = {
      ...sourceMetrics,
      ...agg.metrics,
      algorithm: GROW_LOCAL_NICHE_RULE.version,
      component_id: agg.componentId,
      component_cell_count: agg.cells.length,
      active_lens: sourceMetrics.active_lens || window.__gwState?.activeLens || "classic",
      heat_metric: sourceMetrics.heat_metric || window.__gwState?.heatMetric || "count",
      core_cell: coreCell,
      peak_cell: coreCell,
      geometry_type: "grow-local-niche-vector-osm-subdivision",
      scale_class: scaleClass,
      display_geometry: "grow-local-niche-vector-osm-subdivision",
      interaction_radius_m: Math.round(Math.max(24, Math.sqrt(Math.max(1, face.areaM2)) * 0.52)),
      geometry_context: placeContext.geometry_context || null,
      member_cells_are_analysis_object: true,
      osm_transform: {
        enabled: true,
        version: GROW_LOCAL_NICHE_RULE.osmSubdivisionVersion,
        parent_source_key: sourceKeyBase,
        subdivision_index: componentIndex + 1,
        subdivision_count: subdivisionCount,
        original_cell_count: analysisSummary.originalCount,
        surviving_cell_count: agg.cells.length,
        surviving_area_ratio: Number(areaRatio.toFixed(3)),
        road_path_only: true,
        vector_centerline_cut: true,
        visual_gap_px: GROW_LOCAL_NICHE_RULE.osmVectorVisualGapPx,
        road_cut_cells: analysisSummary.roadCutCells,
        road_feature_count: analysisSummary.roadFeatures,
        structure_feature_count: 0
      },
      grow_osm_subdivision: {
        enabled: true,
        version: GROW_LOCAL_NICHE_RULE.osmSubdivisionVersion,
        parent_source_key: sourceKeyBase,
        road_path_only: true,
        centerline_only: true,
        vector_cut: true,
        visual_gap_px: GROW_LOCAL_NICHE_RULE.osmVectorVisualGapPx,
        subdivision_index: componentIndex + 1,
        subdivision_count: subdivisionCount,
        original_cell_count: analysisSummary.originalCount,
        surviving_cell_count: agg.cells.length,
        vector_face_area_m2: Number(face.areaM2.toFixed(1)),
        road_cut_cells: analysisSummary.roadCutCells,
        road_feature_count: analysisSummary.roadFeatures
      },
      grow_vector_face: {
        enabled: true,
        centerline_only: true,
        visual_gap_px: GROW_LOCAL_NICHE_RULE.osmVectorVisualGapPx,
        outer_paths: face.outerPaths,
        cut_paths: face.cutPathsLatLng,
        area_m2: Number(face.areaM2.toFixed(1))
      }
    };

    const next = {
      ...source,
      source_key: `${sourceKeyBase}:grow-osm-vector:${componentIndex + 1}:${hashString(JSON.stringify(geometry.coordinates))}`,
      id: source._runtimeOnly === false ? undefined : source.id,
      centroid_lat: ll.lat,
      centroid_lng: ll.lng,
      geometry,
      grid_cell_ids: agg.cells,
      radius_m: Math.round(Math.max(18, Math.sqrt(Math.max(1, face.areaM2 / Math.PI)))),
      scale_level: `grow-local-niche:${scaleClass}`,
      description: "A temporary GridWild Grow niche subdivided by cached OSM road and path centerlines.",
      seasonal_profile: { mode: "grow_local_niche_vector_osm_runtime_v1" },
      metrics: nextMetrics,
      evidence_summary: evidenceFor(source.niche_type, nextMetrics, placeContext),
      confidence: clamp01(Number(source.confidence || 0) * 0.94 + Math.min(1, areaRatio) * 0.04 + 0.02),
      questability_score: clamp01(Number(source.questability_score || 0) * (0.86 + Math.min(1, areaRatio) * 0.14)),
      place_context: placeContext,
      primary_place_label: placeContext.primary_label || source.primary_place_label || null,
      secondary_place_label: placeContext.secondary_label || source.secondary_place_label || null,
      place_label_confidence: placeContext.label_confidence || source.place_label_confidence || 0,
      generated_by: `${source.generated_by || "gridwild_grow_local_niche_v1"}+${GROW_LOCAL_NICHE_RULE.osmSubdivisionVersion}`,
      distance_m: Math.round(distanceM),
      _runtimeOnly: true
    };
    next.title = buildNicheDisplayTitle(next);
    next.short_title = next.title.replace(/^(Sample|Survey|Look for|Revisit|Check)\s+/i, "");
    return next;
  }

  function shouldGrowOsmSubdivisionNiche(niche) {
    return String(niche?.metrics?.algorithm || "") === GROW_LOCAL_NICHE_RULE.version &&
      Array.isArray(niche?.grid_cell_ids) &&
      niche.grid_cell_ids.length > 0;
  }

  function growOsmSubdivisionSummaryText(summary, fallbackCount) {
    if (!summary?.enabled) return "";
    if (!summary.available) return "No cached OSM roads or paths available for this view.";
    if (!summary.changed) return `${fallbackCount} Grow niche objects; cached roads and paths did not intersect them.`;
    return `${summary.outputCount} Grow vector faces from ${summary.inputCount} inputs; ${summary.vectorCutCount || 0} road/path centerline cuts.`;
  }

  function applyGrowOsmSubdivisionToNiches(niches = [], origin = getOrigin()) {
    const summary = {
      enabled: state.controls.growOsmSubdivisionEnabled === true,
      available: false,
      changed: false,
      inputCount: niches.length,
      outputCount: niches.length,
      transformedParents: 0,
      droppedParents: 0,
      droppedSmallComponents: 0,
      roadCutCells: 0,
      buildingEdgeCutCells: 0,
      buildingOverlapCells: 0,
      roadFeatures: 0,
      structureFeatures: 0,
      vectorCutCount: 0
    };

    if (!summary.enabled) return { niches, summary };
    const baseContext = buildOsmTransformationContext();
    const context = baseContext
      ? { ...baseContext, structures: [] }
      : null;
    summary.roadFeatures = context?.roadLike?.length || 0;
    summary.available = summary.roadFeatures > 0;
    if (!summary.available) return { niches, summary };

    const transformedRows = [];
    for (const niche of niches) {
      if (!shouldGrowOsmSubdivisionNiche(niche)) {
        transformedRows.push(niche);
        continue;
      }

      const analysis = analyzeGrowVectorOsmSubdivision(niche, context);
      const detail = analysis.summary;
      summary.roadCutCells += Number(detail.roadCutCells || 0);
      summary.vectorCutCount += Number(detail.vectorCutCount || 0);
      summary.droppedSmallComponents += Number(detail.droppedSmallComponents || 0);

      if (!analysis.transformed) {
        transformedRows.push(niche);
        continue;
      }

      summary.changed = true;
      summary.transformedParents += 1;
      if (!analysis.faces.length) {
        summary.droppedParents += 1;
        continue;
      }

      const subdivisionCount = analysis.faces.length;
      for (let i = 0; i < analysis.faces.length; i++) {
        const next = buildGrowVectorSubdividedNiche(niche, analysis.faces[i], i, subdivisionCount, detail, origin);
        if (next) transformedRows.push(next);
      }
    }

    summary.outputCount = transformedRows.length;
    if (state.detectorDebug?.constrainedGeometry) {
      state.detectorDebug.constrainedGeometry.growOsmSubdivision = summary;
    }
    state.constrainedGeometryDebug = state.detectorDebug?.constrainedGeometry || state.constrainedGeometryDebug;
    return { niches: transformedRows, summary };
  }

  function capThresholdSubdivideNiches(niches = []) {
    if (state.controls.thresholdSubdivideApproach !== true) return niches;
    const max = Math.max(1, Number(state.controls.maxCandidates) || 8);
    return niches.slice()
      .sort((a, b) =>
        nicheClusterPriority(b) - nicheClusterPriority(a) ||
        Number(b.questability_score || 0) - Number(a.questability_score || 0)
      )
      .slice(0, max);
  }

  function debugComponentForNiche(niche, signalData = null) {
    const members = (Array.isArray(niche?.grid_cell_ids) ? niche.grid_cell_ids : [])
      .map((cellKey) => signalData?.cells?.get?.(String(cellKey)) || cellMemberForKey(cellKey, niche))
      .filter(Boolean);
    return componentStatsFromMembers(members);
  }

  function syncThresholdSubdivideDebugFromNiches(niches = []) {
    if (state.controls.thresholdSubdivideApproach !== true || !state.detectorDebug) return;
    const signalData = state.detectorDebug.signalData || null;
    const components = niches
      .map((niche) => debugComponentForNiche(niche, signalData))
      .filter(Boolean);
    state.detectorDebug.components = components;
    if (state.detectorDebug.constrainedGeometry) {
      state.detectorDebug.constrainedGeometry.resultCount = niches.length;
      state.detectorDebug.constrainedGeometry.finalFaceCount = niches.length;
    }
    state.constrainedGeometryDebug = state.detectorDebug.constrainedGeometry || state.constrainedGeometryDebug;
  }

  function nicheCellSet(cells = []) {
    return new Set((Array.isArray(cells) ? cells : []).map((cell) =>
      typeof cell === "string" ? cell : cell?.key
    ).filter(Boolean));
  }

  function nicheCellJaccard(aCells = [], bCells = []) {
    const a = nicheCellSet(aCells);
    const b = nicheCellSet(bCells);
    if (!a.size || !b.size) return 0;
    let intersection = 0;
    for (const key of a) {
      if (b.has(key)) intersection += 1;
    }
    return intersection / Math.max(1, a.size + b.size - intersection);
  }

  function peakDistanceCells(a, b) {
    if (!a || !b) return Infinity;
    const ax = Number(a.peak_ix ?? a.peakIx ?? a.ix);
    const ay = Number(a.peak_iy ?? a.peakIy ?? a.iy);
    const bx = Number(b.peak_ix ?? b.peakIx ?? b.ix);
    const by = Number(b.peak_iy ?? b.peakIy ?? b.iy);
    if (![ax, ay, bx, by].every(Number.isFinite)) return Infinity;
    return Math.hypot(ax - bx, ay - by);
  }

  function quantizedCoreCell(cell, quantCells) {
    const q = Math.max(1, Number(quantCells) || 1);
    const ix = Math.round(Number(cell?.ix || 0) / q) * q;
    const iy = Math.round(Number(cell?.iy || 0) / q) * q;
    return `${ix},${iy}`;
  }

  function buildSignalRaster(signalData) {
    const bounds = signalData.bounds || {};
    const minIx = Number(bounds.minIx);
    const minIy = Number(bounds.minIy);
    const maxIx = Number(bounds.maxIx);
    const maxIy = Number(bounds.maxIy);
    if (![minIx, minIy, maxIx, maxIy].every(Number.isFinite)) return null;

    const width = maxIx - minIx + 1;
    const height = maxIy - minIy + 1;
    if (width <= 1 || height <= 1 || width * height > 36000) return null;

    const z = new Float32Array(width * height);
    const signal = new Float32Array(width * height);
    for (const cell of signalData.cells.values()) {
      const x = cell.ix - minIx;
      const y = cell.iy - minIy;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const idx = y * width + x;
      z[idx] = Number(cell.z) || 0;
      signal[idx] = Number(cell.signal) || 0;
    }

    return { minIx, minIy, width, height, z, signal };
  }

  function rasterCellAt(signalData, raster, x, y) {
    const ix = raster.minIx + x;
    const iy = raster.minIy + y;
    return signalData.cells.get(`${ix},${iy}`) || null;
  }

  function componentFromMembers(members, peakCell) {
    const safeMembers = Array.isArray(members) ? members : [];
    if (!safeMembers.length || !peakCell) return null;
    return {
      peak: peakCell,
      members: safeMembers,
      peakSignal: peakCell.signal || 0,
      peakZ: peakCell.z || 0,
      peakAbsZ: Math.abs(peakCell.z || 0),
      meanSignal: safeMembers.reduce((sum, cell) => sum + Number(cell.signal || 0), 0) / safeMembers.length,
      meanZ: safeMembers.reduce((sum, cell) => sum + Number(cell.z || 0), 0) / safeMembers.length,
      meanAbsZ: safeMembers.reduce((sum, cell) => sum + Math.abs(Number(cell.z || 0)), 0) / safeMembers.length,
      componentCellCount: safeMembers.length
    };
  }

  function localBackgroundScore(field, width, height, x, y, radius = 2) {
    let sum = 0;
    let count = 0;
    for (let yy = Math.max(0, y - radius); yy <= Math.min(height - 1, y + radius); yy++) {
      for (let xx = Math.max(0, x - radius); xx <= Math.min(width - 1, x + radius); xx++) {
        if (xx === x && yy === y) continue;
        sum += Number(field[yy * width + xx] || 0);
        count += 1;
      }
    }
    return count ? sum / count : 0;
  }

  function constrainedFindCores(signalData, raster, blurred, rule) {
    const threshold = Math.max(0.16, Number(state.controls.lensZThreshold || 2.5) * rule.peakFactor);
    const cores = [];

    for (let y = 1; y < raster.height - 1; y++) {
      for (let x = 1; x < raster.width - 1; x++) {
        const idx = y * raster.width + x;
        const score = Number(blurred[idx] || 0);
        if (score < threshold) continue;

        const localBackground = localBackgroundScore(blurred, raster.width, raster.height, x, y, 2);
        if (score - localBackground < Math.max(0.05, threshold * 0.16)) continue;

        let localMax = true;
        for (let yy = y - 1; yy <= y + 1 && localMax; yy++) {
          for (let xx = x - 1; xx <= x + 1; xx++) {
            if (xx === x && yy === y) continue;
            if (Number(blurred[yy * raster.width + xx] || 0) > score) {
              localMax = false;
              break;
            }
          }
        }
        if (!localMax) continue;

        const cell = rasterCellAt(signalData, raster, x, y);
        if (!cell || Number(cell.metrics?.count || 0) <= 0) continue;
        cores.push({ x, y, cell, score, localBackground, localContrast: score - localBackground });
      }
    }

    cores.sort((a, b) => b.score - a.score || b.localContrast - a.localContrast);

    const selected = [];
    const suppress = Math.max(1, Number(rule.suppressCells) || 4);
    const maxCores = Math.max(8, Number(state.controls.maxCandidates || 8) * 4);
    for (const core of cores) {
      if (selected.some((other) => Math.hypot(other.x - core.x, other.y - core.y) < suppress)) continue;
      selected.push(core);
      if (selected.length >= maxCores) break;
    }
    return selected;
  }

  function barrierPenaltyForCell(cell) {
    if (!cell || typeof window === "undefined") return 0;
    const groups = window.GridWildOsmFeaturesLayer?.getFeatures?.() || {};
    const lat = Number(cell.lat);
    const lng = Number(cell.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 0;

    let penalty = 0;
    for (const feature of groups.buildings || []) {
      if (minDistanceToFeature(lat, lng, feature) <= 13) penalty = Math.max(penalty, 0.42);
    }
    for (const feature of groups.water || []) {
      if (minDistanceToFeature(lat, lng, feature) <= 12) penalty = Math.max(penalty, 0.24);
    }
    for (const feature of groups.trails || []) {
      if (minDistanceToFeature(lat, lng, feature) <= 7) penalty = Math.max(penalty, 0.12);
    }
    return penalty;
  }

  function constrainedGrowNiche(signalData, raster, blurred, rule, core, assigned) {
    const floor = Math.max(0.06, Number(state.controls.lensZThreshold || 2.5) * rule.floorFactor);
    const maxRadius = Math.max(1, Number(rule.maxRadiusCells) || 6);
    const maxCells = Math.max(1, Number(rule.maxCells) || 24);
    const queue = [{ x: core.x, y: core.y }];
    const seen = new Set([`${core.x},${core.y}`]);
    const scored = [];

    while (queue.length) {
      const current = queue.shift();
      const distance = Math.hypot(current.x - core.x, current.y - core.y);
      if (distance > maxRadius) continue;

      const idx = current.y * raster.width + current.x;
      const cell = rasterCellAt(signalData, raster, current.x, current.y);
      if (!cell) continue;
      if (assigned?.has(cell.key) && cell.key !== core.cell.key) continue;

      const signalScore = Number(blurred[idx] || 0);
      const distancePenalty = (distance / Math.max(1, maxRadius)) * 0.22;
      const barrierPenalty = barrierPenaltyForCell(cell);
      const score = signalScore - distancePenalty - barrierPenalty;
      if (score < floor && cell.key !== core.cell.key) continue;

      scored.push({ cell, score, distance, signalScore, barrierPenalty });

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const x = current.x + dx;
          const y = current.y + dy;
          if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) continue;
          const key = `${x},${y}`;
          if (seen.has(key)) continue;
          seen.add(key);
          queue.push({ x, y });
        }
      }
    }

    scored.sort((a, b) => b.score - a.score || a.distance - b.distance);
    const members = scored.slice(0, maxCells).map((row) => row.cell);
    const constrained = constrainMemberCells(members, core.cell, rule);
    if (constrained.length < Math.max(1, Number(rule.minCells) || 1)) return [];

    for (const cell of constrained) assigned?.add(cell.key);
    return constrained;
  }

  function connectedSubsetFromCore(members, coreCell) {
    const byKey = new Map((members || []).map((cell) => [cell.key, cell]));
    if (!coreCell?.key || !byKey.has(coreCell.key)) return [];

    const visited = new Set([coreCell.key]);
    const queue = [coreCell];
    const result = [];
    while (queue.length) {
      const cell = queue.shift();
      result.push(cell);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const key = `${cell.ix + dx},${cell.iy + dy}`;
          if (visited.has(key) || !byKey.has(key)) continue;
          visited.add(key);
          queue.push(byKey.get(key));
        }
      }
    }
    return result;
  }

  function supportNeighborCount(cell, keys) {
    return [
      `${cell.ix},${cell.iy - 1}`,
      `${cell.ix + 1},${cell.iy}`,
      `${cell.ix},${cell.iy + 1}`,
      `${cell.ix - 1},${cell.iy}`
    ].filter((key) => keys.has(key)).length;
  }

  function constrainMemberCells(members = [], coreCell, rule = {}) {
    const byKey = new Map();
    for (const cell of members || []) {
      if (cell?.key) byKey.set(cell.key, cell);
    }
    if (coreCell?.key) byKey.set(coreCell.key, coreCell);

    let constrained = connectedSubsetFromCore([...byKey.values()], coreCell);
    if (constrained.length <= 4) return constrained;

    for (let pass = 0; pass < 2; pass++) {
      const keys = new Set(constrained.map((cell) => cell.key));
      const keep = constrained.filter((cell) => {
        if (cell.key === coreCell?.key) return true;
        return supportNeighborCount(cell, keys) >= 2;
      });
      if (keep.length < Math.max(1, Number(rule.minCells) || 1)) break;
      constrained = connectedSubsetFromCore(keep, coreCell);
    }

    const maxRadius = Math.max(1, Number(rule.maxRadiusCells) || 6) + 0.15;
    constrained = constrained.filter((cell) => {
      if (cell.key === coreCell?.key) return true;
      return Math.hypot(cell.ix - coreCell.ix, cell.iy - coreCell.iy) <= maxRadius;
    });

    return connectedSubsetFromCore(constrained, coreCell);
  }

  function constrainedShapeMetrics(members = [], coreCell = null) {
    const normalized = normalizedComponentMembers(members);
    const keys = new Set(normalized.map((cell) => cell.key));
    const boundaryEdges = gridBoundaryEdges(normalized);
    const shapeContext = componentShapeContext(normalized);
    const maxRadiusCells = coreCell
      ? normalized.reduce((max, cell) => Math.max(max, Math.hypot(cell.ix - coreCell.ix, cell.iy - coreCell.iy)), 0)
      : 0;
    const complexity = boundaryEdges.length / Math.max(4, 4 * Math.sqrt(Math.max(1, normalized.length)));
    const oneCellNecks = normalized.filter((cell) =>
      cell.key !== coreCell?.key && supportNeighborCount(cell, keys) <= 1
    ).length;

    return {
      ...shapeContext,
      max_radius_cells: Number(maxRadiusCells.toFixed(2)),
      perimeter_edges: boundaryEdges.length,
      perimeter_complexity: Number(complexity.toFixed(2)),
      one_cell_necks: oneCellNecks
    };
  }

  function constrainedGeometryType(rule, component, placeContext, shapeMetrics) {
    const count = Number(component?.members?.length || 0);
    const placeType = String(placeContext?.place_type || "").toLowerCase();
    const geometryContext = placeContext?.geometry_context || {};
    if (count <= 4) return "point-halo";
    if (geometryContext.corridor_kind || placeType.includes("corridor")) return "corridor-buffer";
    if (shapeMetrics?.elongated && (placeType.includes("trail") || placeType.includes("stream") || placeType.includes("water"))) return "edge-band";
    if (count >= 52) return "place-section";
    return "patch-polygon";
  }

  function constrainedScaleClass(component, geometryType) {
    const count = Number(component?.members?.length || 0);
    if (geometryType === "point-halo" || count <= 4) return "micro-niche";
    if (geometryType === "corridor-buffer" || geometryType === "edge-band") return "corridor niche";
    if (count <= 25) return "patch niche";
    if (count <= 96) return "place niche";
    return "constellation";
  }

  function passesConstrainedContract(component, rule, placeContext) {
    const members = component?.members || [];
    const shape = constrainedShapeMetrics(members, component?.peak);
    const corridor = placeContext?.geometry_context?.corridor_kind;
    const maxElongation = corridor ? Math.max(5.6, Number(rule.maxElongation) || 3.2) : Number(rule.maxElongation) || 3.2;
    const maxComplexity = Number(rule.maxComplexity) || 3.2;

    if (!members.length) return { ok: false, shape, reason: "empty" };
    if (members.length > Number(rule.maxCells || 999)) return { ok: false, shape, reason: "area_cap" };
    if (shape.max_radius_cells > Number(rule.maxRadiusCells || 6) + 0.2) return { ok: false, shape, reason: "radius_cap" };
    if (Number(shape.elongation_ratio || 1) > maxElongation) return { ok: false, shape, reason: "elongation_cap" };
    if (Number(shape.perimeter_complexity || 1) > maxComplexity) return { ok: false, shape, reason: "complexity_cap" };
    if (Number(shape.one_cell_necks || 0) > Math.max(0, Math.floor(members.length / 18))) return { ok: false, shape, reason: "neck_cap" };

    return { ok: true, shape, reason: "passes" };
  }

  function constrainedComponentFromMembers(members, coreCell, rule) {
    const component = componentFromMembers(members, coreCell);
    if (!component) return null;
    const sizeScore = clamp01(Math.log1p(component.componentCellCount || 1) / Math.log1p(Math.max(8, Number(rule.maxCells) || 32)));
    const peakScore = clamp01(Math.abs(Number(component.peakZ) || 0) / 5);
    return {
      ...component,
      clusterSizeScore: sizeScore,
      clusterPeakScore: peakScore,
      clusterPreferenceScore: clamp01(sizeScore * 0.44 + peakScore * 0.56)
    };
  }

  function constrainedNicheFromComponent({ component, rule, origin, caps, activeLens, heatMetric, contract }) {
    const agg = aggregateComponent(component);
    const ll = agg.center;
    const distanceM = L.latLng(origin.lat, origin.lng).distanceTo(L.latLng(ll.lat, ll.lng));
    const m = agg.metrics;
    const weights = scoreWeights();
    const bio = clamp01((Math.log1p(m.species) / Math.log1p(caps.species * 4)) * 0.68 + m.activeRatio * 0.17 + m.lensPeakSignal * 0.15);
    const need = clamp01((1 - m.activeRatio) * 0.55 + (m.count > 0 && m.count < caps.count ? 0.22 : 0) + (m.observers <= 1 ? 0.08 : 0) + (1 - m.lensMeanSignal) * 0.15);
    const stale = clamp01(daysSince(m.latestObservedMs) / 240);
    const edge = detectEdgeScore(ll.lat, ll.lng);
    const lensPeak = clamp01(m.lensPeakSignal);
    const zStrength = clamp01((Number(m.lensPeakAbsZ) || 0) / 5);
    const componentSizeScore = clamp01(Math.log1p(Number(m.componentCellCount) || 1) / Math.log1p(96));
    const clusterPriority = clamp01(Number(m.clusterPreferenceScore) || (componentSizeScore * 0.42 + zStrength * 0.36 + lensPeak * 0.22));
    const questability = clamp01(
      clusterPriority * 0.36 +
      zStrength * 0.18 +
      componentSizeScore * 0.12 +
      lensPeak * 0.08 +
      bio * weights.bio * 0.7 +
      need * weights.need * 0.7 +
      stale * weights.stale * 0.7 +
      edge * weights.edge * 0.7
    );

    const placeContext = resolveGeometricPlaceContext(
      ll.lat,
      ll.lng,
      component,
      resolvePlaceContext(ll.lat, ll.lng)
    );
    const geometryType = constrainedGeometryType(rule, component, placeContext, contract?.shape || {});
    const scaleClass = constrainedScaleClass(component, geometryType);
    const nicheType = chooseType({ bio, need, stale, edge }, m, placeContext);
    const theme = `${themeFor(nicheType, placeContext)} / ${scaleClass}`;
    const initialFocus = topTaxonomySubject({
      ...m,
      active_lens: activeLens,
      heat_metric: heatMetric
    });
    const taxonFocus = theme.includes("Plants") || nicheType === "edge_habitat_niche"
      ? { iconic: "Plantae", label: "plants" }
      : initialFocus?.label
        ? { iconic: initialFocus.rank || "Any", label: titleSubjectCase(initialFocus.label), source_rank: initialFocus.rank || null }
        : { iconic: "Any", label: "life" };
    const coreCell = component.peak ? `${component.peak.ix},${component.peak.iy}` : "";
    const sourceKey = [
      "gw-local-niche-v4",
      activeLens,
      isFovSampling() ? "fov" : `${numericRadiusM(500)}m`,
      "constrained",
      scaleClass.replace(/\s+/g, "-"),
      quantizedCoreCell(component.peak, rule.quantCells),
      agg.componentId
    ].join(":");

    const niche = {
      source_key: sourceKey,
      title: "",
      short_title: "",
      description: "A GridWild interpreted sampling opportunity generated as a peak-centered, constrained geometry niche.",
      niche_type: nicheType,
      theme,
      centroid_lat: ll.lat,
      centroid_lng: ll.lng,
      geometry: boundsForCells(agg.minIx, agg.minIy, agg.maxIx, agg.maxIy),
      grid_cell_ids: agg.cells,
      radius_m: Math.round(Math.max(18, Math.sqrt(Math.max(1, m.componentCellCount || agg.cells.length)) * GRID_SIZE_M * 1.14)),
      scale_level: `constrained-geometry:${scaleClass}`,
      taxon_focus: taxonFocus,
      seasonal_profile: { mode: "constrained_geometry_runtime_v1" },
      evidence_summary: evidenceFor(nicheType, m, placeContext),
      metrics: {
        ...m,
        algorithm: "constrained_geometry_niche_v1",
        active_lens: activeLens,
        heat_metric: heatMetric,
        sampling_extent: isFovSampling() ? "fov" : "radius_m",
        sampling_radius_m: isFovSampling() ? null : numericRadiusM(500),
        emphasis: state.controls.emphasis,
        z_threshold: Number(state.controls.lensZThreshold || 2.5),
        core_cell: coreCell,
        peak_cell: coreCell,
        peak_signal: Number(lensPeak.toFixed(3)),
        peak_z: Number((m.lensPeakZ || 0).toFixed(3)),
        peak_abs_z: Number((m.lensPeakAbsZ || 0).toFixed(3)),
        component_id: agg.componentId,
        component_cell_count: Number(m.componentCellCount || agg.cells.length),
        cluster_priority_score: Number(clusterPriority.toFixed(3)),
        geometry_type: geometryType,
        scale_class: scaleClass,
        display_geometry: geometryType,
        interaction_radius_m: Math.round(Math.max(28, Math.sqrt(Math.max(1, agg.cells.length)) * GRID_SIZE_M * 1.35)),
        geometry_contract: contract || null,
        geometry_context: placeContext.geometry_context || null,
        member_cells_are_analysis_object: true
      },
      confidence: clamp01(0.36 + placeContext.label_confidence * 0.2 + questability * 0.26 + clusterPriority * 0.18),
      novelty_score: need,
      sampling_need_score: need,
      biodiversity_score: bio,
      questability_score: questability,
      place_context: placeContext,
      primary_place_label: placeContext.primary_label || null,
      secondary_place_label: placeContext.secondary_label || null,
      place_label_confidence: placeContext.label_confidence || 0,
      generated_by: "gridwild_constrained_geometry_niche_v1",
      visibility: "public",
      status: "active",
      distance_m: Math.round(distanceM),
      comment_count: 0,
      _runtimeOnly: true
    };

    niche.title = buildNicheDisplayTitle(niche);
    niche.short_title = niche.title.replace(/^(Sample|Survey|Look for|Revisit|Check)\s+/i, "");
    return niche;
  }

  function trailCellScore(cell) {
    const signalScore = clamp01(Number(cell?.signal || 0));
    const zScore = clamp01(Math.max(0, Number(cell?.z || 0)) / 4);
    return clamp01(signalScore * TRAIL_CORRIDOR_RULE.signalWeight + zScore * TRAIL_CORRIDOR_RULE.zWeight);
  }

  function smoothTrailBins(bins = []) {
    return bins.map((bin, index) => {
      const prev = bins[index - 1]?.score ?? bin.score;
      const next = bins[index + 1]?.score ?? bin.score;
      return {
        ...bin,
        smoothScore: bin.score * 0.58 + prev * 0.21 + next * 0.21
      };
    });
  }

  function trailRunsFromBins(bins = [], threshold) {
    const runs = [];
    let current = [];

    for (const bin of bins) {
      if (bin.smoothScore >= threshold || bin.peakScore >= TRAIL_CORRIDOR_RULE.minPeakScore) {
        current.push(bin);
      } else if (current.length) {
        runs.push(current);
        current = [];
      }
    }
    if (current.length) runs.push(current);
    return runs;
  }

  function splitTrailRun(run = []) {
    const maxBins = Math.max(1, Math.ceil(TRAIL_CORRIDOR_RULE.maxLengthM / TRAIL_CORRIDOR_RULE.binM));
    if (run.length <= maxBins) return [run];

    const chunks = [];
    for (let i = 0; i < run.length; i += maxBins) {
      chunks.push(run.slice(i, i + maxBins));
    }
    return chunks;
  }

  function trailCorridorComponentFromRun(run = [], cellRows = [], inclusive = false) {
    const startM = Math.min(...run.map(bin => bin.startM));
    const endM = Math.max(...run.map(bin => bin.endM));
    const byKey = new Map();

    for (const row of cellRows) {
      if (row.alongM < startM - TRAIL_CORRIDOR_RULE.binM * 0.5) continue;
      if (row.alongM > endM + TRAIL_CORRIDOR_RULE.binM * 0.5) continue;
      if (row.distanceM > TRAIL_CORRIDOR_RULE.bufferM) continue;
      byKey.set(row.cell.key, row);
    }

    const rows = [...byKey.values()]
      .sort((a, b) => inclusive
        ? a.alongM - b.alongM || a.distanceM - b.distanceM
        : b.score - a.score || a.distanceM - b.distanceM)
      .slice(0, TRAIL_CORRIDOR_RULE.maxCells);
    if (rows.length < TRAIL_CORRIDOR_RULE.minCells) return null;

    const members = rows.map(row => row.cell);
    const peakRow = rows.slice().sort((a, b) => b.score - a.score || a.distanceM - b.distanceM)[0];
    const component = componentFromMembers(members, peakRow.cell);
    if (!component) return null;

    const meanScore = rows.reduce((sum, row) => sum + row.score, 0) / rows.length;
    const peakScore = rows[0]?.score || 0;
    const lengthM = Math.max(0, endM - startM);
    if (lengthM < TRAIL_CORRIDOR_RULE.minLengthM) return null;
    if (meanScore < TRAIL_CORRIDOR_RULE.minMeanScore && peakScore < TRAIL_CORRIDOR_RULE.minPeakScore) return null;

    return {
      ...component,
      trailStartM: startM,
      trailEndM: endM,
      trailLengthM: lengthM,
      trailMeanScore: meanScore,
      trailPeakScore: peakScore,
      clusterSizeScore: clamp01(lengthM / TRAIL_CORRIDOR_RULE.maxLengthM),
      clusterPeakScore: clamp01(peakScore),
      clusterPreferenceScore: clamp01(meanScore * 0.46 + peakScore * 0.34 + Math.min(1, lengthM / 180) * 0.2)
    };
  }

  function trailCorridorComponentForWholeTrail(trailLengthM, cellRows = []) {
    const syntheticRun = [{
      startM: 0,
      endM: trailLengthM
    }];
    return trailCorridorComponentFromRun(syntheticRun, cellRows, true);
  }

  function trailPlaceContext(feature, component, baseContext) {
    const label = featureLabel(feature);
    const corridor = {
      feature,
      kind: "trails",
      label,
      distanceM: 0,
      angle_diff_deg: 0,
      confidence: label ? 0.88 : 0.72,
      relation: "along"
    };
    return applyGeometryContextToPlace(
      baseContext,
      {
        ...componentShapeContext(component.members || []),
        trail_corridor: true,
        trail_length_m: Math.round(component.trailLengthM || 0)
      },
      corridor
    );
  }

  function trailCorridorNicheFromComponent({ component, feature, origin, caps, activeLens, heatMetric }) {
    const agg = aggregateComponent(component);
    const ll = agg.center;
    const distanceM = L.latLng(origin.lat, origin.lng).distanceTo(L.latLng(ll.lat, ll.lng));
    const m = agg.metrics;
    const placeContext = trailPlaceContext(feature, component, resolvePlaceContext(ll.lat, ll.lng));
    const lensPeak = clamp01(m.lensPeakSignal);
    const zStrength = clamp01((Number(m.lensPeakAbsZ) || 0) / 5);
    const trailStrength = clamp01((component.trailMeanScore || 0) * 0.56 + (component.trailPeakScore || 0) * 0.34 + Math.min(1, (component.trailLengthM || 0) / 200) * 0.1);
    const bio = clamp01((Math.log1p(m.species) / Math.log1p(caps.species * 4)) * 0.6 + m.activeRatio * 0.16 + trailStrength * 0.24);
    const need = clamp01((1 - m.activeRatio) * 0.46 + (m.observers <= 1 ? 0.12 : 0) + (1 - m.lensMeanSignal) * 0.18);
    const stale = clamp01(daysSince(m.latestObservedMs) / 240);
    const questability = clamp01(trailStrength * 0.46 + zStrength * 0.14 + lensPeak * 0.1 + bio * 0.16 + need * 0.1 + stale * 0.04);
    const initialFocus = topTaxonomySubject({
      ...m,
      active_lens: activeLens,
      heat_metric: heatMetric
    });
    const taxonFocus = initialFocus?.label
      ? { iconic: initialFocus.rank || "Any", label: titleSubjectCase(initialFocus.label), source_rank: initialFocus.rank || null }
      : { iconic: "Any", label: "life" };
    const coreCell = component.peak ? `${component.peak.ix},${component.peak.iy}` : "";
    const featureKey = String(feature?.id || featureLabel(feature) || "trail").replace(/\s+/g, "-").slice(0, 64);
    const sourceKey = [
      "gw-local-niche-v4",
      activeLens,
      isFovSampling() ? "fov" : `${numericRadiusM(500)}m`,
      "trail-corridor",
      featureKey,
      Math.round(component.trailStartM || 0),
      Math.round(component.trailEndM || 0),
      agg.componentId
    ].join(":");

    const niche = {
      source_key: sourceKey,
      title: "",
      short_title: "",
      description: "A GridWild trail corridor niche generated from OSM path geometry and sustained Lens heat along the trail edge.",
      niche_type: "edge_habitat_niche",
      theme: "Trail corridor / corridor niche",
      centroid_lat: ll.lat,
      centroid_lng: ll.lng,
      geometry: boundsForCells(agg.minIx, agg.minIy, agg.maxIx, agg.maxIy),
      grid_cell_ids: agg.cells,
      radius_m: Math.round(Math.max(36, Math.min(220, (component.trailLengthM || 80) * 0.42))),
      scale_level: "constrained-geometry:corridor niche",
      taxon_focus: taxonFocus,
      seasonal_profile: { mode: "trail_corridor_runtime_v1" },
      evidence_summary: evidenceFor("edge_habitat_niche", m, placeContext),
      metrics: {
        ...m,
        algorithm: "trail_corridor_niche_v1",
        active_lens: activeLens,
        heat_metric: heatMetric,
        sampling_extent: isFovSampling() ? "fov" : "radius_m",
        sampling_radius_m: isFovSampling() ? null : numericRadiusM(500),
        emphasis: state.controls.emphasis,
        z_threshold: Number(state.controls.lensZThreshold || 2.5),
        core_cell: coreCell,
        peak_cell: coreCell,
        peak_signal: Number(lensPeak.toFixed(3)),
        peak_z: Number((m.lensPeakZ || 0).toFixed(3)),
        peak_abs_z: Number((m.lensPeakAbsZ || 0).toFixed(3)),
        component_id: agg.componentId,
        component_cell_count: Number(m.componentCellCount || agg.cells.length),
        cluster_priority_score: Number((component.clusterPreferenceScore || trailStrength).toFixed(3)),
        geometry_type: "corridor-buffer",
        scale_class: "corridor niche",
        display_geometry: "corridor-buffer",
        interaction_radius_m: Math.round(Math.max(48, Math.min(260, (component.trailLengthM || 80) * 0.5))),
        trail_feature_id: feature?.id || null,
        trail_feature_name: featureLabel(feature) || null,
        trail_start_m: Math.round(component.trailStartM || 0),
        trail_end_m: Math.round(component.trailEndM || 0),
        trail_length_m: Math.round(component.trailLengthM || 0),
        trail_buffer_m: TRAIL_CORRIDOR_RULE.bufferM,
        trail_mean_score: Number((component.trailMeanScore || 0).toFixed(3)),
        trail_peak_score: Number((component.trailPeakScore || 0).toFixed(3)),
        trail_corridor_mode: TRAIL_CORRIDOR_RULE.wholeTrailMode ? "whole_trail_inclusive" : "hot_run",
        trail_inclusion_policy: TRAIL_CORRIDOR_RULE.wholeTrailMode ? "emit_if_trail_cells_in_fov" : "emit_hot_runs",
        geometry_contract: {
          ok: true,
          reason: "trail_corridor",
          max_width_m: TRAIL_CORRIDOR_RULE.bufferM * 2,
          min_length_m: TRAIL_CORRIDOR_RULE.minLengthM,
          max_length_m: TRAIL_CORRIDOR_RULE.maxLengthM
        },
        geometry_context: placeContext.geometry_context || null,
        member_cells_are_analysis_object: true
      },
      confidence: clamp01(0.42 + placeContext.label_confidence * 0.22 + questability * 0.24 + trailStrength * 0.12),
      novelty_score: need,
      sampling_need_score: need,
      biodiversity_score: bio,
      questability_score: questability,
      place_context: placeContext,
      primary_place_label: placeContext.primary_label || null,
      secondary_place_label: placeContext.secondary_label || null,
      place_label_confidence: placeContext.label_confidence || 0,
      generated_by: "gridwild_trail_corridor_niche_v1",
      visibility: "public",
      status: "active",
      distance_m: Math.round(distanceM),
      comment_count: 0,
      _runtimeOnly: true
    };

    niche.title = buildNicheDisplayTitle(niche);
    niche.short_title = niche.title.replace(/^(Sample|Survey|Look for|Revisit|Check)\s+/i, "");
    return niche;
  }

  function generateTrailCorridorCandidates(signalData, origin, caps, activeLens, heatMetric) {
    if (!TRAIL_CORRIDOR_RULE.enabled || typeof map === "undefined") return { rows: [], components: [], debug: { trails: 0, emitted: 0 } };
    const trails = (window.GridWildOsmFeaturesLayer?.getFeatures?.().trails || [])
      .filter((feature) => Array.isArray(feature.points) && feature.points.length >= 2);
    const rows = [];
    const components = [];
    const debug = [];

    for (const feature of trails) {
      const segments = featureSegmentSamples(feature);
      const trailLengthM = segments.length ? segments[segments.length - 1].endM : 0;
      if (trailLengthM < TRAIL_CORRIDOR_RULE.minLengthM) continue;

      const cellRows = [];
      for (const cell of signalData.cells.values()) {
        const projection = nearestTrailProjection(cell, segments);
        if (!projection || projection.distanceM > TRAIL_CORRIDOR_RULE.bufferM) continue;
        const score = trailCellScore(cell);
        cellRows.push({
          cell,
          score,
          z: Number(cell.z || 0),
          signal: Number(cell.signal || 0),
          distanceM: projection.distanceM,
          alongM: projection.alongM
        });
      }

      if (cellRows.length < TRAIL_CORRIDOR_RULE.minCells) continue;

      const binCount = Math.max(1, Math.ceil(trailLengthM / TRAIL_CORRIDOR_RULE.binM));
      const bins = Array.from({ length: binCount }, (_, index) => ({
        index,
        startM: index * TRAIL_CORRIDOR_RULE.binM,
        endM: Math.min(trailLengthM, (index + 1) * TRAIL_CORRIDOR_RULE.binM),
        rows: [],
        score: 0,
        peakScore: 0
      }));

      for (const row of cellRows) {
        const idx = Math.max(0, Math.min(binCount - 1, Math.floor(row.alongM / TRAIL_CORRIDOR_RULE.binM)));
        bins[idx].rows.push(row);
      }

      for (const bin of bins) {
        if (!bin.rows.length) continue;
        const sorted = bin.rows.slice().sort((a, b) => b.score - a.score);
        const topRows = sorted.slice(0, Math.min(4, sorted.length));
        bin.score = topRows.reduce((sum, row) => sum + row.score, 0) / topRows.length;
        bin.peakScore = sorted[0]?.score || 0;
      }

      const scoredBins = bins.filter(bin => bin.rows.length);
      if (!scoredBins.length) continue;
      const mean = scoredBins.reduce((sum, bin) => sum + bin.score, 0) / scoredBins.length;
      const variance = scoredBins.reduce((sum, bin) => sum + (bin.score - mean) ** 2, 0) / scoredBins.length;
      const sd = Math.sqrt(variance);
      const threshold = Math.max(TRAIL_CORRIDOR_RULE.minMeanScore, mean + sd * 0.32);
      const smoothed = smoothTrailBins(bins);
      const runs = trailRunsFromBins(smoothed, threshold)
        .flatMap(splitTrailRun);
      let emitted = 0;

      const wholeTrailComponent = TRAIL_CORRIDOR_RULE.wholeTrailMode
        ? trailCorridorComponentForWholeTrail(trailLengthM, cellRows)
        : null;
      const candidateComponents = wholeTrailComponent
        ? [wholeTrailComponent]
        : runs.map(run => trailCorridorComponentFromRun(run, cellRows)).filter(Boolean);

      for (const component of candidateComponents) {
        const niche = trailCorridorNicheFromComponent({
          component,
          feature,
          origin,
          caps,
          activeLens,
          heatMetric
        });
        if (!TRAIL_CORRIDOR_RULE.wholeTrailMode && Number(niche.questability_score || 0) < 0.18) continue;
        rows.push(niche);
        components.push(component);
        emitted += 1;
      }

      debug.push({
        feature: featureLabel(feature) || feature.id || "trail",
        lengthM: Math.round(trailLengthM),
        candidateCells: cellRows.length,
        threshold: Number(threshold.toFixed(3)),
        mode: TRAIL_CORRIDOR_RULE.wholeTrailMode ? "whole-trail" : "hot-runs",
        emitted
      });
    }

    return {
      rows,
      components,
      debug: {
        trails: trails.length,
        emitted: rows.length,
        features: debug.slice(0, 12)
      }
    };
  }

  function heatBaseScore(cell) {
    const signalScore = clamp01(Number(cell?.signal || 0));
    const zScore = clamp01(Math.abs(Number(cell?.z || 0)) / 4);
    return clamp01(signalScore * HEAT_TENDRIL_RULE.signalWeight + zScore * HEAT_TENDRIL_RULE.zWeight);
  }

  function heatLocalEdgeScore(cell, signalData) {
    if (!cell || !signalData?.cells) return 0;
    const center = heatBaseScore(cell);
    const sample = (dx, dy) => {
      const next = signalData.cells.get(`${cell.ix + dx},${cell.iy + dy}`);
      return next ? heatBaseScore(next) : center;
    };
    const left = sample(-1, 0);
    const right = sample(1, 0);
    const up = sample(0, -1);
    const down = sample(0, 1);
    const ul = sample(-1, -1);
    const ur = sample(1, -1);
    const dl = sample(-1, 1);
    const dr = sample(1, 1);
    const sobelX = (ur + 2 * right + dr) - (ul + 2 * left + dl);
    const sobelY = (dl + 2 * down + dr) - (ul + 2 * up + ur);
    const gradient = Math.hypot(sobelX, sobelY) / 4;
    const neighbors = [left, right, up, down, ul, ur, dl, dr];
    const localContrast = Math.max(...neighbors.map((value) => Math.abs(center - value)));
    const localDrop = Math.max(0, center - Math.min(...neighbors));
    return clamp01(gradient * 0.5 + localContrast * 0.3 + localDrop * 0.2);
  }

  function heatPathPasses() {
    const passes = Array.isArray(HEAT_TENDRIL_RULE.candidatePasses)
      ? HEAT_TENDRIL_RULE.candidatePasses
      : [];
    return passes.length
      ? passes
      : [{ name: "heat", minScore: HEAT_TENDRIL_RULE.minScore, minHeat: 0, minEdge: 0, heatWeight: 1, edgeWeight: 0 }];
  }

  function heatTendrilCellScore(cell, signalData = null, pass = null) {
    const heatScore = heatBaseScore(cell);
    if (!pass || !signalData) return heatScore;
    const edgeScore = heatLocalEdgeScore(cell, signalData);
    return clamp01(
      heatScore * Number(pass.heatWeight ?? 1) +
      edgeScore * Number(pass.edgeWeight ?? 0)
    );
  }

  function skeletonizeBinaryMask(binary, width, height, maxIterations = 60) {
    const mask = Uint8Array.from(binary);
    const at = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : mask[y * width + x]);
    let changed = true;
    let iteration = 0;

    while (changed && iteration < maxIterations) {
      changed = false;
      for (let step = 0; step < 2; step++) {
        const remove = [];
        for (let y = 1; y < height - 1; y++) {
          for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            if (!mask[idx]) continue;

            const p2 = at(x, y - 1);
            const p3 = at(x + 1, y - 1);
            const p4 = at(x + 1, y);
            const p5 = at(x + 1, y + 1);
            const p6 = at(x, y + 1);
            const p7 = at(x - 1, y + 1);
            const p8 = at(x - 1, y);
            const p9 = at(x - 1, y - 1);
            const neighbors = [p2, p3, p4, p5, p6, p7, p8, p9];
            const count = neighbors.reduce((sum, value) => sum + value, 0);
            if (count < 2 || count > 6) continue;

            let transitions = 0;
            for (let i = 0; i < neighbors.length; i++) {
              if (!neighbors[i] && neighbors[(i + 1) % neighbors.length]) transitions += 1;
            }
            if (transitions !== 1) continue;

            const keepStep0 = p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0;
            const keepStep1 = p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0;
            if ((step === 0 && keepStep0) || (step === 1 && keepStep1)) remove.push(idx);
          }
        }
        if (remove.length) {
          changed = true;
          for (const idx of remove) mask[idx] = 0;
        }
      }
      iteration += 1;
    }

    return mask;
  }

  function skeletonizeHeatRows(signalData, scored = new Map(), pass = {}) {
    if (!HEAT_TENDRIL_RULE.skeletonizeBeforeVector || scored.size < 9) {
      return { rows: scored, skeletonCells: scored.size, used: false };
    }

    const bounds = signalData.bounds || {};
    const minIx = Number(bounds.minIx);
    const minIy = Number(bounds.minIy);
    const maxIx = Number(bounds.maxIx);
    const maxIy = Number(bounds.maxIy);
    if (![minIx, minIy, maxIx, maxIy].every(Number.isFinite)) {
      return { rows: scored, skeletonCells: scored.size, used: false };
    }

    const width = maxIx - minIx + 1;
    const height = maxIy - minIy + 1;
    if (width <= 2 || height <= 2 || width * height > 36000) {
      return { rows: scored, skeletonCells: scored.size, used: false };
    }

    const field = new Float32Array(width * height);
    for (const row of scored.values()) {
      const x = row.cell.ix - minIx;
      const y = row.cell.iy - minIy;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      field[y * width + x] = Math.max(field[y * width + x], Number(row.score || 0));
    }

    const blurred = blurRaster(field, width, height, Number(HEAT_TENDRIL_RULE.skeletonSigmaCells) || 0.9);
    const threshold = Math.max(0.02, Number(pass.skeletonThreshold ?? HEAT_TENDRIL_RULE.skeletonThreshold) || 0.26);
    const binary = new Uint8Array(width * height);
    for (let idx = 0; idx < blurred.length; idx++) {
      if (blurred[idx] >= threshold) binary[idx] = 1;
    }

    const skeleton = skeletonizeBinaryMask(
      binary,
      width,
      height,
      Math.max(1, Number(HEAT_TENDRIL_RULE.skeletonMaxIterations) || 60)
    );
    const skeletonRows = new Map();

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!skeleton[y * width + x]) continue;
        const ix = minIx + x;
        const iy = minIy + y;
        const key = `${ix},${iy}`;
        const cell = signalData.cells.get(key);
        if (!cell) continue;
        const heatScore = heatBaseScore(cell);
        const edgeScore = heatLocalEdgeScore(cell, signalData);
        const score = clamp01(
          heatScore * Number(pass.heatWeight ?? 1) +
          edgeScore * Number(pass.edgeWeight ?? 0)
        );
        if (score < Math.max(0.01, Number(pass.minScore ?? HEAT_TENDRIL_RULE.minScore) * 0.45)) continue;
        skeletonRows.set(key, {
          cell,
          score,
          heatScore,
          edgeScore,
          passName: pass.name || "heat",
          skeleton: true
        });
      }
    }

    return skeletonRows.size >= Math.max(2, Number(HEAT_TENDRIL_RULE.minVectorLengthCells) || 5)
      ? { rows: skeletonRows, skeletonCells: skeletonRows.size, used: true }
      : { rows: scored, skeletonCells: skeletonRows.size, used: false };
  }

  function heatTendrilAxis(members = []) {
    const shape = componentShapeContext(members);
    const points = (members || [])
      .map((cell) => ({ cell, x: Number(cell.ix), y: Number(cell.iy) }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (points.length < 2) return null;

    const angleRad = (Number(shape.axis_angle_deg || 0) * Math.PI) / 180;
    const ux = Math.cos(angleRad);
    const uy = Math.sin(angleRad);
    const cx = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const cy = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    let minProj = Infinity;
    let maxProj = -Infinity;

    for (const point of points) {
      const dx = point.x - cx;
      const dy = point.y - cy;
      const proj = dx * ux + dy * uy;
      minProj = Math.min(minProj, proj);
      maxProj = Math.max(maxProj, proj);
    }

    if (![minProj, maxProj].every(Number.isFinite)) return null;
    return { shape, ux, uy, cx, cy, minProj, maxProj };
  }

  function extendHeatTendrilMembers(signalData, members = []) {
    if (!HEAT_TENDRIL_RULE.extendAlongAxis || !signalData?.cells?.size || members.length < 2) {
      return { members, added: 0, axis: null };
    }

    const axis = heatTendrilAxis(members);
    if (!axis) return { members, added: 0, axis: null };

    const byKey = new Map(members.map((cell) => [cell.key, cell]));
    const widthCells = Math.max(0.75, Number(HEAT_TENDRIL_RULE.extensionWidthCells) || 2.5);
    const padCells = Math.max(0, Number(HEAT_TENDRIL_RULE.extensionPadCells) || 0);
    const minScore = Math.max(0, Number(HEAT_TENDRIL_RULE.extensionMinScore) || 0);
    const maxAdded = Math.max(0, Number(HEAT_TENDRIL_RULE.extensionMaxAddedCells) || 0);
    const candidates = new Map();

    const inAxisEnvelope = (cell) => {
      const dx = Number(cell.ix) - axis.cx;
      const dy = Number(cell.iy) - axis.cy;
      if (![dx, dy].every(Number.isFinite)) return false;
      const proj = dx * axis.ux + dy * axis.uy;
      if (proj < axis.minProj - padCells || proj > axis.maxProj + padCells) return false;
      const perp = Math.abs(dx * -axis.uy + dy * axis.ux);
      return perp <= widthCells;
    };

    for (const cell of signalData.cells.values()) {
      if (!cell?.key || byKey.has(cell.key)) continue;
      const score = heatTendrilCellScore(cell);
      const active = Number(cell.metrics?.count || 0) > 0;
      if (score < minScore && !(HEAT_TENDRIL_RULE.extensionIncludeActiveCells && active)) continue;
      if (!inAxisEnvelope(cell)) continue;
      candidates.set(cell.key, { cell, score });
    }

    const offsets = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0],           [1, 0],
      [-1, 1],  [0, 1],  [1, 1]
    ];
    const queue = members.slice();
    const queued = new Set(queue.map((cell) => cell.key));
    let added = 0;

    while (queue.length && added < maxAdded) {
      const current = queue.shift();
      for (const [dx, dy] of offsets) {
        const key = `${current.ix + dx},${current.iy + dy}`;
        if (byKey.has(key) || queued.has(key)) continue;
        const candidate = candidates.get(key);
        if (!candidate) continue;
        byKey.set(key, candidate.cell);
        queued.add(key);
        queue.push(candidate.cell);
        added += 1;
        if (added >= maxAdded) break;
      }
    }

    const extended = [...byKey.values()];
    const capped = extended.length > HEAT_TENDRIL_RULE.maxCells
      ? extended
          .map((cell) => {
            const dx = Number(cell.ix) - axis.cx;
            const dy = Number(cell.iy) - axis.cy;
            const perp = Math.abs(dx * -axis.uy + dy * axis.ux);
            return { cell, perp, score: heatTendrilCellScore(cell) };
          })
          .sort((a, b) => a.perp - b.perp || b.score - a.score)
          .slice(0, HEAT_TENDRIL_RULE.maxCells)
          .map((row) => row.cell)
      : extended;

    return {
      members: capped,
      added: Math.max(0, capped.length - members.length),
      axis
    };
  }

  function heatPathNeighborRows(row, rowMap) {
    const out = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const next = rowMap.get(`${row.cell.ix + dx},${row.cell.iy + dy}`);
        if (next) out.push(next);
      }
    }
    return out;
  }

  function heatPathEndpointPair(rows = [], rowMap = new Map()) {
    if (rows.length < 2) return null;
    const axis = heatTendrilAxis(rows.map((row) => row.cell));
    const candidates = new Map();
    const addCandidate = (row) => {
      if (row?.cell?.key) candidates.set(row.cell.key, row);
    };

    for (const row of rows) {
      const neighborCount = heatPathNeighborRows(row, rowMap).length;
      if (neighborCount <= 2) addCandidate(row);
    }

    if (axis) {
      const projected = rows
        .map((row) => {
          const dx = Number(row.cell.ix) - axis.cx;
          const dy = Number(row.cell.iy) - axis.cy;
          return { row, proj: dx * axis.ux + dy * axis.uy };
        })
        .sort((a, b) => a.proj - b.proj);
      const take = Math.max(3, Math.min(10, Math.ceil(rows.length / 10)));
      for (const item of projected.slice(0, take)) addCandidate(item.row);
      for (const item of projected.slice(-take)) addCandidate(item.row);
    }

    for (const row of rows.slice(0, 8)) addCandidate(row);

    const limit = Math.max(8, Number(HEAT_TENDRIL_RULE.maxEndpointCandidates) || 34);
    const list = [...candidates.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    const pool = list.length >= 2 ? list : rows.slice(0, Math.min(rows.length, limit));

    let best = null;
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const a = pool[i];
        const b = pool[j];
        const distanceCells = Math.hypot(a.cell.ix - b.cell.ix, a.cell.iy - b.cell.iy);
        const score = distanceCells * 0.78 + Math.min(a.score, b.score) * 4.2;
        if (!best || score > best.score) best = { start: a, end: b, distanceCells, score };
      }
    }
    return best;
  }

  function solveHeatPathVector(rows = []) {
    if (!HEAT_TENDRIL_RULE.vectorMode || rows.length < 2) return null;
    const rowMap = new Map(rows.map((row) => [row.cell.key, row]));
    const pair = heatPathEndpointPair(rows, rowMap);
    if (!pair || pair.distanceCells < Math.max(2, Number(HEAT_TENDRIL_RULE.minVectorLengthCells) || 5)) return null;

    const startKey = pair.start.cell.key;
    const endKey = pair.end.cell.key;
    const distances = new Map([[startKey, 0]]);
    const previous = new Map();
    const unsettled = new Set([startKey]);
    const visited = new Set();

    while (unsettled.size) {
      let currentKey = null;
      let currentDistance = Infinity;
      for (const key of unsettled) {
        const distance = distances.get(key) ?? Infinity;
        if (distance < currentDistance) {
          currentDistance = distance;
          currentKey = key;
        }
      }
      if (!currentKey) break;
      unsettled.delete(currentKey);
      if (visited.has(currentKey)) continue;
      visited.add(currentKey);
      if (currentKey === endKey) break;

      const current = rowMap.get(currentKey);
      if (!current) continue;
      for (const next of heatPathNeighborRows(current, rowMap)) {
        if (visited.has(next.cell.key)) continue;
        const stepCells = Math.hypot(next.cell.ix - current.cell.ix, next.cell.iy - current.cell.iy);
        const heatReward = clamp01((current.score + next.score) / 2);
        const edgeReward = clamp01((Number(current.edgeScore || 0) + Number(next.edgeScore || 0)) / 2);
        const cost = stepCells * (1.38 - heatReward * 0.48 - edgeReward * 0.42);
        const candidateDistance = currentDistance + cost;
        if (candidateDistance < (distances.get(next.cell.key) ?? Infinity)) {
          distances.set(next.cell.key, candidateDistance);
          previous.set(next.cell.key, currentKey);
          unsettled.add(next.cell.key);
        }
      }
    }

    if (!distances.has(endKey)) return null;
    const pathKeys = [];
    let cursor = endKey;
    while (cursor) {
      pathKeys.push(cursor);
      if (cursor === startKey) break;
      cursor = previous.get(cursor);
    }
    pathKeys.reverse();
    if (pathKeys[0] !== startKey) return null;

    const pathRows = pathKeys.map((key) => rowMap.get(key)).filter(Boolean);
    if (pathRows.length < Math.max(2, Number(HEAT_TENDRIL_RULE.minVectorLengthCells) || 5)) return null;

    const gridPoints = pathRows.map((row) => ({ x: row.cell.ix + 0.5, y: row.cell.iy + 0.5 }));
    const simplifiedPoints = simplifyOpenContourPath(
      gridPoints,
      Math.max(0.05, Number(HEAT_TENDRIL_RULE.simplifyVectorToleranceCells) || 0.55)
    );
    const polyline = simplifiedPoints.map((point) => gridLatLng(point.x, point.y));
    let lengthM = 0;
    for (let i = 1; i < pathRows.length; i++) {
      lengthM += Math.hypot(
        pathRows[i].cell.ix - pathRows[i - 1].cell.ix,
        pathRows[i].cell.iy - pathRows[i - 1].cell.iy
      ) * GRID_SIZE_M;
    }

    return {
      cells: pathRows.map((row) => row.cell),
      cellKeys: pathKeys,
      polyline,
      lengthM,
      endpointDistanceCells: pair.distanceCells,
      meanScore: pathRows.reduce((sum, row) => sum + row.score, 0) / pathRows.length,
      peakScore: Math.max(...pathRows.map((row) => row.score)),
      simplifiedPointCount: polyline.length
    };
  }

  function heatTendrilComponents(signalData) {
    if (!HEAT_TENDRIL_RULE.enabled) return [];

    const passes = heatPathPasses();
    const components = [];
    const fallbackCandidates = [];
    const rejected = {};
    const passDebug = [];
    let scoredCellTotal = 0;
    const offsets = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0],           [1, 0],
      [-1, 1],  [0, 1],  [1, 1]
    ];

    for (const pass of passes) {
      const scored = new Map();
      for (const cell of signalData.cells.values()) {
        const heatScore = heatBaseScore(cell);
        const edgeScore = heatLocalEdgeScore(cell, signalData);
        const score = clamp01(
          heatScore * Number(pass.heatWeight ?? 1) +
          edgeScore * Number(pass.edgeWeight ?? 0)
        );
        if (heatScore < Number(pass.minHeat || 0)) continue;
        if (edgeScore < Number(pass.minEdge || 0)) continue;
        if (
          !pass.allowPlateau &&
          heatScore >= HEAT_TENDRIL_RULE.saturatedHeatThreshold &&
          edgeScore < Math.max(Number(pass.minEdge || 0), Number(HEAT_TENDRIL_RULE.saturatedMinEdgeScore || 0))
        ) {
          continue;
        }
        if (score < Number(pass.minScore ?? HEAT_TENDRIL_RULE.minScore)) continue;
        scored.set(cell.key, {
          cell,
          score,
          heatScore,
          edgeScore,
          passName: pass.name || "heat"
        });
      }

      const skeletonized = skeletonizeHeatRows(signalData, scored, pass);
      const graphRows = skeletonized.rows;
      scoredCellTotal += graphRows.size;
      passDebug.push({
        name: pass.name || "heat",
        scoredCells: scored.size,
        graphCells: graphRows.size,
        skeletonCells: skeletonized.skeletonCells,
        skeletonized: skeletonized.used
      });
      const visited = new Set();

    for (const key of graphRows.keys()) {
      if (visited.has(key)) continue;
      const stack = [key];
      const rows = [];
      visited.add(key);

      while (stack.length) {
        const currentKey = stack.pop();
        const row = graphRows.get(currentKey);
        if (!row) continue;
        rows.push(row);

        for (const [dx, dy] of offsets) {
          const nextKey = `${row.cell.ix + dx},${row.cell.iy + dy}`;
          if (!graphRows.has(nextKey) || visited.has(nextKey)) continue;
          visited.add(nextKey);
          stack.push(nextKey);
        }
      }

      if (rows.length < HEAT_TENDRIL_RULE.minCells) continue;
      rows.sort((a, b) => b.score - a.score);
      const keptRows = rows.slice(0, HEAT_TENDRIL_RULE.maxCells);
      const vector = solveHeatPathVector(keptRows);
      const baseMembers = vector?.cells?.length ? vector.cells : keptRows.map(row => row.cell);
      const extension = vector
        ? { members: baseMembers, added: 0, axis: heatTendrilAxis(baseMembers) }
        : extendHeatTendrilMembers(signalData, baseMembers);
      const members = extension.members;
      const component = componentFromMembers(members, keptRows[0].cell);
      if (!component) continue;

      const shape = constrainedShapeMetrics(members, component.peak);
      const peakScore = vector?.peakScore ?? keptRows[0]?.score ?? 0;
      const meanScore = vector?.meanScore ?? members.reduce((sum, cell) => sum + heatTendrilCellScore(cell), 0) / members.length;
      const rejectionReasons = [];
      if (peakScore < HEAT_TENDRIL_RULE.minPeakScore) rejectionReasons.push("peak_score");
      if (Number(shape.elongation_ratio || 1) < HEAT_TENDRIL_RULE.minElongation) rejectionReasons.push("elongation");
      if (Number(shape.major_cells || 0) < HEAT_TENDRIL_RULE.minMajorCells) rejectionReasons.push("major_length");
      if (Number(shape.minor_cells || 999) > HEAT_TENDRIL_RULE.maxMinorCells) rejectionReasons.push("minor_width");
      if (Number(shape.perimeter_complexity || 0) > HEAT_TENDRIL_RULE.maxPerimeterComplexity) rejectionReasons.push("perimeter_complexity");

      const candidate = {
        ...component,
        heatTendrilScore: meanScore,
        heatTendrilPeakScore: peakScore,
        heatTendrilShape: shape,
        heatTendrilExtendedCells: extension.added,
        heatTendrilPass: keptRows[0]?.passName || "heat",
        heatPathVector: vector,
        heatTendrilAxis: extension.axis ? {
          angle_deg: Number(Number(extension.axis.shape?.axis_angle_deg || 0).toFixed(1)),
          width_cells: HEAT_TENDRIL_RULE.extensionWidthCells,
          pad_cells: HEAT_TENDRIL_RULE.extensionPadCells
        } : null,
        clusterSizeScore: clamp01(Math.log1p(members.length) / Math.log1p(HEAT_TENDRIL_RULE.maxCells)),
        clusterPeakScore: clamp01(peakScore),
        clusterPreferenceScore: clamp01(meanScore * 0.48 + peakScore * 0.32 + Math.min(1, Number(shape.major_cells || 0) / 18) * 0.2)
      };

      if (rejectionReasons.length) {
        for (const reason of rejectionReasons) rejected[reason] = (rejected[reason] || 0) + 1;
        fallbackCandidates.push({ ...candidate, heatTendrilRelaxed: true, heatTendrilRejected: rejectionReasons });
        continue;
      }

      components.push(candidate);
    }
    }

    if (!components.length && HEAT_TENDRIL_RULE.fallbackEnabled) {
      const fallback = fallbackCandidates
        .filter((component) =>
          Number(component.componentCellCount || 0) >= HEAT_TENDRIL_RULE.fallbackMinCells &&
          Number(component.heatTendrilPeakScore || 0) >= HEAT_TENDRIL_RULE.fallbackMinPeakScore
        )
        .sort((a, b) =>
          b.clusterPreferenceScore - a.clusterPreferenceScore ||
          b.componentCellCount - a.componentCellCount
        )
        .slice(0, Math.max(1, Number(HEAT_TENDRIL_RULE.maxFallbackComponents) || 1));
      components.push(...fallback);
    }

    const sorted = components.sort((a, b) =>
      b.clusterPreferenceScore - a.clusterPreferenceScore ||
      b.componentCellCount - a.componentCellCount
    );
    sorted.debug = {
      scoredCells: scoredCellTotal,
      passes: passDebug,
      skeletonizedPasses: passDebug.filter((pass) => pass.skeletonized).length,
      skeletonCells: passDebug.reduce((sum, pass) => sum + Number(pass.skeletonCells || 0), 0),
      fallbackCandidates: fallbackCandidates.length,
      extendedCells: sorted.reduce((sum, component) => sum + Number(component.heatTendrilExtendedCells || 0), 0),
      vectorSegments: sorted.filter((component) => component.heatPathVector?.polyline?.length >= 2).length,
      rejected
    };
    return sorted;
  }

  function heatTendrilPlaceContext(component) {
    const shape = component.heatTendrilShape || constrainedShapeMetrics(component.members || [], component.peak);
    return {
      primary_label: "heat corridor in view",
      secondary_label: null,
      place_type: "heatmap tendril corridor",
      spatial_relation: "along",
      centroid: component.peak ? { lat: component.peak.lat, lng: component.peak.lng } : null,
      label_confidence: 0.64,
      label_source: "heatmap_tendril_context",
      geometry_context: {
        ...shape,
        heat_tendril: true,
        corridor_kind: "heatmap",
        corridor_relation: "along",
        label_phrase: "along a heat corridor"
      }
    };
  }

  function heatTendrilNicheFromComponent({ component, origin, caps, activeLens, heatMetric }) {
    const agg = aggregateComponent(component);
    const ll = agg.center;
    const distanceM = L.latLng(origin.lat, origin.lng).distanceTo(L.latLng(ll.lat, ll.lng));
    const m = agg.metrics;
    const placeContext = heatTendrilPlaceContext(component);
    const lensPeak = clamp01(m.lensPeakSignal);
    const zStrength = clamp01((Number(m.lensPeakAbsZ) || 0) / 5);
    const tendrilStrength = clamp01((component.heatTendrilScore || 0) * 0.54 + (component.heatTendrilPeakScore || 0) * 0.34 + Math.min(1, Number(component.heatTendrilShape?.major_cells || 0) / 20) * 0.12);
    const bio = clamp01((Math.log1p(m.species) / Math.log1p(caps.species * 4)) * 0.58 + m.activeRatio * 0.14 + tendrilStrength * 0.28);
    const need = clamp01((1 - m.activeRatio) * 0.42 + (m.observers <= 1 ? 0.1 : 0) + (1 - m.lensMeanSignal) * 0.18);
    const stale = clamp01(daysSince(m.latestObservedMs) / 240);
    const questability = clamp01(tendrilStrength * 0.48 + zStrength * 0.16 + lensPeak * 0.1 + bio * 0.14 + need * 0.08 + stale * 0.04);
    const initialFocus = topTaxonomySubject({
      ...m,
      active_lens: activeLens,
      heat_metric: heatMetric
    });
    const taxonFocus = initialFocus?.label
      ? { iconic: initialFocus.rank || "Any", label: titleSubjectCase(initialFocus.label), source_rank: initialFocus.rank || null }
      : { iconic: "Any", label: "life" };
    const coreCell = component.peak ? `${component.peak.ix},${component.peak.iy}` : "";
    const sourceKey = [
      "gw-local-niche-v4",
      activeLens,
      isFovSampling() ? "fov" : `${numericRadiusM(500)}m`,
      "heat-tendril",
      quantizedCoreCell(component.peak, 8),
      agg.componentId
    ].join(":");

    const niche = {
      source_key: sourceKey,
      title: "",
      short_title: "",
      description: "A GridWild corridor niche generated directly from a long, thin heatmap tendril inside the current FOV.",
      niche_type: "edge_habitat_niche",
      theme: "Heat corridor / corridor niche",
      centroid_lat: ll.lat,
      centroid_lng: ll.lng,
      geometry: boundsForCells(agg.minIx, agg.minIy, agg.maxIx, agg.maxIy),
      grid_cell_ids: agg.cells,
      radius_m: Math.round(Math.max(42, Math.min(260, Math.sqrt(Math.max(1, agg.cells.length)) * GRID_SIZE_M * 1.65))),
      scale_level: "constrained-geometry:heat corridor",
      taxon_focus: taxonFocus,
      seasonal_profile: { mode: "heat_tendril_runtime_v1" },
      evidence_summary: evidenceFor("edge_habitat_niche", m, placeContext),
      metrics: {
        ...m,
        algorithm: "heat_tendril_niche_v1",
        active_lens: activeLens,
        heat_metric: heatMetric,
        sampling_extent: isFovSampling() ? "fov" : "radius_m",
        sampling_radius_m: isFovSampling() ? null : numericRadiusM(500),
        emphasis: state.controls.emphasis,
        z_threshold: Number(state.controls.lensZThreshold || 2.5),
        core_cell: coreCell,
        peak_cell: coreCell,
        peak_signal: Number(lensPeak.toFixed(3)),
        peak_z: Number((m.lensPeakZ || 0).toFixed(3)),
        peak_abs_z: Number((m.lensPeakAbsZ || 0).toFixed(3)),
        component_id: agg.componentId,
        component_cell_count: Number(m.componentCellCount || agg.cells.length),
        cluster_priority_score: Number((component.clusterPreferenceScore || tendrilStrength).toFixed(3)),
        geometry_type: "corridor-buffer",
        scale_class: "corridor niche",
        display_geometry: "corridor-buffer",
        interaction_radius_m: Math.round(Math.max(56, Math.min(320, Math.sqrt(Math.max(1, agg.cells.length)) * GRID_SIZE_M * 1.9))),
        heat_tendril_score: Number((component.heatTendrilScore || 0).toFixed(3)),
        heat_tendril_peak_score: Number((component.heatTendrilPeakScore || 0).toFixed(3)),
        heat_tendril_pass: component.heatTendrilPass || null,
        heat_tendril_relaxed: Boolean(component.heatTendrilRelaxed),
        heat_tendril_rejected_checks: Array.isArray(component.heatTendrilRejected) ? component.heatTendrilRejected : [],
        heat_tendril_extended_cells: Number(component.heatTendrilExtendedCells || 0),
        heat_tendril_axis: component.heatTendrilAxis || null,
        heat_path_polyline: Array.isArray(component.heatPathVector?.polyline) ? component.heatPathVector.polyline : [],
        heat_path_length_m: Number((component.heatPathVector?.lengthM || 0).toFixed(1)),
        heat_path_cell_count: Number(component.heatPathVector?.cells?.length || 0),
        heat_path_simplified_points: Number(component.heatPathVector?.simplifiedPointCount || 0),
        geometry_contract: {
          ok: true,
          reason: component.heatPathVector
            ? "heat_path_vector"
            : component.heatTendrilRelaxed ? "heat_tendril_relaxed_fallback" : "heat_tendril",
          min_elongation: HEAT_TENDRIL_RULE.minElongation,
          min_major_cells: HEAT_TENDRIL_RULE.minMajorCells,
          max_minor_cells: HEAT_TENDRIL_RULE.maxMinorCells
        },
        geometry_context: placeContext.geometry_context || null,
        member_cells_are_analysis_object: true
      },
      confidence: clamp01(0.38 + questability * 0.28 + tendrilStrength * 0.22 + zStrength * 0.12),
      novelty_score: need,
      sampling_need_score: need,
      biodiversity_score: bio,
      questability_score: questability,
      place_context: placeContext,
      primary_place_label: placeContext.primary_label || null,
      secondary_place_label: placeContext.secondary_label || null,
      place_label_confidence: placeContext.label_confidence || 0,
      generated_by: "gridwild_heat_tendril_niche_v1",
      visibility: "public",
      status: "active",
      distance_m: Math.round(distanceM),
      comment_count: 0,
      _runtimeOnly: true
    };

    niche.title = buildNicheDisplayTitle(niche);
    niche.short_title = niche.title.replace(/^(Sample|Survey|Look for|Revisit|Check)\s+/i, "");
    return niche;
  }

  function generateHeatTendrilCandidates(signalData, origin, caps, activeLens, heatMetric) {
    if (!HEAT_TENDRIL_RULE.enabled) return { rows: [], components: [], debug: { emitted: 0 } };
    const components = heatTendrilComponents(signalData);
    const detectorDebug = components.debug || {};
    const rows = components.map((component) =>
      heatTendrilNicheFromComponent({ component, origin, caps, activeLens, heatMetric })
    );
    return {
      rows,
      components,
      debug: {
        emitted: rows.length,
        components: components.length,
        scoredCells: detectorDebug.scoredCells || 0,
        fallbackCandidates: detectorDebug.fallbackCandidates || 0,
        extendedCells: detectorDebug.extendedCells || 0,
        vectorSegments: detectorDebug.vectorSegments || 0,
        passes: detectorDebug.passes || [],
        skeletonizedPasses: detectorDebug.skeletonizedPasses || 0,
        skeletonCells: detectorDebug.skeletonCells || 0,
        rejected: detectorDebug.rejected || {},
        minScore: HEAT_TENDRIL_RULE.minScore,
        minElongation: HEAT_TENDRIL_RULE.minElongation
      }
    };
  }

  function constrainedDedupeRows(rows = []) {
    const accepted = [];
    const sorted = rows.slice().sort((a, b) =>
      nicheClusterPriority(b) - nicheClusterPriority(a) ||
      Number(b.questability_score || 0) - Number(a.questability_score || 0)
    );

    for (const row of sorted) {
      const duplicate = accepted.some((kept) => {
        const rowCorridor = row.metrics?.geometry_type === "corridor-buffer" || row.metrics?.algorithm === "trail_corridor_niche_v1";
        const keptCorridor = kept.metrics?.geometry_type === "corridor-buffer" || kept.metrics?.algorithm === "trail_corridor_niche_v1";
        if (rowCorridor !== keptCorridor) return false;
        const rowAlgorithm = String(row.metrics?.algorithm || "");
        const keptAlgorithm = String(kept.metrics?.algorithm || "");
        const rowDebugCorridor = ["trail_corridor_niche_v1", "heat_tendril_niche_v1"].includes(rowAlgorithm);
        const keptDebugCorridor = ["trail_corridor_niche_v1", "heat_tendril_niche_v1"].includes(keptAlgorithm);
        if (rowDebugCorridor && keptDebugCorridor && rowAlgorithm !== keptAlgorithm) return false;

        const overlap = nicheCellJaccard(row.grid_cell_ids || [], kept.grid_cell_ids || []);
        const peakDistance = peakDistanceCells(
          {
            peak_ix: Number(String(row.metrics?.peak_cell || "").split(",")[0]),
            peak_iy: Number(String(row.metrics?.peak_cell || "").split(",")[1])
          },
          {
            peak_ix: Number(String(kept.metrics?.peak_cell || "").split(",")[0]),
            peak_iy: Number(String(kept.metrics?.peak_cell || "").split(",")[1])
          }
        );
        const sameTrail = rowCorridor && keptCorridor &&
          row.metrics?.trail_feature_id &&
          row.metrics?.trail_feature_id === kept.metrics?.trail_feature_id;
        if (sameTrail) return overlap >= 0.35;
        return overlap >= 0.42 || peakDistance <= 2.25;
      });
      if (!duplicate) accepted.push(row);
      if (accepted.length >= Math.max(1, Number(state.controls.maxCandidates) || 8)) break;
    }

    return accepted;
  }

  function generateConstrainedGeometryCandidates(origin = getOrigin(), options = {}) {
    if (typeof map === "undefined" || typeof GRID_SIZE_M === "undefined") return [];
    const includeConstrained = options.includeConstrained !== false;
    const includeCorridors = options.includeCorridors === true;

    const signalData = lensSignalMap(origin);
    const raster = buildSignalRaster(signalData);
    if (!raster) {
      state.detectorDebug = {
        signalData,
        components: [],
        sampledCellCount: signalData?.cells?.size || 0,
        thresholdCellCount: 0,
        constrainedGeometry: {
          error: "Sampling field is too large or unavailable for constrained geometry."
        }
      };
      state.constrainedGeometryDebug = state.detectorDebug.constrainedGeometry;
      return [];
    }

    const center = cellForLatLng(origin.lat, origin.lng);
    const capRadiusCells = isFovSampling()
      ? Math.max(
          6,
          Math.ceil(Math.max(
            signalData.bounds.maxIx - signalData.bounds.minIx,
            signalData.bounds.maxIy - signalData.bounds.minIy
          ) / 2)
        )
      : Math.max(6, Math.round(numericRadiusM(500) / GRID_SIZE_M));
    const caps = scanCaps(center, capRadiusCells);
    const activeLens = window.__gwState?.activeLens || "classic";
    const heatMetric = window.__gwState?.heatMetric || "count";
    const rows = [];
    const acceptedComponents = [];
    const rejected = {};
    const debugRules = [];
    let trailDebug = { trails: 0, emitted: 0, disabled: true };
    let heatTendrilDebug = { components: 0, emitted: 0 };

    if (includeConstrained) {
      for (const rule of CONSTRAINED_GEOMETRY_RULES) {
        const blurred = blurRaster(raster.z, raster.width, raster.height, rule.sigma);
        const assigned = new Set();
        const cores = constrainedFindCores(signalData, raster, blurred, rule);
        let emitted = 0;

        for (const core of cores) {
          if (assigned.has(core.cell.key)) continue;
          const members = constrainedGrowNiche(signalData, raster, blurred, rule, core, assigned);
          if (!members.length) continue;

          const component = constrainedComponentFromMembers(members, core.cell, rule);
          if (!component) continue;

          const placeContext = resolveGeometricPlaceContext(
            component.peak.lat,
            component.peak.lng,
            component,
            resolvePlaceContext(component.peak.lat, component.peak.lng)
          );
          const contract = passesConstrainedContract(component, rule, placeContext);
          if (!contract.ok) {
            rejected[contract.reason] = (rejected[contract.reason] || 0) + 1;
            continue;
          }

          const niche = constrainedNicheFromComponent({
            component,
            rule,
            origin,
            caps,
            activeLens,
            heatMetric,
            contract
          });
          if (Number(niche.questability_score || 0) < 0.16) continue;

          rows.push(niche);
          acceptedComponents.push(component);
          emitted += 1;
        }

        debugRules.push({
          scale: rule.scale,
          scaleClass: rule.scaleClass,
          sigma: rule.sigma,
          cores: cores.length,
          emitted
        });
      }
    }

    if (includeCorridors && NICHE_OSM_CONTEXT_ENABLED && TRAIL_CORRIDOR_RULE.enabled) {
      const trailCorridors = generateTrailCorridorCandidates(signalData, origin, caps, activeLens, heatMetric);
      rows.push(...trailCorridors.rows);
      acceptedComponents.push(...trailCorridors.components);
      trailDebug = trailCorridors.debug;
    }

    if (includeCorridors) {
      const heatTendrils = generateHeatTendrilCandidates(signalData, origin, caps, activeLens, heatMetric);
      rows.push(...heatTendrils.rows);
      acceptedComponents.push(...heatTendrils.components);
      heatTendrilDebug = heatTendrils.debug;
    }

    const capped = constrainedDedupeRows(rows);
    state.detectorDebug = {
      signalData,
      components: acceptedComponents,
      zThreshold: Number(state.controls.lensZThreshold || 2.5),
      sampledCellCount: signalData.cells.size,
      thresholdCellCount: [...signalData.cells.values()].filter(cell => Math.abs(cell.z) > Number(state.controls.lensZThreshold || 2.5)).length,
      constrainedGeometry: {
        algorithm: includeCorridors ? "corridor_sampling_v1" : "constrained_geometry_niche_v1",
        activeLens,
        heatMetric,
        includeConstrained,
        includeCorridors,
        rules: debugRules,
        trailCorridors: trailDebug,
        heatTendrils: heatTendrilDebug,
        rejected,
        resultCount: capped.length
      }
    };
    state.constrainedGeometryDebug = state.detectorDebug.constrainedGeometry;

    return capped;
  }

  function nicheClusterPriority(niche) {
    const metrics = niche?.metrics || {};
    const explicit = Number(metrics.cluster_priority_score ?? metrics.clusterPreferenceScore);
    const heatBoost = isHeatTendrilNiche(niche) ? 0.55 : 0;
    if (Number.isFinite(explicit) && explicit > 0) return explicit + heatBoost;

    const cells = Number(metrics.component_cell_count || metrics.componentCellCount || metrics.totalCells || 0);
    const meanAbsZ = Number(metrics.mean_abs_z || metrics.lensMeanAbsZ || metrics.meanAbsZ || 0);
    return clamp01(
      clamp01(Math.log1p(cells) / Math.log1p(100)) * 0.5 +
      clamp01(meanAbsZ / 6) * 0.5
    ) + heatBoost;
  }

  function mergeNiches(...nicheGroups) {
    const byKey = new Map();
    for (const row of nicheGroups.flat()) {
      const niche = retitleNiche(row);
      const key = niche.source_key || niche.id || `${niche.centroid_lat},${niche.centroid_lng}`;
      const current = byKey.get(key);
      if (current) {
        current.is_home_niche = Boolean(current.is_home_niche || niche.is_home_niche);
        current.home_user_count = Math.max(homeUserCount(current), homeUserCount(niche));
      }
      const score = Number(niche.questability_score || 0);
      const currentScore = Number(current?.questability_score || 0);
      const confidence = Number(niche.place_label_confidence || niche.place_context?.label_confidence || 0);
      const currentConfidence = Number(current?.place_label_confidence || current?.place_context?.label_confidence || 0);
      const hasSpecificPlace = !isGenericPlaceContext(niche.place_context || {});
      const currentHasSpecificPlace = !isGenericPlaceContext(current?.place_context || {});
      const scoreTied = Math.abs(score - currentScore) < 0.0001;

      if (
        !current ||
        score > currentScore ||
        (scoreTied && confidence > currentConfidence) ||
        (scoreTied && hasSpecificPlace && !currentHasSpecificPlace) ||
        (scoreTied && niche._runtimeOnly === false && current._runtimeOnly !== false)
      ) {
        byKey.set(key, {
          ...niche,
          is_home_niche: Boolean(niche.is_home_niche || current?.is_home_niche),
          home_user_count: Math.max(homeUserCount(niche), homeUserCount(current))
        });
      }
    }
    const sorted = [...byKey.values()]
      .sort((a, b) =>
        nicheClusterPriority(b) - nicheClusterPriority(a) ||
        Number(b.questability_score || 0) - Number(a.questability_score || 0)
      );

    return sorted;
  }

  function updateNicheDistances(origin = getOrigin()) {
    if (!state.niches?.length || typeof L === "undefined") return;
    const here = L.latLng(origin.lat, origin.lng);
    state.niches = state.niches.map((niche) => {
      const lat = Number(niche.centroid_lat);
      const lng = Number(niche.centroid_lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return niche;
      return {
        ...niche,
        distance_m: here.distanceTo(L.latLng(lat, lng))
      };
    });
  }

  function addRuntimeNiche(niche, options = {}) {
    if (!niche) return null;
    state.niches = mergeNiches(state.niches, [niche]);
    updateNicheDistances();

    const key = nicheKey(niche) || niche.source_key || niche.id;
    if (options.select !== false && key) {
      state.selectedId = String(key);
    }

    if (!state.layerVisible) {
      state.layerVisible = true;
      saveLayerVisible();
    }

    drawNicheLayer();
    renderIntoPage();

    const current = key ? nicheByKey(key) || niche : niche;
    if (options.openDetail === true && key) {
      openNicheDetail(key);
    }
    return current;
  }

  function samplingModeConfig(mode = "niches") {
    if (mode === "corridors") {
      return {
        mode,
        busyTitle: "Generating corridors",
        busyDetail: "Tracing long, narrow Lens signals in the current field.",
        coreTitle: "Finding corridor paths",
        coreDetail: "Solving heat tendrils and trail-aligned signal runs.",
        resultTitle: "Constraining corridors",
        saveDetail: "generated corridor candidates",
        completeTitle: "Corridor generation complete"
      };
    }

    if (state.controls.thresholdSubdivideApproach === true) {
      return {
        mode: "niches",
        busyTitle: "Sampling niches",
        busyDetail: "Preparing the HUD-parity Lens field.",
        coreTitle: "Thresholding cells",
        coreDetail: `Using the HUD heat metric z cutoff, flood fill, and ${THRESHOLD_SUBDIVIDE_RULE.tileCells}x${THRESHOLD_SUBDIVIDE_RULE.tileCells} subdivision.`,
        resultTitle: "Subdividing threshold faces",
        saveDetail: "threshold-subdivide niche candidates",
        completeTitle: "Niche sampling complete"
      };
    }

    return {
      mode: "niches",
      busyTitle: "Sampling niches",
      busyDetail: "Preparing the current Lens field.",
      coreTitle: "Finding niche cores",
      coreDetail: "Smoothing the current Lens field and locating local peaks.",
      resultTitle: "Constraining geometry",
      saveDetail: "generated niche candidates",
      completeTitle: "Niche sampling complete"
    };
  }

  async function refreshLocalNiches(options = {}) {
    if (state.loading) {
      showSamplingToast("Niche generation already running", 55, "Waiting for the current pass to finish.");
      return;
    }
    const modeConfig = samplingModeConfig(options.mode === "corridors" ? "corridors" : "niches");
    state.loading = true;
    state.loadingAction = modeConfig.mode;
    state.lastError = null;
    state.persistWarning = null;
    state.selectedId = null;
    state.constrainedGeometryDebug = null;
    showSamplingToast(modeConfig.busyTitle, 6, modeConfig.busyDetail);
    renderIntoPage();
    await yieldToPaint();

    const useAvailableOsmLayerOnly = modeConfig.mode === "niches" && (
      state.controls.osmTransformation === true ||
      state.controls.thresholdSubdivideApproach === true
    );
    if (NICHE_OSM_CONTEXT_ENABLED && !useAvailableOsmLayerOnly) window.GridWildOsmFeaturesLayer?.scheduleFetch?.();

    const origin = getOrigin();
    let serverNiches = [];
    let generated = [];

    try {
    try {
      showSamplingToast("Checking durable niche layer", 18, "Looking for matching saved components nearby.");
      await yieldToPaint();
      const data = await window.GridWildAPI?.getNearbyLocalNiches?.(origin.lat, origin.lng, {
        radius_m: isFovSampling() ? 5000 : numericRadiusM(500),
        limit: Math.max(1, Number(state.controls.maxCandidates) || 8) * 3
      });
      if (data?.home_niche_id !== undefined) {
        window.__gwState = window.__gwState || {};
        window.__gwState.homeNicheId = data.home_niche_id || null;
      }
      const activeLens = window.__gwState?.activeLens || "classic";
      const zThreshold = Number(state.controls.lensZThreshold || 2.5);
      const extent = isFovSampling() ? "fov" : "radius_m";
      const wantsOsmTransform = modeConfig.mode === "niches" && state.controls.osmTransformation === true;
      const wantsThresholdSubdivide = modeConfig.mode === "niches" && state.controls.thresholdSubdivideApproach === true;
      const durableAlgorithms = [
        "constrained_geometry_niche_v1",
        "trail_corridor_niche_v1",
        "heat_tendril_niche_v1",
        THRESHOLD_SUBDIVIDE_RULE.version
      ];
      serverNiches = (data?.niches || []).filter((niche) => {
        const metrics = niche.metrics || {};
        const algorithm = String(metrics.algorithm || "");
        const hasOsmTransform = metrics.osm_transform?.enabled === true;
        const thresholdApproachMatches = wantsThresholdSubdivide
          ? algorithm === THRESHOLD_SUBDIVIDE_RULE.version
          : algorithm !== THRESHOLD_SUBDIVIDE_RULE.version;
        return durableAlgorithms.includes(algorithm) &&
          String(metrics.active_lens || "classic") === String(activeLens) &&
          String(metrics.sampling_extent || "radius_m") === extent &&
          Math.abs(Number(metrics.z_threshold || zThreshold) - zThreshold) < 0.01 &&
          thresholdApproachMatches &&
          (wantsOsmTransform ? hasOsmTransform : !hasOsmTransform);
      });
    } catch (err) {
      state.persistWarning = "Server niche layer unavailable; showing runtime candidates.";
      console.warn("Local niche fetch failed:", err);
    }

    showSamplingToast(modeConfig.coreTitle, 42, modeConfig.coreDetail);
    await yieldToastMoment(220);
    generated = generateLocalCandidates(origin, { mode: modeConfig.mode });
    const heatTendrilDebug = state.detectorDebug?.constrainedGeometry?.heatTendrils || {};
    const heatTendrilCount = heatTendrilDebug.emitted || 0;
    showSamplingToast(
      modeConfig.resultTitle,
      64,
      modeConfig.mode === "corridors"
        ? `${generated.length} corridor objects, ${heatTendrilCount} heat tendrils (${heatTendrilDebug.vectorSegments || 0} skeleton path vectors, ${heatTendrilDebug.skeletonCells || 0} skeleton cells).`
        : `${state.detectorDebug?.constrainedGeometry?.resultCount || generated.length} niche objects.`
    );
    await yieldToastMoment(SAMPLING_RESULT_TOAST_MS);

    if (generated.length && modeConfig.mode === "niches" && state.controls.osmTransformation === true) {
      showSamplingToast("Applying OSM transformation", 68, "Subdividing blobs with cached roads, paths, and structures.");
      await yieldToPaint();
      const transformed = applyOsmTransformationsToNiches(generated, origin);
      generated = transformed.niches;
      const detail = osmTransformSummaryText(transformed.summary, generated.length);
      if (detail) {
        showSamplingToast("OSM transformation complete", 70, detail);
        await yieldToastMoment(640);
      }
    }

    if (generated.length && modeConfig.mode === "niches" && state.controls.thresholdSubdivideApproach === true) {
      generated = capThresholdSubdivideNiches(generated);
      syncThresholdSubdivideDebugFromNiches(generated);
    }

    if (generated.length && NICHE_OSM_CONTEXT_ENABLED && !useAvailableOsmLayerOnly) {
      showSamplingToast("Resolving place labels", 72, "Checking nearby OSM names, streets, and neighborhoods.");
      await yieldToPaint();
      generated = await enrichNichePlaceContexts(generated);
    }

    if (generated.length && window.GridWildAPI?.upsertLocalNiches) {
      try {
        showSamplingToast("Saving local niches", 82, `${generated.length} ${modeConfig.saveDetail}.`);
        await yieldToPaint();
        const generatedByKey = new Map(generated.map((niche) => [
          niche.source_key || niche.id || `${niche.centroid_lat},${niche.centroid_lng}`,
          niche
        ]));
        const saved = await window.GridWildAPI.upsertLocalNiches(generated);
        const here = L.latLng(origin.lat, origin.lng);
        generated = (saved?.niches || generated).map((row) => {
          const previous = generatedByKey.get(row.source_key || row.id || `${row.centroid_lat},${row.centroid_lng}`) || null;
          const confidence = Number(row.place_label_confidence || row.place_context?.label_confidence || 0);
          const previousConfidence = Number(previous?.place_label_confidence || previous?.place_context?.label_confidence || 0);
          const placeFields = previous && previousConfidence > confidence
            ? {
                place_context: previous.place_context,
                primary_place_label: previous.primary_place_label,
                secondary_place_label: previous.secondary_place_label,
                place_label_confidence: previous.place_label_confidence
              }
            : {};

          return retitleNiche({
            ...(previous || {}),
            ...row,
            ...placeFields,
            distance_m: Number.isFinite(Number(row.distance_m))
              ? Number(row.distance_m)
              : here.distanceTo(L.latLng(row.centroid_lat, row.centroid_lng)),
            comment_count: Number(row.comment_count || 0),
            home_user_count: Math.max(homeUserCount(row), homeUserCount(previous)),
            is_home_niche: Boolean(row.is_home_niche || previous?.is_home_niche || (row.id && row.id === window.__gwState?.homeNicheId)),
            _runtimeOnly: false
          });
        });
      } catch (err) {
        state.persistWarning = "Generated niches could not be persisted yet.";
        console.warn("Local niche upsert failed:", err);
      }
    }

    showSamplingToast("Refreshing niche HUD", 92, "Drawing components, labels, and markers.");
    await yieldToPaint();
    state.niches = state.controls.thresholdSubdivideApproach === true
      ? capThresholdSubdivideNiches(mergeNiches(serverNiches, generated))
      : mergeNiches(state.niches, serverNiches, generated);
    syncThresholdSubdivideDebugFromNiches(state.niches);
    const visibleCorridorCount = state.niches.filter(isCorridorNiche).length;
    state.loading = false;
    state.loadingAction = null;
    drawNicheLayer();
    renderIntoPage();
    finishSamplingToast(
      modeConfig.completeTitle,
      `${state.niches.length} total objects shown; ${visibleCorridorCount} corridors in the HUD.`
    );

    if (options.openFirst) {
      const firstGenerated = generated[0] || null;
      const first = firstGenerated
        ? state.niches.find((niche) => nicheKey(niche) === nicheKey(firstGenerated)) || firstGenerated
        : state.niches[0];
      if (first) openNicheDetail(first.id || first.source_key);
    }
    } catch (err) {
      state.loading = false;
      state.loadingAction = null;
      state.lastError = err;
      console.error("Niche sampling failed:", err);
      failSamplingToast("Niche generation failed", err.message || "Could not complete this generation pass.");
      renderIntoPage();
    }
  }

  async function growLocalNiches(options = {}) {
    if (state.loading) {
      showSamplingToast("Niche generation already running", 55, "Waiting for the current pass to finish.");
      return;
    }

    state.loading = true;
    state.loadingAction = "grow";
    state.lastError = null;
    state.persistWarning = null;
    state.selectedId = null;
    state.constrainedGeometryDebug = null;
    saveControls();
    showSamplingToast(
      "Growing local niches",
      10,
      `Subdividing the active Lens FOV into ${growTileCells()}x${growTileCells()} grid tiles.`
    );
    renderIntoPage();
    await yieldToPaint();

    const origin = getOrigin();

    try {
      showSamplingToast(
        "Checking tile occupancy",
        44,
        `Dropping tiles below ${growMinOccupiedPct()}% occupied active-lens evidence.`
      );
      await yieldToastMoment(180);
      let generated = generateGrowLocalNicheCandidates(origin);
      let growOsmSummary = null;

      showSamplingToast(
        state.controls.growOsmSubdivisionEnabled === true ? "Preparing Grow outputs" : "Resolving tile labels",
        72,
        `${generated.length} ${state.controls.growMergeEnabled === true ? "Grow tile groups" : "grow tile niches"} survived the occupancy filter.`
      );
      await yieldToPaint();

      if (state.controls.growOsmSubdivisionEnabled === true) {
        showSamplingToast(
          "Subdividing with OSM",
          82,
          "Cutting Grow niches with cached road and path boundaries."
        );
        await yieldToastMoment(120);
        const subdivided = applyGrowOsmSubdivisionToNiches(generated, origin);
        generated = subdivided.niches;
        growOsmSummary = subdivided.summary;
      }

      showSamplingToast(
        "Resolving tile labels",
        90,
        `${generated.length} Grow niche objects ready for the HUD.`
      );
      await yieldToPaint();

      generated = generated.map(retitleNiche);
      state.niches = mergeNiches(generated);
      updateNicheDistances(origin);
      state.loading = false;
      state.loadingAction = null;
      drawNicheLayer();
      renderIntoPage();
      finishSamplingToast(
        "Grow Local Niches complete",
        `${state.niches.length} temporary Grow niches shown in the HUD.${growOsmSummary ? ` ${growOsmSubdivisionSummaryText(growOsmSummary, generated.length)}` : ""}`
      );

      if (options.openFirst) {
        const first = state.niches[0];
        if (first) openNicheDetail(first.id || first.source_key);
      }
    } catch (err) {
      state.loading = false;
      state.loadingAction = null;
      state.lastError = err;
      console.error("Grow Local Niches failed:", err);
      failSamplingToast("Grow Local Niches failed", err.message || "Could not complete this generation pass.");
      renderIntoPage();
    }
  }

  function formatDistance(m) {
    const n = Number(m);
    if (!Number.isFinite(n)) return "";
    if (n < 91.44) return `${Math.round(n * 3.28084)} ft away`;
    if (n < 1000) return `${Math.round(n)} m away`;
    return `${(n / 1000).toFixed(1)} km away`;
  }

  function confidenceLabel(n) {
    n = Number(n) || 0;
    if (n >= 0.72) return "high";
    if (n >= 0.48) return "medium";
    return "emerging";
  }

  function reasonText(niche) {
    const human = niche?.evidence_summary?.human;
    if (Array.isArray(human) && human.length) return human[0];
    return niche.description || "Local cells show a useful sampling opportunity.";
  }

  const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const PIE_COLORS = {
    Plantae: "#7fd77e",
    Insecta: "#f28b6d",
    Fungi: "#b58be7",
    Aves: "#6fa7e8",
    Mammalia: "#e5c56e",
    Unknown: "#b9b09d"
  };
  const COMPONENT_PALETTE = [
    "#8bd3a8",
    "#8fb8e8",
    "#d6b36d",
    "#c39adf",
    "#79c7c1",
    "#d9938a",
    "#b6cc7a",
    "#aeb3d8"
  ];
  const NICHE_LENS_KEYS = [
    "classic",
    "richness",
    "rare",
    "underexplored",
    "wildtime",
    "seasonalnow",
    "freshness",
    "timeconfidence",
    "revisit",
    "reactivated",
    "observers",
    "cultivated",
    "wildbalance",
    "night",
    "emerald",
    "treasure",
    "osm-path-adjacency",
    "osm-trail-side",
    "osm-wet-edge",
    "osm-barrier-map",
    "osm-landuse-class",
    "osm-accessibility",
    "dominantlife",
    "seasonalpulse",
    "stability",
    "breadth",
    "treasure2"
  ];
  const NICHE_LENS_GROUPS = [
    { label: "Bio", title: "Biodiversity", lenses: ["richness", "rare", "emerald", "breadth", "dominantlife"] },
    { label: "Find", title: "Discovery", lenses: ["underexplored", "treasure", "treasure2"] },
    { label: "Time", title: "Recency", lenses: ["freshness", "wildtime", "timeconfidence", "revisit", "reactivated", "seasonalnow"] },
    { label: "Season", title: "Seasonality", lenses: ["seasonalpulse", "stability", "seasonalnow"] },
    { label: "People", title: "Human signal", lenses: ["classic", "observers", "cultivated", "wildbalance"] },
    { label: "Access", title: "OSM priors", lenses: ["osm-path-adjacency", "osm-trail-side", "osm-wet-edge", "osm-barrier-map", "osm-landuse-class", "osm-accessibility"] }
  ];
  const TAXON_COMMON_ALIASES = {
    iconic_taxon: {
      Animalia: "Animals",
      Arachnida: "Arachnids",
      Aves: "Birds",
      Fungi: "Fungi",
      Insecta: "Insects",
      Mammalia: "Mammals",
      Mollusca: "Mollusks",
      Plantae: "Plants",
      Reptilia: "Reptiles",
      Amphibia: "Amphibians",
      Actinopterygii: "Ray-finned fish",
      Unknown: "Unknown"
    },
    order: {
      Anseriformes: "Ducks, geese & swans",
      Araneae: "Spiders",
      Carnivora: "Carnivores",
      Coleoptera: "Beetles",
      Diptera: "Flies",
      Fabales: "Peas, beans & allies",
      Hemiptera: "True bugs",
      Hymenoptera: "Bees, wasps & ants",
      Lamiales: "Mints, plantains & allies",
      Lepidoptera: "Butterflies & moths",
      Odonata: "Dragonflies & damselflies",
      Orthoptera: "Grasshoppers & crickets",
      Passeriformes: "Perching birds",
      Polyporales: "Bracket fungi",
      Ranunculales: "Buttercups & allies",
      Rosales: "Roses, elms & allies",
      Squamata: "Lizards & snakes",
      Testudines: "Turtles",
      Unknown: "Unknown order"
    },
    family: {
      Asteraceae: "Aster family",
      Anatidae: "Ducks, geese & swans",
      Apidae: "Honey bees, bumble bees & allies",
      Araneidae: "Orb-weaver spiders",
      Brassicaceae: "Mustard family",
      Carabidae: "Ground beetles",
      Coccinellidae: "Lady beetles",
      Corvidae: "Crows & jays",
      Cyperaceae: "Sedge family",
      Fabaceae: "Pea family",
      Formicidae: "Ants",
      Geometridae: "Inchworm moths",
      Hesperiidae: "Skippers",
      Lamiaceae: "Mint family",
      Nymphalidae: "Brush-footed butterflies",
      Passerellidae: "New World sparrows",
      Poaceae: "Grass family",
      Polyporaceae: "Bracket fungi",
      Rosaceae: "Rose family",
      Salticidae: "Jumping spiders",
      Syrphidae: "Hover flies",
      Vespidae: "Yellowjackets, hornets & paper wasps",
      Vitaceae: "Grape family",
      Unknown: "Unknown family"
    },
    genus: {
      Acer: "Maples",
      Amanita: "Amanitas",
      Anas: "Dabbling ducks",
      Ampelopsis: "Peppervines",
      Apis: "Honey bees",
      Baptisia: "Wild indigos",
      Bidens: "Beggarticks",
      Cardamine: "Bittercresses",
      Cheiracanthium: "Sac spiders",
      Cyanocitta: "Jays",
      Danaus: "Milkweed butterflies",
      Dryobates: "Woodpeckers",
      Dumetella: "Catbirds",
      Erigeron: "Fleabanes",
      Eupatorium: "Thoroughworts",
      Euphorbia: "Spurges",
      Felis: "Cats",
      Iris: "Irises",
      Lamium: "Dead-nettles",
      Monomorium: "Tiny ants",
      Parthenocissus: "Virginia creepers",
      Pipilo: "Towhees",
      Plantago: "Plantains",
      Podophyllum: "Mayapples",
      Polygonum: "Knotweeds",
      Prunus: "Cherries & plums",
      Quercus: "Oaks",
      Rubus: "Brambles",
      Solidago: "Goldenrods",
      Sturnus: "Starlings",
      Taraxacum: "Dandelions",
      Trifolium: "Clovers",
      Turdus: "Thrushes",
      Veronica: "Speedwells",
      Vitis: "Grapes",
      Unknown: "Unknown genus"
    }
  };

  Object.assign(TAXON_COMMON_ALIASES.order, {
    Agaricales: "Gilled mushrooms",
    Alismatales: "Pond plants & wetland herbs",
    Anura: "Frogs & toads",
    Apiales: "Parsleys, ivies & allies",
    Aquifoliales: "Hollies & allies",
    Artiodactyla: "Hoofed mammals",
    Asparagales: "Irises, orchids & asparagus allies",
    Asterales: "Daisies, asters & sunflowers",
    Auriculariales: "Jelly ear fungi",
    Boletales: "Boletes & earthballs",
    Brassicales: "Mustards & caper allies",
    Caliciales: "Stubble lichens",
    Candelariales: "Candleflame lichens",
    Caryophyllales: "Pinks, knotweeds & carnation allies",
    Celastrales: "Bittersweets & staff vines",
    Charadriiformes: "Shorebirds, gulls & allies",
    Commelinales: "Dayflowers & pickerelweeds",
    Cornales: "Dogwoods & hydrangea allies",
    Crassiclitellata: "Earthworms",
    Cyprinodontiformes: "Killifishes & livebearers",
    Decapoda: "Crabs, shrimp & crayfish",
    Dipsacales: "Honeysuckles & viburnums",
    Ericales: "Heaths, blueberries & primroses",
    Fagales: "Oaks, beeches & birches",
    Gentianales: "Milkweeds, dogbanes & coffee allies",
    Geraniales: "Geraniums",
    Hymenochaetales: "Bristle bracket fungi",
    Isopoda: "Woodlice & pillbugs",
    Lecanorales: "Leafy crust lichens",
    Liliales: "Lilies & allies",
    Magnoliales: "Magnolias & spicebush allies",
    Malpighiales: "Willows, violets & spurges",
    Malvales: "Mallows, basswoods & hibiscus",
    Mantodea: "Mantises",
    Myrtales: "Loosestrifes & myrtles",
    Nymphaeales: "Water lilies",
    Opiliones: "Harvestmen",
    Pelecaniformes: "Herons, ibises & pelicans",
    Piciformes: "Woodpeckers",
    Pinales: "Pines, firs & cypresses",
    Poales: "Grasses, sedges & rushes",
    Polypodiales: "Leptosporangiate ferns",
    Proteales: "Lotuses, plane trees & protea allies",
    Russulales: "Russulas, milkcaps & crust fungi",
    Sapindales: "Maples, citrus & cashew allies",
    Saxifragales: "Saxifrages, stonecrops & currants",
    Solanales: "Nightshades & morning glories",
    Stylommatophora: "Land snails & slugs",
    Unionida: "Freshwater mussels",
    Vitales: "Grapes & Virginia creepers"
  });

  Object.assign(TAXON_COMMON_ALIASES.family, {
    Accipitridae: "Hawks, eagles & kites",
    Acrididae: "Short-horned grasshoppers",
    Alismataceae: "Water-plantain family",
    Amaranthaceae: "Amaranth family",
    Amaryllidaceae: "Daffodil & onion family",
    Anacardiaceae: "Cashew & sumac family",
    Apiaceae: "Carrot & parsley family",
    Apocynaceae: "Dogbane & milkweed family",
    Aquifoliaceae: "Holly family",
    Araceae: "Arum family",
    Araliaceae: "Ginseng & ivy family",
    Ardeidae: "Herons, egrets & bitterns",
    Asparagaceae: "Asparagus family",
    Attevidae: "Ailanthus webworm moths",
    Berberidaceae: "Barberry family",
    Betulaceae: "Birch family",
    Bignoniaceae: "Trumpet-creeper family",
    Bufonidae: "True toads",
    Campanulaceae: "Bellflower family",
    Caprifoliaceae: "Honeysuckle family",
    Cardinalidae: "Cardinals & grosbeaks",
    Cecidomyiidae: "Gall midges",
    Centrarchidae: "Sunfish & black basses",
    Cervidae: "Deer",
    Chelydridae: "Snapping turtles",
    Chrysomelidae: "Leaf beetles",
    Cicadellidae: "Leafhoppers",
    Cicadidae: "Cicadas",
    Coenagrionidae: "Narrow-winged damselflies",
    Colubridae: "Typical snakes",
    Commelinaceae: "Dayflower family",
    Convolvulaceae: "Morning-glory family",
    Cornaceae: "Dogwood family",
    Cupressaceae: "Cypress family",
    Cynipidae: "Gall wasps",
    Emydidae: "Pond turtles",
    Erebidae: "Tiger, tussock & underwing moths",
    Ericaceae: "Heath & blueberry family",
    Eriophyidae: "Gall mites",
    Fagaceae: "Oak & beech family",
    Fulgoridae: "Planthoppers",
    Fundulidae: "Topminnows & killifishes",
    Gracillariidae: "Leaf blotch miner moths",
    Halictidae: "Sweat bees",
    Haloragaceae: "Water-milfoil family",
    Icteridae: "Blackbirds & orioles",
    Iridaceae: "Iris family",
    Lauraceae: "Laurel family",
    Libellulidae: "Skimmer dragonflies",
    Lycaenidae: "Blues, coppers & hairstreaks",
    Lygaeidae: "Seed bugs",
    Lythraceae: "Loosestrife family",
    Magnoliaceae: "Magnolia family",
    Malvaceae: "Mallow family",
    Mantidae: "Mantises",
    Mimidae: "Mockingbirds & thrashers",
    Miridae: "Plant bugs",
    Moraceae: "Mulberry & fig family",
    Nelumbonaceae: "Lotus family",
    Noctuidae: "Owlet moths",
    Nymphaeaceae: "Water-lily family",
    Oleaceae: "Olive & ash family",
    Onagraceae: "Evening-primrose family",
    Papilionidae: "Swallowtail butterflies",
    Parmeliaceae: "Shield lichens",
    Parulidae: "New World warblers",
    Physciaceae: "Rosette lichens",
    Phytolaccaceae: "Pokeweed family",
    Picidae: "Woodpeckers",
    Pieridae: "Whites, sulphurs & yellows",
    Plantaginaceae: "Plantain family",
    Platanaceae: "Plane-tree family",
    Poeciliidae: "Livebearers",
    Pontederiaceae: "Pickerelweed family",
    Polygonaceae: "Knotweed & smartweed family",
    Ranidae: "True frogs",
    Ranunculaceae: "Buttercup family",
    Rubiaceae: "Coffee & bedstraw family",
    Salicaceae: "Willow family",
    Sapindaceae: "Maple & soapberry family",
    Scarabaeidae: "Scarab beetles",
    Scincidae: "Skinks",
    Smilacaceae: "Greenbrier family",
    Solanaceae: "Nightshade family",
    Stereaceae: "Parchment fungi",
    Tettigoniidae: "Katydids",
    Turdidae: "Thrushes",
    Typhaceae: "Cattail family",
    Ulmaceae: "Elm family",
    Unionidae: "River mussels",
    Viburnaceae: "Viburnums & elderberries",
    Violaceae: "Violet family"
  });

  Object.assign(TAXON_COMMON_ALIASES.genus, {
    Agelaius: "Blackbirds",
    Ageratina: "Snakeroots",
    Alliaria: "Garlic mustards",
    Anaxyrus: "American toads",
    Apios: "Groundnuts",
    Ardea: "Great herons",
    Artemisia: "Sagebrushes & wormwoods",
    Asclepias: "Milkweeds",
    Atalopedes: "Sachem skippers",
    Atteva: "Ailanthus webworm moths",
    Betula: "Birches",
    Bombus: "Bumble bees",
    Branta: "Black geese",
    Butorides: "Green herons",
    Camponotus: "Carpenter ants",
    Cardinalis: "Cardinals",
    Carex: "Sedges",
    Catalpa: "Catalpas",
    Cephalanthus: "Buttonbushes",
    Chelydra: "Snapping turtles",
    Chrysemys: "Painted turtles",
    Cicuta: "Water hemlocks",
    Clematis: "Clematis vines",
    Commelina: "Dayflowers",
    Cornus: "Dogwoods",
    Epargyreus: "Silver-spotted skippers",
    Erythemis: "Pondhawks",
    Flavoparmelia: "Greenshield lichens",
    Fundulus: "Killifishes",
    Gambusia: "Mosquitofishes",
    Harmonia: "Lady beetles",
    Hibiscus: "Rosemallows",
    Ilex: "Hollies",
    Impatiens: "Jewelweeds",
    Ischnura: "Forktails",
    Junonia: "Buckeyes",
    Lepomis: "Sunfish",
    Lespedeza: "Bush clovers",
    Libellula: "Skimmers",
    Liriodendron: "Tulip trees",
    Lithobates: "Water frogs",
    Lobelia: "Lobelias",
    Lonicera: "Honeysuckles",
    Ludwigia: "Seedboxes",
    Lycorma: "Lanternflies",
    Lythrum: "Loosestrifes",
    Magnolia: "Magnolias",
    Malacosoma: "Tent caterpillars",
    Melanoplus: "Spur-throated grasshoppers",
    Melospiza: "Song sparrows",
    Mikania: "Climbing hempweeds",
    Mimus: "Mockingbirds",
    Morus: "Mulberries",
    Myriophyllum: "Water-milfoils",
    Nelumbo: "Lotuses",
    Neoscona: "Spotted orbweavers",
    Nerodia: "Watersnakes",
    Nuphar: "Spatterdocks",
    Nyctanassa: "Night-herons",
    Odocoileus: "White-tailed deer",
    Oncopeltus: "Large milkweed bugs",
    Pachydiplax: "Blue dashers",
    Papilio: "Swallowtails",
    Parmotrema: "Ruffle lichens",
    Peltandra: "Arrow arums",
    Persicaria: "Smartweeds",
    Phragmites: "Reeds",
    Phyciodes: "Crescents",
    Physcia: "Rosette lichens",
    Phytolacca: "Pokeweeds",
    Pieris: "Cabbage whites",
    Plathemis: "Whitetails",
    Platanus: "Sycamores",
    Plestiodon: "Skinks",
    Polistes: "Paper wasps",
    Pontederia: "Pickerelweeds",
    Punctelia: "Speckled shield lichens",
    Pyxine: "Button lichens",
    Ranunculus: "Buttercups",
    Rhus: "Sumacs",
    Robinia: "Locust trees",
    Rosa: "Roses",
    Rudbeckia: "Coneflowers",
    Sagittaria: "Arrowheads",
    Salix: "Willows",
    Smilax: "Greenbriers",
    Solanum: "Nightshades",
    Stereum: "Parchment fungi",
    Symphyotrichum: "American asters",
    Taxodium: "Bald cypresses",
    Toxicodendron: "Poison ivy & sumacs",
    Trachemys: "Sliders",
    Trametes: "Turkey tails",
    Typha: "Cattails",
    Ulmus: "Elms",
    Verbesina: "Crownbeards",
    Vernonia: "Ironweeds",
    Viola: "Violets",
    Xylocopa: "Carpenter bees",
    Zizania: "Wild rice"
  });

  Object.assign(TAXON_COMMON_ALIASES.order, {
    Accipitriformes: "Hawks, eagles & vultures",
    Anabantiformes: "Labyrinth fishes & snakeheads",
    Apodiformes: "Swifts & hummingbirds",
    Architaenioglossa: "Apple snails",
    Blattodea: "Cockroaches & termites",
    Boraginales: "Borages & forget-me-nots",
    Cathartiformes: "New World vultures",
    Centrarchiformes: "Sunfish & basses",
    Chiroptera: "Bats",
    Columbiformes: "Pigeons & doves",
    Cucurbitales: "Gourds, begonias & allies",
    Cypriniformes: "Minnows & carps",
    Dioscoreales: "Yams & greenbriers",
    Hypnales: "Feather mosses",
    Laurales: "Laurels & spicebushes",
    Neuroptera: "Lacewings & antlions",
    Oxalidales: "Wood-sorrels & allies",
    Piperales: "Pipevines, peppers & lizard's-tails",
    Pucciniales: "Rust fungi",
    Rodentia: "Rodents",
    Sarcoptiformes: "Mites",
    Siluriformes: "Catfishes",
    Suliformes: "Cormorants, anhingas & allies",
    Venerida: "Venus clams & allies",
    Zingiberales: "Gingers, cannas & allies"
  });

  Object.assign(TAXON_COMMON_ALIASES.family, {
    Agromyzidae: "Leaf miner flies",
    Aphididae: "Aphids",
    Balsaminaceae: "Jewelweed family",
    Caliciaceae: "Stubble lichens",
    Cambaridae: "Crayfishes",
    Cantharidae: "Soldier beetles",
    Caryophyllaceae: "Pink & carnation family",
    Castoridae: "Beavers",
    Celastraceae: "Bittersweet family",
    Coreidae: "Leaf-footed bugs",
    Crambidae: "Crambid snout moths",
    Culicidae: "Mosquitoes",
    Flatidae: "Flatid planthoppers",
    Fringillidae: "Finches",
    Geraniaceae: "Geranium family",
    Hirundinidae: "Swallows",
    Juglandaceae: "Walnut family",
    Lasiocampidae: "Tent caterpillar moths",
    Pentatomidae: "Stink bugs",
    Pinaceae: "Pine family",
    Sciuridae: "Squirrels & chipmunks",
    Sphingidae: "Sphinx moths",
    Tetragnathidae: "Long-jawed orbweavers",
    Tyrannidae: "Tyrant flycatchers"
  });

  Object.assign(TAXON_COMMON_ALIASES.genus, {
    Aedes: "Biting mosquitoes",
    Aesculus: "Buckeyes & horse-chestnuts",
    Ailanthus: "Tree-of-heaven",
    Ancyloxypha: "Least skippers",
    Andricus: "Oak gall wasps",
    Castor: "Beavers",
    Coccinella: "Lady beetles",
    Geranium: "Cranesbills",
    Glechoma: "Ground ivies",
    Hedera: "Ivies",
    Liquidambar: "Sweetgums",
    Nymphaea: "Water lilies",
    Passer: "House sparrows",
    Perithemis: "Amberwing dragonflies",
    Procyon: "Raccoons",
    Pyrus: "Pears",
    Reynoutria: "Knotweed canes",
    Rumex: "Docks & sorrels",
    Setophaga: "Wood-warblers",
    Tenodera: "Giant mantises",
    Tyrannus: "Kingbirds",
    Vanessa: "Painted ladies & admirals",
    Vicia: "Vetches",
    Viburnum: "Viburnums"
  });

  Object.assign(TAXON_COMMON_ALIASES.order, {
    Acanthuriformes: "Surgeonfish relatives",
    Acarosporales: "Cobblestone lichens",
    Acholeplasmatales: "Tiny wall-less bacteria",
    Acorales: "Sweet flags",
    Amphipoda: "Scuds & beach hoppers",
    Archaeognatha: "Jumping bristletails",
    Arecales: "Palms",
    Arthoniales: "Script lichens",
    Atheliales: "Crust fungi",
    Atractiellales: "Tiny jelly fungi",
    Aulacomniales: "Ribbed mosses",
    Bartramiales: "Apple mosses",
    Bryales: "Thread mosses",
    Bunyavirales: "Plant & animal viruses",
    Buxales: "Boxwoods",
    Cantharellales: "Chanterelles & tooth fungi",
    Capnodiales: "Sooty molds",
    Caprimulgiformes: "Nightjars",
    Caudata: "Salamanders",
    Ceratiomyxales: "White slime molds",
    Clupeiformes: "Herrings & shads",
    Coraciiformes: "Kingfishers",
    Corticiales: "Painted crust fungi",
    Crossosomatales: "Crossosoma shrubs",
    Cuculiformes: "Cuckoos",
    Cycadales: "Cycads",
    Dacrymycetales: "Orange jelly fungi",
    Dermaptera: "Earwigs",
    Dicranales: "Fork mosses",
    Entomobryomorpha: "Slender springtails",
    Entomophthorales: "Insect-killing fungi",
    Ephemeroptera: "Mayflies",
    Equisetales: "Horsetails",
    Eulipotyphla: "Shrews & moles",
    Falconiformes: "Falcons",
    Funariales: "Cord mosses",
    Galliformes: "Game birds",
    Garryales: "Silktassels & aucubas",
    Geastrales: "Earthstar fungi",
    Geophilomorpha: "Soil centipedes",
    Ginkgoales: "Ginkgoes",
    Glomerellales: "Leaf spot fungi",
    Gloeophyllales: "Brown-rot bracket fungi",
    Gomphales: "Club & coral fungi",
    Grimmiales: "Dry rock mosses",
    Gruiformes: "Rails, cranes & allies",
    Hedwigiales: "Hedwigia mosses",
    Helotiales: "Cup fungi",
    Hypocreales: "Bright mold fungi",
    Ixodida: "Ticks",
    Julida: "Round-backed millipedes",
    Jungermanniales: "Leafy liverworts",
    Laboulbeniales: "Insect fungi",
    Lecideales: "Crustose lichens",
    Leotiales: "Earth tongues & allies",
    Lithobiomorpha: "Stone centipedes",
    Lunulariales: "Crescent liverworts",
    Lycopodiales: "Clubmosses",
    Marchantiales: "Thalloid liverworts",
    Martellivirales: "Plant viruses",
    Megaloptera: "Dobsonflies & alderflies",
    Microstromatales: "Leaf smut fungi",
    Mucorales: "Pin molds",
    Mycosphaerellales: "Leaf spot fungi",
    Myliobatiformes: "Rays",
    Osmundales: "Royal ferns",
    Ostropales: "Lichenized cup fungi",
    Patatavirales: "Plant potyviruses",
    Perciformes: "Perch-like fishes",
    Perissodactyla: "Odd-toed hoofed mammals",
    Pertusariales: "Wart lichens",
    Pezizales: "Cup fungi",
    Phallales: "Stinkhorn fungi",
    Phasmida: "Walking sticks",
    Physarales: "Slime molds",
    Platygloeales: "Jelly rust fungi",
    Plecoptera: "Stoneflies",
    Pleosporales: "Dark-spored fungi",
    Plumatellida: "Freshwater bryozoans",
    Podicipediformes: "Grebes",
    Poduromorpha: "Chunky springtails",
    Porellales: "Leafy liverworts",
    Pottiales: "Twisted mosses",
    Psocodea: "Barklice & parasitic lice",
    Reticulariales: "Netted slime molds",
    Rhizobiales: "Root-nodule bacteria",
    Rhytismatales: "Tar spot fungi",
    Salviniales: "Floating ferns",
    Scolopendromorpha: "Tropical centipedes",
    Scutigeromorpha: "House centipedes",
    Sebacinales: "Jelly root fungi",
    Spirobolida: "Round millipedes",
    Spongillida: "Freshwater sponges",
    Stemonitidales: "Stalked slime molds",
    Strigiformes: "Owls",
    Symphypleona: "Globular springtails",
    Taphrinales: "Leaf curl fungi",
    Teloschistales: "Orange lichens",
    Thelephorales: "Earthfans & tooth fungi",
    Thysanoptera: "Thrips",
    Trapeliales: "Crust lichens",
    Tremellales: "Jelly fungi",
    Trichiales: "Hairy slime molds",
    Trichoptera: "Caddisflies",
    Trombidiformes: "Velvet mites & plant mites",
    Trypetheliales: "Tropical crust lichens",
    Umbilicariales: "Rock tripe lichens",
    Ustilaginales: "Smut fungi",
    Vaucheriales: "Yellow-green algae",
    Venturiales: "Scab fungi",
    Verrucariales: "Rock-pimple lichens",
    Xanthomonadales: "Yellow plant bacteria",
    Xylariales: "Carbon fungi",
    Zygnematales: "Pond silk algae",
    Zygentoma: "Silverfish"
  });

  Object.assign(TAXON_COMMON_ALIASES.family, {
    Acanaloniidae: "Acanaloniid planthoppers",
    Acanthaceae: "Acanthus family",
    Agaricaceae: "Mushroom family",
    Agelenidae: "Funnel weaver spiders",
    Agriolimacidae: "Field slugs",
    Altingiaceae: "Sweetgum family",
    Amblystegiaceae: "Wetland feather mosses",
    Amanitaceae: "Amanita family",
    Annonaceae: "Custard apple family",
    Anthomyiidae: "Root-maggot flies",
    Arecaceae: "Palm family",
    Armadillidiidae: "Pillbugs",
    Arionidae: "Roundback slugs",
    Asilidae: "Robber flies",
    Asphodelaceae: "Aloe & daylily family",
    Aspleniaceae: "Spleenwort ferns",
    Athyriaceae: "Lady fern family",
    Auriculariaceae: "Jelly ear fungi",
    Begoniaceae: "Begonia family",
    Berytidae: "Stilt bugs",
    Boletaceae: "Bolete family",
    Boraginaceae: "Borage family",
    Brachytheciaceae: "Feather moss family",
    Braconidae: "Braconid wasps",
    Bryaceae: "Thread moss family",
    Buxaceae: "Boxwood family",
    Cactaceae: "Cactus family",
    Calliphoridae: "Blow flies",
    Candelariaceae: "Candleflame lichens",
    Cannabaceae: "Hemp & hackberry family",
    Cannaceae: "Canna family",
    Cerambycidae: "Longhorn beetles",
    Chironomidae: "Non-biting midges",
    Chrysopidae: "Green lacewings",
    Chrysotrichaceae: "Gold dust lichens",
    Cladoniaceae: "Cup lichens",
    Crabronidae: "Square-headed wasps",
    Crassulaceae: "Stonecrop family",
    Cucurbitaceae: "Gourd family",
    Cyprinidae: "Minnows & carps",
    Dacrymycetaceae: "Orange jelly fungi",
    Dicranaceae: "Fork moss family",
    Dioscoreaceae: "Yam family",
    Ditrichaceae: "Bristle moss family",
    Dolichopodidae: "Long-legged flies",
    Dolomedidae: "Fishing spiders",
    Drepanopezizaceae: "Leaf spot fungi",
    Drosophilidae: "Fruit flies",
    Dryopteridaceae: "Wood fern family",
    Elaeagnaceae: "Oleaster family",
    Elateridae: "Click beetles",
    Entodontaceae: "Carpet moss family",
    Equisetaceae: "Horsetail family",
    Erysiphaceae: "Powdery mildews",
    Euphorbiaceae: "Spurge family",
    Fissidentaceae: "Pocket moss family",
    Frullaniaceae: "Scale liverworts",
    Funariaceae: "Cord moss family",
    Garryaceae: "Silktassel family",
    Gelechiidae: "Twirler moths",
    Glomerellaceae: "Anthracnose fungi",
    Grimmiaceae: "Rock moss family",
    Gymnosporangiaceae: "Cedar rust fungi",
    Hamamelidaceae: "Witch-hazel family",
    Hedwigiaceae: "Hedwigia moss family",
    Hydnaceae: "Tooth fungi",
    Hydrangeaceae: "Hydrangea family",
    Hymenochaetaceae: "Bristle bracket fungi",
    Hypnaceae: "Feather moss family",
    Hypocreaceae: "Bright mold family",
    Hypoxylaceae: "Carbon cushion fungi",
    Ichneumonidae: "Ichneumon wasps",
    Irpicaceae: "Crust polypores",
    Iteaceae: "Sweetspire family",
    Juncaceae: "Rush family",
    Lampyridae: "Fireflies",
    Laridae: "Gulls & terns",
    Lauxaniidae: "Sap flies",
    Lecanoraceae: "Rim lichens",
    Lecideaceae: "Crustose lichens",
    Leporidae: "Rabbits & hares",
    Leucobryaceae: "Pincushion moss family",
    Liliaceae: "Lily family",
    Limacidae: "Keeled slugs",
    Limoniidae: "Limoniid crane flies",
    Lycoperdaceae: "Puffball fungi",
    Lycosidae: "Wolf spiders",
    Megachilidae: "Leafcutter & mason bees",
    Megasporaceae: "Megaspore lichens",
    Melanthiaceae: "Bunchflower family",
    Membracidae: "Treehoppers",
    Meruliaceae: "Crust polypore family",
    Mniaceae: "Star moss family",
    Montiaceae: "Miner lettuce family",
    Mordellidae: "Tumbling flower beetles",
    Muscidae: "House flies & allies",
    Mycenaceae: "Bonnet mushrooms",
    Mycosphaerellaceae: "Leaf spot fungi",
    Neckeraceae: "Neckera moss family",
    Nepticulidae: "Pygmy moths",
    Nidulariaceae: "Birds nest fungi",
    Nyssaceae: "Tupelo family",
    Onocleaceae: "Sensitive fern family",
    Orchidaceae: "Orchid family",
    Orthotrichaceae: "Bristle moss family",
    Orobanchaceae: "Broomrape family",
    Oxalidaceae: "Wood-sorrel family",
    Paeoniaceae: "Peony family",
    Paradoxosomatidae: "Flat-backed millipedes",
    Paridae: "Tits & chickadees",
    Passalidae: "Bess beetles",
    Passeridae: "Old World sparrows",
    Paulowniaceae: "Empress tree family",
    Phalacrocoracidae: "Cormorants",
    Phyllostictaceae: "Leaf spot fungi",
    Physalacriaceae: "Honey mushroom family",
    Physaraceae: "Slime molds",
    Philosciidae: "Woodlice",
    Phylloxeridae: "Phylloxerans",
    Pisauridae: "Nursery web spiders",
    Plataspidae: "Kudzu bugs",
    Platygloeaceae: "Jelly rust fungi",
    Pleurotaceae: "Oyster mushroom family",
    Pluteaceae: "Shield mushrooms",
    Polemoniaceae: "Phlox family",
    Polytrichaceae: "Haircap moss family",
    Psathyrellaceae: "Inkcap & brittlestem fungi",
    Psychidae: "Bagworm moths",
    Pteridaceae: "Brake fern family",
    Pucciniaceae: "Rust fungi",
    Radulomycetaceae: "Toothed crust fungi",
    Reduviidae: "Assassin bugs",
    Reticulariaceae: "Net slime molds",
    Rhagionidae: "Snipe flies",
    Rhopalidae: "Scentless plant bugs",
    Rutaceae: "Citrus family",
    Russulaceae: "Russulas & milkcaps",
    Sarcophagidae: "Flesh flies",
    Saururaceae: "Lizard-tail family",
    Saxifragaceae: "Saxifrage family",
    Schizophyllaceae: "Split-gill fungi",
    Sclerosomatidae: "Harvestmen",
    Scoliidae: "Scarab-hunter wasps",
    Scolopacidae: "Sandpipers",
    Scrophulariaceae: "Figwort family",
    Simaroubaceae: "Quassia family",
    Sphecidae: "Thread-waisted wasps",
    Spirobolidae: "Round millipedes",
    Stereocaulaceae: "Foam lichens",
    Strophariaceae: "Roundhead mushrooms",
    Sturnidae: "Starlings",
    Tachinidae: "Tachinid flies",
    Taxaceae: "Yew family",
    Teloschistaceae: "Orange lichens",
    Tenthredinidae: "Sawflies",
    Theaceae: "Tea family",
    Thelypteridaceae: "Marsh fern family",
    Theridiidae: "Cobweb spiders",
    Thuidiaceae: "Fern moss family",
    Tingidae: "Lace bugs",
    Tipulidae: "Crane flies",
    Tortricidae: "Leafroller moths",
    Trapeliaceae: "Crust lichens",
    Trigonidiidae: "Sword-tail crickets",
    Troglodytidae: "Wrens",
    Ulidiidae: "Picture-winged flies",
    Urticaceae: "Nettle family",
    Verbenaceae: "Verbena family",
    Verrucariaceae: "Rock-pimple lichens",
    Xylariaceae: "Carbon fungi"
  });

  Object.assign(TAXON_COMMON_ALIASES.order, {
    Anguilliformes: "Freshwater & marine eels",
    Atheriniformes: "Silversides",
    Austrobaileyales: "Primitive flowering vines",
    Botryosphaeriales: "Canker fungi",
    Characiformes: "Characins & tetras",
    Diaporthales: "Canker & blight fungi",
    Didelphimorphia: "Opossums",
    Lagomorpha: "Rabbits & hares",
    Orthotrichales: "Bristle mosses",
    Osteoglossiformes: "Bonytongue fishes",
    Pectinida: "Scallops",
    Pelliales: "Simple thalloid liverworts",
    Pilosa: "Sloths & anteaters",
    Polydesmida: "Flat-backed millipedes",
    Polytrichales: "Haircap mosses",
    Primates: "Primates",
    Pseudomonadales: "Fluorescent bacteria",
    Ulvales: "Sea lettuce algae"
  });

  Object.assign(TAXON_COMMON_ALIASES.family, {
    Canidae: "Dogs, foxes & coyotes",
    Cathartidae: "New World vultures",
    Cephalotaxaceae: "Plum-yew family",
    Ceratiomyxaceae: "White slime molds",
    Cicindelidae: "Tiger beetles",
    Columbidae: "Pigeons & doves",
    Curculionidae: "Weevils",
    Dictynidae: "Meshweb spiders",
    Hylidae: "Treefrogs",
    Hymenogastraceae: "Underground mushroom allies",
    Hypericaceae: "St. John's-wort family",
    Meripilaceae: "Giant polypores",
    Papaveraceae: "Poppy family",
    Philopotamidae: "Finger-net caddisflies",
    Phlyctidaceae: "Crust lichens",
    Pottiaceae: "Twisted moss family",
    Potyviridae: "Plant potyviruses",
    Primulaceae: "Primrose family",
    Saturniidae: "Giant silk moths",
    Stratiomyidae: "Soldier flies"
  });

  window.GridWildTaxonomy?.registerCommonNames?.(TAXON_COMMON_ALIASES);

  function titleCaseTaxonLabel(value) {
    return String(value || "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  function genusCodexCommonName(name) {
    const rec = window.GridWildGenusCodex?.genera?.[name];
    if (!rec) return "";
    if (rec.common) return titleCaseTaxonLabel(rec.common);
    const fact = (rec.facts || []).find(item => /iNaturalist lists "/.test(String(item)));
    const match = String(fact || "").match(/iNaturalist lists "([^"]+)"/);
    return match?.[1] ? titleCaseTaxonLabel(match[1]) : "";
  }

  function taxonDisplayEntry(entry, rank) {
    const scientific = String(entry?.name || "Unknown").trim() || "Unknown";
    if (window.GridWildTaxonomy?.displayEntry) {
      return window.GridWildTaxonomy.displayEntry({ name: scientific, count: entry?.count }, rank);
    }
    const aliases = TAXON_COMMON_ALIASES[rank] || {};
    const common = aliases[scientific] || (rank === "genus" ? genusCodexCommonName(scientific) : "");
    return {
      common: common || scientific,
      scientific,
      count: Math.round(Number(entry?.count) || 0),
      aliased: Boolean(common && common !== scientific)
    };
  }

  function monthTotals(metrics = {}) {
    const totals = Array.isArray(metrics.month_totals)
      ? metrics.month_totals.slice(0, 12).map(v => Number(v) || 0)
      : [];
    while (totals.length < 12) totals.push(0);
    return totals;
  }

  function monthProfileStats(metrics = {}) {
    const totals = monthTotals(metrics);
    const total = totals.reduce((sum, value) => sum + value, 0);
    if (!total) {
      return {
        peakMonth: Number(metrics.peak_month || 0),
        seasonalStrength: clamp01(Number(metrics.seasonal_strength || 0)),
        entropy: Number(metrics.month_entropy || 0)
      };
    }

    const peakIndex = totals.reduce((best, value, idx) => value > totals[best] ? idx : best, 0);
    const entropy = totals.reduce((sum, value) => {
      if (value <= 0) return sum;
      const p = value / total;
      return sum - p * Math.log(p);
    }, 0);

    return {
      peakMonth: peakIndex + 1,
      seasonalStrength: clamp01((totals[peakIndex] / total - (1 / 12)) / 0.55),
      entropy
    };
  }

  function dominantIconicFromMetrics(metrics = {}) {
    const explicit = String(metrics.dominant_iconic || "").trim();
    if (explicit) return explicit;

    return Object.entries(metrics.iconic_counts || {})
      .map(([name, count]) => ({ name, count: Number(count) || 0 }))
      .filter(entry => entry.count > 0)
      .sort((a, b) => b.count - a.count)[0]?.name || "Unknown";
  }

  function lensStatsMetrics(metrics = {}, niche = null) {
    const months = monthProfileStats(metrics);
    const activeCells = Number(metrics.activeCells || metrics.active_cells || 0);
    const totalCells = Number(metrics.component_cell_count || metrics.componentCellCount || metrics.totalCells || 0);
    const rawLatestObservedMs = Number(metrics.latestObservedMs || metrics.latest_observed_ms || metrics.last_observed_ms || 0);
    const latestObservedMs = Number.isFinite(rawLatestObservedMs) ? rawLatestObservedMs : 0;
    const iconicCounts = metrics.iconic_counts || {};
    const iconicN = Object.values(iconicCounts).filter(value => Number(value) > 0).length;

    return {
      ...metrics,
      count: Number(metrics.count) || 0,
      species: Number(metrics.species) || 0,
      observers: Number(metrics.observers) || 0,
      n_captive: Number(metrics.n_captive ?? metrics.captive) || 0,
      activeCells,
      nActiveSquares: activeCells || Math.max(1, Math.round(totalCells * Number(metrics.activeRatio || metrics.active_ratio || 0))),
      dominant_iconic: dominantIconicFromMetrics(metrics),
      iconic_n: Number(metrics.iconic_n || iconicN || 1),
      month_totals: monthTotals(metrics),
      peak_month: Number(metrics.peak_month || months.peakMonth || 0),
      seasonal_strength: clamp01(Number(metrics.seasonal_strength || months.seasonalStrength || 0)),
      month_entropy: Number(metrics.month_entropy || months.entropy || 0),
      last_observed: metrics.last_observed || (latestObservedMs ? new Date(latestObservedMs).toISOString().slice(0, 10) : ""),
      last_observed_ms: latestObservedMs,
      median_last10_observed: metrics.median_last10_observed || metrics.last_observed || "",
      median_last10_observed_ms: Number(metrics.median_last10_observed_ms || latestObservedMs || 0),
      osm: metrics.osm || niche?.place_context?.osm || null
    };
  }

  function lensLabel(key) {
    return window.GWLegendCopy?.[key]?.title ||
      key.split("-").map(part => part ? part[0].toUpperCase() + part.slice(1) : part).join(" ");
  }

  function lensOutputColor(output) {
    if (!output) return "rgba(139,211,168,0.72)";
    const hue = Number(output.hue);
    const sat = Number(output.sat);
    const light = Number(output.light);
    if (![hue, sat, light].every(Number.isFinite)) return "rgba(139,211,168,0.72)";
    return `hsl(${hue.toFixed(1)}, ${Math.max(0, Math.min(100, sat)).toFixed(1)}%, ${Math.max(0, Math.min(100, light)).toFixed(1)}%)`;
  }

  function lensOutputRows(metrics = {}, niche = null) {
    const recipes = window.GWLenses?.recipes || {};
    const sourceMetrics = lensStatsMetrics(metrics, niche);
    const activeLens = String(metrics.active_lens || window.__gwState?.activeLens || "classic");

    return NICHE_LENS_KEYS.map((key) => {
      const recipe = recipes[key];
      const isOsm = key.startsWith("osm-");
      let output = null;

      if (typeof recipe === "function" && (!isOsm || sourceMetrics.osm)) {
        try {
          output = recipe(sourceMetrics);
        } catch (err) {
          output = null;
        }
      }

      return {
        key,
        label: lensLabel(key),
        value: output ? clamp01(Number(output.alpha) || 0) : 0,
        color: lensOutputColor(output),
        available: Boolean(output),
        active: key === activeLens
      };
    });
  }

  function radarPoint(cx, cy, radius, angleDeg, value = 1) {
    const angle = (angleDeg - 90) * Math.PI / 180;
    return {
      x: cx + radius * value * Math.cos(angle),
      y: cy + radius * value * Math.sin(angle)
    };
  }

  function radarPolygonPoints(rows, radiusMultiplier = 1) {
    const cx = 88;
    const cy = 82;
    const radius = 48 * radiusMultiplier;
    return rows.map((row, index) => {
      const angle = (360 / rows.length) * index;
      const point = radarPoint(cx, cy, radius, angle, clamp01(row.value));
      return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    }).join(" ");
  }

  function logScore(value, max) {
    return clamp01(Math.log1p(Number(value) || 0) / Math.log1p(Math.max(1, Number(max) || 1)));
  }

  function lensGroupRows(outputs = [], metrics = {}) {
    return NICHE_LENS_GROUPS.map((group) => {
      const rows = group.lenses
        .map(key => outputs.find(output => output.key === key))
        .filter(Boolean);
      const available = rows.filter(row => row.available);
      let value = available.length
        ? available.reduce((sum, row) => sum + row.value, 0) / available.length
        : 0;

      if (group.label === "Bio") {
        value = Math.max(value, clamp01(Number(metrics.biodiversity_score || 0)) * 0.82);
      } else if (group.label === "Find") {
        value = Math.max(value, clamp01(Number(metrics.sampling_need_score || metrics.novelty_score || 0)) * 0.82);
      } else if (group.label === "Access" && !available.length) {
        const corridor = isCorridorNiche({ metrics }) ? 0.58 : 0;
        value = Math.max(value, corridor);
      }

      return { ...group, value: clamp01(value) };
    });
  }

  function focusSpecificityScore(niche, metrics = {}) {
    const focus = plainTaxonLabel(niche?.taxon_focus?.label || "");
    const summary = metrics.taxonomy_summary || metrics.taxonomySummary || {};
    const hydratedCells = Number(summary.hydrated_cells || 0);
    const specific = focus && !isBroadFocusLabel(focus) ? 0.48 : 0.18;
    return clamp01(specific + Math.min(0.32, hydratedCells / 30) + clamp01(Number(niche?.confidence || 0)) * 0.20);
  }

  function questRadarRows(niche, metrics = {}) {
    const rawLatestMs = Number(metrics.latestObservedMs || metrics.latest_observed_ms || metrics.last_observed_ms || 0);
    const latestMs = Number.isFinite(rawLatestMs) ? rawLatestMs : 0;
    const freshness = latestMs ? 1 - clamp01(daysSince(latestMs) / 365) : 0;
    const stewardScore = clamp01(homeUserCount(niche) / 4 + (isHomeNiche(niche) ? 0.25 : 0));

    return [
      { label: "Priority", value: Number(niche?.questability_score || 0) },
      { label: "Need", value: Number(niche?.sampling_need_score || niche?.novelty_score || 0) },
      { label: "Trust", value: Number(niche?.confidence || 0) },
      { label: "Focus", value: focusSpecificityScore(niche, metrics) },
      { label: "Steward", value: stewardScore },
      { label: "Fresh", value: freshness }
    ];
  }

  function patchRadarRows(metrics = {}) {
    const cells = Number(metrics.component_cell_count || metrics.componentCellCount || metrics.totalCells || 0);
    const count = Number(metrics.count || 0);
    const iconicN = Number(metrics.iconic_n || Object.values(metrics.iconic_counts || {}).filter(value => Number(value) > 0).length || 0);
    const months = monthProfileStats(metrics);
    const activeRatio = Number(metrics.activeRatio || metrics.active_ratio || 0);

    return [
      { label: "Heat", value: Number(metrics.peak_abs_z || metrics.lensPeakAbsZ || 0) / 5 },
      { label: "Area", value: logScore(cells, 96) },
      { label: "Active", value: activeRatio },
      { label: "Support", value: logScore(count, 120) },
      { label: "Season", value: months.seasonalStrength },
      { label: "Mix", value: iconicN ? iconicN / 6 : Number(metrics.biodiversity_score || 0) * 0.7 }
    ];
  }

  function renderRadarCardHtml(title, rows, ariaLabel) {
    const gridPolygons = [0.33, 0.66, 1]
      .map(scale => `<polygon points="${radarPolygonPoints(rows.map(row => ({ ...row, value: 1 })), scale)}"></polygon>`)
      .join("");
    const polygonPoints = radarPolygonPoints(rows);

    return `
      <div class="gw-niche-lens-radar-wrap">
        <div class="gw-niche-lens-radar-title">${esc(title)}</div>
        <svg class="gw-niche-lens-radar" viewBox="0 0 176 164" role="img" aria-label="${esc(ariaLabel || title)}">
          <g class="gw-niche-lens-radar-grid">
            ${gridPolygons}
            ${rows.map((row, index) => {
              const angle = (360 / rows.length) * index;
              const end = radarPoint(88, 82, 48, angle, 1);
              return `<line x1="88" y1="82" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}"></line>`;
            }).join("")}
          </g>
          <polygon class="gw-niche-lens-radar-fill" points="${polygonPoints}"></polygon>
          <polyline class="gw-niche-lens-radar-line" points="${polygonPoints} ${polygonPoints.split(" ")[0]}"></polyline>
          ${rows.map((row, index) => {
            const angle = (360 / rows.length) * index;
            const point = radarPoint(88, 82, 63, angle, 1);
            const anchor = point.x < 78 ? "end" : point.x > 98 ? "start" : "middle";
            return `<text x="${point.x.toFixed(1)}" y="${point.y.toFixed(1)}" text-anchor="${anchor}">${esc(row.label)}</text>`;
          }).join("")}
        </svg>
      </div>
    `;
  }

  function renderNicheLensStatisticsHtml(niche) {
    const metrics = niche?.metrics || {};
    const outputs = lensOutputRows(metrics, niche);
    if (!outputs.length) {
      return `<div class="gw-muted gw-niche-evidence-line">Lens statistics are not available for this niche yet.</div>`;
    }

    const groups = lensGroupRows(outputs, metrics);
    const active = outputs.find(output => output.active) || outputs.find(output => output.key === "classic") || outputs[0];
    const strongest = outputs
      .filter(output => output.available)
      .slice()
      .sort((a, b) => b.value - a.value)[0] || active;
    const average = outputs.length
      ? outputs.reduce((sum, output) => sum + output.value, 0) / outputs.length
      : 0;

    return `
      <div class="gw-niche-lens-stats">
        <div class="gw-niche-lens-radar-grid-panel">
          ${renderRadarCardHtml("Lens Signal", groups, "Lens signal radar plot")}
          ${renderRadarCardHtml("Quest Readiness", questRadarRows(niche, metrics), "Quest readiness radar plot")}
          ${renderRadarCardHtml("Patch Anatomy", patchRadarRows(metrics), "Patch anatomy radar plot")}
        </div>
        <div class="gw-niche-lens-stat-summary">
          <span><b>Active</b>${esc(active.label)} ${esc(Math.round(active.value * 100))}%</span>
          <span><b>Peak</b>${esc(strongest.label)} ${esc(Math.round(strongest.value * 100))}%</span>
          <span><b>Mean</b>${esc(Math.round(average * 100))}% lens output</span>
        </div>
        <div class="gw-niche-lens-output-ribbon" aria-label="All lens output values">
          ${outputs.map(output => `
            <span class="gw-niche-lens-output ${output.active ? "is-active" : ""} ${output.available ? "" : "is-unavailable"}" title="${esc(output.label)}: ${esc(output.available ? `${Math.round(output.value * 100)}%` : "no OSM value")}">
              <i style="--gw-lens-color:${esc(output.color)};--gw-lens-value:${esc(Math.round(output.value * 100))}%;"></i>
              <b>${esc(output.label)}</b>
              <em>${esc(output.available ? Math.round(output.value * 100) : 0)}</em>
            </span>
          `).join("")}
        </div>
      </div>
    `;
  }

  function parseCellIds(cellIds = []) {
    return (Array.isArray(cellIds) ? cellIds : [])
      .map((id) => {
        const [ix, iy] = String(id).split(",").map(Number);
        return Number.isFinite(ix) && Number.isFinite(iy) ? { ix, iy, key: `${ix},${iy}` } : null;
      })
      .filter(Boolean);
  }

  function rowsForSquareRecord(rec) {
    if (!rec) return [];
    if (Array.isArray(rec)) return rec;
    if (Array.isArray(rec.genera)) return rec.genera;
    if (Array.isArray(rec.rows)) return rec.rows;
    if (Array.isArray(rec.taxa)) return rec.taxa;
    if (rec.genera) return [rec.genera];
    return [];
  }

  function addTaxonCount(map, key, count) {
    const label = String(key || "Unknown").trim() || "Unknown";
    map.set(label, (map.get(label) || 0) + (Number(count) || 0));
  }

  function topTaxonEntries(map, limit = 5) {
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .filter(entry => entry.count > 0)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, limit);
  }

  function createTaxonomyTreeNode(name, rank, depth = 0) {
    return {
      name,
      rank,
      depth,
      weight: 0,
      children: new Map()
    };
  }

  function addTaxonomyTreeRow(root, row, count) {
    const parts = [
      [row?.iconic_taxon_name || "Unknown", "iconic_taxon"],
      [row?.order_name || "Unknown", "order"],
      [row?.family_name || "Unknown", "family"],
      [row?.genus_name || "Unknown", "genus"]
    ];

    root.weight += count;
    let node = root;
    parts.forEach(([name, rank], idx) => {
      const key = `${rank}:${name}`;
      if (!node.children.has(key)) {
        node.children.set(key, createTaxonomyTreeNode(name, rank, idx + 1));
      }
      node = node.children.get(key);
      node.weight += count;
    });
  }

  function finalizeTaxonomyTree(node) {
    const children = [...node.children.values()]
      .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name))
      .map(finalizeTaxonomyTree);

    return {
      name: node.name,
      rank: node.rank,
      depth: node.depth,
      weight: node.weight,
      children
    };
  }

  function nicheHydrationKey(niche) {
    return niche?.source_key || niche?.id || (Array.isArray(niche?.grid_cell_ids) ? niche.grid_cell_ids.join("|") : "");
  }

  async function hydrateNicheSummaryMetrics(niche, onProgress = null) {
    const key = nicheHydrationKey(niche);
    if (!key) return niche;
    if (nicheSummaryHydrationCache.has(key)) return nicheSummaryHydrationCache.get(key);

    const cells = parseCellIds(niche.grid_cell_ids || []);
    const loadSquareRecord = typeof getSquareGeneraRecord === "function"
      ? getSquareGeneraRecord
      : window.getSquareGeneraRecord;
    if (!cells.length || typeof loadSquareRecord !== "function") return niche;

    const month_totals = Array(12).fill(0);
    const iconic_counts = {};
    const orderCounts = new Map();
    const familyCounts = new Map();
    const genusCounts = new Map();
    const taxonomyTree = createTaxonomyTreeNode("Life", "root", 0);
    let hydratedCells = 0;
    let cellsWithMonthBuckets = 0;
    let rowsSeen = 0;

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      onProgress?.(i, cells.length);

      const rec = await loadSquareRecord(cell.ix, cell.iy);
      const rows = rowsForSquareRecord(rec);
      if (!rows.length) continue;

      hydratedCells += 1;
      let cellHasMonthBuckets = false;

      for (const row of rows) {
        rowsSeen += 1;
        const count = Number(row?.count) || 0;
        const iconic = row?.iconic_taxon_name || "Unknown";
        iconic_counts[iconic] = (iconic_counts[iconic] || 0) + count;
        addTaxonCount(orderCounts, row?.order_name, count);
        addTaxonCount(familyCounts, row?.family_name, count);
        addTaxonCount(genusCounts, row?.genus_name, count);
        if (count > 0) addTaxonomyTreeRow(taxonomyTree, row, count);

        if (Array.isArray(row?.month_counts)) {
          row.month_counts.slice(0, 12).forEach((value, idx) => {
            const n = Number(value) || 0;
            month_totals[idx] += n;
            if (n > 0) cellHasMonthBuckets = true;
          });
        }
      }

      if (cellHasMonthBuckets) cellsWithMonthBuckets += 1;
      if (i % 6 === 5) await yieldToPaint();
    }

    onProgress?.(cells.length, cells.length);

    const finalizedTaxonomyTree = finalizeTaxonomyTree(taxonomyTree);
    const hydratedDraft = {
      ...niche,
      metrics: {
        ...(niche.metrics || {}),
        month_totals,
        monthTotalsExactCells: cellsWithMonthBuckets,
        monthTotalsMissingCells: Math.max(0, cells.length - cellsWithMonthBuckets),
        iconic_counts,
        taxonomy_summary: {
          hydrated_cells: hydratedCells,
          total_cells: cells.length,
          rows_seen: rowsSeen,
          orders: topTaxonEntries(orderCounts, 6),
          families: topTaxonEntries(familyCounts, 6),
          genera: topTaxonEntries(genusCounts, 8),
          tree: finalizedTaxonomyTree
        },
        taxonomy_tree: finalizedTaxonomyTree,
        hydrated_from_superchunks: true
      }
    };
    const hydratedFocus = topTaxonomySubject(hydratedDraft.metrics);
    if (hydratedFocus?.label && (
      !hydratedDraft.taxon_focus?.label ||
      isBroadFocusLabel(hydratedDraft.taxon_focus.label) ||
      String(hydratedDraft.taxon_focus.source_rank || "") === "iconic_taxon"
    )) {
      hydratedDraft.taxon_focus = {
        ...(hydratedDraft.taxon_focus || {}),
        label: titleSubjectCase(hydratedFocus.label),
        source_rank: hydratedFocus.rank
      };
    }
    const hydrated = retitleNiche(hydratedDraft);

    nicheSummaryHydrationCache.set(key, hydrated);
    if (nicheSummaryHydrationCache.size > 40) {
      nicheSummaryHydrationCache.delete(nicheSummaryHydrationCache.keys().next().value);
    }
    return hydrated;
  }

  function hydrateNicheIntoState(key, options = {}) {
    const niche = nicheByKey(key);
    if (!niche) return Promise.resolve(null);

    const hydrationKey = nicheHydrationKey(niche);
    if (!hydrationKey) return Promise.resolve(niche);

    if (nicheSummaryHydrationPending.has(hydrationKey)) {
      return nicheSummaryHydrationPending.get(hydrationKey);
    }

    const selectedOnly = options.selectedOnly !== false;
    const showToast = options.showToast === true;
    const startedSelectedId = nicheKey(niche);

    const job = hydrateNicheSummaryMetrics(niche, showToast
      ? (done, total) => {
          if (!total) return;
          const progress = 14 + Math.round((done / total) * 78);
          showSamplingToast(
            "Hydrating niche summary",
            progress,
            `Loading month and taxonomy rows for ${done}/${total} cells.`
          );
        }
      : null)
      .then((hydrated) => {
        const current = nicheByKey(startedSelectedId);
        if (!current || !hydrated) return current || hydrated || niche;

        const stillSelected = state.selectedId === startedSelectedId;
        if (hydrated !== current) {
          replaceNicheInState(hydrated);
        }

        if (!selectedOnly || stillSelected) {
          drawNicheLayer();
          renderIntoPage();
        }

        if (showToast && hydrated !== niche) {
          finishSamplingToast(
            "Niche summary hydrated",
            "Monthly bars, life mix, and taxonomy data were refreshed from genera superchunks."
          );
        }

        return hydrated;
      })
      .catch((err) => {
        console.warn("Could not hydrate niche summary:", err);
        if (showToast) {
          failSamplingToast("Niche summary hydration failed", "Keeping the existing niche summary.");
        }
        return niche;
      })
      .finally(() => {
        nicheSummaryHydrationPending.delete(hydrationKey);
      });

    nicheSummaryHydrationPending.set(hydrationKey, job);
    return job;
  }

  function renderNicheCalendarHtml(metrics = {}) {
    const totals = monthTotals(metrics);
    const max = Math.max(...totals, 0);
    const total = totals.reduce((sum, value) => sum + value, 0);
    const exactCells = Number(metrics.monthTotalsExactCells || metrics.month_totals_exact_cells || 0);
    const missingCells = Number(metrics.monthTotalsMissingCells || metrics.month_totals_missing_cells || 0);

    if (!total) {
      return `<div class="gw-muted gw-niche-evidence-line">Month-level observation counts are not loaded for this niche yet.</div>`;
    }

    const yTicks = [max, max / 2, 0].map(value => Math.round(value));
    const note = missingCells > 0
      ? `<div class="gw-muted gw-niche-chart-note">Monthly bars use cells with real month buckets; ${esc(missingCells)} cells lacked month-level counts.</div>`
      : exactCells > 0
        ? `<div class="gw-muted gw-niche-chart-note">Monthly bars use observation month buckets from ${esc(exactCells)} cells.</div>`
        : "";

    return `
      <div class="gw-niche-month-chart" aria-label="Monthly niche observations bar chart">
        <div class="gw-niche-y-axis" aria-hidden="true">
          ${yTicks.map(value => `<span>${esc(value)}</span>`).join("")}
        </div>
        <div class="gw-niche-month-plot">
          ${totals.map((value, idx) => {
            const intensity = max > 0 ? value / max : 0;
            return `
              <div class="gw-niche-month-bar-col" title="${esc(MONTH_LABELS[idx])}: ${esc(Math.round(value))} observations">
                <div class="gw-niche-month-bar-track">
                  <i style="height:${Math.max(value > 0 ? 5 : 0, Math.round(intensity * 100))}%"></i>
                </div>
                <span>${esc(MONTH_LABELS[idx])}</span>
              </div>
            `;
          }).join("")}
        </div>
      </div>
      ${note}
    `;
  }

  function polarPoint(cx, cy, r, angleDeg) {
    const angle = (angleDeg - 90) * Math.PI / 180;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle)
    };
  }

  function pieSlicePath(cx, cy, r, startAngle, endAngle) {
    const start = polarPoint(cx, cy, r, endAngle);
    const end = polarPoint(cx, cy, r, startAngle);
    const largeArc = endAngle - startAngle <= 180 ? "0" : "1";
    return [
      `M ${cx.toFixed(2)} ${cy.toFixed(2)}`,
      `L ${start.x.toFixed(2)} ${start.y.toFixed(2)}`,
      `A ${r} ${r} 0 ${largeArc} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
      "Z"
    ].join(" ");
  }

  function renderExplodedPieHtml(metrics = {}) {
    const entries = Object.entries(metrics.iconic_counts || {})
      .map(([key, value]) => [key, Number(value) || 0])
      .filter(([, value]) => value > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    const total = entries.reduce((sum, [, value]) => sum + value, 0);

    if (!total) {
      return `<div class="gw-muted gw-niche-evidence-line">No life-group mix is available for this niche yet.</div>`;
    }

    let angle = 0;
    const slices = entries.map(([key, value]) => {
      const sweep = (value / total) * 360;
      const start = angle;
      const end = angle + sweep;
      const mid = start + sweep / 2;
      angle = end;

      const offset = polarPoint(0, 0, 7, mid);
      const label = taxonDisplayEntry({ name: key, count: value }, "iconic_taxon");
      const color = PIE_COLORS[key] || PIE_COLORS.Unknown;
      const shape = sweep >= 359.9
        ? `<circle cx="${(60 + offset.x).toFixed(2)}" cy="${(60 + offset.y).toFixed(2)}" r="42" fill="${color}"></circle>`
        : `<path d="${pieSlicePath(60 + offset.x, 60 + offset.y, 42, start, end)}" fill="${color}"></path>`;

      return { key, label, value, color, shape };
    });

    return `
      <div class="gw-niche-pie-wrap">
        <svg class="gw-niche-pie" viewBox="0 0 120 120" role="img" aria-label="Exploded life-group pie chart">
          ${slices.map(slice => slice.shape).join("")}
          <circle cx="60" cy="60" r="18" fill="rgba(20,17,15,0.94)" stroke="rgba(240,209,138,0.20)"></circle>
        </svg>
        <div class="gw-niche-pie-legend">
          ${slices.map(slice => `
            <span title="${esc(slice.key)}"><i style="background:${slice.color}"></i>${esc(slice.label.common)} ${esc(Math.round(slice.value))}</span>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderTaxonomySummaryHtml(metrics = {}) {
    const summary = metrics.taxonomy_summary || metrics.taxonomySummary || null;
    if (!summary) {
      return `<div class="gw-muted gw-niche-evidence-line">Taxonomy detail will hydrate from genera superchunks when available.</div>`;
    }

    const groups = [
      ["Orders", "order", summary.orders],
      ["Families", "family", summary.families],
      ["Genera", "genus", summary.genera]
    ].filter(([, , entries]) => Array.isArray(entries) && entries.length);

    if (!groups.length) {
      return `<div class="gw-muted gw-niche-evidence-line">No taxonomy breakdown was found in the hydrated superchunk rows.</div>`;
    }

    const hydratedCells = Number(summary.hydrated_cells || 0);
    const totalCells = Number(summary.total_cells || 0);
    const rowCount = Number(summary.rows_seen || 0);

    return `
      <div class="gw-niche-taxonomy-summary">
        <div class="gw-muted gw-niche-chart-note">
          Hydrated ${esc(hydratedCells)} of ${esc(totalCells)} cells from genera superchunks; ${esc(rowCount)} taxon rows accumulated.
        </div>
        ${groups.map(([label, rank, entries]) => `
          <div class="gw-niche-taxonomy-group">
            <strong>${esc(label)}</strong>
            <div class="gw-niche-taxonomy-list">
              ${entries.slice(0, 8).map(entry => {
                const item = taxonDisplayEntry(entry, rank);
                const title = item.aliased ? `${item.common} (${item.scientific})` : item.scientific;
                return `
                  <span title="${esc(title)}">
                    ${esc(item.common)}
                    ${item.aliased ? `<em>${esc(item.scientific)}</em>` : ""}
                    <i>${esc(item.count)}</i>
                  </span>
                `;
              }).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderControlsHtml() {
    const c = state.controls;
    return `
      <div class="gw-niche-controls">
        <label>
          <span>Input</span>
          <select id="gwNicheRadius">
            <option value="fov" ${String(c.radiusM || "fov") === "fov" ? "selected" : ""}>Map FOV</option>
            ${[
              [250, "250 m"],
              [500, "500 m"],
              [900, "900 m"],
              [1500, "1.5 km"]
            ].map(([value, label]) => `
              <option value="${value}" ${String(c.radiusM) !== "fov" && Number(c.radiusM) === value ? "selected" : ""}>${label}</option>
            `).join("")}
          </select>
        </label>

        <label>
          <span>Mask</span>
          <select id="gwNicheScale">
            <option value="walk" ${c.scale === "walk" ? "selected" : ""}>8-connected</option>
            <option value="5x5" ${c.scale === "5x5" ? "selected" : ""}>8-connected</option>
            <option value="3x3" ${c.scale === "3x3" ? "selected" : ""}>8-connected</option>
          </select>
        </label>

        <label>
          <span>Z cutoff</span>
          <input id="gwNicheZThreshold" type="number" min="0" max="6" step="0.1" value="${esc(Number(c.lensZThreshold ?? 2.5).toFixed(1))}">
        </label>

        <label>
          <span>Min cells</span>
          <input id="gwNicheMinCells" type="number" min="1" max="100" value="${esc(c.componentMinCells ?? 10)}">
        </label>

        <label>
          <span>Emphasis</span>
          <select id="gwNicheEmphasis">
            <option value="balanced" ${c.emphasis === "balanced" ? "selected" : ""}>balanced</option>
            <option value="under_sampled" ${c.emphasis === "under_sampled" ? "selected" : ""}>under-sampled</option>
            <option value="richness" ${c.emphasis === "richness" ? "selected" : ""}>richness</option>
            <option value="edge" ${c.emphasis === "edge" ? "selected" : ""}>edge habitat</option>
          </select>
        </label>

        <label>
          <span>Max</span>
          <input id="gwNicheMax" type="number" min="3" max="20" value="${esc(c.maxCandidates)}">
        </label>

        <label class="gw-niche-checkline">
          <input id="gwNicheDetectorMask" type="checkbox" ${c.showDetectorMask ? "checked" : ""}>
          <span>Detector mask</span>
        </label>

        <label class="gw-niche-checkline">
          <input id="gwNicheSmartHudPlots" type="checkbox" ${c.smartNicheHudPlots ? "checked" : ""}>
          <span>Soft HUD outlines</span>
        </label>

        <label class="gw-niche-checkline">
          <input id="gwNicheOsmTransformation" type="checkbox" ${c.osmTransformation ? "checked" : ""}>
          <span>OSM Transform</span>
        </label>

        <label class="gw-niche-checkline">
          <input id="gwNicheThresholdSubdivideApproach" type="checkbox" ${c.thresholdSubdivideApproach ? "checked" : ""}>
          <span>Threshold Subdivide Approach</span>
        </label>
      </div>
    `;
  }

  function renderGrowControlsHtml() {
    const growing = state.loading && state.loadingAction === "grow";
    const c = state.controls;
    return `
      <div class="gw-niche-grow-pane">
        <div class="gw-niche-grow-title">Grow Local Niches</div>
        <div class="gw-niche-grow-controls">
          <label>
            <span>Tile</span>
            <input id="gwGrowNicheTileCells" type="number" min="2" max="80" step="1" value="${esc(growTileCells())}">
          </label>
          <label>
            <span>Occupied %</span>
            <input id="gwGrowNicheMinOccupiedPct" type="number" min="0" max="100" step="5" value="${esc(growMinOccupiedPct())}">
          </label>
        </div>
        <div class="gw-niche-grow-checks">
          <label class="gw-niche-grow-checkline">
            <input id="gwGrowNicheClipStructures" type="checkbox" ${c.growClipStructuresEnabled ? "checked" : ""}>
            <span>Clip Structures</span>
          </label>
          <label class="gw-niche-grow-checkline">
            <input id="gwGrowNicheMerge" type="checkbox" ${c.growMergeEnabled ? "checked" : ""}>
            <span>Merge</span>
          </label>
          <label class="gw-niche-grow-checkline">
            <input id="gwGrowNicheOsmSubdivision" type="checkbox" ${c.growOsmSubdivisionEnabled ? "checked" : ""}>
            <span>OSM Subdivision</span>
          </label>
        </div>
        <button class="gw-mini-btn gw-grow-local-niches-btn" id="gwGrowLocalNichesBtn" type="button" ${state.loading ? "disabled" : ""}>
          ${growing ? "Growing..." : "Grow Local Niches"}
        </button>
      </div>
    `;
  }

  function renderLocalNichesHtml() {
    injectStyles();
    const rows = (state.niches || []).filter(isCellSeededNiche);

    return `
      <div class="gw-card gw-local-niches-card">
        <div class="gw-card-title">Local Niches</div>
        ${state.persistWarning ? `<div class="gw-muted gw-niche-warning">${esc(state.persistWarning)}</div>` : ""}
        <div id="gwLocalNicheList">
          ${!rows.length ? `<div class="gw-muted">No seeded niches yet.</div>` : ""}
          ${rows.length ? `
            <div class="gw-list">
              ${rows.map((niche) => `
                <div class="gw-rowline gw-niche-row ${isHomeNiche(niche) ? "is-home-niche" : ""} ${isSelectedNiche(niche) ? "is-selected-niche" : ""} ${isCorridorNiche(niche) ? "is-heat-tendril" : ""}" data-niche-key="${esc(nicheKey(niche))}">
                  <span class="gw-niche-row-main">
                    <span class="gw-niche-icon">${esc(iconForNiche(niche))}</span>
                    <span class="gw-niche-row-text">
                      <span class="gw-niche-title">
                        ${isHomeNiche(niche) ? `<span class="gw-niche-home-mark" aria-hidden="true">${homeIconSvg()}</span>` : ""}
                        ${esc(displayNicheTitle(niche))}
                      </span>
                      <span class="gw-muted gw-niche-sub">
                        ${esc(formatDistance(niche.distance_m))} &middot; ${esc(niche.theme || "local niche")} &middot; ${esc(confidenceLabel(niche.confidence))}
                        ${isCorridorNiche(niche) ? ` &middot; <b class="gw-niche-debug-kind">${isHeatTendrilNiche(niche) ? "heat corridor" : "trail corridor"}</b>` : ""}
                        ${Number(niche.comment_count || 0) ? ` &middot; ${esc(niche.comment_count)} comments` : ""}
                        ${homeUserCount(niche) ? ` &middot; ${esc(homeUserCount(niche))} home users` : ""}
                      </span>
                      <span class="gw-muted gw-niche-reason">${esc(reasonText(niche))}</span>
                    </span>
                  </span>
                  <button class="gw-mini-btn gwStartNicheQuestBtn" data-niche-key="${esc(nicheKey(niche))}" type="button">Start</button>
                </div>
              `).join("")}
            </div>
          ` : ""}
        </div>
      </div>
    `;
  }

  function iconForNiche(niche) {
    if (niche?.metrics?.algorithm === GROW_LOCAL_NICHE_RULE.version) return "G";
    if (isHeatTendrilNiche(niche)) return "T";
    if (isCorridorNiche(niche)) return "C";
    if (String(niche.niche_type || "").includes("edge")) return "E";
    if (String(niche.niche_type || "").includes("rich")) return "R";
    if (String(niche.niche_type || "").includes("stale")) return "S";
    return "N";
  }

  function renderIntoPage() {
    const el = document.getElementById("gwLocalNichesBody");
    if (!el) return;
    el.innerHTML = renderLocalNichesHtml();
    bindLocalNicheControls(el);
  }

  function nicheByKey(key) {
    return state.niches.find((n) => String(n.id || n.source_key) === String(key)) || null;
  }

  function replaceNicheInState(nextNiche) {
    const nextKey = String(nextNiche?.id || nextNiche?.source_key || "");
    if (!nextKey) return;
    const idx = state.niches.findIndex((n) => String(n.id || n.source_key) === nextKey);
    if (idx >= 0) {
      state.niches[idx] = nextNiche;
    }
  }

  function bindLocalNicheControls(root = document) {
    injectStyles();
    if (root.dataset.localNichesBound === "true") return;
    root.dataset.localNichesBound = "true";

    root.addEventListener("change", (evt) => {
      if (evt.target.id === "gwNicheRadius") {
        state.controls.radiusM = evt.target.value === "fov" ? "fov" : Number(evt.target.value);
      }
      else if (evt.target.id === "gwNicheScale") state.controls.scale = evt.target.value;
      else if (evt.target.id === "gwNicheEmphasis") state.controls.emphasis = evt.target.value;
      else if (evt.target.id === "gwNicheDetectorMask") {
        state.controls.showDetectorMask = evt.target.checked === true;
        saveControls();
        drawNicheLayer();
        return;
      }
      else if (evt.target.id === "gwNicheSmartHudPlots") {
        state.controls.smartNicheHudPlots = evt.target.checked === true;
        saveControls();
        drawNicheLayer();
        return;
      }
      else if (evt.target.id === "gwNicheOsmTransformation") {
        state.controls.osmTransformation = evt.target.checked === true;
        saveControls();
        refreshLocalNiches({ mode: "niches" });
        return;
      }
      else if (evt.target.id === "gwNicheThresholdSubdivideApproach") {
        state.controls.thresholdSubdivideApproach = evt.target.checked === true;
        saveControls();
        refreshLocalNiches({ mode: "niches" });
        return;
      }
      else if (evt.target.id === "gwGrowNicheClipStructures") {
        state.controls.growClipStructuresEnabled = evt.target.checked === true;
        saveControls();
        return;
      }
      else if (evt.target.id === "gwGrowNicheMerge") {
        state.controls.growMergeEnabled = evt.target.checked === true;
        saveControls();
        return;
      }
      else if (evt.target.id === "gwGrowNicheOsmSubdivision") {
        state.controls.growOsmSubdivisionEnabled = evt.target.checked === true;
        saveControls();
        return;
      }
      else return;
      saveControls();
      refreshLocalNiches();
    });

    root.addEventListener("input", (evt) => {
      if (evt.target.id === "gwNicheMax") {
        state.controls.maxCandidates = Math.max(3, Math.min(20, Number(evt.target.value) || 8));
      } else if (evt.target.id === "gwNicheZThreshold") {
        state.controls.lensZThreshold = Math.max(0, Math.min(6, Number(evt.target.value) || 2.5));
      } else if (evt.target.id === "gwNicheMinCells") {
        state.controls.componentMinCells = Math.max(1, Math.min(100, Number(evt.target.value) || 10));
      } else if (evt.target.id === "gwGrowNicheTileCells") {
        state.controls.growTileCells = Math.max(2, Math.min(80, Math.round(Number(evt.target.value) || GROW_LOCAL_NICHE_RULE.defaultTileCells)));
      } else if (evt.target.id === "gwGrowNicheMinOccupiedPct") {
        state.controls.growMinOccupiedPct = Math.max(0, Math.min(100, Number(evt.target.value) || 0));
      } else {
        return;
      }
      saveControls();
    });

    root.addEventListener("click", (evt) => {
      const refreshBtn = evt.target.closest("#gwRefreshNichesBtn");
      if (refreshBtn && root.contains(refreshBtn)) {
        refreshLocalNiches({ mode: "niches" });
        return;
      }

      const corridorBtn = evt.target.closest("#gwGenerateCorridorsBtn");
      if (corridorBtn && root.contains(corridorBtn)) {
        refreshLocalNiches({ mode: "corridors" });
        return;
      }

      const growBtn = evt.target.closest("#gwGrowLocalNichesBtn");
      if (growBtn && root.contains(growBtn)) {
        growLocalNiches();
        return;
      }

      const startBtn = evt.target.closest(".gwStartNicheQuestBtn");
      if (startBtn && root.contains(startBtn)) {
        evt.preventDefault();
        evt.stopPropagation();
        if (startBtn.disabled) return;
        startNicheQuest(startBtn.dataset.nicheKey);
        return;
      }

      const row = evt.target.closest(".gw-niche-row");
      if (row && root.contains(row)) {
        openNicheDetail(row.dataset.nicheKey);
      }
    });
  }

  async function ensurePersistedNiche(niche) {
    if (niche?.id && !niche._runtimeOnly) return niche;
    const result = await window.GridWildAPI.upsertLocalNiches([niche]);
    return result?.niches?.[0] || niche;
  }

  async function startNicheQuest(nicheKey) {
    const original = nicheByKey(nicheKey);
    if (!original) return;

    try {
      const niche = await ensurePersistedNiche(original);
      if (!niche.id) throw new Error("niche was not persisted");

      const result = await window.GridWildAPI.createSampleNicheQuest(niche.id);
      const quest = result.quest;

      const data = await window.GridWildAPI.getQuests();
      window.__gwState = window.__gwState || {};
      window.__gwState.quests = data.quests || [];
      window.__gwState.questEvidence = (data.quests || []).flatMap((q) => q.quest_evidence || []);
      window.__gwState.activeQuestId = quest.id;

      const normalized = {
        id: quest.id,
        dbId: quest.id,
        source: "db",
        title: quest.title,
        description: quest.description,
        status: "active",
        pointValue: quest.reward_wildpoints || 0,
        recipe: quest.recipe || {}
      };

      window.GridWildQuests?.renderQuestListIntoPage?.();
      window.refreshQuestBadge?.();
      window.GridWildQuestLayer?.embark?.(normalized);
      closeModals();
    } catch (err) {
      console.error("Could not start niche quest:", err);
      alert(`Could not start niche quest: ${err.message}`);
    }
  }

  function closeModals(clearSelection = true) {
    document.querySelectorAll(".gw-quest-modal-backdrop.gw-niche-detail-backdrop").forEach((el) => el.remove());
    if (clearSelection) {
      state.selectedId = null;
      drawNicheLayer();
    }
  }

  async function loadComments(nicheId) {
    if (!nicheId || !window.GridWildAPI?.getLocalNicheComments) return [];
    try {
      const data = await window.GridWildAPI.getLocalNicheComments(nicheId);
      return data.comments || [];
    } catch (err) {
      console.warn("Could not load niche comments:", err);
      return [];
    }
  }

  async function loadHomeUsers(nicheId) {
    if (!nicheId || !window.GridWildAPI?.getLocalNicheHomeUsers) return [];
    try {
      const data = await window.GridWildAPI.getLocalNicheHomeUsers(nicheId);
      return data.home_users || [];
    } catch (err) {
      console.warn("Could not load niche home users:", err);
      return [];
    }
  }

  async function openNicheDetail(key) {
    const niche = nicheByKey(key);
    if (!niche) return;
    state.selectedId = nicheKey(niche);
    drawNicheLayer();
    renderIntoPage();

    closeModals(false);
    injectStyles();

    const root = document.createElement("div");
    root.className = "gw-quest-modal-backdrop gw-niche-detail-backdrop";
    root.innerHTML = detailHtml(niche, [], []);
    document.body.appendChild(root);
    bindNicheDetail(root, niche);

    let comments = [];
    let homeUsers = [];
    const renderCurrent = (nextNiche) => {
      if (!document.body.contains(root)) return;
      root.innerHTML = detailHtml(nextNiche, comments, homeUsers);
      bindNicheDetail(root, nextNiche);
    };

    const hydratePromise = hydrateNicheIntoState(key, {
      selectedOnly: false,
      showToast: true
    }).then((hydrated) => {
      const current = nicheByKey(key) || hydrated || niche;
      renderCurrent(current);
      return current;
    });

    if (niche.id) {
      const detailData = await Promise.all([
        loadComments(niche.id),
        loadHomeUsers(niche.id)
      ]);
      comments = detailData[0];
      homeUsers = detailData[1];
      renderCurrent(nicheByKey(key) || niche);
      const hydrated = await hydratePromise;
      const current = nicheByKey(key);
      renderCurrent(current || hydrated || niche);
    } else {
      await hydratePromise;
    }
  }

  function selectNichePin(key, evt = null) {
    if (evt && typeof L !== "undefined" && L.DomEvent) {
      L.DomEvent.stop(evt);
    }

    const niche = nicheByKey(key);
    if (!niche) return;
    const nextId = nicheKey(niche);
    const alreadySelected = state.selectedId === nextId;

    state.selectedId = nextId;
    if (!alreadySelected) {
      drawNicheLayer();
      renderIntoPage();
    }
    hydrateNicheIntoState(nextId, {
      selectedOnly: true,
      showToast: false
    });
  }

  function detailHtml(niche, comments, homeUsers = []) {
    const evidence = Array.isArray(niche?.evidence_summary?.human)
      ? niche.evidence_summary.human
      : [];
    const metrics = niche.metrics || {};
    const home = isHomeNiche(niche);
    const stewardCount = Math.max(homeUsers.length, homeUserCount(niche));

    return `
      <div class="gw-quest-modal gw-niche-detail">
        <div class="gw-quest-modal-title ${home ? "is-home-niche" : ""}">
          ${esc(displayNicheTitle(niche))}
        </div>
        <div class="gw-quest-modal-subtitle">${esc(niche.description || reasonText(niche))}</div>

        <div class="gw-niche-map-preview" aria-hidden="true">
          <div class="gw-niche-map-dot"></div>
          <div class="gw-niche-map-label">${esc(displayPlaceLabel(niche.primary_place_label || niche.place_context?.primary_label, "Local niche"))}</div>
        </div>

        <div class="gw-quest-status-grid">
          <div class="gw-quest-status-line"><span>Theme</span><span>${esc(niche.theme || "Local niche")}</span></div>
          <div class="gw-quest-status-line"><span>Place</span><span>${esc(displayPlaceLabel(niche.primary_place_label || niche.place_context?.primary_label, "nearby area"))}</span></div>
          <div class="gw-quest-status-line"><span>Priority</span><span>${Math.round(Number(niche.questability_score || 0) * 100)}%</span></div>
          <div class="gw-quest-status-line"><span>Confidence</span><span>${esc(confidenceLabel(niche.confidence))}</span></div>
          <div class="gw-quest-status-line"><span>Scale</span><span>${esc(niche.scale_level || "walking patch")}</span></div>
          <div class="gw-quest-status-line"><span>Recent validation</span><span>${esc(niche.last_validated_at ? niche.last_validated_at.slice(0, 10) : "not yet")}</span></div>
          <div class="gw-quest-status-line"><span>Home users</span><span>${esc(stewardCount)}</span></div>
          <div class="gw-quest-status-line"><span>My home niche</span><span>${home ? "yes" : "no"}</span></div>
        </div>

        <div class="gw-niche-section">
          <div class="gw-niche-section-title">Home Users</div>
          <div class="gw-niche-home-users">
            ${homeUsers.length ? homeUsers.map((user) => `
              <span class="gw-niche-home-user" style="${user.color ? `--gw-home-user-color:${esc(user.color)};` : ""}">
                <i>${esc(user.icon || "H")}</i>
                <b>${esc(user.display_name || "GridWild Steward")}</b>
                ${formatStewardDate(user.stewarded_at) ? `<small>since ${esc(formatStewardDate(user.stewarded_at))}</small>` : ""}
              </span>
            `).join("") : `<div class="gw-muted">No stewards have made this their home niche yet.</div>`}
          </div>
        </div>

        <div class="gw-niche-section">
          <div class="gw-niche-section-title">Why This Niche Matters</div>
          ${evidence.length ? evidence.map((item) => `<div class="gw-muted gw-niche-evidence-line">${esc(item)}</div>`).join("") : `<div class="gw-muted">Evidence will strengthen as players sample this niche.</div>`}
        </div>

        <div class="gw-niche-section">
          <div class="gw-niche-section-title">Suggested Actions</div>
          <div class="gw-muted gw-niche-evidence-line">Make 3 observations inside the highlighted area.</div>
          <div class="gw-muted gw-niche-evidence-line">Include at least 1 ${esc(titleSubjectCase(nicheFocusLabel(niche, "local life")))} observation when possible.</div>
          <div class="gw-muted gw-niche-evidence-line">Add a field note about habitat condition or access.</div>
        </div>

        <div class="gw-niche-section">
          <div class="gw-niche-section-title">Niche Lens Statistics</div>
          ${renderNicheLensStatisticsHtml(niche)}
        </div>

        <div class="gw-niche-section">
          <div class="gw-niche-section-title">Evidence Summary</div>
          <div class="gw-niche-metric-strip">
            <span>${esc(Math.round(metrics.count || 0))} obs</span>
            <span>${esc(Math.round(metrics.component_cell_count || metrics.componentCellCount || metrics.totalCells || 0))} cells</span>
            <span>|Z| ${esc(Number(metrics.peak_abs_z || metrics.lensPeakAbsZ || 0).toFixed(1))}</span>
          </div>
        </div>

        <div class="gw-niche-section">
          <div class="gw-niche-section-title">Monthly Observations</div>
          ${renderNicheCalendarHtml(metrics)}
        </div>

        <div class="gw-niche-section">
          <div class="gw-niche-section-title">Life Mix</div>
          ${renderExplodedPieHtml(metrics)}
          ${renderTaxonomySummaryHtml(metrics)}
        </div>

        <div class="gw-niche-section">
          <div class="gw-niche-section-title">User Comments</div>
          <div class="gw-niche-comments">
            ${comments.length ? comments.map((comment) => `
              <div class="gw-niche-comment">
                <span>${esc(comment.comment_text)}</span>
                <small>${esc(comment.comment_type || "comment")} &middot; ${esc(String(comment.created_at || "").slice(0, 10))}</small>
              </div>
            `).join("") : `<div class="gw-muted">No comments yet.</div>`}
          </div>
          <div class="gw-niche-comment-form">
            <select id="gwNicheCommentType">
              <option value="habitat_note">Habitat note</option>
              <option value="access_note">Access note</option>
              <option value="seasonal_note">Seasonal note</option>
              <option value="taxon_tip">Taxon tip</option>
              <option value="correction">Correction</option>
              <option value="safety_note">Safety note</option>
              <option value="general_comment">General</option>
            </select>
            <textarea id="gwNicheCommentText" rows="3" placeholder="Add local knowledge"></textarea>
          </div>
        </div>

        <div class="gw-quest-actions gw-quest-actions-four gw-niche-detail-actions">
          <button class="gw-quest-btn secondary" id="gwNicheCloseBtn" type="button">Close</button>
          <button class="gw-quest-btn secondary" id="gwNicheFocusMapBtn" type="button">Map</button>
          <button class="gw-quest-btn secondary gw-niche-home-btn ${home ? "is-home-niche" : ""}" id="gwNicheSetHomeBtn" type="button" title="${home ? "This is your home niche" : "Make home niche"}" aria-label="${home ? "This is your home niche" : "Make home niche"}">
            ${homeIconSvg()}
            <span>${home ? "Home" : "Make Home"} &middot; ${esc(stewardLabel(stewardCount))}</span>
          </button>
          ${home ? `<button class="gw-quest-btn secondary gw-niche-unset-home-btn" id="gwNicheUnsetHomeBtn" type="button">Unset Home</button>` : ""}
          <button class="gw-quest-btn secondary" id="gwNicheAddCommentBtn" type="button" ${niche.id ? "" : "disabled"}>Add Comment</button>
          <button class="gw-quest-btn primary" id="gwNicheStartQuestBtn" type="button">Start Quest</button>
        </div>
      </div>
    `;
  }

  function bindNicheDetail(root, niche) {
    root.addEventListener("click", (evt) => {
      if (evt.target === root || evt.target.closest("#gwNicheCloseBtn")) {
        root.remove();
        drawNicheLayer();
        renderIntoPage();
      }
    });

    root.querySelector("#gwNicheFocusMapBtn")?.addEventListener("click", () => {
      map.flyTo([niche.centroid_lat, niche.centroid_lng], Math.max(map.getZoom(), 18), { duration: 0.6 });
    });

    root.querySelector("#gwNicheStartQuestBtn")?.addEventListener("click", () => {
      startNicheQuest(niche.id || niche.source_key);
    });

    root.querySelector("#gwNicheSetHomeBtn")?.addEventListener("click", () => {
      setHomeNiche(niche.id || niche.source_key);
    });

    root.querySelector("#gwNicheUnsetHomeBtn")?.addEventListener("click", () => {
      unsetHomeNiche(niche.id || niche.source_key);
    });

    root.querySelector("#gwNicheAddCommentBtn")?.addEventListener("click", async () => {
      const text = root.querySelector("#gwNicheCommentText")?.value || "";
      const type = root.querySelector("#gwNicheCommentType")?.value || "general_comment";
      if (!text.trim()) return;

      try {
        await window.GridWildAPI.addLocalNicheComment(niche.id, text, type);
        niche.comment_count = Number(niche.comment_count || 0) + 1;
        openNicheDetail(niche.id || niche.source_key);
        renderIntoPage();
      } catch (err) {
        alert(`Could not add comment: ${err.message}`);
      }
    });
  }

  async function setHomeNiche(nicheKey) {
    const original = nicheByKey(nicheKey);
    if (!original) return;

    try {
      const previousHome = currentHomeNiche();
      const previousHomeId = String(previousHome?.id || "");
      const niche = await ensurePersistedNiche(original);
      if (!niche.id) throw new Error("niche was not persisted");
      const sameHome = previousHomeId && previousHomeId === String(niche.id);

      const result = await window.GridWildAPI.setHomeNiche(niche.id);
      window.__gwState = window.__gwState || {};
      window.__gwState.homeNicheId = result.home_niche_id || niche.id;
      window.__gwState.homeNiche = result.home_niche || {
        id: niche.id,
        title: niche.title,
        short_title: niche.short_title,
        theme: niche.theme,
        primary_place_label: niche.primary_place_label
      };

      state.niches = state.niches.map((row) => {
        const same = String(row.id || row.source_key) === String(niche.id || niche.source_key) ||
          String(row.source_key || "") === String(niche.source_key || "");
        const priorCount = homeUserCount(row);
        const wasHome = row.is_home_niche === true && !same;
        return {
          ...row,
          is_home_niche: same,
          home_user_count: same
            ? Math.max(priorCount, (result.home_users || []).length, 1)
            : wasHome
              ? Math.max(0, priorCount - 1)
              : priorCount
        };
      });

      const updated = {
        ...niche,
        is_home_niche: true,
        home_user_count: Math.max((result.home_users || []).length, 1)
      };
      replaceNicheInState(updated);

      drawNicheLayer();
      renderIntoPage();
      window.GridWildCharacter?.renderSummary?.();
      window.GridWildPlayerUI?.refreshPlayerUI?.();
      showNicheToast(sameHome
        ? "Home niche confirmed"
        : previousHomeId
          ? `Home niche changed to ${homeNicheTitle(updated)}`
          : `Home niche added: ${homeNicheTitle(updated)}`);
      openNicheDetail(updated.id || updated.source_key);
    } catch (err) {
      console.error("Could not set home niche:", err);
      alert(`Could not set home niche: ${err.message}`);
    }
  }

  async function unsetHomeNiche(nicheKey = null) {
    try {
      const previousHome = currentHomeNiche();
      await window.GridWildAPI.unsetHomeNiche();
      window.__gwState = window.__gwState || {};
      window.__gwState.homeNicheId = null;
      window.__gwState.homeNiche = null;

      state.niches = state.niches.map((row) => {
        const wasHome = isHomeNiche(row) || (nicheKey && String(row.id || row.source_key) === String(nicheKey));
        return {
          ...row,
          is_home_niche: false,
          home_user_count: wasHome ? Math.max(0, homeUserCount(row) - 1) : homeUserCount(row)
        };
      });

      drawNicheLayer();
      renderIntoPage();
      window.GridWildCharacter?.renderSummary?.();
      window.GridWildPlayerUI?.refreshPlayerUI?.();
      showNicheToast(previousHome
        ? `Home niche removed: ${homeNicheTitle(previousHome)}`
        : "Home niche removed");

      if (nicheKey) openNicheDetail(nicheKey);
    } catch (err) {
      console.error("Could not unset home niche:", err);
      alert(`Could not unset home niche: ${err.message}`);
    }
  }

  function ensureLayer() {
    if (!map?.getPane(PANE)) {
      map.createPane(PANE);
    }
    map.getPane(PANE).style.zIndex = 755;
    map.getPane(PANE).style.pointerEvents = "auto";

    if (!map?.getPane(LABEL_PANE)) {
      map.createPane(LABEL_PANE);
    }
    map.getPane(LABEL_PANE).style.zIndex = 792;
    map.getPane(LABEL_PANE).style.pointerEvents = "auto";

    if (!state.layer) {
      state.layer = L.layerGroup([], { pane: PANE }).addTo(map);
    }

    if (!state.labelLayer) {
      state.labelLayer = L.layerGroup([], { pane: LABEL_PANE }).addTo(map);
    }

    return state.layer;
  }

  function offsetLatLngByPixels(latLng, dx, dy) {
    if (!map?.latLngToLayerPoint || !map?.layerPointToLatLng) return latLng;
    const point = map.latLngToLayerPoint(latLng);
    return map.layerPointToLatLng(L.point(point.x + dx, point.y + dy));
  }

  function gridLatLng(x, y) {
    const ll = map.options.crs.unproject(L.point(x * GRID_SIZE_M, y * GRID_SIZE_M));
    return [ll.lat, ll.lng];
  }

  function normalizedComponentMembers(members = []) {
    const byKey = new Map();
    for (const cell of members || []) {
      const ix = Number(cell.ix);
      const iy = Number(cell.iy);
      if (!Number.isFinite(ix) || !Number.isFinite(iy)) continue;
      byKey.set(`${ix},${iy}`, { ix, iy, key: `${ix},${iy}` });
    }

    const holeCandidates = new Map();
    for (const cell of byKey.values()) {
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const ix = cell.ix + dx;
        const iy = cell.iy + dy;
        const key = `${ix},${iy}`;
        if (!byKey.has(key)) holeCandidates.set(key, { ix, iy, key });
      }
    }

    for (const cell of holeCandidates.values()) {
      const cardinalFilled =
        byKey.has(`${cell.ix},${cell.iy - 1}`) &&
        byKey.has(`${cell.ix + 1},${cell.iy}`) &&
        byKey.has(`${cell.ix},${cell.iy + 1}`) &&
        byKey.has(`${cell.ix - 1},${cell.iy}`);
      if (cardinalFilled) byKey.set(cell.key, cell);
    }

    return [...byKey.values()];
  }

  function componentBoundarySegments(members = []) {
    const toLatLng = (x, y) => {
      return gridLatLng(x, y);
    };
    return gridBoundaryEdges(members).map(edge => [
      toLatLng(edge.a.x, edge.a.y),
      toLatLng(edge.b.x, edge.b.y)
    ]);
  }

  function gridBoundaryEdges(members = []) {
    const normalized = normalizedComponentMembers(members);
    const keys = new Set(normalized.map(cell => cell.key || `${cell.ix},${cell.iy}`));
    const edges = [];

    for (const cell of normalized) {
      const ix = Number(cell.ix);
      const iy = Number(cell.iy);
      if (!Number.isFinite(ix) || !Number.isFinite(iy)) continue;

      if (!keys.has(`${ix},${iy - 1}`)) edges.push({ a: { x: ix, y: iy }, b: { x: ix + 1, y: iy } });
      if (!keys.has(`${ix + 1},${iy}`)) edges.push({ a: { x: ix + 1, y: iy }, b: { x: ix + 1, y: iy + 1 } });
      if (!keys.has(`${ix},${iy + 1}`)) edges.push({ a: { x: ix + 1, y: iy + 1 }, b: { x: ix, y: iy + 1 } });
      if (!keys.has(`${ix - 1},${iy}`)) edges.push({ a: { x: ix, y: iy + 1 }, b: { x: ix, y: iy } });
    }

    return edges;
  }

  function gridPointKey(point) {
    return `${point.x},${point.y}`;
  }

  function componentBoundaryRings(members = []) {
    const edges = gridBoundaryEdges(members).map((edge, index) => ({
      ...edge,
      id: index,
      used: false
    }));
    if (!edges.length) return [];

    const adjacency = new Map();
    const addAdjacent = (point, edge) => {
      const key = gridPointKey(point);
      if (!adjacency.has(key)) adjacency.set(key, []);
      adjacency.get(key).push(edge);
    };

    edges.forEach((edge) => {
      addAdjacent(edge.a, edge);
      addAdjacent(edge.b, edge);
    });

    if ([...adjacency.values()].some(list => list.length !== 2)) return [];

    const rings = [];
    for (const start of edges) {
      if (start.used) continue;

      start.used = true;
      const startKey = gridPointKey(start.a);
      let current = start.b;
      const ring = [start.a, start.b];

      while (gridPointKey(current) !== startKey) {
        const currentKey = gridPointKey(current);
        const next = (adjacency.get(currentKey) || []).find(edge => !edge.used);
        if (!next) break;

        next.used = true;
        const nextAKey = gridPointKey(next.a);
        current = nextAKey === currentKey ? next.b : next.a;
        ring.push(current);
      }

      if (ring.length >= 5 && gridPointKey(ring[0]) === gridPointKey(ring[ring.length - 1])) {
        rings.push(ring.map(point => gridLatLng(point.x, point.y)));
      }
    }

    return rings;
  }

  function gaussianKernel(sigma = 1) {
    const radius = Math.max(1, Math.ceil(sigma * 3));
    const kernel = [];
    let sum = 0;

    for (let i = -radius; i <= radius; i++) {
      const value = Math.exp(-(i * i) / (2 * sigma * sigma));
      kernel.push(value);
      sum += value;
    }

    return kernel.map(value => value / sum);
  }

  function blurRaster(mask, width, height, sigma = 1) {
    const kernel = gaussianKernel(sigma);
    const radius = Math.floor(kernel.length / 2);
    const tmp = new Float32Array(width * height);
    const out = new Float32Array(width * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) {
          const xx = Math.max(0, Math.min(width - 1, x + k));
          sum += mask[y * width + xx] * kernel[k + radius];
        }
        tmp[y * width + x] = sum;
      }
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) {
          const yy = Math.max(0, Math.min(height - 1, y + k));
          sum += tmp[yy * width + x] * kernel[k + radius];
        }
        out[y * width + x] = sum;
      }
    }

    return out;
  }

  function contourEdgePoint(edgeName, x, y, values, threshold) {
    const [tl, tr, br, bl] = values;
    const interp = (a, b) => {
      const denom = b.v - a.v;
      const t = Math.abs(denom) < 1e-6 ? 0.5 : Math.max(0, Math.min(1, (threshold - a.v) / denom));
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t
      };
    };
    const p = {
      tl: { x, y, v: tl },
      tr: { x: x + 1, y, v: tr },
      br: { x: x + 1, y: y + 1, v: br },
      bl: { x, y: y + 1, v: bl }
    };

    if (edgeName === "top") return interp(p.tl, p.tr);
    if (edgeName === "right") return interp(p.tr, p.br);
    if (edgeName === "bottom") return interp(p.bl, p.br);
    return interp(p.tl, p.bl);
  }

  function marchingSquareSegments(field, width, height, threshold) {
    const table = {
      1: [["left", "top"]],
      2: [["top", "right"]],
      3: [["left", "right"]],
      4: [["right", "bottom"]],
      5: [["left", "bottom"], ["top", "right"]],
      6: [["top", "bottom"]],
      7: [["left", "bottom"]],
      8: [["bottom", "left"]],
      9: [["top", "bottom"]],
      10: [["top", "left"], ["right", "bottom"]],
      11: [["right", "bottom"]],
      12: [["right", "left"]],
      13: [["top", "right"]],
      14: [["left", "top"]]
    };
    const segments = [];

    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const values = [
          field[y * width + x],
          field[y * width + x + 1],
          field[(y + 1) * width + x + 1],
          field[(y + 1) * width + x]
        ];
        const code =
          (values[0] >= threshold ? 1 : 0) |
          (values[1] >= threshold ? 2 : 0) |
          (values[2] >= threshold ? 4 : 0) |
          (values[3] >= threshold ? 8 : 0);

        for (const pair of table[code] || []) {
          segments.push(pair.map(edge => contourEdgePoint(edge, x, y, values, threshold)));
        }
      }
    }

    return segments;
  }

  function contourPointKey(point) {
    return `${point.x.toFixed(3)},${point.y.toFixed(3)}`;
  }

  function connectContourSegments(segments = []) {
    const unused = segments.map(segment => segment.map(point => ({ ...point })));
    const paths = [];

    while (unused.length) {
      const path = unused.pop();
      let changed = true;

      while (changed) {
        changed = false;
        const firstKey = contourPointKey(path[0]);
        const lastKey = contourPointKey(path[path.length - 1]);

        for (let i = unused.length - 1; i >= 0; i--) {
          const segment = unused[i];
          const aKey = contourPointKey(segment[0]);
          const bKey = contourPointKey(segment[1]);

          if (aKey === lastKey) {
            path.push(segment[1]);
          } else if (bKey === lastKey) {
            path.push(segment[0]);
          } else if (bKey === firstKey) {
            path.unshift(segment[0]);
          } else if (aKey === firstKey) {
            path.unshift(segment[1]);
          } else {
            continue;
          }

          unused.splice(i, 1);
          changed = true;
        }
      }

      if (path.length >= 3) paths.push(path);
    }

    return paths;
  }

  function simplifyOpenContourPath(points = [], tolerance = 0.3) {
    if (points.length <= 2 || tolerance <= 0) return points.slice();

    const distance = (point, a, b) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      if (len2 <= 0) return Math.hypot(point.x - a.x, point.y - a.y);
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2));
      return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
    };

    let maxDistance = 0;
    let splitIndex = 0;
    const end = points.length - 1;
    for (let i = 1; i < end; i++) {
      const d = distance(points[i], points[0], points[end]);
      if (d > maxDistance) {
        maxDistance = d;
        splitIndex = i;
      }
    }

    if (maxDistance <= tolerance) return [points[0], points[end]];
    const left = simplifyOpenContourPath(points.slice(0, splitIndex + 1), tolerance);
    const right = simplifyOpenContourPath(points.slice(splitIndex), tolerance);
    return left.slice(0, -1).concat(right);
  }

  function simplifyContourPath(points = [], tolerance = 0.3) {
    if (points.length <= 4 || tolerance <= 0) return points.slice();
    const closed = contourPointKey(points[0]) === contourPointKey(points[points.length - 1]);
    if (!closed) return simplifyOpenContourPath(points, tolerance);

    const ring = points.slice(0, -1);
    let anchor = 0;
    for (let i = 1; i < ring.length; i++) {
      if (ring[i].x < ring[anchor].x || (ring[i].x === ring[anchor].x && ring[i].y < ring[anchor].y)) {
        anchor = i;
      }
    }

    const rotated = ring.slice(anchor).concat(ring.slice(0, anchor));
    const split = Math.max(2, Math.floor(rotated.length / 2));
    const arcA = simplifyOpenContourPath(rotated.slice(0, split + 1), tolerance);
    const arcB = simplifyOpenContourPath(rotated.slice(split).concat([rotated[0]]), tolerance);
    const simplified = arcA.slice(0, -1).concat(arcB);
    return contourPointKey(simplified[0]) === contourPointKey(simplified[simplified.length - 1])
      ? simplified
      : [...simplified, simplified[0]];
  }

  function chaikinContourPath(points = [], iterations = 1) {
    let path = points.slice();
    if (path.length < 4 || iterations <= 0) return path;

    for (let iter = 0; iter < iterations; iter++) {
      const closed = contourPointKey(path[0]) === contourPointKey(path[path.length - 1]);
      const source = closed ? path.slice(0, -1) : path;
      const next = [];
      const limit = closed ? source.length : source.length - 1;

      if (!closed) next.push(source[0]);
      for (let i = 0; i < limit; i++) {
        const a = source[i];
        const b = source[(i + 1) % source.length];
        next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
        next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
      }
      if (!closed) next.push(source[source.length - 1]);
      if (closed) next.push(next[0]);
      path = next;
    }

    return path;
  }

  function smoothedBoundaryPaths(members = []) {
    const normalized = normalizedComponentMembers(members);
    if (!NICHE_BOUNDARY_RENDERING.enabled || normalized.length < 2) return [];

    const cacheKey = [
      "contour-v1",
      NICHE_BOUNDARY_RENDERING.smoothingSigmaCells,
      NICHE_BOUNDARY_RENDERING.contourThreshold,
      NICHE_BOUNDARY_RENDERING.simplifyToleranceCells,
      NICHE_BOUNDARY_RENDERING.chaikinIterations,
      hashString(normalized.map(cell => cell.key).sort().join("|"))
    ].join(":");

    if (nicheBoundaryCache.has(cacheKey)) return nicheBoundaryCache.get(cacheKey);

    const minIx = Math.min(...normalized.map(cell => cell.ix));
    const maxIx = Math.max(...normalized.map(cell => cell.ix));
    const minIy = Math.min(...normalized.map(cell => cell.iy));
    const maxIy = Math.max(...normalized.map(cell => cell.iy));
    const padding = Math.max(3, Math.ceil(NICHE_BOUNDARY_RENDERING.smoothingSigmaCells * 3) + 1);
    const originIx = minIx - padding;
    const originIy = minIy - padding;
    const width = (maxIx - minIx + 1) + padding * 2;
    const height = (maxIy - minIy + 1) + padding * 2;

    if (width * height > 12000) return [];

    const mask = new Float32Array(width * height);
    for (const cell of normalized) {
      const x = cell.ix - originIx;
      const y = cell.iy - originIy;
      if (x >= 0 && x < width && y >= 0 && y < height) mask[y * width + x] = 1;
    }

    const blurred = blurRaster(mask, width, height, NICHE_BOUNDARY_RENDERING.smoothingSigmaCells);
    const segments = marchingSquareSegments(blurred, width, height, NICHE_BOUNDARY_RENDERING.contourThreshold);
    const paths = connectContourSegments(segments)
      .map(path => simplifyContourPath(path, NICHE_BOUNDARY_RENDERING.simplifyToleranceCells))
      .map(path => chaikinContourPath(path, NICHE_BOUNDARY_RENDERING.chaikinIterations))
      .map(path => path.map(point => gridLatLng(originIx + point.x + 0.5, originIy + point.y + 0.5)))
      .filter(path => path.length >= 3);

    nicheBoundaryCache.set(cacheKey, paths);
    if (nicheBoundaryCache.size > 80) {
      nicheBoundaryCache.delete(nicheBoundaryCache.keys().next().value);
    }
    return paths;
  }

  function cellsToBoundarySegments(cellIds = []) {
    const members = (Array.isArray(cellIds) ? cellIds : [])
      .map((id) => {
        const [ix, iy] = String(id).split(",").map(Number);
        if (!Number.isFinite(ix) || !Number.isFinite(iy)) return null;
        return { ix, iy, key: `${ix},${iy}` };
      })
      .filter(Boolean);

    return componentBoundarySegments(members);
  }

  function cellsToBoundaryRings(cellIds = []) {
    const members = (Array.isArray(cellIds) ? cellIds : [])
      .map((id) => {
        const [ix, iy] = String(id).split(",").map(Number);
        if (!Number.isFinite(ix) || !Number.isFinite(iy)) return null;
        return { ix, iy, key: `${ix},${iy}` };
      })
      .filter(Boolean);

    return componentBoundaryRings(members);
  }

  function cellsToSmoothedBoundaryPaths(cellIds = []) {
    const members = (Array.isArray(cellIds) ? cellIds : [])
      .map((id) => {
        const [ix, iy] = String(id).split(",").map(Number);
        if (!Number.isFinite(ix) || !Number.isFinite(iy)) return null;
        return { ix, iy, key: `${ix},${iy}` };
      })
      .filter(Boolean);

    return smoothedBoundaryPaths(members);
  }

  function drawBoundarySegments(layer, segments, color, options = {}) {
    if (!segments?.length) return;

    L.polyline(segments, {
      pane: options.pane || PANE,
      interactive: false,
      color: options.haloColor || "rgba(18,16,12,0.72)",
      weight: options.haloWeight || 4.2,
      opacity: options.haloOpacity || 0.62,
      lineCap: options.lineCap || "square",
      lineJoin: options.lineJoin || "miter",
      dashArray: options.dashArray || null,
      className: options.haloClassName || "gw-niche-mask-component-outline-halo"
    }).addTo(layer);

    L.polyline(segments, {
      pane: options.pane || PANE,
      interactive: false,
      color,
      weight: options.weight || 2.9,
      opacity: options.opacity || 0.96,
      lineCap: options.lineCap || "square",
      lineJoin: options.lineJoin || "miter",
      dashArray: options.dashArray || null,
      className: options.className || "gw-niche-mask-component-outline"
    }).addTo(layer);
  }

  function normalizeLatLngPath(path = []) {
    return (Array.isArray(path) ? path : [])
      .map(point => Array.isArray(point)
        ? [Number(point[0]), Number(point[1])]
        : [Number(point?.lat), Number(point?.lng)])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  }

  function normalizeLatLngPaths(paths = []) {
    return (Array.isArray(paths) ? paths : [])
      .map(normalizeLatLngPath)
      .filter(path => path.length >= 2);
  }

  function offsetLatLngPathByPixels(path = [], offsetPx = 0) {
    const normalized = normalizeLatLngPath(path);
    if (!map?.latLngToLayerPoint || !map?.layerPointToLatLng || normalized.length < 2 || !offsetPx) return normalized;
    const points = normalized.map(([lat, lng]) => map.latLngToLayerPoint(L.latLng(lat, lng)));
    return points.map((point, index) => {
      const prev = points[Math.max(0, index - 1)];
      const next = points[Math.min(points.length - 1, index + 1)];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const shifted = L.point(point.x + (-dy / len) * offsetPx, point.y + (dx / len) * offsetPx);
      const ll = map.layerPointToLatLng(shifted);
      return [ll.lat, ll.lng];
    });
  }

  function growVectorFaceForNiche(niche) {
    const face = niche?.metrics?.grow_vector_face || null;
    if (!face?.enabled) return null;
    const outerPaths = normalizeLatLngPaths(face.outer_paths || []);
    const cutPaths = normalizeLatLngPaths(face.cut_paths || []);
    return outerPaths.length || cutPaths.length
      ? { ...face, outerPaths, cutPaths }
      : null;
  }

  function growStructureCutoutPathsForNiche(niche) {
    const clip = niche?.metrics?.grow_structure_clip || null;
    if (!clip?.enabled || !Number(clip.clipped_cells || 0)) return [];
    return normalizeLatLngPaths(clip.cutout_paths || []);
  }

  function drawGrowVectorFaceBoundary(layer, vectorFace, color, options = {}) {
    if (!vectorFace) return;
    const outerPaths = vectorFace.outerPaths || [];
    if (outerPaths.length) {
      drawBoundarySegments(layer, outerPaths, color, {
        ...options,
        lineCap: "square",
        lineJoin: "miter",
        className: `${options.className || "gw-niche-visible-component-outline"} is-grow-vector-face`,
        haloClassName: `${options.haloClassName || "gw-niche-visible-component-outline-halo"} is-grow-vector-face`
      });
    }

    const gapPx = Math.max(1, Number(vectorFace.visual_gap_px || GROW_LOCAL_NICHE_RULE.osmVectorVisualGapPx));
    const cutOffsetPx = gapPx + Math.max(0.9, Number(options.weight || 2.2) * 0.52);
    for (const cutPath of vectorFace.cutPaths || []) {
      for (const side of [-1, 1]) {
        const shifted = offsetLatLngPathByPixels(cutPath, cutOffsetPx * side);
        L.polyline(shifted, {
          pane: options.pane || PANE,
          interactive: false,
          color: options.haloColor || "rgba(18,16,12,0.62)",
          weight: Math.max(2.2, Number(options.weight || 2.2) + 1.2),
          opacity: Math.min(0.5, Number(options.haloOpacity ?? 0.36)),
          lineCap: "round",
          lineJoin: "round",
          className: "gw-niche-grow-vector-cut-halo"
        }).addTo(layer);
        L.polyline(shifted, {
          pane: options.pane || PANE,
          interactive: false,
          color,
          weight: Math.max(1.2, Math.min(2.2, Number(options.weight || 2.2) * 0.72)),
          opacity: Math.max(0.72, Number(options.opacity ?? 0.86)),
          lineCap: "round",
          lineJoin: "round",
          dashArray: options.dashArray || null,
          className: "gw-niche-grow-vector-cut-edge"
        }).addTo(layer);
      }
    }
  }

  function drawHeatPathVector(layer, polyline = [], visual = {}) {
    if (!Array.isArray(polyline) || polyline.length < 2) return;
    const points = polyline
      .map((point) => Array.isArray(point)
        ? [Number(point[0]), Number(point[1])]
        : [Number(point?.lat), Number(point?.lng)])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    if (points.length < 2) return;

    L.polyline(points, {
      pane: PANE,
      interactive: false,
      color: visual.haloColor || "rgba(0,216,255,0.35)",
      weight: 11,
      opacity: 0.52,
      lineCap: "round",
      lineJoin: "round",
      className: "gw-niche-heat-path-vector-halo"
    }).addTo(layer);

    L.polyline(points, {
      pane: PANE,
      interactive: false,
      color: visual.outlineColor || "#00f0ff",
      weight: 4.2,
      opacity: 0.96,
      lineCap: "round",
      lineJoin: "round",
      className: "gw-niche-heat-path-vector"
    }).addTo(layer);
  }

  function drawDetectorMask(layer) {
    const debug = state.detectorDebug;
    if (!state.controls.showDetectorMask || !debug?.signalData?.cells) return;

    const cells = [...debug.signalData.cells.values()];
    const componentCellKeys = new Set();
    for (const component of debug.components || []) {
      for (const cell of component.members || []) componentCellKeys.add(cell.key);
    }
    const thresholdMode = debug.thresholdMode === "above"
      ? "above"
      : debug.thresholdMode === "grow" ? "grow" : "absolute";
    const sampledLimit = 1400;
    const sampledStride = Math.max(1, Math.ceil(cells.length / sampledLimit));

    cells.forEach((cell, idx) => {
      const hot = thresholdMode === "above"
        ? Number(cell.signal || 0) > 0 && Number(cell.z || 0) >= Number(debug.zThreshold || 0)
        : thresholdMode === "grow"
          ? Number(cell.signal || 0) > 0
          : Math.abs(cell.z) > debug.zThreshold;
      if (!hot && idx % sampledStride !== 0) return;

      const inAcceptedComponent = componentCellKeys.has(cell.key);
      const positive = cell.z >= 0;
      const color = hot
        ? positive ? "#66e39c" : "#d08cff"
        : "rgba(255,255,255,0.16)";
      const fillOpacity = hot && inAcceptedComponent
        ? 0
        : hot
          ? Math.min(0.32, 0.08 + Math.abs(cell.z) * 0.05)
          : 0.035;

      L.rectangle(leafletBoundsForCells(cell.ix, cell.iy, cell.ix, cell.iy), {
        pane: PANE,
        interactive: false,
        color,
        weight: hot && inAcceptedComponent ? 0 : hot ? 0.7 : 0.35,
        opacity: hot && inAcceptedComponent ? 0 : hot ? 0.5 : 0.24,
        fillColor: color,
        fillOpacity,
        className: hot ? "gw-niche-mask-hot-cell" : "gw-niche-mask-sampled-cell"
      }).addTo(layer);
    });

    (debug.components || []).forEach((component, componentIndex) => {
      const agg = aggregateComponent(component);
      const positive = Number(component.peakZ || 0) >= 0;
      const color = componentColor(agg.componentId, componentIndex);
      const outlineColor = strongerComponentColor(color);
      const softOutlines = state.controls.smartNicheHudPlots === true;
      const softPaths = softOutlines ? smoothedBoundaryPaths(component.members || []) : [];
      const outlineSegments = softPaths.length ? softPaths : componentBoundarySegments(component.members || []);

      for (const cell of component.members || []) {
        L.rectangle(leafletBoundsForCells(cell.ix, cell.iy, cell.ix, cell.iy), {
          pane: PANE,
          interactive: false,
          color,
          weight: 0,
          opacity: 0,
          fillColor: positive ? "#66e39c" : "#d08cff",
          fillOpacity: 0,
          className: "gw-niche-mask-component-cell"
        }).addTo(layer);
      }

      if (outlineSegments.length) {
        drawBoundarySegments(layer, outlineSegments, outlineColor, softOutlines ? {
          weight: 2.3,
          opacity: 0.78,
          haloWeight: 5.2,
          haloOpacity: 0.28,
          lineCap: "round",
          lineJoin: "round",
          className: "gw-niche-mask-component-outline is-soft",
          haloClassName: "gw-niche-mask-component-outline-halo is-soft"
        } : {});
      }

    });
  }

  function drawNicheLayer() {
    if (typeof map === "undefined" || typeof L === "undefined") return;
    const layer = state.layerVisible ? ensureLayer() : state.layer;
    if (!layer) return;
    layer.clearLayers();
    state.labelLayer?.clearLayers();
    if (!state.layerVisible) return;

    drawDetectorMask(layer);
    const selectedId = String(state.selectedId || "");

    for (const niche of state.niches || []) {
      const originalRadius = Number(niche.radius_m || 75);
      const radius = Math.max(GRID_SIZE_M * 0.75, Math.min(originalRadius * 0.18, GRID_SIZE_M * 1.15));
      const componentCells = Number(niche.metrics?.component_cell_count || niche.metrics?.componentCellCount || 0);
      const weight = Math.max(2, Math.min(6, 1.6 + Math.log1p(componentCells || 1) * 0.7));
      const home = isHomeNiche(niche);
      const selected = selectedId && selectedId === nicheKey(niche);
      const baseColor = home ? "#ffe66f" : componentColor(niche.metrics?.component_id || niche.source_key);
      const visual = nicheVisualStyle(niche, baseColor);
      const color = home ? baseColor : visual.baseColor;
      const constrainedGeometry = ["constrained_geometry_niche_v1", "trail_corridor_niche_v1", "heat_tendril_niche_v1", THRESHOLD_SUBDIVIDE_RULE.version, CELL_SEEDED_NICHE_ALGORITHM].includes(niche.metrics?.algorithm);
      const growLocal = niche.metrics?.algorithm === GROW_LOCAL_NICHE_RULE.version;
      const vectorFace = growLocal ? growVectorFaceForNiche(niche) : null;
      const structureCutouts = growLocal ? growStructureCutoutPathsForNiche(niche) : [];
      const softOutlines = !growLocal && (state.controls.smartNicheHudPlots === true || constrainedGeometry);
      const specialCorridor = ["trail_corridor_niche_v1", "heat_tendril_niche_v1"].includes(String(niche.metrics?.algorithm || ""));
      const heatPathPolyline = isHeatTendrilNiche(niche) && Array.isArray(niche.metrics?.heat_path_polyline)
        ? niche.metrics.heat_path_polyline
        : [];
      const softPaths = softOutlines && !state.controls.showDetectorMask
        ? cellsToSmoothedBoundaryPaths(niche.grid_cell_ids || [])
        : [];
      const outlineSegments = state.controls.showDetectorMask
        ? []
        : heatPathPolyline.length >= 2
          ? []
        : softPaths.length
          ? softPaths
          : cellsToBoundarySegments(niche.grid_cell_ids || []);
      const outlineOptions = {
        weight: home ? 3.2 : (softOutlines ? 2.1 + visual.weightBoost : 2.4),
        opacity: home ? 0.96 : (softOutlines ? 0.72 : 0.88),
        haloColor: !home && specialCorridor ? visual.haloColor : undefined,
        haloWeight: home ? 6.4 : (softOutlines ? 5.0 + visual.haloBoost : 3.8),
        haloOpacity: home ? 0.62 : (specialCorridor ? 0.52 : (softOutlines ? 0.26 : 0.48)),
        lineCap: softOutlines ? "round" : "square",
        lineJoin: softOutlines ? "round" : "miter",
        dashArray: !home ? visual.dashArray : null,
        className: `${specialCorridor && !home ? visual.outlineClass : (softOutlines ? "gw-niche-visible-component-outline is-soft" : "gw-niche-visible-component-outline")}${home ? " is-home-niche" : ""}`,
        haloClassName: `${specialCorridor && !home ? visual.haloClass : (softOutlines ? "gw-niche-visible-component-outline-halo is-soft" : "gw-niche-visible-component-outline-halo")}${home ? " is-home-niche" : ""}`
      };
      if (vectorFace) {
        drawGrowVectorFaceBoundary(layer, vectorFace, home ? strongerComponentColor(color) : visual.outlineColor, outlineOptions);
      } else {
        drawBoundarySegments(layer, outlineSegments, home ? strongerComponentColor(color) : visual.outlineColor, outlineOptions);
      }
      if (structureCutouts.length) {
        drawBoundarySegments(layer, structureCutouts, home ? strongerComponentColor(color) : visual.outlineColor, {
          ...outlineOptions,
          weight: Math.max(1.2, outlineOptions.weight * 0.72),
          opacity: Math.max(0.72, outlineOptions.opacity * 0.9),
          haloWeight: Math.max(2.6, outlineOptions.weight + 1.1),
          haloOpacity: Math.min(0.48, outlineOptions.haloOpacity),
          lineCap: "round",
          lineJoin: "round",
          className: `${outlineOptions.className} is-grow-structure-cutout`,
          haloClassName: `${outlineOptions.haloClassName} is-grow-structure-cutout`
        });
      }
      if (!home && heatPathPolyline.length >= 2) {
        drawHeatPathVector(layer, heatPathPolyline, visual);
      }

      const circle = L.circle([niche.centroid_lat, niche.centroid_lng], {
        pane: PANE,
        radius: selected ? radius : Math.max(GRID_SIZE_M * 0.58, radius * 0.82),
        color,
        weight: selected
          ? (home ? Math.max(weight, 4.4) : weight)
          : 2.2,
        opacity: selected ? (home ? 1 : 0.82) : 0.82,
        fillColor: color,
        fillOpacity: selected
          ? (home ? 0.34 : Math.max(0.1, Math.min(0.26, 0.08 + Math.log1p(componentCells || 1) * 0.03)))
          : (specialCorridor ? 0.2 : 0.12),
        interactive: true,
        className: `${home ? "gw-niche-home-circle" : ""}${visual.circleClass ? ` ${visual.circleClass}` : ""}${selected ? " is-selected-niche" : " is-unselected-niche"}`
      }).addTo(layer);

      const coreCell = String(niche.metrics?.core_cell || niche.metrics?.peak_cell || "").split(",").map(Number);
      if (constrainedGeometry && coreCell.length === 2 && coreCell.every(Number.isFinite)) {
        const core = latLngForCell(coreCell[0], coreCell[1]);
        L.circleMarker([core.lat, core.lng], {
          pane: PANE,
          radius: selected ? 5.2 : 4.2,
          color: home ? strongerComponentColor(color) : visual.outlineColor,
          weight: selected ? 2.4 : 1.7,
          opacity: 0.94,
          fillColor: visual.coreFill,
          fillOpacity: selected ? 0.88 : 0.68,
          interactive: true,
          className: `gw-niche-core-marker${visual.coreClass ? ` ${visual.coreClass}` : ""}${selected ? " is-selected-niche" : ""}`
        })
          .on("click", (evt) => selectNichePin(nicheKey(niche), evt))
          .addTo(layer);
      }

      if (selected) {
        circle.bindTooltip(displayNicheTitle(niche), {
          pane: LABEL_PANE,
          direction: "top",
          opacity: 0.96,
          className: "gw-niche-name-tooltip"
        });
      }

      circle.on("click", (evt) => selectNichePin(nicheKey(niche), evt));

      if (selected && state.labelLayer) {
        const centroidLatLng = L.latLng(niche.centroid_lat, niche.centroid_lng);
        const labelLatLng = offsetLatLngByPixels(centroidLatLng, 0, -34);

        L.polyline([labelLatLng, centroidLatLng], {
          pane: LABEL_PANE,
          interactive: false,
          color: "rgba(18,16,12,0.76)",
          weight: 3.4,
          opacity: 0.58,
          lineCap: "round",
          className: "gw-niche-name-leader-halo"
        }).addTo(state.labelLayer);

        L.polyline([labelLatLng, centroidLatLng], {
          pane: LABEL_PANE,
          interactive: false,
          color,
          weight: home ? 2.2 : 1.4,
          opacity: home ? 0.96 : 0.78,
          lineCap: "round",
          className: `gw-niche-name-leader${home ? " is-home-niche" : ""}`
        }).addTo(state.labelLayer);

        const label = L.divIcon({
          className: "gw-niche-name-label",
          html: nicheMapLabelHtml(niche),
          iconSize: [184, 64],
          iconAnchor: [92, 60]
        });

        L.marker(labelLatLng, {
          pane: LABEL_PANE,
          icon: label,
          interactive: true,
          zIndexOffset: 1000
        })
          .on("click", (evt) => {
            if (evt && typeof L !== "undefined" && L.DomEvent) {
              L.DomEvent.stop(evt);
            }
            openNicheDetail(nicheKey(niche));
          })
          .addTo(state.labelLayer);
      }
    }
  }

  function setVisible(show) {
    state.layerVisible = show === true;
    saveLayerVisible();
    drawNicheLayer();
    return state.layerVisible;
  }

  function toggleVisible() {
    return setVisible(!state.layerVisible);
  }

  function injectStyles() {
    if (document.getElementById("gwLocalNichesStyles")) return;

    const style = document.createElement("style");
    style.id = "gwLocalNichesStyles";
    style.textContent = `
      .gw-local-niches-card .gw-card-title {
        margin-bottom: 8px;
      }

      .gw-niche-controls {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 8px;
      }

      .gw-niche-controls label {
        display: grid;
        gap: 4px;
        min-width: 0;
      }

      .gw-niche-controls .gw-niche-checkline {
        grid-template-columns: auto minmax(0, 1fr);
        align-items: center;
        align-content: center;
        gap: 7px;
        min-height: 48px;
        padding: 0 2px;
      }

      .gw-niche-controls .gw-niche-checkline input {
        width: 16px;
        height: 16px;
      }

      .gw-niche-controls label span {
        font-size: 10px;
        font-weight: 900;
        color: rgba(239,230,211,0.62);
        text-transform: uppercase;
      }

      .gw-niche-controls select,
      .gw-niche-controls input,
      .gw-niche-comment-form select,
      .gw-niche-comment-form textarea {
        min-width: 0;
        width: 100%;
        border: 1px solid rgba(240,209,138,0.22);
        border-radius: 8px;
        background: rgba(12, 15, 12, 0.68);
        color: #efe6d3;
        padding: 7px 8px;
        font: inherit;
        font-size: 12px;
      }

      .gw-niche-grow-pane {
        display: grid;
        gap: 8px;
        margin: 2px 0 9px;
        padding: 9px;
        border-radius: 10px;
        border: 1px solid rgba(139,211,168,0.24);
        background: rgba(10, 18, 13, 0.38);
      }

      .gw-niche-grow-title {
        color: #d7f5df;
        font-size: 11px;
        font-weight: 950;
        line-height: 1.1;
        text-transform: uppercase;
      }

      .gw-niche-grow-controls {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      .gw-niche-grow-controls label {
        display: grid;
        gap: 4px;
        min-width: 0;
      }

      .gw-niche-grow-controls label span {
        color: rgba(239,230,211,0.62);
        font-size: 10px;
        font-weight: 900;
        text-transform: uppercase;
      }

      .gw-niche-grow-controls input {
        min-width: 0;
        width: 100%;
        border: 1px solid rgba(139,211,168,0.22);
        border-radius: 8px;
        background: rgba(12, 15, 12, 0.68);
        color: #efe6d3;
        padding: 7px 8px;
        font: inherit;
        font-size: 12px;
      }

      .gw-niche-grow-checks {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
        align-items: center;
        min-width: 0;
      }

      .gw-niche-grow-checkline {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        color: rgba(239,230,211,0.74);
        font-size: 11px;
        font-weight: 850;
        line-height: 1.15;
      }

      .gw-niche-grow-checkline input {
        width: 14px;
        min-width: 14px;
        height: 14px;
        padding: 0;
      }

      .gw-niche-grow-checkline span {
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .gw-grow-local-niches-btn {
        width: 100%;
      }

      .gw-niche-controls .gw-niche-checkline input {
        width: 16px;
        min-width: 16px;
        height: 16px;
        padding: 0;
      }

      .gw-niche-sampling-toast {
        position: fixed;
        left: 50%;
        bottom: calc(max(18px, env(safe-area-inset-bottom)) + 86px);
        z-index: 999999;
        width: min(340px, calc(100vw - 28px));
        transform: translateX(-50%);
        padding: 11px 12px 12px;
        border-radius: 12px;
        color: #efe6d3;
        background: rgba(20,17,15,0.94);
        border: 1px solid rgba(139,211,168,0.34);
        box-shadow: 0 14px 34px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.06);
        pointer-events: none;
      }

      .gw-niche-sampling-title {
        font-size: 12px;
        font-weight: 950;
        line-height: 1.2;
        color: #d7f5df;
      }

      .gw-niche-sampling-detail {
        min-height: 14px;
        margin-top: 3px;
        font-size: 10.5px;
        line-height: 1.25;
        color: rgba(239,230,211,0.64);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-niche-sampling-track {
        height: 4px;
        margin-top: 9px;
        border-radius: 999px;
        overflow: hidden;
        background: rgba(255,255,255,0.08);
      }

      .gw-niche-sampling-track span {
        display: block;
        height: 100%;
        width: 2%;
        border-radius: inherit;
        background: linear-gradient(90deg, #8bd3a8, #f0d18a);
        transition: width 220ms ease;
      }

      .gw-niche-sampling-toast.is-done {
        border-color: rgba(240,209,138,0.38);
      }

      .gw-niche-sampling-toast.is-done .gw-niche-sampling-track span {
        background: linear-gradient(90deg, #8bd3a8, #d7f5df);
      }

      .gw-niche-sampling-toast.is-error {
        border-color: rgba(224,124,112,0.50);
      }

      .gw-niche-sampling-toast.is-error .gw-niche-sampling-title {
        color: #ffd8d2;
      }

      .gw-niche-sampling-toast.is-error .gw-niche-sampling-track span {
        background: linear-gradient(90deg, #d9938a, #f0d18a);
      }

      .gw-niche-name-label {
        pointer-events: auto;
        cursor: pointer;
        z-index: 9999;
        overflow: visible;
      }

      .gw-niche-name-label .gw-niche-label-chip {
        display: inline-grid;
        grid-template-rows: auto auto;
        align-items: center;
        justify-items: center;
        row-gap: 1px;
        width: max-content;
        max-width: 178px;
        min-height: 25px;
        padding: 4px 8px 5px;
        border-radius: 9px;
        background: rgba(19,18,14,0.84);
        border: 1px solid rgba(139,211,168,0.28);
        box-shadow: 0 7px 15px rgba(0,0,0,0.30);
        text-align: center;
        overflow: hidden;
        white-space: normal;
        overflow-wrap: anywhere;
      }

      .gw-niche-name-label .gw-niche-label-chip.is-home-niche {
        color: #fff4a8;
        border-color: rgba(255,230,111,0.92);
        background: rgba(36,31,14,0.94);
        box-shadow:
          0 0 0 2px rgba(255,230,111,0.22),
          0 10px 22px rgba(0,0,0,0.38),
          0 0 20px rgba(255,230,111,0.26);
      }

      .gw-niche-core-marker {
        filter: drop-shadow(0 0 7px rgba(255,247,209,0.34));
      }

      .gw-niche-visible-component-outline.is-trail-corridor,
      .gw-niche-visible-component-outline-halo.is-trail-corridor,
      .gw-niche-core-marker.is-trail-corridor,
      .is-trail-corridor {
        filter: drop-shadow(0 0 8px rgba(255,176,0,0.42));
      }

      .gw-niche-visible-component-outline.is-heat-tendril,
      .gw-niche-visible-component-outline-halo.is-heat-tendril,
      .gw-niche-heat-path-vector,
      .gw-niche-heat-path-vector-halo,
      .gw-niche-core-marker.is-heat-tendril,
      .is-heat-tendril {
        filter: drop-shadow(0 0 10px rgba(0,216,255,0.52));
      }

      .gw-niche-label-main {
        display: block;
        max-width: 162px;
        color: #e9fff0;
        font-size: 9.2px;
        font-weight: 900;
        line-height: 1.12;
        white-space: normal;
        overflow-wrap: normal;
      }

      .gw-niche-label-chip.is-home-niche .gw-niche-label-main {
        color: #fff4a8;
        text-shadow: 0 0 10px rgba(255,230,111,0.44);
      }

      .gw-niche-label-chip.is-home-niche .gw-niche-label-place b {
        color: rgba(255,245,183,0.94);
      }

      .gw-niche-label-place {
        display: inline-flex;
        align-items: baseline;
        justify-content: center;
        gap: 3px;
        max-width: 162px;
        color: rgba(179,195,166,0.82);
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 7.2px;
        font-weight: 800;
        line-height: 1.05;
        letter-spacing: 0;
        text-transform: none;
        overflow: hidden;
        white-space: nowrap;
      }

      .gw-niche-label-place i {
        flex: 0 0 auto;
        color: rgba(128,151,126,0.78);
        font-style: normal;
        font-size: 6.8px;
        font-weight: 900;
      }

      .gw-niche-label-place b {
        min-width: 0;
        color: rgba(168,184,158,0.84);
        font-weight: 900;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-niche-name-tooltip {
        z-index: 9999;
        max-width: 210px;
        white-space: normal;
        color: #eaffef;
        background: rgba(20,17,15,0.92);
        border: 1px solid rgba(139,211,168,0.44);
        box-shadow: 0 8px 18px rgba(0,0,0,0.32);
        font-weight: 900;
      }

      .gw-niche-actions {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
        margin-bottom: 10px;
      }

      .gw-niche-warning {
        font-size: 10.5px;
      }

      .gw-niche-row {
        grid-template-columns: minmax(0, 1fr) auto;
        cursor: pointer;
        gap: 10px;
      }

      .gw-niche-row.is-home-niche {
        margin: 0 -6px;
        padding: 10px 6px;
        border-radius: 8px;
        border: 1px solid rgba(255,230,111,0.42);
        background: rgba(255,230,111,0.08);
      }

      .gw-niche-row.is-selected-niche {
        box-shadow: inset 3px 0 0 rgba(125,220,255,0.76);
      }

      .gw-niche-row.is-heat-tendril {
        border: 1px solid rgba(0,216,255,0.48);
        background: rgba(0,216,255,0.08);
        box-shadow:
          inset 3px 0 0 rgba(0,216,255,0.88),
          0 0 14px rgba(0,216,255,0.12);
      }

      .gw-niche-row.is-heat-tendril .gw-niche-icon {
        border-color: rgba(0,216,255,0.8);
        background: rgba(0,216,255,0.18);
        color: #d7fbff;
      }

      .gw-niche-row.is-heat-tendril .gw-niche-title {
        color: #d7fbff;
      }

      .gw-niche-debug-kind {
        color: #7ef4ff;
        font-weight: 950;
      }

      .gw-niche-row-main {
        display: flex;
        gap: 9px;
        min-width: 0;
        align-items: flex-start;
      }

      .gw-niche-icon {
        width: 30px;
        height: 30px;
        display: inline-grid;
        place-items: center;
        border-radius: 8px;
        border: 1px solid rgba(139, 211, 168, 0.34);
        background: rgba(139, 211, 168, 0.12);
        color: #bde9c9;
        font-weight: 950;
        flex: 0 0 auto;
      }

      .gw-niche-row-text {
        min-width: 0;
        display: grid;
        gap: 2px;
      }

      .gw-niche-title {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-weight: 900;
        line-height: 1.2;
      }

      .gw-niche-row.is-home-niche .gw-niche-title,
      .gw-niche-detail .gw-quest-modal-title.is-home-niche {
        color: #fff0a1;
        text-shadow: 0 0 12px rgba(255,230,111,0.34);
      }

      .gw-niche-home-mark {
        display: inline-grid;
        width: 14px;
        height: 14px;
        color: #ffe66f;
      }

      .gw-niche-home-mark svg,
      .gw-niche-home-btn svg {
        width: 100%;
        height: 100%;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .gw-niche-sub,
      .gw-niche-reason {
        display: block;
        font-size: 10.5px;
        line-height: 1.28;
      }

      .gw-niche-detail {
        max-height: min(86vh, 820px);
        overflow: auto;
      }

      .gw-niche-map-preview {
        position: relative;
        height: 96px;
        margin: 12px 0;
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid rgba(139, 211, 168, 0.22);
        background:
          linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px),
          linear-gradient(0deg, rgba(255,255,255,0.05) 1px, transparent 1px),
          linear-gradient(135deg, rgba(31,47,38,0.95), rgba(23,27,24,0.96));
        background-size: 24px 24px, 24px 24px, auto;
      }

      .gw-niche-map-dot {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 38px;
        height: 38px;
        transform: translate(-50%, -50%);
        border-radius: 999px;
        border: 2px solid rgba(139, 211, 168, 0.95);
        background: rgba(139, 211, 168, 0.18);
        box-shadow: 0 0 0 16px rgba(139, 211, 168, 0.08);
      }

      .gw-niche-map-label {
        position: absolute;
        left: 10px;
        bottom: 8px;
        right: 10px;
        font-size: 11px;
        font-weight: 900;
        color: #d7f5df;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-niche-section {
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid rgba(240,209,138,0.14);
      }

      .gw-niche-section-title {
        font-size: 11px;
        font-weight: 950;
        text-transform: uppercase;
        color: #f0d18a;
        margin-bottom: 6px;
      }

      .gw-niche-home-users {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .gw-niche-home-user {
        --gw-home-user-color: #ffe66f;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        max-width: 100%;
        padding: 5px 8px;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--gw-home-user-color) 54%, transparent);
        background: rgba(255,230,111,0.08);
        color: rgba(255,246,191,0.94);
        font-size: 11px;
        font-weight: 850;
      }

      .gw-niche-home-user small {
        color: rgba(239,230,211,0.56);
        font-size: 9.5px;
        font-weight: 800;
        white-space: nowrap;
      }

      .gw-niche-home-user i {
        display: inline-grid;
        place-items: center;
        width: 16px;
        height: 16px;
        border-radius: 999px;
        background: var(--gw-home-user-color);
        color: #1f271d;
        font-style: normal;
        font-size: 10px;
        font-weight: 950;
        flex: 0 0 auto;
      }

      .gw-niche-home-user b {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-niche-detail-actions {
        grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
      }

      .gw-niche-home-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-width: 0;
      }

      .gw-niche-home-btn span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-niche-home-btn svg {
        width: 15px;
        height: 15px;
        flex: 0 0 auto;
      }

      .gw-niche-home-btn.is-home-niche {
        color: #1f271d;
        border-color: rgba(255,230,111,0.96);
        background: linear-gradient(180deg, #fff4a8, #ffe66f);
        box-shadow: 0 0 18px rgba(255,230,111,0.28);
      }

      .gw-niche-evidence-line {
        font-size: 12px;
        line-height: 1.36;
        margin-top: 4px;
      }

      .gw-niche-metric-strip {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
      }

      .gw-niche-metric-strip span {
        border: 1px solid rgba(240,209,138,0.16);
        border-radius: 8px;
        padding: 7px 6px;
        text-align: center;
        font-size: 11px;
        color: rgba(239,230,211,0.78);
        background: rgba(255,255,255,0.04);
      }

      .gw-niche-lens-stats {
        display: grid;
        gap: 10px;
      }

      .gw-niche-lens-radar-grid-panel {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        align-items: stretch;
      }

      .gw-niche-lens-radar-wrap {
        display: grid;
        align-content: start;
        gap: 5px;
        justify-items: center;
        min-width: 0;
        padding: 7px 6px;
        border: 1px solid rgba(139,211,168,0.18);
        border-radius: 8px;
        background:
          linear-gradient(180deg, rgba(139,211,168,0.08), rgba(255,255,255,0.03)),
          rgba(0,0,0,0.10);
      }

      .gw-niche-lens-radar-title {
        color: rgba(240,209,138,0.86);
        font-size: 9.5px;
        font-weight: 950;
        line-height: 1.15;
        text-align: center;
        text-transform: uppercase;
      }

      .gw-niche-lens-radar {
        width: 100%;
        max-width: 176px;
        height: auto;
        overflow: visible;
      }

      .gw-niche-lens-radar-grid polygon {
        fill: none;
        stroke: rgba(239,230,211,0.12);
        stroke-width: 1;
      }

      .gw-niche-lens-radar-grid line {
        stroke: rgba(239,230,211,0.10);
        stroke-width: 1;
      }

      .gw-niche-lens-radar-fill {
        fill: rgba(139,211,168,0.23);
        stroke: none;
      }

      .gw-niche-lens-radar-line {
        fill: none;
        stroke: rgba(139,211,168,0.92);
        stroke-width: 2;
        stroke-linejoin: round;
        filter: drop-shadow(0 0 7px rgba(139,211,168,0.30));
      }

      .gw-niche-lens-radar text {
        fill: rgba(240,209,138,0.86);
        font-size: 8.6px;
        font-weight: 950;
        letter-spacing: 0;
      }

      .gw-niche-lens-stat-summary {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
        width: 100%;
      }

      .gw-niche-lens-stat-summary span {
        display: flex;
        justify-content: space-between;
        gap: 6px;
        min-width: 0;
        color: rgba(239,230,211,0.72);
        font-size: 10px;
        line-height: 1.2;
        padding: 5px 6px;
        border-radius: 6px;
        background: rgba(255,255,255,0.035);
      }

      .gw-niche-lens-stat-summary b {
        color: rgba(139,211,168,0.90);
        font-weight: 950;
        text-transform: uppercase;
      }

      .gw-niche-lens-output-ribbon {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 3px 6px;
        align-content: start;
        min-width: 0;
      }

      .gw-niche-lens-output {
        display: grid;
        grid-template-columns: minmax(62px, 17%) minmax(0, 1fr) 30px;
        align-items: center;
        gap: 6px;
        min-width: 0;
        min-height: 22px;
        padding: 2px 6px;
        border-radius: 6px;
        background: rgba(255,255,255,0.035);
      }

      .gw-niche-lens-output.is-active {
        background: rgba(240,209,138,0.10);
        box-shadow: inset 2px 0 0 rgba(240,209,138,0.88);
      }

      .gw-niche-lens-output.is-unavailable {
        opacity: 0.58;
      }

      .gw-niche-lens-output i {
        position: relative;
        display: block;
        width: 100%;
        height: 5px;
        border-radius: 999px;
        overflow: hidden;
        background: rgba(255,255,255,0.09);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05);
      }

      .gw-niche-lens-output i::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: var(--gw-lens-value, 0%);
        border-radius: inherit;
        background: var(--gw-lens-color, #8bd3a8);
        box-shadow: 0 0 8px color-mix(in srgb, var(--gw-lens-color, #8bd3a8) 58%, transparent);
      }

      .gw-niche-lens-output b {
        min-width: 0;
        overflow: visible;
        overflow-wrap: anywhere;
        white-space: normal;
        color: rgba(239,230,211,0.78);
        font-size: 9.8px;
        line-height: 1.08;
        font-weight: 850;
      }

      .gw-niche-lens-output em {
        color: rgba(139,211,168,0.82);
        font-style: normal;
        font-size: 9px;
        font-weight: 950;
        text-align: right;
      }

      .gw-niche-month-chart {
        display: grid;
        grid-template-columns: 28px minmax(0, 1fr);
        gap: 7px;
        min-height: 118px;
      }

      .gw-niche-y-axis {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: flex-end;
        padding: 2px 0 19px;
        color: rgba(239,230,211,0.52);
        font-size: 9px;
        font-weight: 800;
      }

      .gw-niche-month-plot {
        position: relative;
        display: grid;
        grid-template-columns: repeat(12, minmax(0, 1fr));
        align-items: end;
        gap: 4px;
        min-height: 116px;
        padding-top: 2px;
        border-left: 1px solid rgba(239,230,211,0.18);
        border-bottom: 1px solid rgba(239,230,211,0.20);
      }

      .gw-niche-month-plot::before {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        top: 50%;
        border-top: 1px dashed rgba(239,230,211,0.10);
        pointer-events: none;
      }

      .gw-niche-month-bar-col {
        min-width: 0;
        height: 114px;
        display: grid;
        grid-template-rows: 1fr 16px;
        align-items: end;
        gap: 3px;
      }

      .gw-niche-month-bar-col span {
        display: block;
        text-align: center;
        font-size: 8.5px;
        font-weight: 850;
        color: rgba(239,230,211,0.62);
        overflow: hidden;
        text-overflow: clip;
        white-space: nowrap;
      }

      .gw-niche-month-bar-track {
        position: relative;
        height: 94px;
        border-radius: 4px 4px 0 0;
        overflow: hidden;
        background: rgba(0,0,0,0.16);
      }

      .gw-niche-month-bar-track i {
        position: absolute;
        left: 2px;
        right: 2px;
        bottom: 0;
        display: block;
        border-radius: 4px 4px 0 0;
        background: linear-gradient(180deg, rgba(139,211,168,0.95), rgba(70,145,97,0.74));
        box-shadow: 0 -1px 0 rgba(255,255,255,0.12) inset;
      }

      .gw-niche-chart-note {
        margin-top: 6px;
        font-size: 10px;
        line-height: 1.3;
      }

      .gw-niche-pie-wrap {
        display: grid;
        grid-template-columns: 122px minmax(0, 1fr);
        gap: 12px;
        align-items: center;
      }

      .gw-niche-pie {
        width: 122px;
        height: 122px;
        overflow: visible;
        filter: drop-shadow(0 8px 14px rgba(0,0,0,0.28));
      }

      .gw-niche-pie path,
      .gw-niche-pie circle {
        stroke: rgba(20,17,15,0.86);
        stroke-width: 1.5;
      }

      .gw-niche-pie-legend {
        display: grid;
        gap: 5px;
        min-width: 0;
      }

      .gw-niche-pie-legend span {
        display: flex;
        align-items: center;
        gap: 7px;
        min-width: 0;
        font-size: 11px;
        color: rgba(239,230,211,0.78);
      }

      .gw-niche-pie-legend i {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        flex: 0 0 auto;
        box-shadow: 0 0 0 1px rgba(255,255,255,0.16);
      }

      .gw-niche-taxonomy-summary {
        margin-top: 10px;
        display: grid;
        gap: 8px;
      }

      .gw-niche-taxonomy-group {
        display: grid;
        gap: 4px;
      }

      .gw-niche-taxonomy-group strong {
        font-size: 10px;
        color: rgba(240,209,138,0.82);
        text-transform: uppercase;
      }

      .gw-niche-taxonomy-list {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
      }

      .gw-niche-taxonomy-list span {
        border: 1px solid rgba(240,209,138,0.14);
        border-radius: 999px;
        padding: 3px 7px;
        font-size: 10.5px;
        line-height: 1.25;
        color: rgba(239,230,211,0.78);
        background: rgba(255,255,255,0.04);
      }

      .gw-niche-taxonomy-list i {
        font-style: normal;
        color: rgba(139,211,168,0.86);
        font-weight: 900;
      }

      .gw-niche-taxonomy-list em {
        display: block;
        margin-top: 1px;
        font-style: normal;
        font-size: 9px;
        color: rgba(239,230,211,0.50);
      }

      .gw-niche-comments {
        display: grid;
        gap: 6px;
      }

      .gw-niche-comment {
        display: grid;
        gap: 3px;
        padding: 8px;
        border-radius: 8px;
        background: rgba(255,255,255,0.05);
      }

      .gw-niche-comment small {
        color: rgba(239,230,211,0.55);
      }

      .gw-niche-comment-form {
        display: grid;
        gap: 7px;
        margin-top: 8px;
      }

      @media (max-width: 420px) {
        .gw-niche-controls,
        .gw-niche-metric-strip,
        .gw-niche-lens-radar-grid-panel,
        .gw-niche-lens-stat-summary,
        .gw-niche-detail-actions {
          grid-template-columns: 1fr;
        }

        .gw-niche-lens-output-ribbon {
          grid-template-columns: 1fr;
        }

        .gw-niche-pie-wrap {
          grid-template-columns: 1fr;
          justify-items: center;
        }
      }
    `;

    document.head.appendChild(style);
  }

  window.GridWildLocalNiches = {
    addRuntimeNiche,
    buildNicheDisplayTitle,
    bindLocalNicheControls,
    drawNicheLayer,
    generateGrowLocalNicheCandidates,
    generateLocalCandidates,
    getHomeNiche: currentHomeNiche,
    getNiches: () => state.niches.slice(),
    growLocalNiches,
    isVisible: () => state.layerVisible,
    openNicheDetail,
    refreshLocalNiches,
    renderLocalNichesHtml,
    renderIntoPage,
    setHomeNiche,
    setVisible,
    startNicheQuest,
    toggleVisible,
    unsetHomeNiche
  };

  document.addEventListener("DOMContentLoaded", () => {
    injectStyles();
    saveLayerVisible();
    setTimeout(() => {
      if (document.getElementById("gwLocalNichesBody")) {
        renderIntoPage();
      }
    }, 0);
  });

  window.addEventListener("gwUserLocationUpdated", () => {
    if (document.getElementById("gwLocalNichesBody") && state.niches.length) {
      updateNicheDistances();
      drawNicheLayer();
      renderIntoPage();
    }
  });
})();
