// js/gw-niche-osm-priors.js
// Current-view cell adapter plus OSM-prior normalization for niche graph passes.

(function () {
  const GRID_SIZE_M = 20 * 0.3048;
  const DEFAULTS = {
    pathAdjacentDistanceM: 30,
    wetEdgeDistanceM: 30,
    buildingBufferM: 5,
    roadNearDistanceM: 30,
    highVisibleCellWarning: 12000
  };

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  function cellId(col, row) {
    return `${col},${row}`;
  }

  function getPaddedBoundsMeters(padPx = 80) {
    const z = map.getZoom();
    const b = map.getBounds();
    const nw = map.project(b.getNorthWest(), z);
    const se = map.project(b.getSouthEast(), z);
    const llNW = map.unproject(L.point(nw.x - padPx, nw.y - padPx), z);
    const llSE = map.unproject(L.point(se.x + padPx, se.y + padPx), z);
    const pNW = map.options.crs.project(llNW);
    const pSE = map.options.crs.project(llSE);

    return {
      startX: Math.floor(Math.min(pNW.x, pSE.x) / GRID_SIZE_M) * GRID_SIZE_M,
      endX: Math.ceil(Math.max(pNW.x, pSE.x) / GRID_SIZE_M) * GRID_SIZE_M,
      startY: Math.floor(Math.min(pNW.y, pSE.y) / GRID_SIZE_M) * GRID_SIZE_M,
      endY: Math.ceil(Math.max(pNW.y, pSE.y) / GRID_SIZE_M) * GRID_SIZE_M
    };
  }

  function metricNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function getMetricsForCell(col, row) {
    const key = cellId(col, row);
    const m = window.__richGridMetrics?.get?.(key) || window.__staticGridCounts?.get?.(key) || null;

    if (!m) {
      return {
        observations: 0,
        richness: 0,
        genusRichness: 0,
        observerCount: 0,
        recency: 0,
        cultivatedRatio: 0,
        dominantTaxon: "Unknown",
        taxonMix: {}
      };
    }

    const observations = metricNumber(m.count);
    const nCaptive = metricNumber(m.n_captive);
    const lastMs = metricNumber(m.last_observed_ms);
    const recency = lastMs
      ? clamp01(1 - (Date.now() - lastMs) / (365 * 8 * 24 * 60 * 60 * 1000))
      : 0;

    return {
      observations,
      richness: metricNumber(m.species),
      genusRichness: metricNumber(m.genera || m.genusRichness),
      observerCount: metricNumber(m.observers),
      recency,
      cultivatedRatio: observations > 0 ? clamp01(nCaptive / observations) : 0,
      dominantTaxon: m.dominant_iconic || m.dominantTaxon || "Unknown",
      taxonMix: m.iconic_counts || m.taxonMix || {}
    };
  }

  function buildCell(col, row) {
    const x0 = col * GRID_SIZE_M;
    const y0 = row * GRID_SIZE_M;
    const sw = map.options.crs.unproject(L.point(x0, y0));
    const ne = map.options.crs.unproject(L.point(x0 + GRID_SIZE_M, y0 + GRID_SIZE_M));
    const center = map.options.crs.unproject(L.point(x0 + GRID_SIZE_M / 2, y0 + GRID_SIZE_M / 2));

    return {
      id: cellId(col, row),
      row,
      col,
      lat: center.lat,
      lng: center.lng,
      bounds: [
        [sw.lat, sw.lng],
        [ne.lat, ne.lng]
      ],
      center: { lat: center.lat, lng: center.lng },
      metrics: getMetricsForCell(col, row),
      osm: defaultOsmPrior()
    };
  }

  function getVisibleGridCells(options = {}) {
    const opts = { ...DEFAULTS, ...options };
    const { startX, endX, startY, endY } = getPaddedBoundsMeters(opts.padPx ?? 80);
    const nx = Math.max(0, Math.ceil((endX - startX) / GRID_SIZE_M));
    const ny = Math.max(0, Math.ceil((endY - startY) / GRID_SIZE_M));
    const count = nx * ny;
    const warnings = [];

    if (count > opts.highVisibleCellWarning) {
      warnings.push(
        `Visible graph is using all ${count.toLocaleString()} cells; zooming in may run faster.`
      );
    }

    const cells = [];
    for (let x = startX; x < endX; x += GRID_SIZE_M) {
      for (let y = startY; y < endY; y += GRID_SIZE_M) {
        const col = Math.floor(x / GRID_SIZE_M);
        const row = Math.floor(y / GRID_SIZE_M);
        const cell = buildCell(col, row);
        cell.debugStrideCells = 1;
        cells.push(cell);
      }
    }

    return { cells, warnings, strideCells: 1 };
  }

  function defaultOsmPrior() {
    return {
      nearestPathId: null,
      nearestPathDistanceM: Infinity,
      nearestPathSide: "none",
      isPathAdjacent: false,
      nearestRoadDistanceM: Infinity,
      roadBarrierClass: "none",
      nearestWaterDistanceM: Infinity,
      isWetEdge: false,
      insideBuilding: false,
      insidePark: false,
      insideWood: false,
      insideGrass: false,
      landuseClass: "unclassified",
      nearestPlaceName: null,
      accessibilityScore: 0.35
    };
  }

  function normalizeRoadBarrierClass(value, distanceM, options) {
    if (value === "strong" || value === "moderate" || value === "weak" || value === "none") {
      return value;
    }

    if (value === "crossing") return "strong";
    if (value === "near") return "weak";
    if (
      Number.isFinite(distanceM) &&
      distanceM <= (options.roadNearDistanceM ?? DEFAULTS.roadNearDistanceM)
    ) {
      return "weak";
    }
    return "none";
  }

  function normalizeOsmPrior(raw = {}, options = {}) {
    const nearestPathDistanceM = Number(raw.nearestPathDistanceM);
    const nearestWaterDistanceM = Number(raw.nearestWaterDistanceM);
    const nearestRoadDistanceM = Number(raw.nearestRoadDistanceM);
    const landuseClass =
      raw.landuseClass ||
      (raw.insideBuilding
        ? "building"
        : raw.insideWater
          ? "water"
          : raw.insideWood
            ? "wood"
            : raw.insideGrass
              ? "grass"
              : raw.insidePark
                ? "park"
                : "unclassified");

    return {
      nearestPathId: raw.nearestPathId || null,
      nearestPathDistanceM: Number.isFinite(nearestPathDistanceM) ? nearestPathDistanceM : Infinity,
      nearestPathSide:
        raw.nearestPathSide === "left" || raw.nearestPathSide === "right"
          ? raw.nearestPathSide
          : "none",
      isPathAdjacent:
        raw.isPathAdjacent === true ||
        (Number.isFinite(nearestPathDistanceM) &&
          nearestPathDistanceM <=
            (options.pathAdjacentDistanceM ?? DEFAULTS.pathAdjacentDistanceM)),
      nearestRoadDistanceM: Number.isFinite(nearestRoadDistanceM) ? nearestRoadDistanceM : Infinity,
      roadBarrierClass: normalizeRoadBarrierClass(
        raw.roadBarrierClass,
        nearestRoadDistanceM,
        options
      ),
      nearestWaterDistanceM: Number.isFinite(nearestWaterDistanceM)
        ? nearestWaterDistanceM
        : Infinity,
      isWetEdge:
        raw.isWetEdge === true ||
        (Number.isFinite(nearestWaterDistanceM) &&
          nearestWaterDistanceM <= (options.wetEdgeDistanceM ?? DEFAULTS.wetEdgeDistanceM)),
      insideBuilding: raw.insideBuilding === true,
      insidePark: raw.insidePark === true,
      insideWood: raw.insideWood === true,
      insideGrass: raw.insideGrass === true,
      landuseClass,
      nearestPlaceName: raw.nearestPlaceName || raw.nearestPlaceName || null,
      accessibilityScore: clamp01(raw.accessibilityScore ?? 0.35),
      barrierBetweenNeighbors: raw.barrierBetweenNeighbors || null,
      edgeContext: raw.edgeContext || null
    };
  }

  function computeOsmPriorsForCells(cells, osmFeatures = null, options = {}) {
    const opts = { ...DEFAULTS, ...options };
    return cells.map((cell) => {
      const out = { ...cell };
      let raw = null;

      if (window.GridWildOsmPriorsLayer?.getCell) {
        raw = window.GridWildOsmPriorsLayer.getCell(cell.col, cell.row)?.osm || null;
      }

      out.osm = normalizeOsmPrior(raw || cell.osm || {}, opts);
      return out;
    });
  }

  function summarizeOsmPriors(cells) {
    const summary = {
      nCells: cells.length,
      pathAdjacent: 0,
      wetEdge: 0,
      insideBuilding: 0,
      landuse: {}
    };

    for (const cell of cells) {
      if (cell.osm?.isPathAdjacent) summary.pathAdjacent++;
      if (cell.osm?.isWetEdge) summary.wetEdge++;
      if (cell.osm?.insideBuilding) summary.insideBuilding++;
      const cls = cell.osm?.landuseClass || "unclassified";
      summary.landuse[cls] = (summary.landuse[cls] || 0) + 1;
    }

    return summary;
  }

  window.GridWildNicheOsmPriors = {
    GRID_SIZE_M,
    getVisibleGridCells,
    computeOsmPriorsForCells,
    normalizeOsmPrior,
    summarizeOsmPriors,
    defaultOsmPrior
  };
})();
