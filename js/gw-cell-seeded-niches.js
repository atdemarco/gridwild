// -----------------------------------------------------------------------------
// GridWild Cell-Seeded Niches
// Runtime-only niche construction from a single global 20 ft GridWild cell.
// -----------------------------------------------------------------------------

(function () {
  const ALGORITHM_VERSION = "cell_seeded_niche_v1";
  const GENERATED_BY = "gridwild_cell_seeded_niche_v1";
  const SPARKLE_STORAGE_KEY = "gw_cell_seeded_niche_sparkles_v1";
  const PANE = "gwCellSeededNicheSparklePane";
  const SEED_SEARCH_RADIUS_CELLS = 5;
  const GROW_RADIUS_CELLS = 13;
  const MAX_GROW_CELLS = 140;
  const SPARKLE_BUCKET_MS = 90000;
  const MIN_SPARKLE_ZOOM = 16;
  const GRID_SIZE_M = 20 * 0.3048;
  const TAXON_HYDRATION_TIMEOUT_MS = 1600;
  const LOCAL_NICHES_MODULE_TIMEOUT_MS = 2200;
  const NICHE_SAVE_TIMEOUT_MS = 2800;

  const state = {
    sparkleLayer: null,
    sparkleVisible: loadSparkleVisible(),
    sparkleRaf: null,
    sparkleTimer: null,
    lastSparkleSignature: "",
    deploying: false,
    deployCue: null
  };

  function clamp01(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function hashString(value) {
    let h = 2166136261;
    const s = String(value || "");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function hash01(value) {
    return hashString(value) / 4294967295;
  }

  function shortHash(value) {
    return hashString(value).toString(36).padStart(6, "0").slice(0, 8);
  }

  function cellKey(ix, iy) {
    return `${ix},${iy}`;
  }

  function parseCellKey(key) {
    const [ix, iy] = String(key || "")
      .split(",")
      .map(Number);
    return Number.isFinite(ix) && Number.isFinite(iy) ? { ix, iy, key: cellKey(ix, iy) } : null;
  }

  function gridApi() {
    return window.GridWildGrid || null;
  }

  function latLngToCell(latlng) {
    if (gridApi()?.latLngToCell) return gridApi().latLngToCell(latlng);
    const ll = Array.isArray(latlng) ? L.latLng(latlng[0], latlng[1]) : L.latLng(latlng);
    const p = map.options.crs.project(ll);
    return {
      ix: Math.floor(p.x / GRID_SIZE_M),
      iy: Math.floor(p.y / GRID_SIZE_M)
    };
  }

  function cellCenter(ix, iy) {
    const size = gridApi()?.gridSizeM || GRID_SIZE_M;
    const ll = map.options.crs.unproject(L.point((ix + 0.5) * size, (iy + 0.5) * size));
    return { lat: ll.lat, lng: ll.lng };
  }

  function cellBounds(ix, iy) {
    if (gridApi()?.cellBounds) return gridApi().cellBounds(ix, iy);
    const size = gridApi()?.gridSizeM || GRID_SIZE_M;
    const sw = map.options.crs.unproject(L.point(ix * size, iy * size));
    const ne = map.options.crs.unproject(L.point((ix + 1) * size, (iy + 1) * size));
    return { sw, ne };
  }

  function gridCornerLngLat(ix, iy) {
    const size = gridApi()?.gridSizeM || GRID_SIZE_M;
    const ll = map.options.crs.unproject(L.point(ix * size, iy * size));
    return [ll.lng, ll.lat];
  }

  function displayMetricsForCell(ix, iy) {
    const key = cellKey(ix, iy);

    if (typeof window.getGridWildRuntimeMetricsForCell === "function") {
      const metrics = window.getGridWildRuntimeMetricsForCell(ix, iy);
      if (metrics) return metrics;
    }

    const raw =
      window.__richGridMetrics?.get?.(key) || window.__staticGridCounts?.get?.(key) || null;

    if (typeof window.getDisplayMetricsForCell === "function") {
      return window.getDisplayMetricsForCell(ix, iy, raw);
    }

    const row = gridApi()?.cellsForBounds?.({
      minIx: ix,
      maxIx: ix,
      minIy: iy,
      maxIy: iy
    })?.[0];
    return row?.metrics || raw || null;
  }

  function logScale(value, max) {
    return clamp01(Math.log1p(Math.max(0, Number(value) || 0)) / Math.log1p(max));
  }

  function biodiversityScore(metrics) {
    if (!metrics) return 0;
    const count = Number(metrics.count) || 0;
    const species = Number(metrics.species || metrics.genera || metrics.genusRichness) || 0;
    const observers = Number(metrics.observers) || 0;
    if (count <= 0 && species <= 0 && observers <= 0) return 0;

    return clamp01(
      logScale(count, 32) * 0.34 + logScale(species, 24) * 0.5 + logScale(observers, 9) * 0.16
    );
  }

  function activeLensSignal(metrics, osm) {
    if (!metrics || !window.GWLenses?.compose) return 0;
    const styled = window.GWLenses.compose({ ...metrics, osm });
    if (!styled) return 0;
    return clamp01((Number(styled.fillOpacity) || 0) / 0.78);
  }

  function dominantIconic(metrics) {
    if (!metrics) return "Any";
    const direct = metrics.dominant_iconic || metrics.dominantTaxon;
    if (direct && direct !== "Unknown") return direct;

    let best = "Any";
    let bestCount = 0;
    for (const [name, count] of Object.entries(metrics.iconic_counts || metrics.taxonMix || {})) {
      const n = Number(count) || 0;
      if (n > bestCount && name && name !== "Unknown") {
        best = name;
        bestCount = n;
      }
    }
    return best;
  }

  function normalizeOsm(osm) {
    if (window.GridWildNicheOsmPriors?.normalizeOsmPrior) {
      return window.GridWildNicheOsmPriors.normalizeOsmPrior(osm || {});
    }
    return osm || {};
  }

  function osmForCell(ix, iy) {
    return normalizeOsm(window.GridWildOsmPriorsLayer?.getCell?.(ix, iy)?.osm || {});
  }

  function waterBoundaryScore(osm = {}) {
    const d = Number(osm.nearestWaterDistanceM);
    if (osm.insideWater) return 0.48;
    if (osm.isWetEdge) return 1;
    if (Number.isFinite(d) && d <= 18) return 0.72;
    if (Number.isFinite(d) && d <= 54) return 0.28;
    return 0;
  }

  function roadPenalty(osm = {}) {
    const cls = osm.roadBarrierClass;
    if (cls === "crossing" || cls === "strong") return 0.58;
    if (cls === "moderate") return 0.36;
    if (cls === "near" || cls === "weak") return 0.16;
    return 0;
  }

  function structurePenalty(osm = {}) {
    if (osm.insideBuilding) return 1;
    const d = Number(osm.distanceToBuildingM);
    return Number.isFinite(d) && d <= 8 ? 0.16 : 0;
  }

  function landuseBoost(osm = {}) {
    const cls = osm.landuseClass;
    if (cls === "wood" || cls === "park") return 0.08;
    if (cls === "grass") return 0.05;
    if (cls === "water") return 0.02;
    return 0;
  }

  function buildCellState(ix, iy) {
    const metrics = displayMetricsForCell(ix, iy);
    const osm = osmForCell(ix, iy);
    const bio = biodiversityScore(metrics);
    const water = waterBoundaryScore(osm);
    const lens = activeLensSignal(metrics, osm);
    const humanPenalty = roadPenalty(osm) + structurePenalty(osm);
    const intersectedBio = bio * (0.72 + 0.28 * water);
    const blocked = osm.insideBuilding === true;
    const score = blocked
      ? 0
      : clamp01(
          intersectedBio * 0.76 +
            lens * 0.14 +
            bio * water * 0.1 +
            landuseBoost(osm) -
            humanPenalty * 0.42
        );

    return {
      ix,
      iy,
      key: cellKey(ix, iy),
      center: cellCenter(ix, iy),
      metrics,
      osm,
      biodiversity: bio,
      water,
      lens,
      score,
      blocked,
      dominantIconic: dominantIconic(metrics),
      quietResidue: hash01(`${ix},${iy}:quiet-cell`)
    };
  }

  function neighborhoodStates(center, radiusCells) {
    const states = [];
    for (let iy = center.iy - radiusCells; iy <= center.iy + radiusCells; iy++) {
      for (let ix = center.ix - radiusCells; ix <= center.ix + radiusCells; ix++) {
        states.push(buildCellState(ix, iy));
      }
    }
    return states;
  }

  function chooseParsedSeed(clickedCell, radiusCells = SEED_SEARCH_RADIUS_CELLS) {
    const clicked = buildCellState(clickedCell.ix, clickedCell.iy);
    const states = neighborhoodStates(clickedCell, radiusCells);
    let best = clicked;
    let bestValue = -Infinity;

    for (const cell of states) {
      if (cell.blocked) continue;
      const dx = cell.ix - clickedCell.ix;
      const dy = cell.iy - clickedCell.iy;
      const distance = Math.hypot(dx, dy);
      const extremity =
        cell.score + cell.biodiversity * 0.16 + cell.water * cell.biodiversity * 0.08;
      const tieBreak =
        hash01(`${clicked.key || cellKey(clickedCell.ix, clickedCell.iy)}:${cell.key}`) * 0.0001;
      const value = extremity - distance * 0.006 + tieBreak;
      if (value > bestValue) {
        best = cell;
        bestValue = value;
      }
    }

    if (best.score <= 0.005 && clicked && !clicked.blocked) return clicked;
    return best;
  }

  function transitionSide(dx, dy) {
    if (dx === 1 && dy === 0) return ["east", "west"];
    if (dx === -1 && dy === 0) return ["west", "east"];
    if (dx === 0 && dy === 1) return ["north", "south"];
    if (dx === 0 && dy === -1) return ["south", "north"];
    return [null, null];
  }

  function hasRoadBarrierBetween(a, b, dx, dy) {
    if (!a || !b) return false;
    if (Math.abs(dx) + Math.abs(dy) === 1) {
      const [fromSide, toSide] = transitionSide(dx, dy);
      return Boolean(
        a.osm?.barrierBetweenNeighbors?.[fromSide] ||
        b.osm?.barrierBetweenNeighbors?.[toSide] ||
        a.osm?.roadBarrierClass === "crossing" ||
        b.osm?.roadBarrierClass === "crossing" ||
        a.osm?.roadBarrierClass === "strong" ||
        b.osm?.roadBarrierClass === "strong"
      );
    }

    return Boolean(
      a.osm?.roadBarrierClass === "crossing" ||
      b.osm?.roadBarrierClass === "crossing" ||
      a.osm?.roadBarrierClass === "strong" ||
      b.osm?.roadBarrierClass === "strong"
    );
  }

  function waterCrossingBlocked(a, b) {
    if (!a || !b) return false;
    if (a.osm?.insideWater === b.osm?.insideWater) return false;
    return !(a.water >= 0.7 && b.water >= 0.7);
  }

  function sameHabitat(a, b) {
    const ah = a.osm?.landuseClass || "unclassified";
    const bh = b.osm?.landuseClass || "unclassified";
    if (ah === bh && ah !== "unclassified") return 1;
    if (a.water >= 0.7 && b.water >= 0.7) return 0.8;
    return 0;
  }

  function linkScore(from, next, seed, dx, dy) {
    const diagonal = Math.abs(dx) === 1 && Math.abs(dy) === 1;
    if (next.blocked) return { score: 0, blocked: "structure" };
    if (hasRoadBarrierBetween(from, next, dx, dy)) return { score: 0, blocked: "road" };
    if (waterCrossingBlocked(from, next)) return { score: 0, blocked: "water" };

    const waterAffinity = 1 - Math.abs((seed.water || 0) - (next.water || 0));
    const habitatAffinity = sameHabitat(from, next);
    const taxonAffinity =
      next.dominantIconic !== "Any" && next.dominantIconic === seed.dominantIconic ? 0.12 : 0;
    const localRoadPenalty = Math.max(roadPenalty(from.osm), roadPenalty(next.osm));
    let score =
      next.score * 0.58 +
      Math.min(from.score, seed.score) * 0.16 +
      waterAffinity * 0.12 +
      habitatAffinity * 0.08 +
      taxonAffinity -
      localRoadPenalty * 0.18;

    if (diagonal) score *= 0.58;
    return { score: clamp01(score), blocked: null, diagonal };
  }

  function growFromSeed(seed) {
    const cache = new Map();
    const blocked = {
      road: 0,
      structure: 0,
      water: 0
    };
    let diagonalLinks = 0;

    function stateFor(ix, iy) {
      const key = cellKey(ix, iy);
      if (!cache.has(key)) cache.set(key, buildCellState(ix, iy));
      return cache.get(key);
    }

    const seedState = stateFor(seed.ix, seed.iy);
    if (seedState.score <= 0.005 || seedState.blocked) {
      return {
        cells: [seedState],
        blocked,
        diagonalLinks,
        threshold: 1,
        quiet: true
      };
    }

    const included = new Map([[seedState.key, seedState]]);
    const seen = new Set([seedState.key]);
    const frontier = [];
    const threshold = clamp(seedState.score * 0.36, 0.075, 0.32);
    const offsets = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1]
    ];

    function pushNeighbors(from) {
      for (const [dx, dy] of offsets) {
        const ix = from.ix + dx;
        const iy = from.iy + dy;
        const key = cellKey(ix, iy);
        if (seen.has(key)) continue;

        const dist = Math.hypot(ix - seedState.ix, iy - seedState.iy);
        if (dist > GROW_RADIUS_CELLS) continue;

        const next = stateFor(ix, iy);
        const link = linkScore(from, next, seedState, dx, dy);
        if (link.blocked) {
          blocked[link.blocked] += 1;
          seen.add(key);
          continue;
        }

        const priority = link.score - dist * 0.008 + hash01(`${seedState.key}:${key}`) * 0.0001;
        if (priority < threshold) {
          seen.add(key);
          continue;
        }

        frontier.push({
          key,
          cell: next,
          priority,
          diagonal: link.diagonal === true
        });
      }
    }

    pushNeighbors(seedState);

    while (frontier.length && included.size < MAX_GROW_CELLS) {
      frontier.sort((a, b) => b.priority - a.priority);
      const item = frontier.shift();
      if (!item || included.has(item.key)) continue;

      seen.add(item.key);
      included.set(item.key, item.cell);
      if (item.diagonal) diagonalLinks += 1;
      pushNeighbors(item.cell);
    }

    return {
      cells: [...included.values()],
      blocked,
      diagonalLinks,
      threshold,
      quiet: false
    };
  }

  function mean(values) {
    const nums = values.map(Number).filter(Number.isFinite);
    if (!nums.length) return 0;
    return nums.reduce((sum, value) => sum + value, 0) / nums.length;
  }

  function sum(values) {
    return values.reduce((total, value) => total + (Number(value) || 0), 0);
  }

  function isOnlineUnavailableError(err) {
    return (
      err?.code === "GRIDWILD_ONLINE_UNAVAILABLE" ||
      err?.onlineUnavailable === true ||
      window.GridWildOnline?.isUnavailableError?.(err) === true
    );
  }

  function withTimeout(promise, timeoutMs, fallback, label) {
    let settled = false;
    const guarded = Promise.resolve(promise)
      .then((value) => {
        settled = true;
        return value;
      })
      .catch((err) => {
        settled = true;
        if (label === "Cell-seeded niche save" && isOnlineUnavailableError(err)) {
          console.info(
            "Cell-seeded niche save deferred; keeping runtime niche until online gameplay is ready."
          );
        } else {
          console.warn(label || "Cell-seeded niche async step failed.", err);
        }
        return fallback;
      });

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (!settled) {
          console.warn(
            `${label || "Cell-seeded niche async step"} timed out after ${timeoutMs}ms; continuing with fallback.`
          );
          resolve(fallback);
        }
      }, timeoutMs);

      guarded.then((value) => {
        clearTimeout(timer);
        resolve(value);
      });
    });
  }

  function ensureLocalNichesModule() {
    if (window.GridWildLocalNiches?.addRuntimeNiche) {
      return Promise.resolve(window.GridWildLocalNiches);
    }
    if (typeof window.ensureGridWildLocalNichesLoaded === "function") {
      return window.ensureGridWildLocalNichesLoaded();
    }
    return Promise.resolve(null);
  }

  function addRuntimeNicheToHud(localNiches, niche, options = {}) {
    if (!localNiches?.addRuntimeNiche || !niche) return null;
    const added = localNiches.addRuntimeNiche(niche, options);
    window.GridWildHudTaxaFilter?.sync?.();
    return added;
  }

  async function addRuntimeNicheIfPossible(niche, options = {}) {
    let displayed = false;
    const modulePromise = ensureLocalNichesModule();
    const localNiches = await withTimeout(
      modulePromise,
      LOCAL_NICHES_MODULE_TIMEOUT_MS,
      null,
      "Local niches module load"
    );

    if (localNiches?.addRuntimeNiche) {
      displayed = true;
      return addRuntimeNicheToHud(localNiches, niche, options);
    }

    Promise.resolve(modulePromise)
      .then((lateLocalNiches) => {
        if (displayed || !lateLocalNiches?.addRuntimeNiche) return;
        displayed = true;
        addRuntimeNicheToHud(lateLocalNiches, niche, options);
      })
      .catch((err) => {
        console.warn("Cell-seeded niche display failed; Local Niches module unavailable.", err);
      });

    return null;
  }

  function addTaxonCount(map, name, count) {
    const key = String(name || "").trim();
    if (!key || /^unknown$/i.test(key)) return;
    map.set(key, (map.get(key) || 0) + (Number(count) || 0));
  }

  function topTaxonEntries(map, limit = 6) {
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, limit);
  }

  function taxonDisplayLabel(entry, rank) {
    if (!entry?.name) return "";
    const display = window.GridWildTaxonomy?.displayEntry?.(entry, rank);
    return display?.common || entry.name;
  }

  function primaryTaxonFromSummary(summary = {}) {
    const genus = Array.isArray(summary.genera) ? summary.genera[0] : null;
    if (genus?.name) {
      return {
        iconic: "Any",
        label: taxonDisplayLabel(genus, "genus") || genus.name,
        source_rank: "genus",
        source: "cell_seeded_runtime_taxonomy"
      };
    }

    const family = Array.isArray(summary.families) ? summary.families[0] : null;
    if (family?.name) {
      return {
        iconic: "Any",
        label: taxonDisplayLabel(family, "family") || family.name,
        source_rank: "family",
        source: "cell_seeded_runtime_taxonomy"
      };
    }

    const order = Array.isArray(summary.orders) ? summary.orders[0] : null;
    if (order?.name) {
      return {
        iconic: "Any",
        label: taxonDisplayLabel(order, "order") || order.name,
        source_rank: "order",
        source: "cell_seeded_runtime_taxonomy"
      };
    }

    return null;
  }

  function taxonomySummaryFromRecords(records = []) {
    const orderCounts = new Map();
    const familyCounts = new Map();
    const genusCounts = new Map();
    const iconicCounts = {};
    let rowCount = 0;

    for (const rec of records) {
      const rows = Array.isArray(rec?.genera) ? rec.genera : [];
      for (const row of rows) {
        const count = Number(row?.count) || 0;
        if (count <= 0) continue;
        rowCount += 1;
        addTaxonCount(orderCounts, row?.order_name, count);
        addTaxonCount(familyCounts, row?.family_name, count);
        addTaxonCount(genusCounts, row?.genus_name, count);
        const iconic = String(row?.iconic_taxon_name || "").trim();
        if (iconic && !/^unknown$/i.test(iconic)) {
          iconicCounts[iconic] = (iconicCounts[iconic] || 0) + count;
        }
      }
    }

    return {
      rowCount,
      iconicCounts,
      summary: {
        orders: topTaxonEntries(orderCounts, 6),
        families: topTaxonEntries(familyCounts, 6),
        genera: topTaxonEntries(genusCounts, 8)
      }
    };
  }

  function aggregateMetrics(cells, seed, clickedCell, grow) {
    const counts = cells.map((cell) => Number(cell.metrics?.count) || 0);
    const species = cells.map((cell) => Number(cell.metrics?.species || cell.metrics?.genera) || 0);
    const observers = cells.map((cell) => Number(cell.metrics?.observers) || 0);
    const activeCells = cells.filter((cell) => (Number(cell.metrics?.count) || 0) > 0).length;
    const dominantCounts = {};

    for (const cell of cells) {
      const iconic = cell.dominantIconic || "Any";
      if (iconic && iconic !== "Any") {
        dominantCounts[iconic] = (dominantCounts[iconic] || 0) + (Number(cell.metrics?.count) || 1);
      }
    }

    let dominant = "Any";
    let dominantCount = 0;
    for (const [iconic, count] of Object.entries(dominantCounts)) {
      if (count > dominantCount) {
        dominant = iconic;
        dominantCount = count;
      }
    }

    const biodiversity = mean(cells.map((cell) => cell.biodiversity));
    const waterBoundary = mean(cells.map((cell) => cell.water));
    const peak = Math.max(...cells.map((cell) => cell.score), 0);
    const roadBounded = cells.filter((cell) => roadPenalty(cell.osm) > 0).length;
    const wetEdgeCells = cells.filter((cell) => cell.osm?.isWetEdge).length;

    return {
      algorithm: ALGORITHM_VERSION,
      algorithm_version: ALGORITHM_VERSION,
      generated_by: GENERATED_BY,
      clicked_cell: cellKey(clickedCell.ix, clickedCell.iy),
      parsed_seed_cell: seed.key,
      core_cell: seed.key,
      peak_cell: seed.key,
      seed_search_radius_cells: SEED_SEARCH_RADIUS_CELLS,
      growth_radius_cells: GROW_RADIUS_CELLS,
      growth_threshold: Number(grow.threshold.toFixed(4)),
      component_cell_count: cells.length,
      totalCells: cells.length,
      active_cells: activeCells,
      activeRatio: cells.length ? activeCells / cells.length : 0,
      count: sum(counts),
      species: sum(species),
      observers: sum(observers),
      mean_count: mean(counts),
      mean_species: mean(species),
      biodiversity_score: Number(biodiversity.toFixed(4)),
      water_boundary_score: Number(waterBoundary.toFixed(4)),
      seed_score: Number(seed.score.toFixed(4)),
      peak_score: Number(peak.toFixed(4)),
      road_bounded_cells: roadBounded,
      wet_edge_cells: wetEdgeCells,
      diagonal_links: grow.diagonalLinks,
      blocked_edges: grow.blocked,
      quiet_seed: grow.quiet === true,
      active_lens: window.__gwState?.activeLens || "classic",
      heat_metric: window.__gwState?.heatMetric || "count",
      filter_signature: gridApi()?.activeFilterSignature?.() || "all",
      dominant_iconic: dominant,
      lens_vectors: {
        biodiversity: Number(seed.biodiversity.toFixed(4)),
        water_boundary: Number(seed.water.toFixed(4)),
        active_lens: Number(seed.lens.toFixed(4)),
        road_boundary_penalty: Number(roadPenalty(seed.osm).toFixed(4)),
        structure_penalty: Number(structurePenalty(seed.osm).toFixed(4))
      }
    };
  }

  function themeFor(metrics) {
    if (metrics.quiet_seed) return "quiet cell";
    if (metrics.wet_edge_cells > 0 || metrics.water_boundary_score >= 0.36)
      return "wet-edge biodiversity";
    if (metrics.road_bounded_cells > 0 || metrics.blocked_edges?.road > 0)
      return "road-bounded biodiversity";
    if (metrics.biodiversity_score >= 0.34) return "biodiversity patch";
    return "cell-seeded biodiversity";
  }

  function typeFor(metrics) {
    if (metrics.water_boundary_score >= 0.32 || metrics.wet_edge_cells > 0)
      return "edge_habitat_niche";
    if (metrics.biodiversity_score >= 0.38 || metrics.species >= 10) return "high_richness_hotspot";
    return "under_sampled_nearby_opportunity";
  }

  function placeContextFor(seed, cells) {
    const visible = visibleOsmPlaceContext(seed.center);
    if (visible?.primary_label) return visible;

    const named = [seed, ...cells].find((cell) => cell.osm?.nearestPlaceName);
    if (named?.osm?.nearestPlaceName) {
      return {
        primary_label: named.osm.nearestPlaceName,
        label_confidence: 0.66,
        place_type: "osm-nearby-place",
        spatial_relation: seed.water >= 0.6 ? "beside" : "near",
        label_source: "cell_seeded_osm_prior",
        centroid: seed.center
      };
    }

    return {
      primary_label: `Grid ${seed.ix},${seed.iy}`,
      label_confidence: 0.32,
      place_type: "global-grid-cell",
      spatial_relation: "around",
      label_source: "cell_seeded_grid",
      centroid: seed.center
    };
  }

  function taxonFocusFor(metrics) {
    if (metrics.primary_taxa_label) {
      return {
        iconic: metrics.dominant_iconic || "Any",
        label: metrics.primary_taxa_label,
        source_rank: metrics.primary_taxa_rank || null,
        source: "cell_seeded_runtime_taxonomy"
      };
    }

    const iconic = metrics.dominant_iconic || "Any";
    return {
      iconic,
      label: iconic === "Any" ? "local life" : iconic,
      source: "cell_seeded_runtime_metrics"
    };
  }

  function evidenceFor(metrics, clickedCell, seed) {
    const facts = [];
    facts.push(
      `Seeded from global 20 ft cell ${cellKey(clickedCell.ix, clickedCell.iy)}; parsed ${seed.key} as the strongest cell within a 5-cell radius.`
    );
    facts.push(
      `Growth linked ${metrics.component_cell_count} contiguous cell${metrics.component_cell_count === 1 ? "" : "s"} using biodiversity intersected with OSM water-boundary context.`
    );
    if (metrics.diagonal_links > 0)
      facts.push(
        `${metrics.diagonal_links} diagonal link${metrics.diagonal_links === 1 ? "" : "s"} survived the weak-diagonal penalty.`
      );
    if ((metrics.blocked_edges?.road || 0) > 0)
      facts.push(
        `${metrics.blocked_edges.road} road-boundary expansion${metrics.blocked_edges.road === 1 ? "" : "s"} were blocked.`
      );
    if ((metrics.blocked_edges?.structure || 0) > 0)
      facts.push(
        `${metrics.blocked_edges.structure} structure-overlap expansion${metrics.blocked_edges.structure === 1 ? "" : "s"} were cut off.`
      );
    if (metrics.quiet_seed)
      facts.push(
        "No strong biodiversity evidence was cached nearby, so this remains a one-cell quiet niche definition."
      );
    return facts;
  }

  function componentCentroid(cells) {
    const weights = cells.map((cell) => Math.max(0.18, cell.score));
    const weightTotal = sum(weights);
    if (weightTotal <= 0) return cells[0]?.center || null;

    let lat = 0;
    let lng = 0;
    cells.forEach((cell, index) => {
      lat += cell.center.lat * weights[index];
      lng += cell.center.lng * weights[index];
    });
    return { lat: lat / weightTotal, lng: lng / weightTotal };
  }

  function boundaryEdges(cells) {
    const keys = new Set(cells.map((cell) => cell.key));
    const edges = [];

    for (const cell of cells) {
      const { ix, iy } = cell;
      const sides = [
        { n: cellKey(ix, iy - 1), a: [ix, iy], b: [ix + 1, iy] },
        { n: cellKey(ix + 1, iy), a: [ix + 1, iy], b: [ix + 1, iy + 1] },
        { n: cellKey(ix, iy + 1), a: [ix + 1, iy + 1], b: [ix, iy + 1] },
        { n: cellKey(ix - 1, iy), a: [ix, iy + 1], b: [ix, iy] }
      ];

      for (const side of sides) {
        if (!keys.has(side.n)) edges.push(side);
      }
    }
    return edges;
  }

  function pointKey(point) {
    return `${point[0]},${point[1]}`;
  }

  function geometryForCells(cells) {
    if (!cells.length) return null;
    const edges = boundaryEdges(cells).map((edge) => ({ ...edge, used: false }));
    const byStart = new Map();
    for (const edge of edges) {
      const start = pointKey(edge.a);
      if (!byStart.has(start)) byStart.set(start, []);
      byStart.get(start).push(edge);
    }

    const rings = [];
    for (const edge of edges) {
      if (edge.used) continue;
      const ring = [edge.a];
      let current = edge;
      current.used = true;
      let guard = 0;

      while (current && guard++ < edges.length + 4) {
        ring.push(current.b);
        const nextKey = pointKey(current.b);
        if (nextKey === pointKey(ring[0])) break;
        const next = (byStart.get(nextKey) || []).find((candidate) => !candidate.used);
        if (!next) break;
        next.used = true;
        current = next;
      }

      if (ring.length >= 5 && pointKey(ring[0]) === pointKey(ring[ring.length - 1])) {
        rings.push(ring.map(([ix, iy]) => gridCornerLngLat(ix, iy)));
      }
    }

    if (!rings.length) {
      const minIx = Math.min(...cells.map((cell) => cell.ix));
      const maxIx = Math.max(...cells.map((cell) => cell.ix));
      const minIy = Math.min(...cells.map((cell) => cell.iy));
      const maxIy = Math.max(...cells.map((cell) => cell.iy));
      rings.push([
        gridCornerLngLat(minIx, minIy),
        gridCornerLngLat(maxIx + 1, minIy),
        gridCornerLngLat(maxIx + 1, maxIy + 1),
        gridCornerLngLat(minIx, maxIy + 1),
        gridCornerLngLat(minIx, minIy)
      ]);
    }

    rings.sort((a, b) => b.length - a.length);
    return {
      type: "Polygon",
      coordinates: rings
    };
  }

  function sourceKeyFor(clickedCell, seed, metrics) {
    const filterHash = shortHash(
      `${metrics.active_lens}|${metrics.heat_metric}|${metrics.filter_signature}`
    );
    return `cell-seeded:${ALGORITHM_VERSION}:${filterHash}:${cellKey(clickedCell.ix, clickedCell.iy)}:${seed.key}`;
  }

  function titleFor(metrics, placeContext) {
    const place = placeContext?.primary_label || "this cell";
    const focus =
      metrics.primary_taxa_label ||
      (metrics.dominant_iconic && metrics.dominant_iconic !== "Any"
        ? metrics.dominant_iconic
        : "life");
    if (metrics.quiet_seed) return `Mark quiet cell near ${place}`;
    if (metrics.water_boundary_score >= 0.36) return `Trace wet-edge ${focus} near ${place}`;
    if (metrics.road_bounded_cells > 0) return `Sample road-bounded ${focus} near ${place}`;
    return `Sample cell-seeded ${focus} near ${place}`;
  }

  function featureLabel(feature) {
    const tags = feature?.tags || {};
    return tags.name || tags["addr:housename"] || tags.brand || tags.operator || "";
  }

  function featureKindLabel(kind, feature) {
    const tags = feature?.tags || {};
    if (kind === "water") return tags.waterway ? "stream / waterway" : "waterbody";
    if (kind === "parks")
      return tags.leisure === "garden" ? "garden / park" : "park / natural feature";
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

  function visibleOsmPlaceContext(center) {
    if (!center || typeof L === "undefined") return null;
    const groups = window.GridWildOsmFeaturesLayer?.getFeatures?.() || {};
    const priority = [
      { kind: "buildings", maxM: 70, base: 0.9 },
      { kind: "water", maxM: 110, base: 0.86 },
      { kind: "parks", maxM: 150, base: 0.8 },
      { kind: "trails", maxM: 95, base: 0.78 }
    ];
    const candidates = [];

    for (const rule of priority) {
      for (const feature of groups[rule.kind] || []) {
        const label = featureLabel(feature);
        if (!label) continue;
        const distanceM = minDistanceToFeature(center.lat, center.lng, feature);
        if (!Number.isFinite(distanceM) || distanceM > rule.maxM) continue;
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
    if (!best) return null;

    return {
      primary_label: best.label,
      secondary_label: null,
      place_type: featureKindLabel(best.kind, best.feature),
      nearby_poi: best.kind === "buildings" ? best.label : null,
      osm_feature_ids: [best.feature.id].filter(Boolean),
      spatial_relation:
        best.kind === "water"
          ? "beside"
          : best.kind === "trails"
            ? "along"
            : best.kind === "buildings" && best.distanceM < 30
              ? "at"
              : "near",
      distance_m: Math.round(best.distanceM),
      centroid: center,
      label_confidence: Number(best.confidence.toFixed(2)),
      label_source: "cell_seeded_visible_osm_context"
    };
  }

  function buildNiche(clickedCell, seed, grow) {
    const cells = grow.cells;
    const metrics = aggregateMetrics(cells, seed, clickedCell, grow);
    const centroid = componentCentroid(cells) || seed.center;
    const placeContext = placeContextFor(seed, cells);
    const theme = themeFor(metrics);
    const title = titleFor(metrics, placeContext);
    const confidence = clamp01(
      0.28 +
        metrics.biodiversity_score * 0.38 +
        metrics.water_boundary_score * 0.18 +
        Math.min(0.16, (metrics.active_cells / Math.max(1, metrics.component_cell_count)) * 0.16)
    );

    return {
      source_key: sourceKeyFor(clickedCell, seed, metrics),
      title,
      short_title: title.replace(/^(Sample|Trace|Mark)\s+/i, ""),
      description: "A runtime niche grown from one globally anchored 20 ft GridWild cell.",
      niche_type: typeFor(metrics),
      theme,
      centroid_lat: centroid.lat,
      centroid_lng: centroid.lng,
      geometry: geometryForCells(cells),
      grid_cell_ids: cells.map((cell) => cell.key),
      radius_m: Math.round(Math.max(12, Math.sqrt(Math.max(1, cells.length)) * GRID_SIZE_M * 0.82)),
      scale_level: `cell-seeded:${cells.length > 4 ? "patch" : "micro"}`,
      taxon_focus: taxonFocusFor(metrics),
      seasonal_profile: {
        mode: ALGORITHM_VERSION,
        runtime_seeded: true
      },
      evidence_summary: {
        human: evidenceFor(metrics, clickedCell, seed),
        algorithm: ALGORITHM_VERSION,
        clicked_cell: cellKey(clickedCell.ix, clickedCell.iy),
        parsed_seed_cell: seed.key
      },
      metrics,
      confidence,
      novelty_score: clamp01(0.66 - confidence * 0.34 + (metrics.quiet_seed ? 0.18 : 0)),
      sampling_need_score: clamp01(1 - metrics.activeRatio * 0.72),
      biodiversity_score: clamp01(metrics.biodiversity_score),
      questability_score: clamp01(
        confidence * 0.62 + Math.min(0.34, metrics.component_cell_count / 28)
      ),
      place_context: placeContext,
      primary_place_label: placeContext.primary_label || null,
      secondary_place_label: null,
      place_label_confidence: placeContext.label_confidence || 0,
      generated_by: GENERATED_BY,
      visibility: "public",
      status: "active",
      comment_count: 0,
      _runtimeOnly: true
    };
  }

  function generateFromClickedCell(clickedCell) {
    const clicked = {
      ix: Number(clickedCell.ix),
      iy: Number(clickedCell.iy),
      key: cellKey(clickedCell.ix, clickedCell.iy)
    };
    const seed = chooseParsedSeed(clicked);
    const grow = growFromSeed(seed);
    return buildNiche(clicked, seed, grow);
  }

  async function hydrateNicheCreationTaxa(niche) {
    const loadSquareRecord =
      typeof getSquareGeneraRecord === "function"
        ? getSquareGeneraRecord
        : window.getSquareGeneraRecord;
    if (!niche || typeof loadSquareRecord !== "function") return niche;

    const cells = (niche.grid_cell_ids || []).map(parseCellKey).filter(Boolean).slice(0, 140);
    if (!cells.length) return niche;

    try {
      const records = (
        await Promise.all(cells.map((cell) => loadSquareRecord(cell.ix, cell.iy).catch(() => null)))
      ).filter(Boolean);
      if (!records.length) return niche;

      const { rowCount, iconicCounts, summary } = taxonomySummaryFromRecords(records);
      const mergedMetrics = window.GWMetrics?.mergeSquareMetrics?.(records) || null;
      const primaryTaxon = primaryTaxonFromSummary(summary);
      const dominantIconic =
        Object.entries(iconicCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
        mergedMetrics?.dominant_iconic ||
        niche.metrics?.dominant_iconic ||
        "Any";

      const metrics = {
        ...(niche.metrics || {}),
        ...(mergedMetrics
          ? {
              count: Math.max(Number(niche.metrics?.count) || 0, Number(mergedMetrics.count) || 0),
              species: Math.max(
                Number(niche.metrics?.species) || 0,
                Number(mergedMetrics.species || mergedMetrics.genera) || 0
              ),
              observers: Math.max(
                Number(niche.metrics?.observers) || 0,
                Number(mergedMetrics.observers) || 0
              ),
              month_totals: mergedMetrics.month_totals || niche.metrics?.month_totals,
              peak_month: mergedMetrics.peak_month || niche.metrics?.peak_month,
              seasonal_strength:
                mergedMetrics.seasonal_strength ?? niche.metrics?.seasonal_strength,
              last_observed: mergedMetrics.last_observed || niche.metrics?.last_observed,
              median_last10_observed:
                mergedMetrics.median_last10_observed || niche.metrics?.median_last10_observed,
              last_observed_ms:
                Number(mergedMetrics.last_observed_ms) ||
                Number(niche.metrics?.last_observed_ms) ||
                0,
              median_last10_observed_ms:
                Number(mergedMetrics.median_last10_observed_ms) ||
                Number(niche.metrics?.median_last10_observed_ms) ||
                0
            }
          : {}),
        iconic_counts: {
          ...(niche.metrics?.iconic_counts || {}),
          ...iconicCounts
        },
        iconic_n: Object.keys(iconicCounts).length || niche.metrics?.iconic_n || 0,
        dominant_iconic: dominantIconic,
        taxonomy_summary: summary,
        taxonomy_hydrated_cells: records.length,
        taxonomy_row_count: rowCount,
        primary_taxa_label: primaryTaxon?.label || niche.metrics?.primary_taxa_label || null,
        primary_taxa_rank: primaryTaxon?.source_rank || niche.metrics?.primary_taxa_rank || null
      };

      const taxon_focus = primaryTaxon
        ? { ...primaryTaxon, iconic: dominantIconic }
        : taxonFocusFor(metrics);
      const title = titleFor(metrics, niche.place_context);

      return {
        ...niche,
        title,
        short_title: title.replace(/^(Sample|Trace|Mark)\s+/i, ""),
        taxon_focus,
        metrics,
        biodiversity_score: clamp01(metrics.biodiversity_score),
        evidence_summary: {
          ...(niche.evidence_summary || {}),
          taxonomy: [
            `Hydrated ${records.length} grown cell${records.length === 1 ? "" : "s"} from genera superchunks at niche creation.`,
            primaryTaxon?.label ? `Primary HUD taxon: ${primaryTaxon.label}.` : ""
          ].filter(Boolean)
        }
      };
    } catch (err) {
      console.warn("Cell-seeded niche taxonomy hydration failed.", err);
      return niche;
    }
  }

  async function saveIfPossible(niche) {
    if (!window.GridWildAPI?.upsertLocalNiches) return niche;
    try {
      const saved = await withTimeout(
        window.GridWildAPI.upsertLocalNiches([niche]),
        NICHE_SAVE_TIMEOUT_MS,
        null,
        "Cell-seeded niche save"
      );
      if (!saved) return niche;
      const row = saved?.niches?.[0];
      if (!row) return niche;
      const metrics = {
        ...(niche.metrics || {}),
        ...(row.metrics || {})
      };
      if (!metrics.taxonomy_summary && niche.metrics?.taxonomy_summary) {
        metrics.taxonomy_summary = niche.metrics.taxonomy_summary;
      }
      if (!metrics.primary_taxa_label && niche.metrics?.primary_taxa_label) {
        metrics.primary_taxa_label = niche.metrics.primary_taxa_label;
        metrics.primary_taxa_rank =
          niche.metrics.primary_taxa_rank || metrics.primary_taxa_rank || null;
      }
      const title = titleFor(metrics, row.place_context || niche.place_context);
      return {
        ...niche,
        ...row,
        title,
        short_title: title.replace(/^(Sample|Trace|Mark)\s+/i, ""),
        taxon_focus: niche.taxon_focus || row.taxon_focus,
        metrics,
        evidence_summary: {
          ...(niche.evidence_summary || {}),
          ...(row.evidence_summary || {})
        },
        place_context: row.place_context || niche.place_context,
        _runtimeOnly: false
      };
    } catch (err) {
      console.warn("Cell-seeded niche save failed; using runtime object.", err);
      return niche;
    }
  }

  async function persistPlantedNiche(niche) {
    const saved = await saveIfPossible(niche);
    if (!saved || saved._runtimeOnly !== false) return;

    await addRuntimeNicheIfPossible(saved, {
      openDetail: false,
      select: true
    });
  }

  function waitForPaint() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  function clearDeployCue() {
    if (!state.deployCue) return;
    try {
      state.sparkleLayer?.removeLayer?.(state.deployCue);
      map.removeLayer(state.deployCue);
    } catch {}
    state.deployCue = null;
    document.body?.classList?.remove?.("gw-cell-niche-is-calculating");
  }

  function showDeployCue(clickedCell) {
    clearDeployCue();
    injectStyles();
    const center = cellCenter(clickedCell.ix, clickedCell.iy);
    const size = 42;
    const icon = L.divIcon({
      className: "",
      html: `
        <span class="gw-cell-niche-working" aria-hidden="true">
          <span></span>
        </span>
      `,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
    state.deployCue = L.marker([center.lat, center.lng], {
      pane: PANE,
      icon,
      interactive: false,
      keyboard: false,
      zIndexOffset: 120
    }).addTo(ensureSparkleLayer());
    document.body?.classList?.add?.("gw-cell-niche-is-calculating");
  }

  async function deployFromCell(clickedCell, options = {}) {
    if (state.deploying) return null;
    state.deploying = true;

    try {
      window.GridWildOsmFeaturesLayer?.scheduleFetch?.();
      showDeployCue(clickedCell);
      await waitForPaint();
      const niche = generateFromClickedCell(clickedCell);
      const hydrated = await withTimeout(
        hydrateNicheCreationTaxa(niche),
        TAXON_HYDRATION_TIMEOUT_MS,
        niche,
        "Cell-seeded niche taxonomy hydration"
      );
      await addRuntimeNicheIfPossible(hydrated, {
        openDetail: options.openDetail === true,
        select: true
      });
      persistPlantedNiche(hydrated).catch((err) => {
        console.warn("Cell-seeded niche background persistence failed.", err);
      });

      if (typeof window.showGridWildToast === "function") {
        const n = Number(
          hydrated.metrics?.component_cell_count || hydrated.grid_cell_ids?.length || 1
        );
        window.showGridWildToast(
          `Niche parsed from ${hydrated.metrics?.parsed_seed_cell || clickedCell.key}: ${n} cell${n === 1 ? "" : "s"}`
        );
      }

      return hydrated;
    } finally {
      clearDeployCue();
      state.deploying = false;
    }
  }

  function deployFromLatLng(latlng, options = {}) {
    const cell = latLngToCell(latlng);
    return deployFromCell(cell, options);
  }

  function ensureSparkleLayer() {
    if (state.sparkleLayer) return state.sparkleLayer;
    if (!map.getPane(PANE)) {
      map.createPane(PANE);
      map.getPane(PANE).style.zIndex = "674";
      map.getPane(PANE).style.pointerEvents = "auto";
    }
    state.sparkleLayer = L.layerGroup([], { pane: PANE }).addTo(map);
    return state.sparkleLayer;
  }

  function injectStyles() {
    if (document.getElementById("gwCellSeededNicheStyles")) return;
    const style = document.createElement("style");
    style.id = "gwCellSeededNicheStyles";
    style.textContent = `
      .gw-cell-niche-sparkle {
        position: relative;
        width: var(--spark-size, 12px);
        height: var(--spark-size, 12px);
        transform: translate(-50%, -50%);
        pointer-events: auto;
      }

      .gw-cell-niche-sparkle::before,
      .gw-cell-niche-sparkle::after {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: 999px;
        background:
          radial-gradient(circle, rgba(255,255,236,0.98) 0 18%, rgba(147,225,182,0.72) 28%, rgba(147,225,182,0.0) 68%);
        box-shadow:
          0 0 9px rgba(147,225,182,0.58),
          0 0 18px rgba(240,209,138,0.24);
        animation: gw-cell-niche-sparkle-pulse 22s ease-in-out infinite;
        animation-delay: var(--spark-delay, 0s);
      }

      .gw-cell-niche-sparkle::after {
        inset: 22%;
        border-radius: 2px;
        transform: rotate(45deg);
        background: rgba(255,246,196,0.88);
        box-shadow: 0 0 10px rgba(255,246,196,0.45);
        animation-duration: 31s;
      }

      @keyframes gw-cell-niche-sparkle-pulse {
        0%, 100% { opacity: 0.18; transform: scale(0.72); }
        45% { opacity: 0.82; transform: scale(1.18); }
        70% { opacity: 0.34; transform: scale(0.92); }
      }

      .gw-cell-niche-working {
        position: relative;
        display: block;
        width: 42px;
        height: 42px;
        border-radius: 999px;
        transform: translateZ(0);
        background:
          radial-gradient(circle, rgba(255,246,196,0.96) 0 9%, rgba(118,231,191,0.55) 20%, rgba(118,231,191,0.10) 52%, rgba(118,231,191,0) 72%);
        box-shadow:
          0 0 0 1px rgba(255,246,196,0.50),
          0 0 18px rgba(118,231,191,0.42),
          0 0 30px rgba(255,224,142,0.20);
        animation: gw-cell-niche-working-pulse 1.15s ease-in-out infinite;
      }

      .gw-cell-niche-working::before,
      .gw-cell-niche-working::after,
      .gw-cell-niche-working span {
        content: "";
        position: absolute;
        border-radius: inherit;
        inset: 5px;
        border: 1px solid rgba(255,246,196,0.64);
        animation: gw-cell-niche-working-ring 1.5s ease-out infinite;
      }

      .gw-cell-niche-working::after {
        inset: 11px;
        border-color: rgba(118,231,191,0.58);
        animation-delay: 0.32s;
      }

      .gw-cell-niche-working span {
        inset: 17px;
        border-color: rgba(255,255,255,0.78);
        animation-delay: 0.62s;
      }

      .gw-cell-niche-is-calculating .leaflet-container {
        cursor: progress;
      }

      @keyframes gw-cell-niche-working-pulse {
        0%, 100% { opacity: 0.72; transform: scale(0.88); }
        50% { opacity: 1; transform: scale(1.06); }
      }

      @keyframes gw-cell-niche-working-ring {
        0% { opacity: 0.86; transform: scale(0.66); }
        100% { opacity: 0; transform: scale(1.6); }
      }
    `;
    document.head.appendChild(style);
  }

  function viewportCellBounds(padCells = 1) {
    const b = map.getBounds();
    const sw = latLngToCell(b.getSouthWest());
    const ne = latLngToCell(b.getNorthEast());
    return {
      minIx: Math.min(sw.ix, ne.ix) - padCells,
      maxIx: Math.max(sw.ix, ne.ix) + padCells,
      minIy: Math.min(sw.iy, ne.iy) - padCells,
      maxIy: Math.max(sw.iy, ne.iy) + padCells
    };
  }

  function sparkleSignature(bounds, bucket) {
    return [
      bounds.minIx,
      bounds.maxIx,
      bounds.minIy,
      bounds.maxIy,
      bucket,
      window.__gwState?.activeLens || "classic",
      gridApi()?.activeFilterSignature?.() || "all"
    ].join("|");
  }

  function sparkleCandidates() {
    if (map.getZoom() < MIN_SPARKLE_ZOOM) return [];
    const bounds = viewportCellBounds(1);
    const bucket = Math.floor(Date.now() / SPARKLE_BUCKET_MS);
    const count = Math.max(
      1,
      (bounds.maxIx - bounds.minIx + 1) * (bounds.maxIy - bounds.minIy + 1)
    );
    const stride = count > 7500 ? 3 : count > 3200 ? 2 : 1;
    const candidates = [];

    for (let iy = bounds.minIy; iy <= bounds.maxIy; iy += stride) {
      for (let ix = bounds.minIx; ix <= bounds.maxIx; ix += stride) {
        const cell = buildCellState(ix, iy);
        if (cell.blocked) continue;

        const interesting = cell.score;
        const quietChance = interesting <= 0.015 ? 0.0012 + cell.quietResidue * 0.0014 : 0;
        const density = 0.0018 + quietChance + Math.pow(interesting, 1.65) * 0.052;
        const roll = hash01(`${cell.key}:${bucket}:sparkle`);
        if (roll > density) continue;

        candidates.push({
          cell,
          score: interesting + (1 - roll) * 0.09 + cell.quietResidue * 0.025
        });
      }
    }

    const maxSparkles = clamp(Math.round(Math.sqrt(count) * 0.6), 4, 28);
    return candidates.sort((a, b) => b.score - a.score).slice(0, maxSparkles);
  }

  function renderSparklesNow() {
    state.sparkleRaf = null;
    injectStyles();
    const layer = ensureSparkleLayer();
    layer.clearLayers();

    if (!state.sparkleVisible) return;
    const candidates = sparkleCandidates();
    for (const item of candidates) {
      const size = Math.round(8 + clamp01(item.score) * 10);
      const delay = -Math.round(hash01(`${item.cell.key}:delay`) * 2200) / 100;
      const icon = L.divIcon({
        className: "",
        html: `<span class="gw-cell-niche-sparkle" style="--spark-size:${size}px;--spark-delay:${delay}s"></span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
      });
      const marker = L.marker([item.cell.center.lat, item.cell.center.lng], {
        pane: PANE,
        icon,
        interactive: true,
        keyboard: false,
        zIndexOffset: 40
      });
      marker.on("dblclick", (evt) => {
        if (evt && L.DomEvent) L.DomEvent.stop(evt);
        deployFromCell(item.cell, { openDetail: false });
      });
      marker.addTo(layer);
    }
  }

  function scheduleSparkles() {
    if (!state.sparkleVisible) {
      state.sparkleLayer?.clearLayers();
      return;
    }

    const bounds = viewportCellBounds(1);
    const bucket = Math.floor(Date.now() / SPARKLE_BUCKET_MS);
    const signature = sparkleSignature(bounds, bucket);
    if (signature === state.lastSparkleSignature && state.sparkleLayer?.getLayers?.().length)
      return;
    state.lastSparkleSignature = signature;

    if (state.sparkleRaf) return;
    state.sparkleRaf = requestAnimationFrame(renderSparklesNow);
  }

  function saveSparkleVisible() {
    window.__gwState = window.__gwState || {};
    window.__gwState.showNicheSparkles = state.sparkleVisible;
    try {
      localStorage.setItem(SPARKLE_STORAGE_KEY, state.sparkleVisible ? "1" : "0");
    } catch {}
    window.dispatchEvent(
      new CustomEvent("gridwild:nichesparklechange", {
        detail: { showNicheSparkles: state.sparkleVisible }
      })
    );
  }

  function loadSparkleVisible() {
    try {
      const saved = localStorage.getItem(SPARKLE_STORAGE_KEY);
      if (saved === "0") return false;
      if (saved === "1") return true;
    } catch {}
    return window.__gwState?.showNicheSparkles === true;
  }

  function setSparklesVisible(show, options = {}) {
    state.sparkleVisible = show === true;
    saveSparkleVisible();
    if (!state.sparkleVisible) {
      state.sparkleLayer?.clearLayers();
    } else {
      ensureSparkleLayer();
      scheduleSparkles();
    }
    if (!options.silent && typeof window.showGridWildToast === "function") {
      window.showGridWildToast(`Niche sparkle ${state.sparkleVisible ? "on" : "off"}`);
    }
    return state.sparkleVisible;
  }

  function toggleSparkles(options = {}) {
    return setSparklesVisible(!state.sparkleVisible, options);
  }

  function claimsMapDoubleClick() {
    return false;
  }

  function bindMap() {
    if (bindMap.bound || typeof map === "undefined") return;
    bindMap.bound = true;

    map.doubleClickZoom?.disable?.();

    map.on("moveend zoomend resize", scheduleSparkles);
    window.addEventListener("gwOsmFeaturesUpdated", () => {
      state.lastSparkleSignature = "";
      scheduleSparkles();
    });
    window.addEventListener("gridwild:filterschange", () => {
      state.lastSparkleSignature = "";
      scheduleSparkles();
    });
    window.addEventListener("gridwild:heatchange", () => {
      state.lastSparkleSignature = "";
      scheduleSparkles();
    });

    clearInterval(state.sparkleTimer);
    state.sparkleTimer = setInterval(() => {
      state.lastSparkleSignature = "";
      scheduleSparkles();
    }, 15000);
  }

  function init() {
    window.__gwState = window.__gwState || {};
    state.sparkleVisible = loadSparkleVisible();
    window.__gwState.showNicheSparkles = state.sparkleVisible;
    injectStyles();
    bindMap();
    ensureSparkleLayer();
    if (state.sparkleVisible) scheduleSparkles();
  }

  window.GridWildCellSeededNiches = {
    ALGORITHM_VERSION,
    deployFromCell,
    deployFromLatLng,
    generateFromClickedCell,
    renderSparkles: renderSparklesNow,
    scheduleSparkles,
    setSparklesVisible,
    sparkleCandidates,
    sparklesVisible: () => state.sparkleVisible,
    toggleSparkles,
    claimsMapDoubleClick
  };

  document.addEventListener("DOMContentLoaded", init);
  if (document.readyState !== "loading") setTimeout(init, 0);
})();
