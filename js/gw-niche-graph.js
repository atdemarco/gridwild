// js/gw-niche-graph.js
// Builds a debuggable cell adjacency graph for niche partition passes.

(function () {
  const DEFAULTS = {
    neighborMode: 4,
    trailMode: "corridor",
    pathDistanceBucketM: 30,
    waterDistanceBucketM: 30,
    pass2NeighborhoodSize: 5,
    pass2NeighborhoodMinActiveCells: 2,
    pass2NeighborhoodMinObservations: 3
  };

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  function finiteOr(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function bucketDistance(value, bucketM) {
    if (!Number.isFinite(value)) return 99;
    return Math.floor(value / Math.max(1, bucketM));
  }

  function contextGroup(cell) {
    const osm = cell.osm || {};
    if (osm.insideBuilding) return "building";
    return osm.landuseClass || "unclassified";
  }

  function sameGreenClass(a, b) {
    const greens = new Set(["park", "wood", "grass"]);
    return greens.has(a.osm?.landuseClass) && a.osm?.landuseClass === b.osm?.landuseClass;
  }

  function roadPenalty(osmA = {}, osmB = {}) {
    const rank = { none: 0, weak: 0.12, moderate: 0.28, strong: 0.48 };
    return Math.max(rank[osmA.roadBarrierClass] || 0, rank[osmB.roadBarrierClass] || 0);
  }

  function waterPenalty(osmA = {}, osmB = {}) {
    if (osmA.insideWater !== osmB.insideWater) return 0.42;
    if (osmA.isWetEdge !== osmB.isWetEdge) return 0.10;
    return 0;
  }

  function buildingPenalty(osmA = {}, osmB = {}) {
    if (osmA.insideBuilding && osmB.insideBuilding) return 0;
    return osmA.insideBuilding || osmB.insideBuilding ? 0.55 : 0;
  }

  function oppositePathSides(a, b) {
    const sa = a.osm?.nearestPathSide;
    const sb = b.osm?.nearestPathSide;
    return (sa === "left" && sb === "right") || (sa === "right" && sb === "left");
  }

  function computeContextEdgeWeight(cellA, cellB, options = {}) {
    const opts = { ...DEFAULTS, ...options };
    const osmA = cellA.osm || {};
    const osmB = cellB.osm || {};
    const reasons = {};
    let score = 0.45;

    reasons.sameLanduse = contextGroup(cellA) === contextGroup(cellB);
    if (reasons.sameLanduse) score += 0.22;
    else score -= 0.14;

    reasons.sameParkWoodGrass = sameGreenClass(cellA, cellB);
    if (reasons.sameParkWoodGrass) score += 0.12;

    reasons.bothPathAdjacent = osmA.isPathAdjacent === true && osmB.isPathAdjacent === true;
    if (reasons.bothPathAdjacent) score += opts.trailMode === "corridor" ? 0.14 : 0.05;

    reasons.sameTrailSide =
      reasons.bothPathAdjacent &&
      osmA.nearestPathSide !== "none" &&
      osmA.nearestPathSide === osmB.nearestPathSide;
    if (reasons.sameTrailSide) score += 0.12;

    if (opts.trailMode === "divider" && reasons.bothPathAdjacent && oppositePathSides(cellA, cellB)) {
      reasons.oppositeTrailSidePenalty = 0.32;
      score -= reasons.oppositeTrailSidePenalty;
    }

    reasons.bothWetEdge = osmA.isWetEdge === true && osmB.isWetEdge === true;
    if (reasons.bothWetEdge) score += 0.12;

    const samePathBucket =
      bucketDistance(osmA.nearestPathDistanceM, opts.pathDistanceBucketM) ===
      bucketDistance(osmB.nearestPathDistanceM, opts.pathDistanceBucketM);
    if (samePathBucket) score += 0.06;
    reasons.samePathDistanceBucket = samePathBucket;

    const sameWaterBucket =
      bucketDistance(osmA.nearestWaterDistanceM, opts.waterDistanceBucketM) ===
      bucketDistance(osmB.nearestWaterDistanceM, opts.waterDistanceBucketM);
    if (sameWaterBucket) score += 0.05;
    reasons.sameWaterDistanceBucket = sameWaterBucket;

    reasons.insideBuildingPenalty = buildingPenalty(osmA, osmB);
    reasons.roadBarrierPenalty = roadPenalty(osmA, osmB);
    reasons.waterBarrierPenalty = waterPenalty(osmA, osmB);
    score -= reasons.insideBuildingPenalty + reasons.roadBarrierPenalty + reasons.waterBarrierPenalty;

    reasons.contextSimilarity = clamp01(score);
    return { weight: clamp01(score), reasons };
  }

  function metricRange(items, key, transform = value => value) {
    const values = items
      .map(item => transform(finiteOr(item?.[key], 0)))
      .filter(Number.isFinite);
    if (!values.length) return { min: 0, max: 1 };
    return { min: Math.min(...values), max: Math.max(...values) };
  }

  function normalizedOddSize(value, fallback) {
    const n = Math.floor(finiteOr(value, fallback));
    const clamped = Math.max(1, Math.min(11, n));
    if (clamped % 2 === 1) return clamped;
    return clamped < 11 ? clamped + 1 : clamped - 1;
  }

  function addTaxonMix(out, metrics = {}) {
    const mix = metrics.taxonMix || {};
    let added = false;
    for (const [taxon, count] of Object.entries(mix)) {
      const n = Number(count) || 0;
      if (!taxon || taxon === "Unknown" || n <= 0) continue;
      out[taxon] = (out[taxon] || 0) + n;
      added = true;
    }

    const dominant = metrics.dominantTaxon || "Unknown";
    if (!added && dominant && dominant !== "Unknown") {
      out[dominant] = (out[dominant] || 0) + Math.max(1, Number(metrics.observations) || 1);
    }
  }

  function dominantTaxonFromMix(mix = {}) {
    let best = "Unknown";
    let bestCount = 0;
    for (const [taxon, count] of Object.entries(mix)) {
      const n = Number(count) || 0;
      if (n > bestCount) {
        best = taxon;
        bestCount = n;
      }
    }
    return best;
  }

  function isActiveMetrics(metrics = {}) {
    return (
      finiteOr(metrics.observations, 0) > 0 ||
      finiteOr(metrics.richness, 0) > 0 ||
      finiteOr(metrics.genusRichness, 0) > 0 ||
      finiteOr(metrics.observerCount, 0) > 0
    );
  }

  function poolNeighborhoodMetrics(cell, byKey, options = {}) {
    const size = normalizedOddSize(options.pass2NeighborhoodSize, DEFAULTS.pass2NeighborhoodSize);
    const radius = Math.floor(size / 2);
    const pooled = {
      observations: 0,
      richness: 0,
      genusRichness: 0,
      observerCount: 0,
      recency: 0,
      cultivatedRatio: 0,
      dominantTaxon: "Unknown",
      taxonMix: {},
      activeCells: 0,
      totalCells: 0,
      neighborhoodSize: size
    };
    let recencyWeight = 0;
    let cultivatedWeight = 0;

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const other = byKey.get(`${cell.col + dx},${cell.row + dy}`);
        if (!other) continue;
        pooled.totalCells++;

        const metrics = other.metrics || {};
        const observations = finiteOr(metrics.observations, 0);
        const active = isActiveMetrics(metrics);
        if (active) pooled.activeCells++;

        pooled.observations += observations;
        pooled.richness += finiteOr(metrics.richness, 0);
        pooled.genusRichness += finiteOr(metrics.genusRichness, 0);
        pooled.observerCount += finiteOr(metrics.observerCount, 0);
        addTaxonMix(pooled.taxonMix, metrics);

        if (observations > 0) {
          pooled.recency += finiteOr(metrics.recency, 0) * observations;
          pooled.cultivatedRatio += finiteOr(metrics.cultivatedRatio, 0) * observations;
          recencyWeight += observations;
          cultivatedWeight += observations;
        }
      }
    }

    pooled.recency = recencyWeight ? pooled.recency / recencyWeight : 0;
    pooled.cultivatedRatio = cultivatedWeight ? pooled.cultivatedRatio / cultivatedWeight : 0;
    pooled.dominantTaxon = dominantTaxonFromMix(pooled.taxonMix);
    return pooled;
  }

  function neighborhoodSupport(metrics = {}, options = {}) {
    const minActive = Math.max(1, finiteOr(
      options.pass2NeighborhoodMinActiveCells,
      DEFAULTS.pass2NeighborhoodMinActiveCells
    ));
    const minObservations = Math.max(1, finiteOr(
      options.pass2NeighborhoodMinObservations,
      DEFAULTS.pass2NeighborhoodMinObservations
    ));
    const activeSupport = clamp01(finiteOr(metrics.activeCells, 0) / minActive);
    const observationSupport = clamp01(finiteOr(metrics.observations, 0) / minObservations);
    return clamp01(activeSupport * 0.72 + observationSupport * 0.28);
  }

  function supportedValue(value, support) {
    return 0.5 + (clamp01(value) - 0.5) * clamp01(support);
  }

  function buildRawSignalNormalizer(cells) {
    const metricRows = cells.map(cell => cell.metrics || {});
    const ranges = {
      observations: metricRange(metricRows, "observations", Math.log1p),
      richness: metricRange(metricRows, "richness", Math.log1p),
      genusRichness: metricRange(metricRows, "genusRichness", Math.log1p),
      observerCount: metricRange(metricRows, "observerCount", Math.log1p),
      recency: metricRange(metricRows, "recency"),
      cultivatedRatio: metricRange(metricRows, "cultivatedRatio")
    };

    function norm(metrics, key, transform = value => value) {
      const range = ranges[key] || { min: 0, max: 1 };
      const value = transform(finiteOr(metrics?.[key], 0));
      const span = range.max - range.min;
      if (span <= 1e-9) return 0.5;
      return clamp01((value - range.min) / span);
    }

    return function signalVector(cell) {
      const metrics = cell.metrics || {};
      return {
        observations: norm(metrics, "observations", Math.log1p),
        richness: norm(metrics, "richness", Math.log1p),
        genusRichness: norm(metrics, "genusRichness", Math.log1p),
        observerCount: norm(metrics, "observerCount", Math.log1p),
        recency: norm(metrics, "recency"),
        cultivatedRatio: norm(metrics, "cultivatedRatio"),
        dominantTaxon: metrics.dominantTaxon || "Unknown",
        signalSupport: isActiveMetrics(metrics) ? 1 : 0,
        activeCells: isActiveMetrics(metrics) ? 1 : 0,
        neighborhoodSize: 1
      };
    };
  }

  function buildPooledSignalNormalizer(cells, byKey, options = {}) {
    const pooledById = new Map(cells.map(cell => [
      cell.id,
      poolNeighborhoodMetrics(cell, byKey, options)
    ]));
    const pooledRows = Array.from(pooledById.values());
    const ranges = {
      observations: metricRange(pooledRows, "observations", Math.log1p),
      richness: metricRange(pooledRows, "richness", Math.log1p),
      genusRichness: metricRange(pooledRows, "genusRichness", Math.log1p),
      observerCount: metricRange(pooledRows, "observerCount", Math.log1p),
      recency: metricRange(pooledRows, "recency"),
      cultivatedRatio: metricRange(pooledRows, "cultivatedRatio")
    };

    function norm(metrics, key, transform = value => value) {
      const range = ranges[key] || { min: 0, max: 1 };
      const value = transform(finiteOr(metrics?.[key], 0));
      const span = range.max - range.min;
      if (span <= 1e-9) return 0.5;
      return clamp01((value - range.min) / span);
    }

    return function pooledSignalVector(cell) {
      const metrics = pooledById.get(cell.id) || {};
      const support = neighborhoodSupport(metrics, options);
      return {
        observations: supportedValue(norm(metrics, "observations", Math.log1p), support),
        richness: supportedValue(norm(metrics, "richness", Math.log1p), support),
        genusRichness: supportedValue(norm(metrics, "genusRichness", Math.log1p), support),
        observerCount: supportedValue(norm(metrics, "observerCount", Math.log1p), support),
        recency: supportedValue(norm(metrics, "recency"), support),
        cultivatedRatio: supportedValue(norm(metrics, "cultivatedRatio"), support),
        dominantTaxon: metrics.dominantTaxon || "Unknown",
        signalSupport: support,
        activeCells: finiteOr(metrics.activeCells, 0),
        observationsTotal: finiteOr(metrics.observations, 0),
        neighborhoodSize: metrics.neighborhoodSize || DEFAULTS.pass2NeighborhoodSize
      };
    };
  }

  function computeSignalEdgeWeight(cellA, cellB, options = {}) {
    const signalKey = options.signalKey || "_signal";
    const signalA = cellA[signalKey] || {};
    const signalB = cellB[signalKey] || {};
    const numericKeys = ["observations", "richness", "genusRichness", "observerCount", "recency", "cultivatedRatio"];
    let distance = 0;

    for (const key of numericKeys) {
      distance += Math.abs((signalA[key] ?? 0.5) - (signalB[key] ?? 0.5));
    }

    const meanDistance = distance / numericKeys.length;
    const supportA = Number.isFinite(Number(signalA.signalSupport)) ? clamp01(signalA.signalSupport) : 1;
    const supportB = Number.isFinite(Number(signalB.signalSupport)) ? clamp01(signalB.signalSupport) : 1;
    const support = Math.min(supportA, supportB);
    let score = 1 - meanDistance;
    score = 0.5 + (score - 0.5) * support;
    if (signalA.dominantTaxon && signalA.dominantTaxon === signalB.dominantTaxon && signalA.dominantTaxon !== "Unknown") {
      score += 0.08 * support;
    } else if (signalA.dominantTaxon !== signalB.dominantTaxon) {
      score -= 0.06 * support;
    }

    return {
      weight: clamp01(score),
      reasons: {
        signalSimilarity: clamp01(score),
        dominantTaxonMatch: signalA.dominantTaxon === signalB.dominantTaxon,
        signalSupport: support,
        signalSupportA: supportA,
        signalSupportB: supportB,
        signalNeighborhoodSize: Math.max(
          Number(signalA.neighborhoodSize) || 1,
          Number(signalB.neighborhoodSize) || 1
        ),
        signalActiveCellsA: Number(signalA.activeCells) || 0,
        signalActiveCellsB: Number(signalB.activeCells) || 0
      }
    };
  }

  function computeBarrierGradientEdgeWeight(cellA, cellB, options = {}) {
    const context = computeContextEdgeWeight(cellA, cellB, options);
    const signal = computeSignalEdgeWeight(cellA, cellB, options);
    const richnessGradient = Math.abs((cellA._signal?.richness ?? 0.5) - (cellB._signal?.richness ?? 0.5));
    const obsGradient = Math.abs((cellA._signal?.observations ?? 0.5) - (cellB._signal?.observations ?? 0.5));
    const gradientPenalty = Math.max(richnessGradient, obsGradient) * 0.30;
    const landusePenalty = context.reasons.sameLanduse ? 0 : 0.12;
    const hardPenalty =
      context.reasons.roadBarrierPenalty +
      context.reasons.waterBarrierPenalty +
      context.reasons.insideBuildingPenalty;
    const score = (context.weight * 0.46) + (signal.weight * 0.36) + 0.18 - hardPenalty * 0.45 - gradientPenalty - landusePenalty;

    return {
      weight: clamp01(score),
      reasons: {
        ...context.reasons,
        ...signal.reasons,
        gradientPenalty,
        abruptLandusePenalty: landusePenalty,
        barrierPenalty: hardPenalty
      }
    };
  }

  function edgeId(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  function buildCellAdjacencyGraph(cells, options = {}) {
    const opts = { ...DEFAULTS, ...options };
    const byKey = new Map(cells.map(cell => [cell.id, cell]));
    const rawSignalForCell = buildRawSignalNormalizer(cells);
    const pass2SignalForCell = buildPooledSignalNormalizer(cells, byKey, opts);
    const offsets = opts.neighborMode === 8
      ? [[1, 0], [0, 1], [1, 1], [1, -1]]
      : [[1, 0], [0, 1]];
    const nodes = cells.map(cell => {
      cell._signal = rawSignalForCell(cell);
      cell._pass2Signal = pass2SignalForCell(cell);
      return { id: cell.id, cell };
    });
    const edges = [];

    for (const cell of cells) {
      for (const [dx, dy] of offsets) {
        const other = byKey.get(`${cell.col + dx},${cell.row + dy}`);
        if (!other) continue;

        const context = computeContextEdgeWeight(cell, other, opts);
        const signal = computeSignalEdgeWeight(cell, other, { ...opts, signalKey: "_pass2Signal" });
        const barrier = computeBarrierGradientEdgeWeight(cell, other, opts);

        edges.push({
          id: edgeId(cell.id, other.id),
          a: cell.id,
          b: other.id,
          weight: barrier.weight,
          passWeights: {
            pass1Context: context.weight,
            pass2Signal: clamp01((context.weight * 0.58) + (signal.weight * 0.42)),
            pass3BarrierGradient: barrier.weight
          },
          reasons: {
            ...context.reasons,
            ...signal.reasons,
            gradientPenalty: barrier.reasons.gradientPenalty,
            abruptLandusePenalty: barrier.reasons.abruptLandusePenalty,
            barrierPenalty: barrier.reasons.barrierPenalty
          },
          cut: false
        });
      }
    }

    return { nodes, edges };
  }

  window.GridWildNicheGraph = {
    buildCellAdjacencyGraph,
    computeContextEdgeWeight,
    computeSignalEdgeWeight,
    computeBarrierGradientEdgeWeight
  };
})();
