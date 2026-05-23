// js/gw-niche-graph.js
// Builds a debuggable cell adjacency graph for niche partition passes.

(function () {
  const DEFAULTS = {
    neighborMode: 4,
    trailMode: "corridor",
    pathDistanceBucketM: 30,
    waterDistanceBucketM: 30
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

  function metricRange(cells, key, transform = value => value) {
    const values = cells
      .map(cell => transform(finiteOr(cell.metrics?.[key], 0)))
      .filter(Number.isFinite);
    if (!values.length) return { min: 0, max: 1 };
    return { min: Math.min(...values), max: Math.max(...values) };
  }

  function buildSignalNormalizer(cells) {
    const ranges = {
      observations: metricRange(cells, "observations", Math.log1p),
      richness: metricRange(cells, "richness", Math.log1p),
      genusRichness: metricRange(cells, "genusRichness", Math.log1p),
      observerCount: metricRange(cells, "observerCount", Math.log1p),
      recency: metricRange(cells, "recency"),
      cultivatedRatio: metricRange(cells, "cultivatedRatio")
    };

    function norm(cell, key, transform = value => value) {
      const range = ranges[key] || { min: 0, max: 1 };
      const value = transform(finiteOr(cell.metrics?.[key], 0));
      const span = range.max - range.min;
      if (span <= 1e-9) return 0.5;
      return clamp01((value - range.min) / span);
    }

    return function signalVector(cell) {
      return {
        observations: norm(cell, "observations", Math.log1p),
        richness: norm(cell, "richness", Math.log1p),
        genusRichness: norm(cell, "genusRichness", Math.log1p),
        observerCount: norm(cell, "observerCount", Math.log1p),
        recency: norm(cell, "recency"),
        cultivatedRatio: norm(cell, "cultivatedRatio"),
        dominantTaxon: cell.metrics?.dominantTaxon || "Unknown"
      };
    };
  }

  function computeSignalEdgeWeight(cellA, cellB, options = {}) {
    const signalA = cellA._signal || {};
    const signalB = cellB._signal || {};
    const numericKeys = ["observations", "richness", "genusRichness", "observerCount", "recency", "cultivatedRatio"];
    let distance = 0;

    for (const key of numericKeys) {
      distance += Math.abs((signalA[key] ?? 0.5) - (signalB[key] ?? 0.5));
    }

    const meanDistance = distance / numericKeys.length;
    let score = 1 - meanDistance;
    if (signalA.dominantTaxon && signalA.dominantTaxon === signalB.dominantTaxon && signalA.dominantTaxon !== "Unknown") {
      score += 0.08;
    } else if (signalA.dominantTaxon !== signalB.dominantTaxon) {
      score -= 0.06;
    }

    return {
      weight: clamp01(score),
      reasons: {
        signalSimilarity: clamp01(score),
        dominantTaxonMatch: signalA.dominantTaxon === signalB.dominantTaxon
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
    const signalForCell = buildSignalNormalizer(cells);
    const offsets = opts.neighborMode === 8
      ? [[1, 0], [0, 1], [1, 1], [1, -1]]
      : [[1, 0], [0, 1]];
    const nodes = cells.map(cell => {
      cell._signal = signalForCell(cell);
      return { id: cell.id, cell };
    });
    const edges = [];

    for (const cell of cells) {
      for (const [dx, dy] of offsets) {
        const other = byKey.get(`${cell.col + dx},${cell.row + dy}`);
        if (!other) continue;

        const context = computeContextEdgeWeight(cell, other, opts);
        const signal = computeSignalEdgeWeight(cell, other, opts);
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
