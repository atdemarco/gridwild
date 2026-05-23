// js/gw-niche-partition.js
// Thresholded connected-components partitioning for niche graph passes.

(function () {
  const DEFAULTS = {
    pass1Threshold: 0.45,
    pass2Threshold: 0.50,
    pass3Threshold: 0.55,
    minCellCount: 3
  };

  function passWeightKey(pass) {
    if (Number(pass) === 1) return "pass1Context";
    if (Number(pass) === 2) return "pass2Signal";
    return "pass3BarrierGradient";
  }

  function thresholdForPass(pass, options) {
    if (Number(pass) === 1) return Number(options.pass1Threshold ?? DEFAULTS.pass1Threshold);
    if (Number(pass) === 2) return Number(options.pass2Threshold ?? DEFAULTS.pass2Threshold);
    return Number(options.pass3Threshold ?? DEFAULTS.pass3Threshold);
  }

  function mean(values) {
    const nums = values.map(Number).filter(Number.isFinite);
    if (!nums.length) return 0;
    return nums.reduce((sum, value) => sum + value, 0) / nums.length;
  }

  function dominant(values) {
    const counts = new Map();
    for (const value of values) {
      const key = value || "unclassified";
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    let best = "unclassified";
    let bestCount = -1;
    for (const [key, count] of counts) {
      if (count > bestCount) {
        best = key;
        bestCount = count;
      }
    }
    return best;
  }

  function regionStats(cells) {
    const nCells = cells.length;
    return {
      nCells,
      meanObservations: mean(cells.map(cell => cell.metrics?.observations)),
      meanRichness: mean(cells.map(cell => cell.metrics?.richness)),
      meanDistanceToPathM: mean(cells.map(cell => cell.osm?.nearestPathDistanceM).filter(Number.isFinite)),
      dominantLanduse: dominant(cells.map(cell => cell.osm?.landuseClass)),
      percentPathAdjacent: nCells ? cells.filter(cell => cell.osm?.isPathAdjacent).length / nCells : 0,
      percentWetEdge: nCells ? cells.filter(cell => cell.osm?.isWetEdge).length / nCells : 0,
      percentInsideWood: nCells ? cells.filter(cell => cell.osm?.insideWood).length / nCells : 0,
      percentInsideGrass: nCells ? cells.filter(cell => cell.osm?.insideGrass).length / nCells : 0
    };
  }

  function bboxForCells(cells) {
    if (!cells.length) return null;
    let south = Infinity;
    let west = Infinity;
    let north = -Infinity;
    let east = -Infinity;

    for (const cell of cells) {
      const [[s, w], [n, e]] = cell.bounds;
      south = Math.min(south, s);
      west = Math.min(west, w);
      north = Math.max(north, n);
      east = Math.max(east, e);
    }

    return [[south, west], [north, east]];
  }

  function centroidForCells(cells) {
    return {
      lat: mean(cells.map(cell => cell.center?.lat)),
      lng: mean(cells.map(cell => cell.center?.lng))
    };
  }

  function evidenceForRegion(cells, boundaryEdges) {
    const stats = regionStats(cells);
    const evidence = [];
    if (stats.dominantLanduse !== "unclassified") evidence.push(`dominant land-use: ${stats.dominantLanduse}`);
    if (stats.percentPathAdjacent >= 0.45) evidence.push("path-adjacent corridor");
    if (stats.percentWetEdge >= 0.30) evidence.push("wet-edge cluster");
    if (stats.percentInsideWood >= 0.30) evidence.push("wood/forest context");
    if (stats.percentInsideGrass >= 0.30) evidence.push("grass/meadow context");

    const cutReasons = boundaryEdges
      .filter(edge => edge.cut)
      .map(edge => {
        if ((edge.reasons?.roadBarrierPenalty || 0) > 0.2) return "split by road barrier";
        if ((edge.reasons?.waterBarrierPenalty || 0) > 0.2) return "split by water barrier";
        if ((edge.reasons?.gradientPenalty || 0) > 0.14) return "split by signal gradient";
        if (edge.reasons?.sameLanduse === false) return "land-use transition";
        return null;
      })
      .filter(Boolean);

    for (const reason of Array.from(new Set(cutReasons)).slice(0, 3)) {
      evidence.push(reason);
    }

    if (!evidence.length) evidence.push("connected by local graph threshold");
    return evidence;
  }

  function buildRegions(graph, componentIds, pass, cutEdges) {
    const cellById = new Map(graph.nodes.map(node => [node.id, node.cell]));
    const regions = [];
    let index = 1;

    for (const ids of componentIds) {
      const cells = ids.map(id => cellById.get(id)).filter(Boolean);
      if (!cells.length) continue;

      const cellIdSet = new Set(ids);
      const boundaryEdges = cutEdges.filter(edge => cellIdSet.has(edge.a) || cellIdSet.has(edge.b));
      const stats = regionStats(cells);

      regions.push({
        id: `region_pass${pass}_${index++}`,
        pass,
        cellIds: ids,
        cells,
        bbox: bboxForCells(cells),
        centroid: centroidForCells(cells),
        boundary: null,
        stats,
        evidence: evidenceForRegion(cells, boundaryEdges)
      });
    }

    return regions;
  }

  function partitionGraph(graph, pass = 1, options = {}) {
    const opts = { ...DEFAULTS, ...options };
    const weightKey = passWeightKey(pass);
    const threshold = thresholdForPass(pass, opts);
    const adjacency = new Map(graph.nodes.map(node => [node.id, []]));
    const cutEdges = [];

    for (const edge of graph.edges) {
      const weight = Number(edge.passWeights?.[weightKey] ?? edge.weight ?? 0);
      const cut = weight < threshold;
      edge.cut = cut;
      edge.activePass = pass;
      edge.activeWeight = weight;

      if (cut) {
        cutEdges.push(edge);
      } else {
        adjacency.get(edge.a)?.push(edge.b);
        adjacency.get(edge.b)?.push(edge.a);
      }
    }

    const visited = new Set();
    const components = [];

    for (const node of graph.nodes) {
      if (visited.has(node.id)) continue;
      const stack = [node.id];
      const ids = [];
      visited.add(node.id);

      while (stack.length) {
        const id = stack.pop();
        ids.push(id);
        for (const next of adjacency.get(id) || []) {
          if (visited.has(next)) continue;
          visited.add(next);
          stack.push(next);
        }
      }

      components.push(ids);
    }

    const minCellCount = Math.max(1, Math.floor(Number(opts.minCellCount) || DEFAULTS.minCellCount));
    const large = components.filter(ids => ids.length >= minCellCount);
    const tiny = components.filter(ids => ids.length < minCellCount);
    const mergedComponents = large.length ? large : components;

    if (large.length && tiny.length) {
      for (const ids of tiny) {
        mergedComponents.push(ids);
      }
    }

    const regions = buildRegions(graph, mergedComponents, pass, cutEdges);
    return {
      pass,
      threshold,
      weightKey,
      regions,
      cutEdges,
      warnings: tiny.length ? [`${tiny.length} tiny region(s) left unmerged for auditability.`] : []
    };
  }

  function runThreePassPartitions(graph, options = {}) {
    const pass1 = partitionGraph(graph, 1, options);
    const pass2 = partitionGraph(graph, 2, options);
    const pass3 = partitionGraph(graph, 3, options);

    return { pass1, pass2, pass3 };
  }

  window.GridWildNichePartition = {
    partitionGraph,
    runThreePassPartitions,
    passWeightKey,
    thresholdForPass
  };
})();
