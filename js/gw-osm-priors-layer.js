// js/gw-osm-priors-layer.js
// Derived OSM priors for 20-ft GridWild cells.
//
// This module intentionally does not query OSM. It consumes the shared
// GridWildOsmFeaturesLayer cache and renders interpreted per-cell priors as
// Lens-driven HUD heatmaps.

(function () {
  const CELL_SIZE_M = 20 * 0.3048;
  const VIEW_PAD_PX = 120;
  const MAX_RENDER_SAMPLES = 5200;
  const MIN_PREVIEW_ZOOM = 15;
  const MAX_PREVIEW_STRIDE_CELLS = 8;

  const PATH_ADJACENT_M = 10;
  const WET_EDGE_M = 8;
  const BUILDING_ADJACENT_M = 8;
  const ROAD_NEAR_M = 12;

  const OSM_PRIOR_LENSES = new Map([
    ["osm-path-adjacency", "path-adjacency"],
    ["osm-trail-side", "trail-side"],
    ["osm-wet-edge", "wet-edge"],
    ["osm-barrier-map", "barrier-map"],
    ["osm-landuse-class", "landuse-class"],
    ["osm-accessibility", "accessibility"]
  ]);

  let canvas = null;
  let ctx = null;
  let topLeft = L.point(0, 0);
  let raf = null;
  let listenersBound = false;
  let projectedVersion = -1;
  let projected = emptyProjected();
  let cellCacheVersion = -1;
  let cellCache = new Map();
  let autoEnableGuard = false;

  window.__gwOsmPriorCells = window.__gwOsmPriorCells || cellCache;

  function emptyProjected() {
    return {
      paths: [],
      roads: [],
      water: [],
      buildings: [],
      landuse: [],
      places: []
    };
  }

  function isOsmPriorLens(lens = window.__gwState?.activeLens) {
    return OSM_PRIOR_LENSES.has(lens);
  }

  function getModeForLens(lens = window.__gwState?.activeLens) {
    return OSM_PRIOR_LENSES.get(lens) || null;
  }

  function heatOverlayEnabled() {
    if (window.__gwFilters && typeof window.__gwFilters.showHeat === "boolean") {
      return window.__gwFilters.showHeat;
    }

    const checkbox = document.getElementById("toggleHeat");
    if (checkbox) return checkbox.checked;

    return window.__gwState?.showHeat ?? true;
  }

  function getPreviewStride(cellCount) {
    const zoom = map.getZoom();
    if (zoom < MIN_PREVIEW_ZOOM) return null;

    let stride = 1;
    while (cellCount / (stride * stride) > MAX_RENDER_SAMPLES) {
      stride *= 2;
    }

    return Math.min(MAX_PREVIEW_STRIDE_CELLS, stride);
  }

  function ensurePane() {
    const heatPane = map.getPane("gridHeatPane");
    if (heatPane) return heatPane;

    map.createPane("gridHeatPane");
    map.getPane("gridHeatPane").style.zIndex = "415";
    map.getPane("gridHeatPane").style.pointerEvents = "none";
    return map.getPane("gridHeatPane");
  }

  function ensureCanvas() {
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.id = "gwOsmPriorsCanvas";
      Object.assign(canvas.style, {
        position: "absolute",
        left: "0px",
        top: "0px",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: ""
      });
      ensurePane().appendChild(canvas);
      ctx = canvas.getContext("2d", { alpha: true });
    }

    if (!listenersBound) {
      listenersBound = true;
      map.on("move zoom resize viewreset zoomend moveend", scheduleRender);
      window.addEventListener("gwOsmFeaturesUpdated", () => {
        invalidate();
        scheduleRender();
      });
      document.addEventListener("change", evt => {
        if (evt.target?.id === "toggleOsmBuildings" && isOsmPriorLens()) {
          ensureOsmLayerEnabled();
        }

        if (evt.target?.id === "toggleHeat") {
          scheduleRender();
        }
      });
    }
  }

  function resizeCanvas() {
    ensureCanvas();

    topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(canvas, topLeft);

    const size = map.getSize();
    const dpr = window.GridWildCanvasPerf?.getDpr?.("osm-priors") || window.devicePixelRatio || 1;
    const wantW = Math.round(size.x * dpr);
    const wantH = Math.round(size.y * dpr);

    if (canvas.width !== wantW || canvas.height !== wantH) {
      canvas.width = wantW;
      canvas.height = wantH;
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function layerPoint(latlng) {
    return map.latLngToLayerPoint(latlng).subtract(topLeft);
  }

  function getPaddedBoundsMeters() {
    const z = map.getZoom();
    const b = map.getBounds();
    const nw = map.project(b.getNorthWest(), z);
    const se = map.project(b.getSouthEast(), z);
    const llNW = map.unproject(L.point(nw.x - VIEW_PAD_PX, nw.y - VIEW_PAD_PX), z);
    const llSE = map.unproject(L.point(se.x + VIEW_PAD_PX, se.y + VIEW_PAD_PX), z);
    const pNW = map.options.crs.project(llNW);
    const pSE = map.options.crs.project(llSE);
    const minX = Math.min(pNW.x, pSE.x);
    const maxX = Math.max(pNW.x, pSE.x);
    const minY = Math.min(pNW.y, pSE.y);
    const maxY = Math.max(pNW.y, pSE.y);

    return {
      startX: Math.floor(minX / CELL_SIZE_M) * CELL_SIZE_M,
      endX: Math.ceil(maxX / CELL_SIZE_M) * CELL_SIZE_M,
      startY: Math.floor(minY / CELL_SIZE_M) * CELL_SIZE_M,
      endY: Math.ceil(maxY / CELL_SIZE_M) * CELL_SIZE_M
    };
  }

  function projectPoint(ll) {
    const p = map.options.crs.project(ll);
    return { x: p.x, y: p.y, latlng: ll };
  }

  function projectFeature(feature) {
    return {
      id: feature.id,
      tags: feature.tags || {},
      closed: feature.closed === true,
      points: (feature.points || []).map(projectPoint)
    };
  }

  function landuseClassForTags(tags = {}) {
    if (tags.building) return "building";
    if (tags.natural === "water" || tags.waterway === "riverbank") return "water";
    if (tags.natural === "wood" || tags.landuse === "forest") return "wood";
    if (tags.landuse === "grass" || tags.landuse === "meadow") return "grass";
    if (
      tags.leisure === "park" ||
      tags.leisure === "garden" ||
      tags.leisure === "nature_reserve" ||
      tags.landuse === "recreation_ground"
    ) {
      return "park";
    }
    return "other";
  }

  function getProjectedFeatures() {
    const source = window.GridWildOsmFeaturesLayer;
    const version = source?.getVersion?.() ?? 0;

    if (version === projectedVersion) return projected;

    const features = source?.getFeatures?.() || {};
    projectedVersion = version;
    projected = {
      paths: (features.trails || []).map(projectFeature),
      roads: (features.roads || []).map(projectFeature),
      water: (features.water || []).map(projectFeature),
      buildings: (features.buildings || []).map(projectFeature),
      landuse: (features.parks || []).map(f => ({
        ...projectFeature(f),
        landuseClass: landuseClassForTags(f.tags)
      })),
      places: (features.places || [])
        .map(projectFeature)
        .filter(f => f.points.length)
    };

    return projected;
  }

  function invalidate() {
    projectedVersion = -1;
    cellCacheVersion = -1;
    cellCache = new Map();
    window.__gwOsmPriorCells = cellCache;
  }

  function distPointSegment(px, py, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 <= 0) {
      const ddx = px - a.x;
      const ddy = py - a.y;
      return { distance: Math.hypot(ddx, ddy), t: 0, x: a.x, y: a.y, side: "center" };
    }

    const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2));
    const x = a.x + t * dx;
    const y = a.y + t * dy;
    const cross = dx * (py - a.y) - dy * (px - a.x);

    return {
      distance: Math.hypot(px - x, py - y),
      t,
      x,
      y,
      side: Math.abs(cross) < 0.001 ? "center" : (cross > 0 ? "left" : "right")
    };
  }

  function nearestLine(px, py, lines) {
    let best = null;

    for (const f of lines) {
      for (let i = 1; i < f.points.length; i++) {
        const hit = distPointSegment(px, py, f.points[i - 1], f.points[i]);
        if (!best || hit.distance < best.distance) {
          best = {
            id: f.id,
            tags: f.tags,
            distance: hit.distance,
            side: hit.side,
            a: f.points[i - 1],
            b: f.points[i]
          };
        }
      }
    }

    return best;
  }

  function pointInPolygon(px, py, polygon) {
    const pts = polygon.points || [];
    if (pts.length < 3) return false;

    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const pi = pts[i];
      const pj = pts[j];
      const crosses =
        ((pi.y > py) !== (pj.y > py)) &&
        (px < (pj.x - pi.x) * (py - pi.y) / ((pj.y - pi.y) || 1e-9) + pi.x);
      if (crosses) inside = !inside;
    }

    return inside;
  }

  function nearestPolygonDistance(px, py, polygons) {
    let best = { distance: Infinity, feature: null, inside: false };

    for (const f of polygons) {
      if (f.points.length < 3) continue;

      const inside = f.closed && pointInPolygon(px, py, f);
      if (inside) {
        best = { distance: 0, feature: f, inside: true };
        break;
      }

      for (let i = 1; i < f.points.length; i++) {
        const hit = distPointSegment(px, py, f.points[i - 1], f.points[i]);
        if (hit.distance < best.distance) {
          best = { distance: hit.distance, feature: f, inside: false };
        }
      }
    }

    return best;
  }

  function nearestPlaceName(px, py, places) {
    let bestName = null;
    let bestDistance = Infinity;

    for (const place of places) {
      const p = place.points[0];
      if (!p) continue;
      const d = Math.hypot(px - p.x, py - p.y);
      if (d < bestDistance) {
        bestDistance = d;
        bestName = place.tags?.name || null;
      }
    }

    return bestDistance <= 300 ? bestName : null;
  }

  function ccw(a, b, c) {
    return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
  }

  function segmentsIntersect(a, b, c, d) {
    return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
  }

  function roadBarrierForCell(x0, y0, x1, y1, roads, nearestRoadDistanceM) {
    const nw = { x: x0, y: y1 };
    const ne = { x: x1, y: y1 };
    const se = { x: x1, y: y0 };
    const sw = { x: x0, y: y0 };
    const boundaries = {
      north: [nw, ne],
      east: [ne, se],
      south: [sw, se],
      west: [nw, sw]
    };
    const barrier = { north: false, east: false, south: false, west: false, any: false };

    for (const road of roads) {
      for (let i = 1; i < road.points.length; i++) {
        const a = road.points[i - 1];
        const b = road.points[i];
        for (const [side, line] of Object.entries(boundaries)) {
          if (segmentsIntersect(a, b, line[0], line[1])) {
            barrier[side] = true;
            barrier.any = true;
          }
        }
      }
    }

    const cls = barrier.any
      ? "crossing"
      : nearestRoadDistanceM <= ROAD_NEAR_M
        ? "near"
        : "none";

    return { barrier, cls };
  }

  function computeAccessibility(prior) {
    let score = 0.42;

    if (prior.isPathAdjacent) score += 0.32;
    else if (prior.nearestPathDistanceM <= 30) score += 0.16;

    if (prior.insidePark || prior.insideGrass || prior.insideWood) score += 0.12;
    if (prior.isWetEdge) score += 0.05;
    if (prior.insideWater) score -= 0.36;
    if (prior.insideBuilding) score -= 0.55;
    if (prior.roadBarrierClass === "crossing") score -= 0.28;
    else if (prior.roadBarrierClass === "near") score -= 0.12;

    return Math.max(0, Math.min(1, score));
  }

  function computeEdgeContext(prior) {
    if (prior.insideWater) return "water";
    if (prior.insideBuilding) return "building";
    if (prior.roadBarrierClass === "crossing") return "road-barrier";
    if (prior.isWetEdge) return "wet-edge";
    if (prior.distanceToBuildingM <= BUILDING_ADJACENT_M) return "building-edge";
    if (prior.isPathAdjacent) return "path-edge";
    if (prior.insidePark && prior.nearestPathDistanceM <= 24) return "park-trail";
    if (prior.insideWood) return "wood-interior";
    if (prior.insideGrass) return "grass-interior";
    if (prior.insidePark) return "park-interior";
    return "open";
  }

  function computeCell(ix, iy) {
    const sourceVersion = window.GridWildOsmFeaturesLayer?.getVersion?.() ?? 0;
    if (cellCacheVersion !== sourceVersion) {
      cellCacheVersion = sourceVersion;
      cellCache = new Map();
      window.__gwOsmPriorCells = cellCache;
    }

    const key = `${ix},${iy}`;
    if (cellCache.has(key)) return cellCache.get(key);

    const x0 = ix * CELL_SIZE_M;
    const y0 = iy * CELL_SIZE_M;
    const x1 = x0 + CELL_SIZE_M;
    const y1 = y0 + CELL_SIZE_M;
    const px = x0 + CELL_SIZE_M / 2;
    const py = y0 + CELL_SIZE_M / 2;
    const f = getProjectedFeatures();

    const nearestPath = nearestLine(px, py, f.paths);
    const nearestRoad = nearestLine(px, py, f.roads);
    const waterPoly = nearestPolygonDistance(px, py, f.water.filter(w => w.closed));
    const waterLine = nearestLine(px, py, f.water.filter(w => !w.closed));
    const nearestWaterDistanceM = Math.min(
      waterPoly.distance,
      waterLine?.distance ?? Infinity
    );
    const building = nearestPolygonDistance(px, py, f.buildings);
    const landuse = f.landuse.find(poly => poly.closed && pointInPolygon(px, py, poly));
    const insideWater = waterPoly.inside === true;
    const nearestPathDistanceM = nearestPath?.distance ?? Infinity;
    const nearestRoadDistanceM = nearestRoad?.distance ?? Infinity;
    const barrierInfo = roadBarrierForCell(x0, y0, x1, y1, f.roads, nearestRoadDistanceM);
    const landuseClass = insideWater
      ? "water"
      : building.inside
        ? "building"
        : landuse?.landuseClass || "unclassified";

    const prior = {
      nearestPathId: nearestPath?.id || null,
      nearestPathDistanceM,
      nearestPathSide: nearestPath?.side || null,
      isPathAdjacent: nearestPathDistanceM <= PATH_ADJACENT_M,

      nearestWaterDistanceM,
      isWetEdge: !insideWater && nearestWaterDistanceM <= WET_EDGE_M,

      nearestRoadDistanceM,
      roadBarrierClass: barrierInfo.cls,

      insidePark: landuseClass === "park",
      insideWood: landuseClass === "wood",
      insideGrass: landuseClass === "grass",
      insideBuilding: building.inside === true,

      landuseClass,
      nearestPlaceName: nearestPlaceName(px, py, f.places),

      insideWater,
      distanceToBuildingM: building.distance,
      barrierBetweenNeighbors: barrierInfo.barrier
    };

    prior.accessibilityScore = computeAccessibility(prior);
    prior.edgeContext = computeEdgeContext(prior);

    const cell = { ix, iy, key, osm: prior };
    cellCache.set(key, cell);
    return cell;
  }

  function colorForMode(osm, mode) {
    if (!osm) return null;

    if (mode === "path-adjacency") {
      if (!Number.isFinite(osm.nearestPathDistanceM) || osm.nearestPathDistanceM > 32) return null;
      const t = 1 - Math.min(1, osm.nearestPathDistanceM / 32);
      return { fill: "rgb(231, 166, 68)", alpha: 0.12 + 0.46 * t, stroke: osm.isPathAdjacent ? "rgba(255,238,176,0.8)" : null };
    }

    if (mode === "trail-side") {
      if (!osm.isPathAdjacent && osm.nearestPathDistanceM > 20) return null;
      const left = osm.nearestPathSide === "left";
      return {
        fill: left ? "rgb(75, 160, 220)" : "rgb(232, 121, 74)",
        alpha: 0.34,
        stroke: "rgba(255,255,255,0.22)"
      };
    }

    if (mode === "wet-edge") {
      if (osm.insideWater) return { fill: "rgb(53, 130, 178)", alpha: 0.46, stroke: "rgba(177,231,255,0.58)" };
      if (osm.isWetEdge) return { fill: "rgb(73, 205, 214)", alpha: 0.48, stroke: "rgba(214,255,250,0.86)", hatch: true };
      return null;
    }

    if (mode === "barrier-map") {
      if (osm.insideBuilding) return { fill: "rgb(100, 74, 55)", alpha: 0.58, stroke: "rgba(255,225,188,0.72)" };
      if (osm.roadBarrierClass === "crossing") return { fill: "rgb(205, 59, 54)", alpha: 0.52, stroke: "rgba(255,220,214,0.78)" };
      if (osm.roadBarrierClass === "near") return { fill: "rgb(226, 143, 65)", alpha: 0.28, stroke: "rgba(255,217,165,0.52)" };
      if (osm.distanceToBuildingM <= BUILDING_ADJACENT_M) return { fill: "rgb(128, 91, 66)", alpha: 0.22, stroke: "rgba(255,225,188,0.56)" };
      return null;
    }

    if (mode === "landuse-class") {
      const palette = {
        park: ["rgb(79, 154, 86)", 0.34],
        wood: ["rgb(37, 112, 76)", 0.42],
        grass: ["rgb(156, 174, 77)", 0.34],
        water: ["rgb(58, 134, 182)", 0.42],
        building: ["rgb(102, 80, 64)", 0.48]
      };
      const item = palette[osm.landuseClass];
      if (!item) return null;
      return {
        fill: item[0],
        alpha: item[1],
        stroke: osm.edgeContext?.includes("edge") ? "rgba(255,255,255,0.34)" : null,
        hatch: osm.edgeContext === "park-trail" || osm.isWetEdge
      };
    }

    if (mode === "accessibility") {
      const t = Math.max(0, Math.min(1, Number(osm.accessibilityScore) || 0));
      const hue = 4 + 124 * t;
      return {
        fill: `hsl(${hue.toFixed(0)}, 68%, ${t > 0.56 ? 42 : 50}%)`,
        alpha: 0.18 + 0.42 * Math.abs(t - 0.5) * 2,
        stroke: osm.roadBarrierClass === "crossing" ? "rgba(255,235,230,0.82)" : null
      };
    }

    return null;
  }

  function drawHatch(x, y, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = "rgba(255,255,255,0.78)";
    ctx.lineWidth = 1;
    for (let dx = -h; dx < w + h; dx += 8) {
      ctx.beginPath();
      ctx.moveTo(x + dx, y + h);
      ctx.lineTo(x + dx + h, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBarrierEdges(pxX, pxY, pxW, pxH, barrier) {
    if (!barrier?.any) return;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = "rgba(255, 238, 214, 0.92)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (barrier.north) {
      ctx.moveTo(pxX, pxY);
      ctx.lineTo(pxX + pxW, pxY);
    }
    if (barrier.east) {
      ctx.moveTo(pxX + pxW, pxY);
      ctx.lineTo(pxX + pxW, pxY + pxH);
    }
    if (barrier.south) {
      ctx.moveTo(pxX, pxY + pxH);
      ctx.lineTo(pxX + pxW, pxY + pxH);
    }
    if (barrier.west) {
      ctx.moveTo(pxX, pxY);
      ctx.lineTo(pxX, pxY + pxH);
    }
    ctx.stroke();
    ctx.restore();
  }

  function styleKey(style) {
    if (!style) return null;
    return [
      style.fill || "",
      Math.round((Number(style.alpha) || 0) * 1000),
      style.stroke || "",
      style.hatch ? "h" : ""
    ].join("|");
  }

  function metersRectToPixels(x0, y0, x1, y1) {
    const sw = map.options.crs.unproject(L.point(x0, y0));
    const ne = map.options.crs.unproject(L.point(x1, y1));
    const nwPx = layerPoint(L.latLng(ne.lat, sw.lng));
    const sePx = layerPoint(L.latLng(sw.lat, ne.lng));

    return {
      x: Math.floor(nwPx.x),
      y: Math.floor(nwPx.y),
      w: Math.max(1, Math.ceil(sePx.x - nwPx.x)),
      h: Math.max(1, Math.ceil(sePx.y - nwPx.y))
    };
  }

  function drawStyledRect(x0, y0, x1, y1, style) {
    const rect = metersRectToPixels(x0, y0, x1, y1);

    ctx.globalAlpha = style.alpha;
    ctx.fillStyle = style.fill;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

    if (style.hatch) drawHatch(rect.x, rect.y, rect.w, rect.h);

    if (style.stroke) {
      ctx.globalAlpha = 0.82;
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(
        rect.x + 0.5,
        rect.y + 0.5,
        Math.max(1, rect.w - 1),
        Math.max(1, rect.h - 1)
      );
    }

    return rect;
  }

  function clearCanvas() {
    if (!ctx) return;
    const size = map.getSize();
    ctx.clearRect(0, 0, size.x, size.y);
  }

  function ensureOsmLayerEnabled() {
    if (autoEnableGuard) return;
    autoEnableGuard = true;

    try {
      window.__gwState = window.__gwState || {};
      window.__gwState.showOsmFeatures = true;
      window.__gwState.showOsmBuildings = true;
      window.__gwState.showOsmTrails = true;
      window.__gwState.showOsmParks = true;
      window.__gwState.showOsmWater = true;
      window.__gwState.showOsmRoads = true;

      window.GridWildOsmFeaturesLayer?.setVisible?.(true);
      window.GridWildOsmFeaturesLayer?.scheduleFetch?.();

      const checkbox = document.getElementById("toggleOsmBuildings");
      const wasChecked = checkbox?.checked === true;
      if (checkbox && !checkbox.checked) {
        checkbox.checked = true;
        try {
          checkbox.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (err) {
          console.warn("GridWild OSM Priors: OSM toggle sync failed:", err);
        }
      }

      window.GridWildHudTaxaFilter?.sync?.();

      if (!wasChecked && typeof window.showGridWildToast === "function") {
        window.showGridWildToast("OSM layer enabled for OSM Priors");
      }
    } finally {
      autoEnableGuard = false;
    }
  }

  function render() {
    raf = null;
    ensureCanvas();
    resizeCanvas();
    clearCanvas();

    const lens = window.__gwState?.activeLens || "classic";
    const mode = getModeForLens(lens);

    if (!mode) {
      if (canvas) canvas.style.display = "none";
      return;
    }

    if (!heatOverlayEnabled()) {
      if (canvas) canvas.style.display = "none";
      return;
    }

    canvas.style.display = "block";
    ensureOsmLayerEnabled();

    const { startX, endX, startY, endY } = getPaddedBoundsMeters();
    const cellCount =
      Math.max(0, Math.ceil((endX - startX) / CELL_SIZE_M)) *
      Math.max(0, Math.ceil((endY - startY) / CELL_SIZE_M));
    const strideCells = getPreviewStride(cellCount);
    if (!strideCells) return;

    const strideM = CELL_SIZE_M * strideCells;
    const barrierRects = [];

    function flushRun(run) {
      if (!run) return;
      drawStyledRect(run.x0, run.y0, run.x1, run.y1, run.style);
    }

    for (let y = startY; y < endY; y += strideM) {
      const y1 = Math.min(y + strideM, endY);
      let run = null;

      for (let x = startX; x < endX; x += strideM) {
        const x1 = Math.min(x + strideM, endX);
        const ix = Math.floor(x / CELL_SIZE_M);
        const iy = Math.floor(y / CELL_SIZE_M);
        const sampleIx = ix + Math.floor(strideCells / 2);
        const sampleIy = iy + Math.floor(strideCells / 2);
        const cell = computeCell(sampleIx, sampleIy);
        const style = colorForMode(cell.osm, mode);
        const key = styleKey(style);

        if (!style || !key) {
          flushRun(run);
          run = null;
          continue;
        }

        if (run && run.key === key && run.x1 === x) {
          run.x1 = x1;
        } else {
          flushRun(run);
          run = {
            key,
            style,
            x0: x,
            x1,
            y0: y,
            y1
          };
        }

        if (mode === "barrier-map") {
          const barrier = strideCells === 1
            ? cell.osm.barrierBetweenNeighbors
            : { any: true };
          if (barrier?.any) barrierRects.push({ x0: x, y0: y, x1, y1, barrier });
        }
      }

      flushRun(run);
    }

    if (mode === "barrier-map") {
      for (const item of barrierRects) {
        const rect = metersRectToPixels(item.x0, item.y0, item.x1, item.y1);
        drawBarrierEdges(rect.x, rect.y, rect.w, rect.h, item.barrier);
      }
    }

    ctx.globalAlpha = 1;
  }

  function scheduleRender() {
    if (raf) return;
    raf = requestAnimationFrame(render);
  }

  function handleLensChange(lens = window.__gwState?.activeLens) {
    window.__gwState = window.__gwState || {};
    window.__gwState.osmPriorsEnabled = isOsmPriorLens(lens);
    window.__gwState.osmPriorsMode = getModeForLens(lens) || window.__gwState.osmPriorsMode || "path-adjacency";

    if (isOsmPriorLens(lens)) {
      ensureOsmLayerEnabled();
    }

    scheduleRender();
  }

  window.GridWildOsmPriorsLayer = {
    lenses: OSM_PRIOR_LENSES,
    isOsmPriorLens,
    getModeForLens,
    handleLensChange,
    scheduleRender,
    render,
    invalidate,
    getCell(ix, iy) {
      return computeCell(ix, iy);
    },
    getVisibleCells() {
      const out = [];
      const { startX, endX, startY, endY } = getPaddedBoundsMeters();
      for (let x = startX; x < endX; x += CELL_SIZE_M) {
        for (let y = startY; y < endY; y += CELL_SIZE_M) {
          out.push(computeCell(Math.floor(x / CELL_SIZE_M), Math.floor(y / CELL_SIZE_M)));
        }
      }
      return out;
    },
    setEnabled(enabled) {
      window.__gwState = window.__gwState || {};
      window.__gwState.osmPriorsEnabled = enabled === true;
      if (!enabled && canvas) {
        canvas.style.display = "none";
        clearCanvas();
      } else {
        scheduleRender();
      }
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    ensureCanvas();
    handleLensChange();
  });
})();
