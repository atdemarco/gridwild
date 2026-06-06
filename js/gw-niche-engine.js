// js/gw-niche-engine.js
// Coordinator for current-field-of-view niche graph passes.

(function () {
  const DEFAULTS = {
    pass: 1,
    mode: "regions-pass1",
    trailMode: "corridor",
    neighborMode: 4,
    pass1Threshold: 0.45,
    pass2Threshold: 0.5,
    pass3Threshold: 0.55,
    minCellCount: 3,
    pass2NeighborhoodSize: 5,
    pass2NeighborhoodMinActiveCells: 2,
    pass2NeighborhoodMinObservations: 3
  };

  function nowMs() {
    return performance?.now?.() ?? Date.now();
  }

  function markTiming(timings, name, start) {
    timings[name] = Math.round((nowMs() - start) * 10) / 10;
  }

  function runNicheGraphPassesForCurrentView(options = {}) {
    const opts = { ...DEFAULTS, ...options };
    const warnings = [];
    const timings = {};
    let t = nowMs();

    console.time?.("GridWild niche graph debug");

    const visible = window.GridWildNicheOsmPriors.getVisibleGridCells(opts);
    warnings.push(...(visible.warnings || []));
    markTiming(timings, "visibleCellsMs", t);

    t = nowMs();
    const osmFeatures = window.GridWildOsmFeaturesLayer?.getFeatures?.() || null;
    const osmCacheStatus = window.GridWildOsmFeaturesLayer?.getCacheStatus?.() || null;
    if (osmCacheStatus && !osmCacheStatus.hasCoverage) {
      warnings.push("OSM cache does not fully cover the current viewport yet.");
    }
    const cells = window.GridWildNicheOsmPriors.computeOsmPriorsForCells(
      visible.cells,
      osmFeatures,
      opts
    );
    const osmPriorsSummary = window.GridWildNicheOsmPriors.summarizeOsmPriors(cells);
    markTiming(timings, "osmPriorsMs", t);

    t = nowMs();
    const graph = window.GridWildNicheGraph.buildCellAdjacencyGraph(cells, opts);
    markTiming(timings, "graphMs", t);

    t = nowMs();
    const partitions = window.GridWildNichePartition.runThreePassPartitions(graph, opts);
    markTiming(timings, "partitionMs", t);
    warnings.push(
      ...partitions.pass1.warnings,
      ...partitions.pass2.warnings,
      ...partitions.pass3.warnings
    );

    const result = {
      cells,
      osmPriorsSummary,
      graph,
      regionsPass1: partitions.pass1.regions,
      regionsPass2: partitions.pass2.regions,
      regionsPass3: partitions.pass3.regions,
      partitions,
      options: opts,
      debug: {
        warnings,
        timings,
        visibleStrideCells: visible.strideCells,
        osmCacheStatus
      }
    };

    console.timeEnd?.("GridWild niche graph debug");
    console.info?.("GridWild niche graph result", result);
    return result;
  }

  window.GridWildNicheEngine = {
    runNicheGraphPassesForCurrentView,
    defaults: DEFAULTS
  };

  window.runNicheGraphPassesForCurrentView = runNicheGraphPassesForCurrentView;
})();
