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
  const placeContextCache = new Map();
  const nicheBoundaryCache = new Map();
  const nicheSummaryHydrationCache = new Map();
  const NICHE_BOUNDARY_RENDERING = {
    enabled: true,
    smoothingSigmaCells: 1.0,
    contourThreshold: 0.45,
    simplifyToleranceCells: 0.3,
    chaikinIterations: 1
  };
  const DEFAULT_CONTROLS = {
    version: CONTROLS_VERSION,
    radiusM: "fov",
    scale: "walk",
    maxCandidates: 8,
    emphasis: "balanced",
    lensZThreshold: 2.5,
    componentMinCells: 10,
    showDetectorMask: false,
    smartNicheHudPlots: false
  };

  const state = {
    niches: [],
    selectedId: null,
    loading: false,
    lastError: null,
    persistWarning: null,
    controls: loadControls(),
    layer: null,
    labelLayer: null,
    layerVisible: loadLayerVisible(),
    detectorDebug: null,
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

  function currentHomeNiche() {
    const homeId = String(window.__gwState?.homeNicheId || "");
    const local = state.niches.find((niche) => String(niche.id || "") === homeId) || null;
    return local || window.__gwState?.homeNiche || null;
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
    }, 1600);
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

  function isFovSampling() {
    return String(state.controls.radiusM || "fov") === "fov";
  }

  function numericRadiusM(fallback = 500) {
    const n = Number(state.controls.radiusM);
    return Number.isFinite(n) && n > 0 ? n : fallback;
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
    const corridor = alignedCorridorContext(lat, lng, shapeContext);
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
        secondary_label: window.__gwQuestLocale?.shortLabel || null,
        place_type: featureKindLabel(best.kind, best.feature),
        nearby_poi: best.kind === "buildings" ? best.label : null,
        osm_feature_ids: [best.feature.id].filter(Boolean),
        spatial_relation: relation,
        distance_m: Math.round(best.distanceM),
        label_confidence: Number(best.confidence.toFixed(2)),
        label_source: "osm_visible_context"
      };
    }

    const locale = window.__gwQuestLocale || {};
    const fallback = locale.shortLabel || locale.label || "this nearby area";
    return {
      primary_label: fallback,
      secondary_label: null,
      place_type: locale.source === "gps" ? "neighborhood / GPS locale" : "map area",
      label_confidence: fallback === "this nearby area" ? 0.25 : 0.42,
      label_source: "quest_locale_fallback"
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
        secondary_label: window.__gwQuestLocale?.shortLabel || null,
        place_type: "street corner / intersection",
        street_or_block: `${nearbyRoads[0].name} & ${nearbyRoads[1].name}`,
        osm_feature_ids: osmFeatureIds,
        spatial_relation: "near",
        distance_m: Math.round(Math.min(nearbyRoads[0].distanceM, nearbyRoads[1].distanceM)),
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
      secondary_label: window.__gwQuestLocale?.shortLabel || null,
      place_type: placeType,
      nearby_poi: best.isRoad ? null : best.name,
      street_or_block: best.isRoad ? best.name : null,
      osm_feature_ids: [osmFeatureId].filter(Boolean),
      spatial_relation: relation,
      distance_m: Math.round(best.distanceM),
      label_confidence: Number(clamp01(0.78 - Math.min(best.distanceM, 100) / 260).toFixed(2)),
      label_source: "overpass_nearby_context"
    };
  }

  function isGenericPlaceContext(placeContext = {}) {
    const label = String(placeContext.primary_label || "").trim().toLowerCase();
    const confidence = Number(placeContext.label_confidence) || 0;
    return confidence < 0.58 ||
      !label ||
      ["this nearby area", "your area", "current map area", "near your current location"].includes(label) ||
      String(placeContext.label_source || "") === "quest_locale_fallback";
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
    const response = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: new URLSearchParams({ data: overpassQuery(lat, lng) })
    });
    if (!response.ok) throw new Error(`Overpass lookup failed (${response.status})`);
    const data = await response.json();
    return overpassContext(Array.isArray(data?.elements) ? data.elements : [], lat, lng);
  }

  async function resolvePlaceContextAsync(lat, lng, currentContext = null) {
    const current = currentContext || resolvePlaceContext(lat, lng);
    if (!isGenericPlaceContext(current)) return current;

    const key = `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
    if (placeContextCache.has(key)) {
      return betterPlaceContext(current, placeContextCache.get(key));
    }

    let resolved = null;
    try {
      resolved = betterPlaceContext(resolved, await lookupOverpassPlaceContext(lat, lng));
    } catch (err) {
      console.warn("GridWild niche Overpass place lookup failed:", err);
    }

    try {
      resolved = betterPlaceContext(resolved, await lookupNominatimPlaceContext(lat, lng));
    } catch (err) {
      console.warn("GridWild niche reverse place lookup failed:", err);
    }

    placeContextCache.set(key, resolved);
    return betterPlaceContext(current, resolved);
  }

  async function enrichNichePlaceContexts(niches = []) {
    const enriched = [];

    for (const niche of niches) {
      const lat = Number(niche.centroid_lat);
      const lng = Number(niche.centroid_lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        enriched.push(niche);
        continue;
      }

      const storedGeometryContext = niche.place_context?.geometry_context || niche.metrics?.geometry_context || null;
      const placeContext = preserveGeometryContext(
        await resolvePlaceContextAsync(lat, lng, niche.place_context),
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
    if (!label) return confidence < 0.35 ? "near your current location" : "in this nearby area";
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
    if (Number(metrics.lensPeakAbsZ) > 0) {
      facts.push(`This locus is part of an absolute Z > ${Number(state.controls.lensZThreshold || 2.5).toFixed(1)} connected component in the current Lens heatmap.`);
    }
    if (metrics.species > 0) facts.push(`Nearby cells contain ${Math.round(metrics.species)} genus/species signals.`);
    if (metrics.activeRatio < 0.35) facts.push("This cell cluster is under-sampled relative to its walking context.");
    if (daysSince(metrics.latestObservedMs) > 120) facts.push("The area has not been sampled recently.");
    if (metrics.observers >= 3) facts.push("Multiple observers have contributed records nearby.");
    if (placeContext?.primary_label) facts.push(`The niche is tied to ${placeContext.primary_label}.`);
    if (placeContext?.geometry_context?.label_phrase) {
      facts.push(`The connected component is elongated and tracks ${placeContext.geometry_context.label_phrase}.`);
    }

    if (type === "edge_habitat_niche") {
      facts.unshift("A nearby edge feature may concentrate plants, insects, or fungi.");
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

  function generateLocalCandidates(origin = getOrigin()) {
    if (typeof map === "undefined" || typeof GRID_SIZE_M === "undefined") return [];

    const signalData = lensSignalMap(origin);
    const components = connectedComponents(signalData);
    state.detectorDebug = {
      signalData,
      components,
      zThreshold: Number(state.controls.lensZThreshold || 2.5),
      sampledCellCount: signalData.cells.size,
      thresholdCellCount: [...signalData.cells.values()].filter(cell => Math.abs(cell.z) > Number(state.controls.lensZThreshold || 2.5)).length
    };
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
    const weights = scoreWeights();
    const raw = [];
    const emittedComponentIds = new Set();

    for (const component of components) {
      const agg = aggregateComponent(component);
      if (emittedComponentIds.has(agg.componentId)) continue;
      emittedComponentIds.add(agg.componentId);

      const ll = agg.center;
      const distanceM = L.latLng(origin.lat, origin.lng).distanceTo(L.latLng(ll.lat, ll.lng));
      const m = agg.metrics;
      if (m.count <= 0 && m.activeRatio <= 0.05) continue;

      const bio = clamp01((Math.log1p(m.species) / Math.log1p(caps.species * 4)) * 0.68 + m.activeRatio * 0.17 + m.lensPeakSignal * 0.15);
      const need = clamp01((1 - m.activeRatio) * 0.55 + (m.count > 0 && m.count < caps.count ? 0.22 : 0) + (m.observers <= 1 ? 0.08 : 0) + (1 - m.lensMeanSignal) * 0.15);
      const stale = clamp01(daysSince(m.latestObservedMs) / 240);
      const edge = detectEdgeScore(ll.lat, ll.lng);
      const lensPeak = clamp01(m.lensPeakSignal);
      const zStrength = clamp01((Number(m.lensPeakAbsZ) || 0) / 5);
      const componentSizeScore = clamp01(Math.log1p(Number(m.componentCellCount) || 1) / Math.log1p(80));
      const clusterPriority = clamp01(Number(m.clusterPreferenceScore) || 0);
      const questability = clamp01(
        clusterPriority * 0.34 +
        zStrength * 0.18 +
        componentSizeScore * 0.10 +
        lensPeak * 0.10 +
        bio * weights.bio * 0.72 +
        need * weights.need * 0.72 +
        stale * weights.stale * 0.72 +
        edge * weights.edge * 0.72 +
        (isFovSampling() ? 0.03 : Math.max(0, 1 - distanceM / numericRadiusM(500)) * 0.06)
      );

      if (questability < 0.18) continue;

      const placeContext = resolveGeometricPlaceContext(
        ll.lat,
        ll.lng,
        component,
        resolvePlaceContext(ll.lat, ll.lng)
      );
      const nicheType = chooseType({ bio, need, stale, edge }, m, placeContext);
      const theme = themeFor(nicheType, placeContext);
      const activeLens = window.__gwState?.activeLens || "classic";
      const heatMetric = window.__gwState?.heatMetric || "count";
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
      const niche = {
        source_key: [
          "gw-local-niche-v3",
          activeLens,
          isFovSampling() ? "fov" : `${numericRadiusM(500)}m`,
          `z${Number(state.controls.lensZThreshold || 2.5).toFixed(1)}`,
          agg.componentId
        ].join(":"),
        title: "",
        short_title: "",
        description: "A GridWild interpreted ecological opportunity generated from a connected component in the current Lens heat signal.",
        niche_type: nicheType,
        theme,
        centroid_lat: ll.lat,
        centroid_lng: ll.lng,
        geometry: boundsForCells(agg.minIx, agg.minIy, agg.maxIx, agg.maxIy),
        grid_cell_ids: agg.cells,
        radius_m: Math.round(Math.max(24, Math.sqrt(Math.max(1, m.componentCellCount || agg.cells.length)) * GRID_SIZE_M * 1.25)),
        scale_level: `lens-component:z>${Number(state.controls.lensZThreshold || 2.5).toFixed(1)}`,
        taxon_focus: taxonFocus,
        seasonal_profile: { mode: "current_lens_inferred_v1" },
        evidence_summary: evidenceFor(nicheType, m, placeContext),
        metrics: {
          ...m,
          algorithm: "current_lens_z_connected_components_v3",
          active_lens: activeLens,
          heat_metric: heatMetric,
          sampling_extent: isFovSampling() ? "fov" : "radius_m",
          sampling_radius_m: isFovSampling() ? null : numericRadiusM(500),
          emphasis: state.controls.emphasis,
          z_threshold: Number(state.controls.lensZThreshold || 2.5),
          component_min_cells: Number(state.controls.componentMinCells || 10),
          component_id: agg.componentId,
          component_cell_count: Number(m.componentCellCount || agg.cells.length),
          cluster_size_score: Number((Number(m.clusterSizeScore) || 0).toFixed(3)),
          cluster_peak_score: Number((Number(m.clusterPeakScore) || 0).toFixed(3)),
          cluster_priority_score: Number(clusterPriority.toFixed(3)),
          peak_cell: `${component.peak.ix},${component.peak.iy}`,
          peak_signal: Number(lensPeak.toFixed(3)),
          peak_z: Number((m.lensPeakZ || 0).toFixed(3)),
          peak_abs_z: Number((m.lensPeakAbsZ || 0).toFixed(3)),
          mean_z: Number((m.lensMeanZ || 0).toFixed(3)),
          mean_abs_z: Number((m.lensMeanAbsZ || 0).toFixed(3)),
          mean_signal: Number(m.lensMeanSignal.toFixed(3)),
          distance_m: Math.round(distanceM),
          geometry_context: placeContext.geometry_context || null
        },
        confidence: clamp01(0.35 + placeContext.label_confidence * 0.24 + questability * 0.29 + lensPeak * 0.12),
        novelty_score: need,
        sampling_need_score: need,
        biodiversity_score: bio,
        questability_score: questability,
        place_context: placeContext,
        primary_place_label: placeContext.primary_label || null,
        secondary_place_label: placeContext.secondary_label || null,
        place_label_confidence: placeContext.label_confidence || 0,
        generated_by: "gridwild_current_lens_z_connected_components_v3",
        visibility: "public",
        status: "active",
        distance_m: Math.round(distanceM),
        comment_count: 0,
        _runtimeOnly: true
      };

      niche.title = buildNicheDisplayTitle(niche);
      niche.short_title = niche.title.replace(/^(Sample|Survey|Look for|Revisit|Check)\s+/i, "");
      raw.push(niche);
    }

    const byKey = new Map();
    raw
      .sort((a, b) =>
        nicheClusterPriority(b) - nicheClusterPriority(a) ||
        Number(b.questability_score || 0) - Number(a.questability_score || 0)
      )
      .forEach((niche) => {
        if (!byKey.has(niche.source_key)) byKey.set(niche.source_key, niche);
      });

    return [...byKey.values()].slice(0, Math.max(1, Number(state.controls.maxCandidates) || 8));
  }

  function nicheClusterPriority(niche) {
    const metrics = niche?.metrics || {};
    const explicit = Number(metrics.cluster_priority_score ?? metrics.clusterPreferenceScore);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;

    const cells = Number(metrics.component_cell_count || metrics.componentCellCount || metrics.totalCells || 0);
    const meanAbsZ = Number(metrics.mean_abs_z || metrics.lensMeanAbsZ || metrics.meanAbsZ || 0);
    return clamp01(
      clamp01(Math.log1p(cells) / Math.log1p(100)) * 0.5 +
      clamp01(meanAbsZ / 6) * 0.5
    );
  }

  function mergeNiches(serverNiches, generatedNiches) {
    const byKey = new Map();
    for (const row of [...serverNiches, ...generatedNiches]) {
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
    return [...byKey.values()]
      .sort((a, b) =>
        nicheClusterPriority(b) - nicheClusterPriority(a) ||
        Number(b.questability_score || 0) - Number(a.questability_score || 0)
      )
      .slice(0, Math.max(1, Number(state.controls.maxCandidates) || 8));
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

  async function refreshLocalNiches(options = {}) {
    if (state.loading) {
      showSamplingToast("Niche sampling already running", 55, "Waiting for the current pass to finish.");
      return;
    }
    state.loading = true;
    state.lastError = null;
    state.persistWarning = null;
    showSamplingToast("Sampling niches", 6, "Preparing the current Lens field.");
    renderIntoPage();
    await yieldToPaint();

    window.GridWildOsmFeaturesLayer?.scheduleFetch?.();

    const origin = getOrigin();
    let serverNiches = [];
    let generated = [];

    try {
    try {
      showSamplingToast("Checking durable niche layer", 18, "Looking for matching saved components nearby.");
      await yieldToPaint();
      const data = await window.GridWildAPI?.getNearbyLocalNiches?.(origin.lat, origin.lng, {
        radius_m: isFovSampling() ? 5000 : numericRadiusM(500),
        limit: Number(state.controls.maxCandidates)
      });
      if (data?.home_niche_id !== undefined) {
        window.__gwState = window.__gwState || {};
        window.__gwState.homeNicheId = data.home_niche_id || null;
      }
      const activeLens = window.__gwState?.activeLens || "classic";
      const zThreshold = Number(state.controls.lensZThreshold || 2.5);
      const extent = isFovSampling() ? "fov" : "radius_m";
      serverNiches = (data?.niches || []).filter((niche) => {
        const metrics = niche.metrics || {};
        return metrics.algorithm === "current_lens_z_connected_components_v3" &&
          String(metrics.active_lens || "classic") === String(activeLens) &&
          String(metrics.sampling_extent || "radius_m") === extent &&
          Math.abs(Number(metrics.z_threshold || zThreshold) - zThreshold) < 0.01;
      });
    } catch (err) {
      state.persistWarning = "Server niche layer unavailable; showing runtime candidates.";
      console.warn("Local niche fetch failed:", err);
    }

    showSamplingToast("Building detector mask", 42, "Z-scoring the current Lens heat matrix.");
    await yieldToPaint();
    generated = generateLocalCandidates(origin);
    showSamplingToast(
      "Extracting connected components",
      64,
      `${state.detectorDebug?.thresholdCellCount || 0} threshold cells, ${state.detectorDebug?.components?.length || 0} components.`
    );
    await yieldToPaint();

    if (generated.length) {
      showSamplingToast("Resolving place labels", 72, "Checking nearby OSM names, streets, and neighborhoods.");
      await yieldToPaint();
      generated = await enrichNichePlaceContexts(generated);
    }

    if (generated.length && window.GridWildAPI?.upsertLocalNiches) {
      try {
        showSamplingToast("Saving local niches", 82, `${generated.length} generated niche candidates.`);
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
    state.niches = mergeNiches(serverNiches, generated);
    state.loading = false;
    drawNicheLayer();
    renderIntoPage();
    finishSamplingToast(
      "Niche sampling complete",
      `${state.niches.length} niches shown from ${state.detectorDebug?.sampledCellCount || 0} sampled cells.`
    );

    if (options.openFirst && state.niches[0]) {
      openNicheDetail(state.niches[0].id || state.niches[0].source_key);
    }
    } catch (err) {
      state.loading = false;
      state.lastError = err;
      console.error("Niche sampling failed:", err);
      failSamplingToast("Niche sampling failed", err.message || "Could not complete this sampling pass.");
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
      </div>
    `;
  }

  function renderLocalNichesHtml() {
    injectStyles();
    const rows = state.niches || [];

    return `
      <div class="gw-card gw-local-niches-card">
        <div class="gw-card-title">Local Niches</div>
        ${renderControlsHtml()}
        <div class="gw-niche-actions">
          <button class="gw-mini-btn" id="gwRefreshNichesBtn" type="button">
            ${state.loading ? "Sampling..." : "Sample Niches"}
          </button>
          ${state.persistWarning ? `<span class="gw-muted gw-niche-warning">${esc(state.persistWarning)}</span>` : ""}
        </div>
        <div id="gwLocalNicheList">
          ${state.loading ? `<div class="gw-muted">Building local niche candidates...</div>` : ""}
          ${!state.loading && !rows.length ? `<div class="gw-muted">No local niches loaded yet.</div>` : ""}
          ${!state.loading && rows.length ? `
            <div class="gw-list">
              ${rows.map((niche) => `
                <div class="gw-rowline gw-niche-row ${isHomeNiche(niche) ? "is-home-niche" : ""}" data-niche-key="${esc(niche.id || niche.source_key)}">
                  <span class="gw-niche-row-main">
                    <span class="gw-niche-icon">${esc(iconForNiche(niche))}</span>
                    <span class="gw-niche-row-text">
                      <span class="gw-niche-title">${isHomeNiche(niche) ? `<span class="gw-niche-home-mark" aria-hidden="true">${homeIconSvg()}</span>` : ""}${esc(displayNicheTitle(niche))}</span>
                      <span class="gw-muted gw-niche-sub">
                        ${esc(formatDistance(niche.distance_m))} &middot; ${esc(niche.theme || "local niche")} &middot; ${esc(confidenceLabel(niche.confidence))}
                        ${Number(niche.comment_count || 0) ? ` &middot; ${esc(niche.comment_count)} comments` : ""}
                        ${homeUserCount(niche) ? ` &middot; ${esc(homeUserCount(niche))} home users` : ""}
                      </span>
                      <span class="gw-muted gw-niche-reason">${esc(reasonText(niche))}</span>
                    </span>
                  </span>
                  <button class="gw-mini-btn gwStartNicheQuestBtn" data-niche-key="${esc(niche.id || niche.source_key)}" type="button">Start</button>
                </div>
              `).join("")}
            </div>
          ` : ""}
        </div>
      </div>
    `;
  }

  function iconForNiche(niche) {
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
      } else {
        return;
      }
      saveControls();
    });

    root.addEventListener("click", (evt) => {
      const refreshBtn = evt.target.closest("#gwRefreshNichesBtn");
      if (refreshBtn && root.contains(refreshBtn)) {
        refreshLocalNiches();
        return;
      }

      const startBtn = evt.target.closest(".gwStartNicheQuestBtn");
      if (startBtn && root.contains(startBtn)) {
        evt.preventDefault();
        evt.stopPropagation();
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

  function closeModals() {
    document.querySelectorAll(".gw-quest-modal-backdrop.gw-niche-detail-backdrop").forEach((el) => el.remove());
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

  async function openNicheDetail(nicheKey) {
    const niche = nicheByKey(nicheKey);
    if (!niche) return;

    closeModals();
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

    const hydratePromise = hydrateNicheSummaryMetrics(niche, (done, total) => {
      if (!total) return;
      const progress = 14 + Math.round((done / total) * 78);
      showSamplingToast(
        "Hydrating niche summary",
        progress,
        `Loading month and taxonomy rows for ${done}/${total} cells.`
      );
    })
      .then((hydrated) => {
        if (hydrated !== niche) {
          replaceNicheInState(hydrated);
          drawNicheLayer();
          renderIntoPage();
          renderCurrent(hydrated);
          finishSamplingToast(
            "Niche summary hydrated",
            "Monthly bars, life mix, and taxonomy data were refreshed from genera superchunks."
          );
        }
        return hydrated;
      })
      .catch((err) => {
        console.warn("Could not hydrate niche summary:", err);
        failSamplingToast("Niche summary hydration failed", "Keeping the existing niche summary.");
        return niche;
      });

    if (niche.id) {
      const detailData = await Promise.all([
        loadComments(niche.id),
        loadHomeUsers(niche.id)
      ]);
      comments = detailData[0];
      homeUsers = detailData[1];
      renderCurrent(nicheByKey(nicheKey) || niche);
      const hydrated = await hydratePromise;
      const current = nicheByKey(nicheKey);
      renderCurrent(current || hydrated || niche);
    } else {
      await hydratePromise;
    }
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
        <div class="gw-quest-modal-title ${home ? "is-home-niche" : ""}">${esc(displayNicheTitle(niche))}</div>
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
      const niche = await ensurePersistedNiche(original);
      if (!niche.id) throw new Error("niche was not persisted");

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
      openNicheDetail(updated.id || updated.source_key);
    } catch (err) {
      console.error("Could not set home niche:", err);
      alert(`Could not set home niche: ${err.message}`);
    }
  }

  async function unsetHomeNiche(nicheKey = null) {
    try {
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
    map.getPane(LABEL_PANE).style.pointerEvents = "none";

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
      className: options.className || "gw-niche-mask-component-outline"
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
    const sampledLimit = 1400;
    const sampledStride = Math.max(1, Math.ceil(cells.length / sampledLimit));

    cells.forEach((cell, idx) => {
      const hot = Math.abs(cell.z) > debug.zThreshold;
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

    for (const niche of state.niches || []) {
      const originalRadius = Number(niche.radius_m || 75);
      const radius = Math.max(GRID_SIZE_M * 0.75, Math.min(originalRadius * 0.18, GRID_SIZE_M * 1.15));
      const componentCells = Number(niche.metrics?.component_cell_count || niche.metrics?.componentCellCount || 0);
      const weight = Math.max(2, Math.min(6, 1.6 + Math.log1p(componentCells || 1) * 0.7));
      const home = isHomeNiche(niche);
      const color = home ? "#ffe66f" : componentColor(niche.metrics?.component_id || niche.source_key);
      const softOutlines = state.controls.smartNicheHudPlots === true;
      const softPaths = softOutlines && !state.controls.showDetectorMask
        ? cellsToSmoothedBoundaryPaths(niche.grid_cell_ids || [])
        : [];
      const outlineSegments = state.controls.showDetectorMask
        ? []
        : softPaths.length
          ? softPaths
          : cellsToBoundarySegments(niche.grid_cell_ids || []);
      drawBoundarySegments(layer, outlineSegments, strongerComponentColor(color), {
        weight: home ? 3.2 : (softOutlines ? 2.1 : 2.4),
        opacity: home ? 0.96 : (softOutlines ? 0.72 : 0.88),
        haloWeight: home ? 6.4 : (softOutlines ? 5.0 : 3.8),
        haloOpacity: home ? 0.62 : (softOutlines ? 0.26 : 0.48),
        lineCap: softOutlines ? "round" : "square",
        lineJoin: softOutlines ? "round" : "miter",
        className: `${softOutlines ? "gw-niche-visible-component-outline is-soft" : "gw-niche-visible-component-outline"}${home ? " is-home-niche" : ""}`,
        haloClassName: `${softOutlines ? "gw-niche-visible-component-outline-halo is-soft" : "gw-niche-visible-component-outline-halo"}${home ? " is-home-niche" : ""}`
      });

      const circle = L.circle([niche.centroid_lat, niche.centroid_lng], {
        pane: PANE,
        radius,
        color,
        weight: home ? Math.max(weight, 4.4) : weight,
        opacity: home ? 1 : 0.82,
        fillColor: color,
        fillOpacity: home ? 0.34 : Math.max(0.1, Math.min(0.26, 0.08 + Math.log1p(componentCells || 1) * 0.03)),
        interactive: true,
        className: home ? "gw-niche-home-circle" : ""
      }).addTo(layer);

      circle.bindTooltip(displayNicheTitle(niche), {
        pane: LABEL_PANE,
        direction: "top",
        opacity: 0.96,
        className: "gw-niche-name-tooltip"
      });

      circle.on("click", () => openNicheDetail(niche.id || niche.source_key));

      if (state.labelLayer) {
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
          interactive: false,
          zIndexOffset: 1000
        }).addTo(state.labelLayer);
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
        pointer-events: none;
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
        .gw-niche-detail-actions {
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
    buildNicheDisplayTitle,
    bindLocalNicheControls,
    drawNicheLayer,
    generateLocalCandidates,
    getHomeNiche: currentHomeNiche,
    getNiches: () => state.niches.slice(),
    isVisible: () => state.layerVisible,
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
