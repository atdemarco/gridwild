// js/gw-fog.js
// -----------------------------------------------------------------------------
// GridWild three-layer fog system
//
// States:
// 1. unknown    = never visited/documented
// 2. surveyed  = physically entered recently, fades over time
// 3. documented = observation made here, permanently revealed
// -----------------------------------------------------------------------------

(function () {
  const STORAGE_KEY = "gw_fog_cells_v1";

  // 7 days for temporary survey reveal
  const SURVEY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  // After 24h, surveyed cells begin visually fading back toward fog
  const SURVEY_FULL_STRENGTH_MS = 24 * 60 * 60 * 1000;

  let cellStore = loadStore();
  let saveBatchDepth = 0;
  let saveBatchDirty = false;

  function nowMs() {
    return Date.now();
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      console.warn("GridWild fog store could not be loaded:", err);
      return {};
    }
  }

  function saveStore() {
    if (saveBatchDepth > 0) {
      saveBatchDirty = true;
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cellStore));
    } catch (err) {
      console.warn("GridWild fog store could not be saved:", err);
    }
  }

  function batchUpdates(fn) {
    if (typeof fn !== "function") return null;

    saveBatchDepth++;
    try {
      return fn();
    } finally {
      saveBatchDepth = Math.max(0, saveBatchDepth - 1);

      if (saveBatchDepth === 0 && saveBatchDirty) {
        saveBatchDirty = false;
        saveStore();
      }
    }
  }

  function getCell(key) {
    if (!key) return null;
    return cellStore[key] || null;
  }

  function ensureCell(key) {
    if (!cellStore[key]) {
      cellStore[key] = {
        visited_at: null,
        observed_at: null,
        obs_count: 0,
        species_count: 0
      };
    }
    return cellStore[key];
  }

  function markVisited(key, timestamp = nowMs()) {
    if (!key) return null;

    const cell = ensureCell(key);

    // Keep the most recent visit timestamp
    cell.visited_at = Math.max(Number(cell.visited_at) || 0, timestamp);

    saveStore();
    return cell;
  }

  function markObserved(key, options = {}) {
    if (!key) return null;

    const {
      timestamp = nowMs(),
      obsCountIncrement = 1,
      speciesCountIncrement = 0
    } = options;

    const cell = ensureCell(key);

    cell.observed_at = Math.max(Number(cell.observed_at) || 0, timestamp);
    cell.obs_count = Math.max(0, Number(cell.obs_count) || 0) + obsCountIncrement;
    cell.species_count =
      Math.max(0, Number(cell.species_count) || 0) + speciesCountIncrement;

    saveStore();
    return cell;
  }

  function getCellFogState(key, timestamp = nowMs()) {
    const cell = getCell(key);

    if (!cell) {
      return {
        state: "unknown",
        reveal: 0,
        fogOpacity: 0.72,
        cell: null
      };
    }

    // correct location???
    const recentINatObservedAt = Number(cell.recent_inat_observed_at) || 0;
    if (recentINatObservedAt > 0) {
    return {
        state: "documented",
        reveal: 1,
        fogOpacity: 0,
        cell
    };
    }

    const observedAt = Number(cell.observed_at) || 0;
    if (observedAt > 0) {
      return {
        state: "documented",
        reveal: 1,
        fogOpacity: 0,
        cell
      };
    }

    const visitedAt = Number(cell.visited_at) || 0;
    if (visitedAt <= 0) {
      return {
        state: "unknown",
        reveal: 0,
        fogOpacity: 0.72,
        cell
      };
    }

    const age = timestamp - visitedAt;

    if (age < 0 || age <= SURVEY_FULL_STRENGTH_MS) {
      return {
        state: "surveyed",
        reveal: 1,
        fogOpacity: 0.12,
        cell
      };
    }

    if (age >= SURVEY_TTL_MS) {
      return {
        state: "expired",
        reveal: 0,
        fogOpacity: 0.72,
        cell
      };
    }

    // Fade from mostly clear to foggy between 24h and 7d
    const fadeT =
      (age - SURVEY_FULL_STRENGTH_MS) /
      (SURVEY_TTL_MS - SURVEY_FULL_STRENGTH_MS);

    const reveal = Math.max(0, Math.min(1, 1 - fadeT));
    const fogOpacity = 0.08 + 0.28 * fadeT;

    return {
      state: "surveyed",
      reveal,
      fogOpacity,
      cell
    };
  }

  function getStats(timestamp = nowMs()) {
    let unknown = 0;
    let surveyed = 0;
    let documented = 0;
    let expired = 0;

    for (const key of Object.keys(cellStore)) {
      const s = getCellFogState(key, timestamp).state;
      if (s === "surveyed") surveyed++;
      else if (s === "documented") documented++;
      else if (s === "expired") expired++;
      else unknown++;
    }

    return {
      storedCells: Object.keys(cellStore).length,
      surveyed,
      documented,
      expired,
      unknown
    };
  }

  function clearAllFogProgress() {
    cellStore = {};
    saveStore();
  }

  function clearMovementExploration() {
  for (const [key, cell] of Object.entries(cellStore)) {
    delete cell.visited_at;

    const hasObserved =
      Number(cell.observed_at) > 0 ||
      Number(cell.recent_inat_observed_at) > 0;

    if (!hasObserved) {
      delete cellStore[key];
    }
  }

  saveStore();
}

  function clearRecentINatObserved() {
  for (const cell of Object.values(cellStore)) {
    delete cell.recent_inat_observed_at;
    delete cell.recent_inat_obs_count;
  }
  saveStore();
}

function markRecentINatObserved(key, options = {}) {
  if (!key) return null;

  const {
    timestamp = nowMs(),
    obsCountIncrement = 1
  } = options;

  const cell = ensureCell(key);

  cell.recent_inat_observed_at = Math.max(
    Number(cell.recent_inat_observed_at) || 0,
    timestamp
  );

  cell.recent_inat_obs_count =
    Math.max(0, Number(cell.recent_inat_obs_count) || 0) + obsCountIncrement;

  saveStore();
  return cell;
}

    window.GridWildFog = {
    markVisited,
    markObserved,
    markRecentINatObserved,
    clearRecentINatObserved,
    batchUpdates,
    clearMovementExploration,
    getCell,
    getCellFogState,
    getStats,
    clearAllFogProgress,
    constants: {
        SURVEY_TTL_MS,
        SURVEY_FULL_STRENGTH_MS
    }
    };

})();
