// GridWild Patches
// First-class human-imposed field boundaries, backed by local storage for now.

(function () {
  const PATCHES_KEY = "gw_field_patches_v1";
  const HOME_PATCH_KEY = "gw_home_patch_id_v1";
  const PATCH_VISIBLE_KEY = "gw_patch_layer_visible_v1";
  const PANE = "gwPatchPane";
  const INAT_PROJECT_RESULT_LIMIT = 12;
  const INAT_PROJECT_SEARCH_PAGE_SIZE = 24;
  const INAT_PROJECT_GEOMETRY_CHECK_LIMIT = 18;
  const NEARBY_PROJECT_RADIUS_M = 50000;
  const PATCH_COMPLETENESS_MAX_EXACT_CELLS = 12000;
  const PATCH_COMPLETENESS_MAX_SAMPLE_CELLS = 6000;
  const PATCH_QUEST_TARGET_MAX_CELLS = 400;
  const PATCH_QUEST_SCAN_MAX_BBOX_CELLS = 120000;
  const PATCH_MENU_LONG_HOLD_MS = 620;
  const PATCH_MENU_MOVE_TOLERANCE_PX = 14;

  const projectBoundaryCache = new Map();
  const placeGeometryCache = new Map();

  const state = {
    patches: loadPatches(),
    homePatchId: loadHomePatchId(),
    layerVisible: loadLayerVisible(),
    layer: null,
    peekLayer: null,
    peekMapClickHandler: null,
    peekRunId: 0,
    peekRows: [],
    lastOpen: { id: null, at: 0 },
    actionMenuRoot: null,
    patchHoldTimer: null,
    patchHoldStart: null,
    suppressPatchInfoUntil: 0,
    suppressHudActionMenuUntil: 0
  };

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function toast(message) {
    if (!message) return;
    if (typeof window.showGridWildToast === "function") {
      window.showGridWildToast(message);
    } else {
      console.info(message);
    }
  }

  function storageKey(base) {
    try {
      const playerId = localStorage.getItem("gwPlayerId");
      return playerId ? `${base}:${playerId}` : base;
    } catch {
      return base;
    }
  }

  function plainClone(value) {
    if (!value) return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return null;
    }
  }

  function loadPatches() {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey(PATCHES_KEY)) || "[]");
      return Array.isArray(parsed) ? parsed.filter((patch) => patch?.id) : [];
    } catch {
      return [];
    }
  }

  function savePatches() {
    try {
      localStorage.setItem(storageKey(PATCHES_KEY), JSON.stringify(state.patches || []));
    } catch (err) {
      console.warn("Could not save patches:", err);
    }

    window.__gwState = window.__gwState || {};
    window.__gwState.patches = state.patches.slice();
    window.__gwState.homePatchId = state.homePatchId || null;
    window.__gwState.homePatch = getHomePatch();
    window.dispatchEvent(
      new CustomEvent("gwPatchesChanged", {
        detail: { patches: state.patches.slice(), homePatch: getHomePatch() }
      })
    );
  }

  function loadHomePatchId() {
    try {
      return localStorage.getItem(storageKey(HOME_PATCH_KEY)) || null;
    } catch {
      return null;
    }
  }

  function saveHomePatchId() {
    try {
      if (state.homePatchId) {
        localStorage.setItem(storageKey(HOME_PATCH_KEY), state.homePatchId);
      } else {
        localStorage.removeItem(storageKey(HOME_PATCH_KEY));
      }
    } catch (err) {
      console.warn("Could not save home patch:", err);
    }
  }

  function loadLayerVisible() {
    try {
      const raw = localStorage.getItem(storageKey(PATCH_VISIBLE_KEY));
      return raw == null ? true : raw === "1";
    } catch {
      return true;
    }
  }

  function saveLayerVisible() {
    try {
      localStorage.setItem(storageKey(PATCH_VISIBLE_KEY), state.layerVisible ? "1" : "0");
      const uiState = JSON.parse(localStorage.getItem("gw_ui_state") || "{}");
      uiState.showPatchView = state.layerVisible;
      localStorage.setItem("gw_ui_state", JSON.stringify(uiState));
    } catch {}

    window.__gwState = window.__gwState || {};
    window.__gwState.showPatchView = state.layerVisible;

    const checkbox = document.getElementById("togglePatchView");
    if (checkbox) checkbox.checked = state.layerVisible;
  }

  function patchIdFor(source, sourceId, fallback = "") {
    const raw = `${source || "patch"}:${sourceId || fallback || Date.now()}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
    }
    return `patch_${Math.abs(hash).toString(36)}`;
  }

  function userLocationOrigin() {
    const loc = window.__gwLastUserLocation;
    if (Number.isFinite(Number(loc?.lat)) && Number.isFinite(Number(loc?.lng))) {
      return { lat: Number(loc.lat), lng: Number(loc.lng), source: "avatar" };
    }

    return null;
  }

  function mapCenterOrigin() {
    if (window.map?.getCenter) {
      const c = map.getCenter();
      return { lat: Number(c.lat), lng: Number(c.lng), source: "map" };
    }

    return null;
  }

  function locationOrigin() {
    return userLocationOrigin() || mapCenterOrigin();
  }

  function nearbySearchOrigin() {
    const avatar = userLocationOrigin();
    if (avatar && !window.map?.getBounds) return avatar;

    if (avatar && map.getBounds().contains([avatar.lat, avatar.lng])) {
      return avatar;
    }

    return mapCenterOrigin() || avatar || null;
  }

  function distanceM(a, b) {
    if (!a || !b) return Infinity;
    const lat1 = Number(a.lat);
    const lng1 = Number(a.lng);
    const lat2 = Number(b.lat);
    const lng2 = Number(b.lng);
    if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity;

    const r = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const p1 = (lat1 * Math.PI) / 180;
    const p2 = (lat2 * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * r * Math.asin(Math.sqrt(h));
  }

  function pointInRing(point, ring = []) {
    const lat = Number(point?.lat);
    const lng = Number(point?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || ring.length < 3) return false;

    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const pi = ring[i];
      const pj = ring[j];
      const yi = Number(pi.lat);
      const xi = Number(pi.lng);
      const yj = Number(pj.lat);
      const xj = Number(pj.lng);
      if (![yi, xi, yj, xj].every(Number.isFinite)) continue;

      const crosses =
        yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-9) + xi;
      if (crosses) inside = !inside;
    }

    return inside;
  }

  function pointInRings(point, rings = []) {
    return (rings || []).some((ring) => pointInRing(point, ring));
  }

  function localMetersFromLatLng(point, origin) {
    const earthM = 6371000;
    const latRad = (Number(origin.lat) * Math.PI) / 180;
    return {
      x: (((Number(point.lng) - Number(origin.lng)) * Math.PI) / 180) * earthM * Math.cos(latRad),
      y: (((Number(point.lat) - Number(origin.lat)) * Math.PI) / 180) * earthM
    };
  }

  function distanceToSegmentM(point, a, b) {
    const aa = localMetersFromLatLng(a, point);
    const bb = localMetersFromLatLng(b, point);
    const dx = bb.x - aa.x;
    const dy = bb.y - aa.y;
    const len2 = dx * dx + dy * dy;
    if (len2 <= 0) return Math.hypot(aa.x, aa.y);

    const t = Math.max(0, Math.min(1, -(aa.x * dx + aa.y * dy) / len2));
    const x = aa.x + dx * t;
    const y = aa.y + dy * t;
    return Math.hypot(x, y);
  }

  function distanceToRingsM(origin, rings = []) {
    if (!origin || !Array.isArray(rings) || !rings.length) return Infinity;

    let best = Infinity;

    for (const ring of rings) {
      const valid = (ring || [])
        .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

      if (valid.length < 3) continue;
      if (pointInRing(origin, valid)) return 0;

      for (let i = 0; i < valid.length; i++) {
        const a = valid[i];
        const b = valid[(i + 1) % valid.length];
        best = Math.min(best, distanceToSegmentM(origin, a, b));
      }
    }

    return best;
  }

  function formatDistance(meters) {
    const n = Number(meters);
    if (!Number.isFinite(n)) return "nearby";
    if (window.GridWildUnits?.formatDistance) return window.GridWildUnits.formatDistance(n);
    if (n < 1000) return `${Math.round(n)} m`;
    return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)} km`;
  }

  function centroidForPoints(points = []) {
    const valid = points
      .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

    if (!valid.length) return null;
    return {
      lat: valid.reduce((sum, p) => sum + p.lat, 0) / valid.length,
      lng: valid.reduce((sum, p) => sum + p.lng, 0) / valid.length
    };
  }

  function patchRings(patch) {
    return Array.isArray(patch?.geometry?.rings) && patch.geometry.rings.length
      ? patch.geometry.rings
      : [primaryBoundary(patch)];
  }

  function validRingPoints(rings = []) {
    return (rings || [])
      .flat()
      .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  }

  function patchCellBounds(rings = []) {
    const grid = window.GridWildGrid;
    if (!grid?.latLngToCell) return null;

    const points = validRingPoints(rings);
    if (!points.length) return null;

    let minIx = Infinity;
    let maxIx = -Infinity;
    let minIy = Infinity;
    let maxIy = -Infinity;

    points.forEach((point) => {
      const cell = grid.latLngToCell([point.lat, point.lng]);
      if (!Number.isFinite(Number(cell?.ix)) || !Number.isFinite(Number(cell?.iy))) return;
      minIx = Math.min(minIx, cell.ix);
      maxIx = Math.max(maxIx, cell.ix);
      minIy = Math.min(minIy, cell.iy);
      maxIy = Math.max(maxIy, cell.iy);
    });

    if (![minIx, maxIx, minIy, maxIy].every(Number.isFinite)) return null;
    return { minIx, maxIx, minIy, maxIy };
  }

  function cellCenterPoint(ix, iy) {
    const bounds = window.GridWildGrid?.cellBounds?.(ix, iy);
    if (!bounds?.sw || !bounds?.ne) return null;

    return {
      lat: (Number(bounds.sw.lat) + Number(bounds.ne.lat)) / 2,
      lng: (Number(bounds.sw.lng) + Number(bounds.ne.lng)) / 2
    };
  }

  function displayMetricsForCell(ix, iy) {
    const key = window.GridWildGrid?.cellKey?.(ix, iy) || `${ix},${iy}`;
    const baseMetrics =
      window.__richGridMetrics?.get?.(key) || window.__staticGridCounts?.get?.(key) || null;

    if (typeof window.getDisplayMetricsForCell === "function") {
      return window.getDisplayMetricsForCell(ix, iy, baseMetrics || null) || null;
    }

    return baseMetrics;
  }

  function staticObservationCountForCell(ix, iy) {
    const key = window.GridWildGrid?.cellKey?.(ix, iy) || `${ix},${iy}`;
    const metrics =
      window.__staticGridCounts instanceof Map ? window.__staticGridCounts.get(key) : null;
    return Number(metrics?.count) || 0;
  }

  function staticGridReady() {
    return (
      window.__gwStaticHeatLoaded === true ||
      (window.__staticGridCounts instanceof Map && window.__staticGridCounts.size > 0)
    );
  }

  function waitForStaticGridReady(timeoutMs = 8000) {
    if (staticGridReady()) return Promise.resolve(true);

    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        window.removeEventListener("gridwild:staticheatloaded", onLoaded);
        window.clearTimeout(timer);
        resolve(value);
      };
      const onLoaded = () => finish(true);
      const timer = window.setTimeout(() => finish(staticGridReady()), timeoutMs);
      window.addEventListener("gridwild:staticheatloaded", onLoaded, { once: true });
    });
  }

  function targetSortOrigin() {
    return userLocationOrigin() || mapCenterOrigin() || null;
  }

  function visibleCellRank(center) {
    return window.map?.getBounds?.().contains([center.lat, center.lng]) ? 0 : 1;
  }

  function patchQuestTargetCells(patch) {
    const rings = patchRings(patch);
    const bounds = patchCellBounds(rings);
    if (!bounds) return { cells: [], totalEligibleCells: 0, scannedCells: 0 };

    const bboxCells = (bounds.maxIx - bounds.minIx + 1) * (bounds.maxIy - bounds.minIy + 1);
    if (bboxCells > PATCH_QUEST_SCAN_MAX_BBOX_CELLS) {
      return { cells: [], totalEligibleCells: 0, scannedCells: bboxCells, tooLarge: true };
    }

    const origin = targetSortOrigin();
    const rows = [];
    let totalEligibleCells = 0;

    for (let iy = bounds.minIy; iy <= bounds.maxIy; iy++) {
      for (let ix = bounds.minIx; ix <= bounds.maxIx; ix++) {
        const center = cellCenterPoint(ix, iy);
        if (!center || !pointInRings(center, rings)) continue;
        if (staticObservationCountForCell(ix, iy) > 0) continue;

        totalEligibleCells++;
        rows.push({
          ix,
          iy,
          key: window.GridWildGrid?.cellKey?.(ix, iy) || `${ix},${iy}`,
          center,
          visibleRank: visibleCellRank(center),
          distanceM: distanceM(origin, center)
        });
      }
    }

    rows.sort(
      (a, b) =>
        (Number.isFinite(a.distanceM) ? a.distanceM : Infinity) -
          (Number.isFinite(b.distanceM) ? b.distanceM : Infinity) ||
        a.visibleRank - b.visibleRank ||
        a.key.localeCompare(b.key)
    );

    return {
      cells: rows
        .slice(0, PATCH_QUEST_TARGET_MAX_CELLS)
        .map((row) => ({ ix: row.ix, iy: row.iy, key: row.key })),
      totalEligibleCells,
      scannedCells: bboxCells
    };
  }

  function patchFillQuestRecipe(patch, targetInfo) {
    const title = patchTitle(patch);
    return {
      range: "here",
      iconicTaxon: "Any",
      objectiveType: "any_observation",
      difficulty: 2,
      timeframe: "today",
      evidence: "photo_gps20",
      surveyId: "none",
      targetLocation: "target_set",
      target: {
        mode: "target_set",
        kind: "patch_grid_fill",
        label: `Fill ${title}`,
        patchId: patch.id,
        patchName: title,
        cells: targetInfo.cells,
        totalEligibleCells: targetInfo.totalEligibleCells,
        generatedAt: new Date().toISOString()
      },
      quantity: 1
    };
  }

  function patchQuestPolygonTarget(patch) {
    const rings = patchRings(patch)
      .map((ring) =>
        ring
          .filter(
            (point) => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng))
          )
          .map((point) => ({
            lat: Number(point.lat),
            lng: Number(point.lng)
          }))
      )
      .filter((ring) => ring.length >= 3);
    if (!rings.length) return null;

    const points = rings.flat();
    const centroid =
      patch.centroid &&
      Number.isFinite(Number(patch.centroid.lat)) &&
      Number.isFinite(Number(patch.centroid.lng))
        ? { lat: Number(patch.centroid.lat), lng: Number(patch.centroid.lng) }
        : {
            lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length,
            lng: points.reduce((sum, point) => sum + point.lng, 0) / points.length
          };
    const radiusMeters = Math.max(
      25,
      Math.ceil(points.reduce((max, point) => Math.max(max, distanceM(centroid, point)), 0) + 30)
    );
    const title = patchTitle(patch);

    return {
      mode: "patch_polygon",
      kind: "patch_identify_unknowns",
      label: `Unknowns in ${title}`,
      patchId: patch.id,
      patchName: title,
      rings,
      centroid,
      lat: centroid.lat,
      lng: centroid.lng,
      radiusMeters,
      generatedAt: new Date().toISOString()
    };
  }

  function patchIdentifyQuestRecipe(patch) {
    const target = patchQuestPolygonTarget(patch);
    if (!target) return null;

    return {
      range: "here",
      iconicTaxon: "Any",
      objectiveType: "identify_unknowns",
      difficulty: 2,
      timeframe: "permanent",
      evidence: "identification",
      surveyId: "none",
      targetLocation: "patch_polygon",
      target,
      quantity: 1
    };
  }

  async function startPatchFillQuest(patchId) {
    const patch = getPatch(patchId);
    if (!patch) {
      toast("Save this Patch before starting a quest.");
      return null;
    }

    if (!window.GridWildQuests?.startQuestFromRecipe) {
      toast("Quest tools are still loading.");
      return null;
    }

    if (!staticGridReady()) toast("Loading grid memory...");
    const staticReady = await waitForStaticGridReady();
    if (!staticReady) {
      toast("Grid memory is still loading. Try the Patch quest again in a moment.");
      return null;
    }

    const targetInfo = patchQuestTargetCells(patch);
    if (targetInfo.tooLarge) {
      toast("That Patch is too large for a fill quest right now.");
      return null;
    }
    if (!targetInfo.cells.length) {
      toast("No unobserved target squares in this Patch.");
      return null;
    }

    const recipe = patchFillQuestRecipe(patch, targetInfo);
    const targetCount = targetInfo.totalEligibleCells;
    const storedCount = targetInfo.cells.length;
    return window.GridWildQuests.startQuestFromRecipe(recipe, {
      title: `Help Fill Grid: ${patchTitle(patch)}`,
      description: `Observe one organism in an unobserved GridWild square inside ${patchTitle(patch)}. ${storedCount} of ${targetCount} eligible target squares are marked for this run.`,
      source: "patch",
      autoEmbark: true,
      openStatus: false
    });
  }

  async function startPatchIdentifyQuest(patchId) {
    const patch = getPatch(patchId);
    if (!patch) {
      toast("Save this Patch before starting a quest.");
      return null;
    }

    if (!window.GridWildQuests?.startQuestFromRecipe) {
      toast("Quest tools are still loading.");
      return null;
    }

    const recipe = patchIdentifyQuestRecipe(patch);
    if (!recipe) {
      toast("This Patch needs a saved polygon boundary for Identify Unknowns.");
      return null;
    }

    const quest = await window.GridWildQuests.startQuestFromRecipe(recipe, {
      title: `Identify Unknowns: ${patchTitle(patch)}`,
      description: `Identify one iNaturalist needs-ID observation whose coordinates fall inside ${patchTitle(patch)}.`,
      source: "patch",
      autoEmbark: true,
      openStatus: false
    });

    if (quest && window.GridWildIdentify?.openIdentifyDialog) {
      window.GridWildIdentify.openIdentifyDialog(quest);
    }

    return quest;
  }

  function patchCompleteness(patch, rings = patchRings(patch)) {
    const bounds = patchCellBounds(rings);
    if (!bounds) return { total: 0, observed: 0, percent: 0, sampled: false };

    const bboxCells = (bounds.maxIx - bounds.minIx + 1) * (bounds.maxIy - bounds.minIy + 1);
    const exact = bboxCells <= PATCH_COMPLETENESS_MAX_EXACT_CELLS;
    const stride = exact
      ? 1
      : Math.max(1, Math.ceil(Math.sqrt(bboxCells / PATCH_COMPLETENESS_MAX_SAMPLE_CELLS)));
    let total = 0;
    let observed = 0;

    for (let iy = bounds.minIy; iy <= bounds.maxIy; iy += stride) {
      for (let ix = bounds.minIx; ix <= bounds.maxIx; ix += stride) {
        const center = cellCenterPoint(ix, iy);
        if (!center || !pointInRings(center, rings)) continue;

        total++;
        const metrics = displayMetricsForCell(ix, iy);
        if ((Number(metrics?.count) || 0) > 0) observed++;
      }
    }

    const percent = total ? Math.max(0, Math.min(1, observed / total)) : 0;
    return {
      total,
      observed,
      percent,
      sampled: !exact && stride > 1
    };
  }

  function completenessColor(percent) {
    const p = Number(percent) || 0;
    if (p >= 0.75) return "#75e6a4";
    if (p >= 0.5) return "#ffd85a";
    if (p >= 0.25) return "#f59e0b";
    return "#f97373";
  }

  function formatCompletenessPercent(value) {
    const pct = Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100);
    return `${pct}%`;
  }

  function topBoundaryLabelLatLng(rings = []) {
    const points = validRingPoints(rings);
    if (!points.length) return null;

    if (window.map?.latLngToLayerPoint && window.map?.layerPointToLatLng && window.L?.point) {
      const projected = points.map((point) => ({
        point,
        layer: map.latLngToLayerPoint([point.lat, point.lng])
      }));
      const minY = Math.min(...projected.map((row) => row.layer.y));
      const maxY = Math.max(...projected.map((row) => row.layer.y));
      const threshold = minY + Math.min(24, Math.max(6, (maxY - minY) * 0.12));
      const topRows = projected.filter((row) => row.layer.y <= threshold);
      const avgX = topRows.reduce((sum, row) => sum + row.layer.x, 0) / Math.max(1, topRows.length);

      return map.layerPointToLatLng(L.point(avgX, minY));
    }

    const maxLat = Math.max(...points.map((point) => point.lat));
    const topPoints = points.filter((point) => Math.abs(point.lat - maxLat) < 0.00001);
    const lng =
      topPoints.reduce((sum, point) => sum + point.lng, 0) / Math.max(1, topPoints.length);
    return { lat: maxLat, lng };
  }

  function expandLatLngBounds(bounds, ratio = 0.08) {
    if (!bounds?.isValid?.()) return bounds;

    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const latPad = Math.max(0.00008, Math.abs(ne.lat - sw.lat) * ratio);
    const lngPad = Math.max(0.00008, Math.abs(ne.lng - sw.lng) * ratio);

    return L.latLngBounds([sw.lat - latPad, sw.lng - lngPad], [ne.lat + latPad, ne.lng + lngPad]);
  }

  function ringBounds(ring = []) {
    const points = validRingPoints([ring]);
    if (!points.length) return null;
    return L.latLngBounds(points.map((point) => [point.lat, point.lng]));
  }

  function boundsCorners(bounds) {
    if (!bounds?.isValid?.()) return [];
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    return [
      { lat: sw.lat, lng: sw.lng },
      { lat: sw.lat, lng: ne.lng },
      { lat: ne.lat, lng: ne.lng },
      { lat: ne.lat, lng: sw.lng }
    ];
  }

  function ringIntersectsBounds(ring = [], bounds) {
    if (!bounds?.isValid?.() || !Array.isArray(ring) || ring.length < 3) return false;
    const rb = ringBounds(ring);
    if (!rb?.isValid?.() || !rb.intersects(bounds)) return false;

    if (ring.some((point) => bounds.contains([point.lat, point.lng]))) return true;
    if (boundsCorners(bounds).some((point) => pointInRing(point, ring))) return true;

    return true;
  }

  function patchIntersectsBounds(patch, bounds) {
    return patchRings(patch).some((ring) => ringIntersectsBounds(ring, bounds));
  }

  function suppressHudActionMenu(ms = 900) {
    state.suppressHudActionMenuUntil = Date.now() + ms;
  }

  function shouldSuppressHudActionMenu() {
    return Date.now() < state.suppressHudActionMenuUntil;
  }

  function patchAtLatLng(latlng) {
    if (!latlng) return false;
    const point = { lat: Number(latlng.lat), lng: Number(latlng.lng) };
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return false;

    const rows = [
      ...patchesWithDistance(),
      ...(Array.isArray(state.peekRows) ? state.peekRows : [])
    ];
    const seen = new Set();
    return (
      rows.find((patch) => {
        if (!patch?.id || seen.has(patch.id)) return null;
        seen.add(patch.id);
        return pointInRings(point, patchRings(patch));
      }) || null
    );
  }

  function isPatchAtLatLng(latlng) {
    return !!patchAtLatLng(latlng);
  }

  function openPatchActionMenuAtLatLng(latlng, originalEvent = null) {
    const patch = patchAtLatLng(latlng);
    if (!patch) return false;

    suppressHudActionMenu();
    if (getPatch(patch.id)) {
      openPatchActionMenu(patch, { originalEvent, latlng });
    } else {
      openPatchPeekInfo(patch, latlng);
    }
    return true;
  }

  function primaryBoundary(patch) {
    if (Array.isArray(patch?.boundary) && patch.boundary.length) return patch.boundary;
    const boundary = patch?.survey_geometry?.boundary;
    if (Array.isArray(boundary) && boundary[0]?.lat != null) return boundary;
    const rings = patch?.geometry?.rings;
    if (Array.isArray(rings) && Array.isArray(rings[0])) return rings[0];
    return [];
  }

  function withDerivedPatchFields(patch) {
    const clone = plainClone(patch);
    if (!clone?.id) return null;

    const boundary = primaryBoundary(clone);
    const centroid = clone.centroid || centroidForPoints(boundary) || locationOrigin();
    clone.centroid = centroid ? { lat: Number(centroid.lat), lng: Number(centroid.lng) } : null;
    clone.boundary = boundary;
    clone.updated_at = new Date().toISOString();
    clone.is_home_patch = clone.id === state.homePatchId;

    if (!clone.survey_geometry) {
      clone.survey_geometry = surveyGeometryForPatch(clone);
    }

    return clone;
  }

  function surveyGeometryForPatch(patch) {
    const boundary = primaryBoundary(patch);
    return {
      boundary,
      paths: [],
      exclusions: [],
      denseZones: [],
      assets: [],
      styles: {
        boundary: {
          fillColor: "#6fb7ff",
          lineColor: "#f0d18a",
          lineWeight: 3,
          fillOpacity: 0.12
        }
      }
    };
  }

  function patchTitle(patch) {
    return patch?.name || patch?.title || patch?.metadata?.title || "Untitled patch";
  }

  function upsertPatch(rawPatch, options = {}) {
    const patch = withDerivedPatchFields({
      ...rawPatch,
      saved_at: rawPatch.saved_at || new Date().toISOString()
    });
    if (!patch) return null;

    const idx = state.patches.findIndex((row) => row.id === patch.id);
    if (idx >= 0) state.patches[idx] = { ...state.patches[idx], ...patch };
    else state.patches.unshift(patch);

    if (options.home === true) state.homePatchId = patch.id;
    saveHomePatchId();
    savePatches();
    render();
    return getPatch(patch.id);
  }

  function removePatch(id) {
    const before = state.patches.length;
    state.patches = state.patches.filter((patch) => patch.id !== id);
    if (state.homePatchId === id) {
      state.homePatchId = null;
      saveHomePatchId();
    }
    if (state.patches.length !== before) savePatches();
    render();
  }

  function setHomePatch(id) {
    const patch = getPatch(id);
    if (!patch) return null;
    state.homePatchId = id;
    saveHomePatchId();
    savePatches();
    render();
    return getHomePatch();
  }

  function unsetHomePatch() {
    state.homePatchId = null;
    saveHomePatchId();
    savePatches();
    render();
  }

  function getPatch(id) {
    return state.patches.find((patch) => String(patch.id) === String(id)) || null;
  }

  function getHomePatch() {
    return state.homePatchId ? getPatch(state.homePatchId) : null;
  }

  function patchesWithDistance() {
    const origin = locationOrigin();
    return state.patches
      .map((patch) => ({
        ...patch,
        is_home_patch: patch.id === state.homePatchId,
        distance_m: distanceM(origin, patch.centroid)
      }))
      .sort((a, b) => {
        if (a.is_home_patch && !b.is_home_patch) return -1;
        if (!a.is_home_patch && b.is_home_patch) return 1;
        return Number(a.distance_m || Infinity) - Number(b.distance_m || Infinity);
      });
  }

  function setVisible(show) {
    state.layerVisible = show === true;
    saveLayerVisible();
    render();
    window.dispatchEvent(
      new CustomEvent("gridwild:patchviewchange", {
        detail: { visible: state.layerVisible }
      })
    );
    return state.layerVisible;
  }

  function toggleVisible() {
    return setVisible(!state.layerVisible);
  }

  function ensureLayer() {
    if (!window.map || !window.L) return null;

    if (!map.getPane(PANE)) {
      map.createPane(PANE);
      map.getPane(PANE).style.zIndex = 758;
      map.getPane(PANE).style.pointerEvents = "auto";
    }

    if (!state.layer) {
      state.layer = L.layerGroup([], { pane: PANE }).addTo(map);
      injectStyles();
    }

    return state.layer;
  }

  function injectStyles() {
    if (document.getElementById("gwPatchStyles")) return;
    const style = document.createElement("style");
    style.id = "gwPatchStyles";
    style.textContent = `
      .gw-patch-boundary {
        filter: drop-shadow(0 0 4px rgba(255,216,90,0.46));
      }

      .gw-patch-hud-label {
        width: 158px;
        pointer-events: none;
        transform: translateY(-2px);
        filter: drop-shadow(0 5px 12px rgba(0,0,0,0.42));
      }

      .gw-patch-completeness-bar {
        position: relative;
        height: 7px;
        border-radius: 999px;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.72);
        background: rgba(28,24,21,0.82);
        box-shadow: 0 0 0 1px rgba(255,216,90,0.30), 0 0 10px rgba(255,216,90,0.24);
      }

      .gw-patch-completeness-fill {
        height: 100%;
        width: var(--gw-patch-completeness-width, 0%);
        border-radius: inherit;
        background: var(--gw-patch-completeness-color, #f97373);
      }

      .gw-patch-label-row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        margin-top: 4px;
        min-width: 0;
      }

      .gw-patch-label-name {
        min-width: 0;
        max-width: 124px;
        border-radius: 999px;
        padding: 3px 8px;
        color: #231a12;
        background: rgba(255,216,90,0.94);
        border: 1px solid rgba(255,255,255,0.76);
        font-size: 10px;
        line-height: 1;
        font-weight: 950;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .gw-patch-completeness-text {
        min-width: 34px;
        border-radius: 999px;
        padding: 3px 6px;
        color: #fff7df;
        background: rgba(20,17,15,0.88);
        border: 1px solid rgba(255,216,90,0.32);
        font-size: 10px;
        line-height: 1;
        font-weight: 950;
        text-align: center;
        opacity: 0;
        transform: translateX(-3px);
        transition: opacity 120ms ease, transform 120ms ease;
      }

      .gw-patch-hud-label.is-hovered .gw-patch-completeness-text,
      .gw-patch-hud-label.is-selected .gw-patch-completeness-text {
        opacity: 1;
        transform: translateX(0);
      }

      .gw-patch-peek-outline {
        cursor: pointer;
        filter: drop-shadow(0 0 14px rgba(255,216,90,0.78));
        transition: filter 120ms ease, opacity 120ms ease;
      }

      .gw-patch-peek-outline:hover {
        filter: drop-shadow(0 0 18px rgba(255,216,90,0.96));
      }

      .gw-patch-action-menu {
        position: fixed;
        z-index: 100006;
        width: min(218px, calc(100vw - 20px));
        border-radius: 8px;
        border: 1px solid rgba(255,216,90,0.48);
        background:
          linear-gradient(180deg, rgba(44,35,25,0.98), rgba(18,15,13,0.98));
        color: #fff7df;
        box-shadow:
          0 18px 48px rgba(0,0,0,0.42),
          0 0 0 1px rgba(255,255,255,0.08) inset,
          0 0 18px rgba(255,216,90,0.14);
        overflow: hidden;
        user-select: none;
      }

      .gw-patch-action-title {
        padding: 10px 11px 7px;
        color: rgba(255,216,90,0.96);
        font-size: 11px;
        line-height: 1;
        font-weight: 950;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        border-bottom: 1px solid rgba(255,216,90,0.14);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-patch-action-list {
        display: grid;
        padding: 5px;
        gap: 4px;
      }

      .gw-patch-action-btn {
        width: 100%;
        min-height: 36px;
        border: 1px solid transparent;
        border-radius: 7px;
        padding: 8px 9px;
        display: grid;
        grid-template-columns: 22px minmax(0, 1fr);
        gap: 8px;
        align-items: center;
        background: transparent;
        color: #efe6d3;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      .gw-patch-action-btn:hover,
      .gw-patch-action-btn:focus-visible {
        outline: none;
        border-color: rgba(255,216,90,0.30);
        background: rgba(255,216,90,0.10);
      }

      .gw-patch-action-icon {
        width: 22px;
        height: 22px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: rgba(255,216,90,0.16);
        color: #ffd85a;
        font-size: 12px;
        font-weight: 950;
      }

      .gw-patch-action-label {
        color: #fff7df;
        font-size: 12px;
        line-height: 1.15;
        font-weight: 950;
      }

      .gw-patch-action-sub {
        margin-top: 2px;
        color: rgba(239,230,211,0.58);
        font-size: 10px;
        line-height: 1.2;
        font-weight: 750;
      }
    `;
    document.head.appendChild(style);
  }

  function setPatchHudLabelState(patchId, className, enabled) {
    document.querySelectorAll(".gw-patch-hud-label").forEach((el) => {
      if (String(el.dataset.patchId || "") !== String(patchId)) return;
      el.classList.toggle(className, enabled);
    });
  }

  function selectPatchHudLabel(patchId) {
    document.querySelectorAll(".gw-patch-hud-label.is-selected").forEach((el) => {
      el.classList.remove("is-selected");
    });
    setPatchHudLabelState(patchId, "is-selected", true);
  }

  function closePatchActionMenu() {
    state.actionMenuRoot?.remove();
    state.actionMenuRoot = null;
  }

  function clampPatchMenuPosition(x, y) {
    const width = Math.min(218, window.innerWidth - 20);
    const maxX = window.innerWidth - width - 10;
    const maxY = window.innerHeight - 150;
    return {
      x: Math.max(10, Math.min(maxX, Number(x) || 10)),
      y: Math.max(10, Math.min(Math.max(10, maxY), Number(y) || 10))
    };
  }

  function patchActionItems() {
    return [
      {
        id: "info",
        icon: "i",
        label: "Patch Info",
        sub: "Open details for this Patch"
      },
      {
        id: "quest",
        icon: "Q",
        label: "Start Quest",
        sub: "Choose a Patch quest"
      }
    ];
  }

  function patchQuestTypeItems() {
    return [
      {
        id: "fill_grid",
        icon: "F",
        label: "Fill Grid",
        sub: "Mark unobserved target squares"
      },
      {
        id: "identify_unknowns",
        icon: "ID",
        label: "Identify Unknowns",
        sub: "Source unknowns inside this Patch"
      }
    ];
  }

  function openPatchQuestTypeMenu(patch, anchor = {}) {
    if (!patch?.id) return;
    const x = Number(anchor.clientX ?? anchor.left) || Math.round(window.innerWidth / 2);
    const y = Number(anchor.clientY ?? anchor.top) || Math.round(window.innerHeight / 2);
    const pos = clampPatchMenuPosition(x, y);

    closePatchActionMenu();
    selectPatchHudLabel(patch.id);

    const root = document.createElement("div");
    root.className = "gw-patch-action-menu";
    root.style.left = `${pos.x}px`;
    root.style.top = `${pos.y}px`;
    root.setAttribute("role", "menu");
    root.innerHTML = `
      <div class="gw-patch-action-title">Start Quest · ${esc(patchTitle(patch))}</div>
      <div class="gw-patch-action-list">
        ${patchQuestTypeItems()
          .map(
            (item) => `
          <button class="gw-patch-action-btn" type="button" role="menuitem" data-gw-patch-quest-type="${esc(item.id)}">
            <span class="gw-patch-action-icon">${esc(item.icon)}</span>
            <span>
              <span class="gw-patch-action-label">${esc(item.label)}</span>
              <span class="gw-patch-action-sub">${esc(item.sub)}</span>
            </span>
          </button>
        `
          )
          .join("")}
      </div>
    `;

    document.body.appendChild(root);
    state.actionMenuRoot = root;

    root.querySelectorAll("[data-gw-patch-quest-type]").forEach((button) => {
      button.addEventListener("click", async () => {
        const questType = button.dataset.gwPatchQuestType;
        closePatchActionMenu();
        if (questType === "fill_grid") {
          await startPatchFillQuest(patch.id);
        } else if (questType === "identify_unknowns") {
          await startPatchIdentifyQuest(patch.id);
        }
      });
    });
  }

  function openPatchActionMenu(patch, evt = {}) {
    if (!patch?.id) return;
    suppressHudActionMenu();
    if (evt?.originalEvent && window.L?.DomEvent?.stop) L.DomEvent.stop(evt.originalEvent);
    const original = evt.originalEvent || evt;
    const x = Number(original?.clientX) || Math.round(window.innerWidth / 2);
    const y = Number(original?.clientY) || Math.round(window.innerHeight / 2);
    const pos = clampPatchMenuPosition(x, y);

    closePatchActionMenu();
    selectPatchHudLabel(patch.id);

    const root = document.createElement("div");
    root.className = "gw-patch-action-menu";
    root.style.left = `${pos.x}px`;
    root.style.top = `${pos.y}px`;
    root.setAttribute("role", "menu");
    root.innerHTML = `
      <div class="gw-patch-action-title">${esc(patchTitle(patch))}</div>
      <div class="gw-patch-action-list">
        ${patchActionItems()
          .map(
            (item) => `
          <button class="gw-patch-action-btn" type="button" role="menuitem" data-gw-patch-action="${esc(item.id)}">
            <span class="gw-patch-action-icon">${esc(item.icon)}</span>
            <span>
              <span class="gw-patch-action-label">${esc(item.label)}</span>
              <span class="gw-patch-action-sub">${esc(item.sub)}</span>
            </span>
          </button>
        `
          )
          .join("")}
      </div>
    `;

    document.body.appendChild(root);
    state.actionMenuRoot = root;

    root.querySelectorAll("[data-gw-patch-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const action = button.dataset.gwPatchAction;
        const rect = button.getBoundingClientRect();
        closePatchActionMenu();
        if (action === "info") {
          openPatchDetail(patch.id, evt?.latlng || null);
        } else if (action === "quest") {
          openPatchQuestTypeMenu(patch, rect);
        }
      });
    });
  }

  function clearPatchHold() {
    if (state.patchHoldTimer) {
      window.clearTimeout(state.patchHoldTimer);
      state.patchHoldTimer = null;
    }
    state.patchHoldStart = null;
  }

  function bindPatchLongHold(target, patch) {
    const el = target?.getElement?.();
    if (!el || el.dataset.gwPatchLongHoldBound === "true") return;
    el.dataset.gwPatchLongHoldBound = "true";

    el.addEventListener(
      "pointerdown",
      (event) => {
        if (event.pointerType !== "touch") return;
        suppressHudActionMenu(PATCH_MENU_LONG_HOLD_MS + 400);
        clearPatchHold();
        state.patchHoldStart = {
          x: event.clientX,
          y: event.clientY,
          latlng: window.map?.mouseEventToLatLng?.(event) || null
        };

        state.patchHoldTimer = window.setTimeout(() => {
          if (!state.patchHoldStart) return;
          event.preventDefault?.();
          state.suppressPatchInfoUntil = Date.now() + 700;
          openPatchActionMenu(patch, {
            originalEvent: event,
            latlng: state.patchHoldStart.latlng
          });
          clearPatchHold();
        }, PATCH_MENU_LONG_HOLD_MS);
      },
      { passive: false }
    );

    el.addEventListener(
      "pointermove",
      (event) => {
        if (!state.patchHoldStart) return;
        const dist = Math.hypot(
          event.clientX - state.patchHoldStart.x,
          event.clientY - state.patchHoldStart.y
        );
        if (dist > PATCH_MENU_MOVE_TOLERANCE_PX) clearPatchHold();
      },
      { passive: true }
    );

    ["pointerup", "pointercancel", "pointerleave"].forEach((type) => {
      el.addEventListener(type, clearPatchHold, { passive: true });
    });
  }

  function addPatchPolygon(patch, points, home) {
    if (!Array.isArray(points) || points.length < 3) return;
    const layer = state.layer;
    L.polygon(
      points.map((p) => [p.lat, p.lng]),
      {
        pane: PANE,
        color: "#ffd85a",
        opacity: 0.22,
        weight: home ? 11 : 9,
        fillOpacity: 0,
        interactive: false,
        bubblingMouseEvents: false,
        className: "gw-patch-boundary-glow"
      }
    ).addTo(layer);

    const target = L.polygon(
      points.map((p) => [p.lat, p.lng]),
      {
        pane: PANE,
        color: "#ffd85a",
        opacity: 0.96,
        weight: home ? 4 : 3.5,
        fillColor: "#ffd85a",
        fillOpacity: home ? 0.16 : 0.1,
        dashArray: home ? "" : "9 6",
        interactive: true,
        bubblingMouseEvents: false,
        className: "gw-patch-boundary"
      }
    ).addTo(layer);

    target.on("click", (evt) => openPatchHudInfo(patch, evt));
    target.on("dblclick", (evt) => openPatchHudInfo(patch, evt));
    target.on("contextmenu", (evt) => openPatchActionMenu(patch, evt));
    target.on("mouseover", () => setPatchHudLabelState(patch.id, "is-hovered", true));
    target.on("mouseout", () => setPatchHudLabelState(patch.id, "is-hovered", false));
    bindPatchLongHold(target, patch);
  }

  function openPatchHudInfo(patch, evt) {
    if (evt?.originalEvent && window.L?.DomEvent?.stop) L.DomEvent.stop(evt.originalEvent);
    if (Date.now() < state.suppressPatchInfoUntil) return;
    const now = Date.now();
    if (state.lastOpen.id === patch.id && now - state.lastOpen.at < 450) return;
    state.lastOpen = { id: patch.id, at: now };
    selectPatchHudLabel(patch.id);
    openPatchDetail(patch.id, evt?.latlng);
  }

  function addPatchCompletenessLabel(patch, rings) {
    const latlng = topBoundaryLabelLatLng(rings);
    if (!latlng) return;

    const completeness = patchCompleteness(patch, rings);
    const percentText = formatCompletenessPercent(completeness.percent);
    const percentWidth = `${Math.round(completeness.percent * 1000) / 10}%`;
    const title = patchTitle(patch);
    const color = completenessColor(completeness.percent);

    L.marker(latlng, {
      pane: PANE,
      interactive: false,
      keyboard: false,
      bubblingMouseEvents: false,
      icon: L.divIcon({
        className: "",
        html: `
          <div
            class="gw-patch-hud-label"
            data-patch-id="${esc(patch.id)}"
            title="${esc(`${title}: ${percentText} complete${completeness.sampled ? " (estimated)" : ""}`)}"
            style="--gw-patch-completeness-width:${esc(percentWidth)};--gw-patch-completeness-color:${esc(color)};"
          >
            <div class="gw-patch-completeness-bar" aria-hidden="true">
              <div class="gw-patch-completeness-fill"></div>
            </div>
            <div class="gw-patch-label-row">
              <span class="gw-patch-label-name">${esc(title)}</span>
              <span class="gw-patch-completeness-text">${esc(percentText)}</span>
            </div>
          </div>
        `,
        iconSize: [158, 36],
        iconAnchor: [79, 40]
      })
    }).addTo(state.layer);
  }

  function clearLocalPatchHighlights(options = {}) {
    if (options.invalidate !== false) state.peekRunId++;
    state.peekRows = [];
    state.peekLayer?.clearLayers();
    if (state.peekMapClickHandler && window.map?.off) {
      window.map.off("click", state.peekMapClickHandler);
    }
    state.peekMapClickHandler = null;
  }

  function ensurePeekLayer() {
    ensureLayer();
    if (!window.map || !window.L) return null;
    if (!state.peekLayer) {
      state.peekLayer = L.layerGroup([], { pane: PANE }).addTo(window.map);
    }
    return state.peekLayer;
  }

  function localPatchesInFov(options = {}) {
    if (!window.map?.getBounds || !window.L) return [];
    const bounds = expandLatLngBounds(window.map.getBounds(), Number(options.marginRatio) || 0.08);
    const savedRows = patchesWithDistance().map((patch) => ({ ...patch, candidate: false }));
    const candidateRows = nearbyOsmPatchCandidates(options.candidateLimit || 80);
    const seen = new Set();

    return [...savedRows, ...candidateRows].filter((patch) => {
      if (!patch?.id || seen.has(patch.id)) return false;
      seen.add(patch.id);
      return patchIntersectsBounds(patch, bounds);
    });
  }

  function openPatchPeekInfo(patch, latlng = null) {
    if (!patch?.id) return;
    if (getPatch(patch.id)) {
      openPatchDetail(patch.id, latlng);
      return;
    }

    injectFieldModalStyles();
    document
      .querySelectorAll(".gw-quest-modal-backdrop.gw-patch-peek-backdrop")
      .forEach((el) => el.remove());

    const root = document.createElement("div");
    root.className = "gw-quest-modal-backdrop gw-patch-peek-backdrop";
    root.innerHTML = `
      <div class="gw-quest-modal">
        <div class="gw-quest-modal-title">${esc(patchTitle(patch))}</div>
        <div class="gw-quest-modal-subtitle">
          ${esc(patch.source_label || "OSM patch boundary")}
        </div>
        <div class="gw-quest-status-grid">
          <div class="gw-quest-status-line"><span>Distance</span><span>${esc(formatDistance(patch.distance_m ?? distanceM(locationOrigin(), patch.centroid)))}</span></div>
          <div class="gw-quest-status-line"><span>Source</span><span>${esc(patch.source_label || patch.source || "OSM")}</span></div>
        </div>
        <div class="gw-quest-actions gw-quest-actions-four">
          <button class="gw-quest-btn secondary" id="gwPatchPeekCloseBtn" type="button">Close</button>
          <button class="gw-quest-btn secondary" id="gwPatchPeekMapBtn" type="button">Map</button>
          <button class="gw-quest-btn secondary" id="gwPatchPeekBookmarkBtn" type="button">Bookmark</button>
          <button class="gw-quest-btn secondary" id="gwPatchPeekHomeBtn" type="button">Make Home</button>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    root.onclick = (evt) => {
      if (evt.target === root || evt.target.closest("#gwPatchPeekCloseBtn")) root.remove();
    };
    root.querySelector("#gwPatchPeekMapBtn").onclick = () => focusPatchObject(patch);
    root.querySelector("#gwPatchPeekBookmarkBtn").onclick = () => {
      upsertPatch(patch);
      root.remove();
      openPatchDetail(patch.id, latlng);
    };
    root.querySelector("#gwPatchPeekHomeBtn").onclick = () => {
      upsertPatch(patch);
      setHomePatch(patch.id);
      root.remove();
      openPatchDetail(patch.id, latlng);
    };
  }

  function highlightPatchRows(rows = []) {
    const peekLayer = ensurePeekLayer();
    if (!peekLayer) return 0;

    clearLocalPatchHighlights({ invalidate: false });
    state.peekRows = Array.isArray(rows) ? rows : [];
    let count = 0;

    rows.forEach((patch) => {
      patchRings(patch).forEach((ring) => {
        if (!Array.isArray(ring) || ring.length < 3) return;
        count++;
        const polygon = L.polygon(
          ring.map((point) => [point.lat, point.lng]),
          {
            pane: PANE,
            color: "#fff2a8",
            opacity: 0.98,
            weight: 4,
            fillColor: patch.candidate ? "#ffed9a" : "#ffd85a",
            fillOpacity: patch.candidate ? 0.16 : 0.2,
            dashArray: patch.candidate ? "10 6" : "",
            interactive: true,
            bubblingMouseEvents: false,
            className: "gw-patch-peek-outline"
          }
        ).addTo(peekLayer);

        polygon.on("click", (evt) => {
          if (evt?.originalEvent && window.L?.DomEvent?.stop) L.DomEvent.stop(evt.originalEvent);
          selectPatchHudLabel(patch.id);
          openPatchPeekInfo(patch, evt?.latlng || null);
        });
      });
    });

    if (count && window.map?.on) {
      state.peekMapClickHandler = () => clearLocalPatchHighlights();
      window.map.on("click", state.peekMapClickHandler);
    }

    return count;
  }

  function showLocalPatchHighlights(options = {}) {
    const runId = ++state.peekRunId;
    setVisible(true);
    window.GridWildOsmFeaturesLayer?.scheduleFetch?.(0);
    const rows = localPatchesInFov(options);
    highlightPatchRows(rows);

    if (options.retryAfterOsm !== false) {
      const retry = () => {
        if (state.peekRunId !== runId) return;
        const refreshedRows = localPatchesInFov(options);
        if (refreshedRows.length) highlightPatchRows(refreshedRows);
      };
      window.addEventListener("gwOsmFeaturesUpdated", retry, { once: true });
      window.setTimeout(() => window.removeEventListener("gwOsmFeaturesUpdated", retry), 1800);
    }

    return rows;
  }

  function blinkLocalPatches(options = {}) {
    return showLocalPatchHighlights(options);
  }

  function render() {
    const layer = ensureLayer();
    if (!layer) return;
    layer.clearLayers();
    if (!state.layerVisible) return;

    patchesWithDistance().forEach((patch) => {
      const home = patch.id === state.homePatchId;
      const rings = patchRings(patch);

      rings.forEach((ring) => addPatchPolygon(patch, ring, home));
      addPatchCompletenessLabel(patch, rings);
    });
  }

  function focusPatch(id) {
    const patch = getPatch(id);
    focusPatchObject(patch);
  }

  function focusPatchObject(patch) {
    if (!patch || !window.map) return;
    const rings =
      Array.isArray(patch.geometry?.rings) && patch.geometry.rings.length
        ? patch.geometry.rings
        : [primaryBoundary(patch)];
    const points = rings
      .flat()
      .filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)));
    if (points.length >= 2) {
      map.fitBounds(
        points.map((p) => [p.lat, p.lng]),
        { padding: [34, 34], maxZoom: 18 }
      );
    } else if (patch.centroid) {
      map.flyTo([patch.centroid.lat, patch.centroid.lng], Math.max(map.getZoom(), 17), {
        duration: 0.6
      });
    }
  }

  function minimizePatchDetail(root, patch) {
    const patchId = patch?.id;
    const restoreSheetName = window.GridWildSheets?.getOpen?.() || null;
    root?.remove();
    window.GridWildSheets?.closeAll?.();

    if (!patchId || !window.GridWildInfoPuck?.minimize) return;

    window.GridWildInfoPuck.minimize({
      kind: "patch",
      mark: "P",
      title: patchTitle(patch),
      beforeRestore: restoreSheetName
        ? () => window.GridWildSheets?.open?.(restoreSheetName)
        : null,
      restore: () => openPatchDetail(patchId)
    });
  }

  function openPatchDetail(id, latlng = null) {
    const patch = getPatch(id);
    if (!patch) return;
    const home = patch.id === state.homePatchId;

    document
      .querySelectorAll(".gw-quest-modal-backdrop.gw-patch-detail-backdrop")
      .forEach((el) => el.remove());
    const root = document.createElement("div");
    root.className = "gw-quest-modal-backdrop gw-patch-detail-backdrop";
    root.innerHTML = `
      <div class="gw-quest-modal">
        <div class="gw-quest-modal-title">${esc(patchTitle(patch))}</div>
        <div class="gw-quest-modal-subtitle">
          ${esc(patch.source_label || patch.source || "Patch")}
          ${home ? `<span class="gw-quest-pill" style="margin-left:6px;">Home patch</span>` : ""}
        </div>
        <div class="gw-quest-status-grid">
          <div class="gw-quest-status-line"><span>Boundary</span><span>${esc(boundaryLabel(patch))}</span></div>
          <div class="gw-quest-status-line"><span>Distance</span><span>${esc(formatDistance(distanceM(locationOrigin(), patch.centroid)))}</span></div>
          <div class="gw-quest-status-line"><span>Source</span><span>${esc(patch.source_label || patch.source || "manual")}</span></div>
        </div>
        <div class="gw-quest-actions gw-quest-actions-four">
          <button class="gw-quest-btn secondary" id="gwPatchCloseBtn" type="button">Close</button>
          <button class="gw-quest-btn secondary" id="gwPatchMapBtn" type="button">Map</button>
          <button class="gw-quest-btn secondary" id="gwPatchHomeBtn" type="button">${home ? "Home" : "Make Home"}</button>
          ${home ? `<button class="gw-quest-btn secondary" id="gwPatchUnsetHomeBtn" type="button">Unset Home</button>` : ""}
          <button class="gw-quest-btn danger" id="gwPatchRemoveBtn" type="button">Remove</button>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    root.onclick = (evt) => {
      if (evt.target === root) root.remove();
    };
    root.querySelector("#gwPatchCloseBtn").onclick = () => root.remove();
    root.querySelector("#gwPatchMapBtn").onclick = () => {
      focusPatch(id);
      minimizePatchDetail(root, patch);
    };
    root.querySelector("#gwPatchHomeBtn").onclick = () => {
      setHomePatch(id);
      root.remove();
      openPatchDetail(id, latlng);
    };
    root.querySelector("#gwPatchUnsetHomeBtn")?.addEventListener("click", () => {
      unsetHomePatch();
      root.remove();
      openPatchDetail(id, latlng);
    });
    root.querySelector("#gwPatchRemoveBtn").onclick = () => {
      if (!confirm(`Remove patch "${patchTitle(patch)}"?`)) return;
      removePatch(id);
      root.remove();
    };

    if (latlng && window.L) {
      setTimeout(() => {
        L.popup()
          .setLatLng(latlng)
          .setContent(esc(patchTitle(patch)))
          .openOn(map);
      }, 0);
    }
  }

  function boundaryLabel(patch) {
    const rings = patch.geometry?.rings || [primaryBoundary(patch)];
    const pointCount = rings.flat().length;
    return pointCount
      ? `${rings.length} ring${rings.length === 1 ? "" : "s"} / ${pointCount} points`
      : "No geometry";
  }

  function osmHumanName(tags = {}) {
    const label = [
      tags.name,
      tags["name:en"],
      tags["official_name"],
      tags["short_name"],
      tags["loc_name"],
      tags["alt_name"],
      tags["gnis:feature_name"],
      tags["old_name"]
    ].find((value) => String(value || "").trim());

    return label ? String(label).trim() : "";
  }

  function osmBoundaryKind(tags = {}) {
    if (
      tags.amenity === "grave_yard" ||
      tags.historic === "cemetery" ||
      tags.landuse === "cemetery"
    )
      return "cemetery";
    if (tags.boundary === "national_park") return "national park";
    if (tags.boundary === "protected_area") return "protected area";
    if (tags.leisure === "garden") return "garden";
    if (tags.leisure === "nature_reserve") return "nature reserve";
    if (tags.natural === "wetland") return "wetland";
    if (tags.natural === "scrub") return "scrubland";
    if (tags.natural === "heath") return "heath";
    if (tags.natural === "wood" || tags.landuse === "forest") return "woodland";
    if (tags.natural === "grassland" || tags.landuse === "grass" || tags.landuse === "meadow")
      return "grassland";
    if (tags.landuse === "recreation_ground") return "recreation ground";
    if (tags.landuse === "allotments") return "allotments";
    if (tags.landuse === "orchard") return "orchard";
    return "park";
  }

  function osmFeatureBoundary(feature) {
    return (feature?.points || [])
      .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  }

  function buildOsmLabelContext(features = [], places = []) {
    const namedBoundaries = features
      .filter((feature) => feature?.closed !== false)
      .map((feature) => ({
        feature,
        name: osmHumanName(feature.tags),
        boundary: osmFeatureBoundary(feature)
      }))
      .filter((row) => row.name && row.boundary.length >= 3);

    const namedPlaces = places
      .map((place) => ({
        name: osmHumanName(place.tags),
        point: place?.points?.[0]
          ? { lat: Number(place.points[0].lat), lng: Number(place.points[0].lng) }
          : null
      }))
      .filter(
        (row) => row.name && Number.isFinite(row.point?.lat) && Number.isFinite(row.point?.lng)
      );

    return { namedBoundaries, namedPlaces };
  }

  function inheritedOsmBoundaryName(feature, boundary, context = {}) {
    const centroid = centroidForPoints(boundary);
    if (!centroid) return null;

    const containingBoundary = (context.namedBoundaries || [])
      .filter((row) => row.feature?.id !== feature?.id)
      .map((row) => ({
        name: row.name,
        distance: pointInRing(centroid, row.boundary)
          ? 0
          : distanceToRingsM(centroid, [row.boundary])
      }))
      .filter((row) => Number.isFinite(row.distance) && row.distance <= 40)
      .sort((a, b) => a.distance - b.distance)[0];

    if (containingBoundary) return containingBoundary.name;

    const nearbyPlace = (context.namedPlaces || [])
      .map((row) => ({
        name: row.name,
        inside: pointInRing(row.point, boundary),
        distance: distanceToRingsM(row.point, [boundary])
      }))
      .filter((row) => row.inside || (Number.isFinite(row.distance) && row.distance <= 80))
      .sort((a, b) => {
        if (a.inside && !b.inside) return -1;
        if (!a.inside && b.inside) return 1;
        return a.distance - b.distance;
      })[0];

    return nearbyPlace?.name || null;
  }

  function osmFeatureLabel(feature, context = {}) {
    const tags = feature?.tags || {};
    const ownName = osmHumanName(tags);
    if (ownName) return { name: ownName, source: "own" };

    const boundary = osmFeatureBoundary(feature);
    const inheritedName =
      boundary.length >= 3 ? inheritedOsmBoundaryName(feature, boundary, context) : null;

    if (inheritedName) return { name: inheritedName, source: "inherited" };

    return {
      name: `Unnamed ${osmBoundaryKind(tags)} boundary`,
      source: "fallback"
    };
  }

  function nameForOsmFeature(feature, context = {}) {
    return osmFeatureLabel(feature, context).name;
  }

  function patchFromOsmFeature(feature, context = {}) {
    if (!feature?.id || !Array.isArray(feature.points) || feature.points.length < 3) return null;
    const boundary = feature.points
      .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (boundary.length < 3) return null;

    const id = patchIdFor("osm", feature.id);
    const label = osmFeatureLabel(feature, context);
    const kind = osmBoundaryKind(feature.tags);
    return withDerivedPatchFields({
      id,
      name: label.name,
      source: "osm",
      source_id: feature.id,
      source_label: `OSM ${kind} boundary`,
      boundary,
      geometry: {
        type: "polygon",
        rings: [boundary]
      },
      metadata: {
        tags: feature.tags || {},
        osm_id: feature.id,
        osm_label_source: label.source
      },
      created_at: new Date().toISOString()
    });
  }

  function nearbyOsmPatchCandidates(limit = 12) {
    const origin = locationOrigin();
    const savedIds = new Set(state.patches.map((patch) => patch.id));
    const osmFeatures = window.GridWildOsmFeaturesLayer?.getFeatures?.() || {};
    const features = (osmFeatures.parks || []).filter((feature) => feature.closed !== false);
    const labelContext = buildOsmLabelContext(features, osmFeatures.places || []);

    const rows = features
      .map((feature) => patchFromOsmFeature(feature, labelContext))
      .filter(Boolean)
      .filter((patch) => !savedIds.has(patch.id))
      .map((patch) => ({
        ...patch,
        distance_m: distanceToRingsM(origin, patch.geometry?.rings || [patch.boundary]),
        candidate: true
      }));

    const ownNames = new Set(
      rows
        .filter((patch) => patch.metadata?.osm_label_source === "own")
        .map((patch) => String(patch.name || "").trim())
        .filter(Boolean)
    );

    const withoutInheritedDuplicates = rows.filter((patch) => {
      if (patch.metadata?.osm_label_source === "own") return true;
      return !ownNames.has(String(patch.name || "").trim());
    });

    const namedRows = withoutInheritedDuplicates.filter(
      (patch) => patch.metadata?.osm_label_source !== "fallback"
    );
    const sourceRows = namedRows.length ? namedRows : withoutInheritedDuplicates;

    return sourceRows
      .sort((a, b) => Number(a.distance_m || Infinity) - Number(b.distance_m || Infinity))
      .slice(0, limit);
  }

  function openPatchSelector() {
    window.GridWildOsmFeaturesLayer?.scheduleFetch?.(0);
    injectFieldModalStyles();

    const root = document.createElement("div");
    root.className = "gw-quest-modal-backdrop gw-field-selector-backdrop";
    root.innerHTML = `
      <div class="gw-quest-modal gw-field-selector-modal">
        <div class="gw-quest-modal-title">Nearby Patches</div>
        <div class="gw-quest-modal-subtitle">Saved patches and nearby OSM habitat boundaries.</div>
        <div id="gwPatchSelectorRows">${renderPatchSelectorRows()}</div>
        <div class="gw-quest-actions">
          <button class="gw-quest-btn secondary" id="gwPatchSelectorCancel" type="button">Cancel</button>
          <button class="gw-quest-btn secondary" id="gwPatchSelectorRefresh" type="button">Refresh OSM</button>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    const rerender = () => {
      const rows = root.querySelector("#gwPatchSelectorRows");
      if (rows) rows.innerHTML = renderPatchSelectorRows();
    };

    root.onclick = (evt) => {
      if (evt.target === root || evt.target.closest("#gwPatchSelectorCancel")) root.remove();

      const saveBtn = evt.target.closest("[data-gw-save-patch]");
      if (saveBtn) {
        const patch = nearbyOsmPatchCandidates(24).find(
          (row) => row.id === saveBtn.dataset.gwSavePatch
        );
        if (patch) {
          upsertPatch(patch);
          rerender();
        }
      }

      const homeBtn = evt.target.closest("[data-gw-home-patch]");
      if (homeBtn) {
        const id = homeBtn.dataset.gwHomePatch;
        const patch = getPatch(id) || nearbyOsmPatchCandidates(24).find((row) => row.id === id);
        if (patch && !getPatch(id)) upsertPatch(patch);
        setHomePatch(id);
        rerender();
      }

      const mapBtn = evt.target.closest("[data-gw-map-patch]");
      if (mapBtn) {
        const id = mapBtn.dataset.gwMapPatch;
        const patch = getPatch(id) || nearbyOsmPatchCandidates(24).find((row) => row.id === id);
        if (getPatch(id)) focusPatch(id);
        else focusPatchObject(patch);
      }

      const detailBtn = evt.target.closest("[data-gw-open-patch]");
      if (detailBtn) {
        root.remove();
        openPatchDetail(detailBtn.dataset.gwOpenPatch);
      }

      const refreshBtn = evt.target.closest("#gwPatchSelectorRefresh");
      if (refreshBtn) {
        window.GridWildOsmFeaturesLayer?.scheduleFetch?.(0);
        setTimeout(rerender, 1200);
      }
    };

    window.addEventListener("gwOsmFeaturesUpdated", rerender, { once: true });
  }

  function renderPatchSelectorRows() {
    const saved = patchesWithDistance();
    const candidates = nearbyOsmPatchCandidates();
    const empty = !saved.length && !candidates.length;

    if (empty) {
      return `<div class="gw-muted">No saved patches or loaded OSM habitat boundaries nearby yet.</div>`;
    }

    return `
      ${saved.length ? `<div class="gw-field-list-heading">Saved</div>${saved.map(renderSavedPatchRow).join("")}` : ""}
      ${candidates.length ? `<div class="gw-field-list-heading">Nearby OSM</div>${candidates.map(renderCandidatePatchRow).join("")}` : ""}
    `;
  }

  function renderSavedPatchRow(patch) {
    return `
      <div class="gw-rowline gw-field-selector-row">
        <span class="gw-field-selector-main">
          <span>${esc(patchTitle(patch))}</span>
          <span class="gw-muted">${esc(formatDistance(patch.distance_m))} / ${esc(patch.source_label || patch.source || "patch")}</span>
        </span>
        <span class="gw-field-selector-actions">
          ${patch.is_home_patch ? `<span class="gw-quest-pill">Home</span>` : `<button class="gw-mini-btn" data-gw-home-patch="${esc(patch.id)}" type="button">Make Home</button>`}
          <button class="gw-mini-btn" data-gw-map-patch="${esc(patch.id)}" type="button">Map</button>
          <button class="gw-mini-btn" data-gw-open-patch="${esc(patch.id)}" type="button">Open</button>
        </span>
      </div>
    `;
  }

  function renderCandidatePatchRow(patch) {
    return `
      <div class="gw-rowline gw-field-selector-row">
        <span class="gw-field-selector-main">
          <span>${esc(patchTitle(patch))}</span>
          <span class="gw-muted">${esc(formatDistance(patch.distance_m))} / ${esc(patch.source_label || "OSM boundary")}</span>
        </span>
        <span class="gw-field-selector-actions">
          <button class="gw-mini-btn" data-gw-save-patch="${esc(patch.id)}" type="button">Save</button>
          <button class="gw-mini-btn" data-gw-home-patch="${esc(patch.id)}" type="button">Make Home</button>
          <button class="gw-mini-btn" data-gw-map-patch="${esc(patch.id)}" type="button">Map</button>
        </span>
      </div>
    `;
  }

  function injectFieldModalStyles() {
    if (document.getElementById("gwFieldSelectorStyles")) return;
    const style = document.createElement("style");
    style.id = "gwFieldSelectorStyles";
    style.textContent = `
      .gw-field-selector-modal {
        max-width: min(680px, 96vw);
      }

      .gw-field-list-heading {
        margin: 12px 0 5px;
        color: #f0d18a;
        font-size: 11px;
        font-weight: 950;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .gw-field-selector-row {
        gap: 10px;
        align-items: center;
      }

      .gw-field-selector-main {
        display: grid;
        min-width: 0;
        gap: 2px;
      }

      .gw-field-selector-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 6px;
      }

      .gw-field-load-tabs {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        margin-bottom: 10px;
      }

      .gw-field-load-tab.is-active {
        background: #f0d18a;
        color: #1d241c;
      }

      .gw-field-load-panel {
        display: none;
      }

      .gw-field-load-panel.is-active {
        display: grid;
        gap: 8px;
      }

      .gw-field-input-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
      }

      .gw-field-input-row input {
        min-width: 0;
        border-radius: 8px;
        border: 1px solid rgba(215,183,116,0.28);
        background: rgba(20,17,15,0.88);
        color: #efe6d3;
        padding: 9px 10px;
      }
    `;
    document.head.appendChild(style);
  }

  function openLoadPatchModal() {
    injectFieldModalStyles();

    const root = document.createElement("div");
    root.className = "gw-quest-modal-backdrop gw-field-selector-backdrop";
    root.innerHTML = `
      <div class="gw-quest-modal gw-field-selector-modal">
        <div class="gw-quest-modal-title">Load Patch</div>
        <div class="gw-quest-modal-subtitle">Import an iNaturalist project or place boundary as a Patch.</div>
        <div class="gw-field-load-tabs">
          <button class="gw-mini-btn gw-field-load-tab is-active" data-gw-load-tab="nearby" type="button">Nearby</button>
          <button class="gw-mini-btn gw-field-load-tab" data-gw-load-tab="search" type="button">Search</button>
          <button class="gw-mini-btn gw-field-load-tab" data-gw-load-tab="url" type="button">URL/ID</button>
        </div>
        <div class="gw-field-load-panel is-active" data-gw-load-panel="nearby">
          <button class="gw-mini-btn" id="gwPatchFindNearbyProjects" type="button">Find Nearby</button>
          <div id="gwPatchNearbyResults" class="gw-muted">No nearby boundary project search yet.</div>
        </div>
        <div class="gw-field-load-panel" data-gw-load-panel="search">
          <div class="gw-field-input-row">
            <input id="gwPatchProjectSearchInput" type="text" placeholder="Project name" />
            <button class="gw-mini-btn" id="gwPatchProjectSearchBtn" type="button">Search</button>
          </div>
          <div id="gwPatchSearchResults" class="gw-muted">No boundary project search yet.</div>
        </div>
        <div class="gw-field-load-panel" data-gw-load-panel="url">
          <div class="gw-field-input-row">
            <input id="gwPatchProjectUrlInput" type="text" placeholder="Project URL, slug, or id" />
            <button class="gw-mini-btn" id="gwPatchProjectLoadBtn" type="button">Load</button>
          </div>
          <div id="gwPatchUrlStatus" class="gw-muted">Ready.</div>
        </div>
        <div class="gw-quest-actions">
          <button class="gw-quest-btn secondary" id="gwPatchLoadCancel" type="button">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    root.onclick = (evt) => {
      if (evt.target === root || evt.target.closest("#gwPatchLoadCancel")) root.remove();
      const tab = evt.target.closest("[data-gw-load-tab]");
      if (tab) setActiveLoadTab(root, tab.dataset.gwLoadTab);
    };

    root.querySelector("#gwPatchFindNearbyProjects")?.addEventListener("click", async () => {
      const box = root.querySelector("#gwPatchNearbyResults");
      box.innerHTML = "Finding nearby boundary projects...";
      try {
        const projects = await searchINatProjects("", { nearby: true });
        box.innerHTML = renderProjectResults(projects);
      } catch (err) {
        box.innerHTML = `Could not find projects: ${esc(err.message)}`;
      }
    });

    root.querySelector("#gwPatchProjectSearchBtn")?.addEventListener("click", async () => {
      const q = root.querySelector("#gwPatchProjectSearchInput")?.value || "";
      const box = root.querySelector("#gwPatchSearchResults");
      box.innerHTML = "Searching boundary projects...";
      try {
        const projects = await searchINatProjects(q);
        box.innerHTML = renderProjectResults(projects);
      } catch (err) {
        box.innerHTML = `Could not search projects: ${esc(err.message)}`;
      }
    });

    root.querySelector("#gwPatchProjectLoadBtn")?.addEventListener("click", async () => {
      const input = root.querySelector("#gwPatchProjectUrlInput")?.value || "";
      const box = root.querySelector("#gwPatchUrlStatus");
      box.innerHTML = "Loading project...";
      try {
        const patch = await loadINatProjectPatch(input);
        box.innerHTML = `Loaded ${esc(patchTitle(patch))}.`;
        window.GridWildField?.renderIntoPage?.();
      } catch (err) {
        box.innerHTML = `Could not load project: ${esc(err.message)}`;
      }
    });

    root.addEventListener("click", async (evt) => {
      const btn = evt.target.closest("[data-gw-load-project]");
      if (!btn) return;
      const row = btn.closest("[data-gw-project-row]");
      const status = row?.querySelector(".gw-field-project-status");
      if (status) status.textContent = "Loading...";
      try {
        const patch = await loadINatProjectPatch(btn.dataset.gwLoadProject);
        if (status) status.textContent = `Loaded ${patchTitle(patch)}`;
        window.GridWildField?.renderIntoPage?.();
      } catch (err) {
        if (status) status.textContent = `Could not load: ${err.message}`;
      }
    });
  }

  function setActiveLoadTab(root, name) {
    root.querySelectorAll("[data-gw-load-tab]").forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.gwLoadTab === name);
    });
    root.querySelectorAll("[data-gw-load-panel]").forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.gwLoadPanel === name);
    });
  }

  function normalizeProjectId(input) {
    const raw = String(input || "").trim();
    if (!raw) throw new Error("Project id or URL required.");
    try {
      const url = new URL(raw);
      const parts = url.pathname.split("/").filter(Boolean);
      const idx = parts.indexOf("projects");
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
      return parts[parts.length - 1] || raw;
    } catch {
      return raw.replace(/^projects\//, "");
    }
  }

  async function fetchINatJson(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`iNaturalist HTTP ${resp.status}`);
    return await resp.json();
  }

  function firstResult(data) {
    if (Array.isArray(data?.results)) return data.results[0] || null;
    if (Array.isArray(data)) return data[0] || null;
    return data || null;
  }

  function projectLookupId(project) {
    return String(project?.slug || project?.id || "").trim();
  }

  async function fetchProjectDetail(projectOrId) {
    const base = typeof projectOrId === "object" && projectOrId ? projectOrId : null;
    const projectId = base ? projectLookupId(base) : normalizeProjectId(projectOrId);
    if (!projectId) return base;

    const data = await fetchINatJson(
      `https://api.inaturalist.org/v1/projects/${encodeURIComponent(projectId)}`
    );
    const detail = firstResult(data);
    return detail ? { ...(base || {}), ...detail } : base;
  }

  async function resolveINatProjectBoundary(projectOrId) {
    const key =
      typeof projectOrId === "object" && projectOrId
        ? projectLookupId(projectOrId)
        : normalizeProjectId(projectOrId);

    if (!key) return null;
    if (projectBoundaryCache.has(key)) return await projectBoundaryCache.get(key);

    const promise = (async () => {
      let project = typeof projectOrId === "object" && projectOrId ? projectOrId : null;
      let placeId = project ? inferProjectPlaceId(project) : null;

      if (!project || !placeId) {
        project = await fetchProjectDetail(projectOrId);
        placeId = project ? inferProjectPlaceId(project) : null;
      }

      if (!project || !placeId) return null;

      const geometry = await loadINatPlaceGeometry(placeId).catch((err) => {
        console.warn("Could not resolve iNat project boundary:", err);
        return null;
      });

      if (!geometry?.rings?.length) return null;
      return { project, placeId, geometry };
    })();

    projectBoundaryCache.set(key, promise);
    return await promise;
  }

  async function filterProjectsWithBoundaries(projects = [], options = {}) {
    const origin = options.origin || null;
    const checks = projects.slice(0, INAT_PROJECT_GEOMETRY_CHECK_LIMIT).map(async (project) => {
      try {
        const resolved = await resolveINatProjectBoundary(project);
        if (!resolved) return null;

        const distance = origin ? distanceToRingsM(origin, resolved.geometry.rings) : Infinity;
        if (options.nearby && (!Number.isFinite(distance) || distance > NEARBY_PROJECT_RADIUS_M)) {
          return null;
        }

        return {
          ...resolved.project,
          __gwPlaceId: resolved.placeId,
          __gwBoundaryGeometry: resolved.geometry,
          distance_m: distance
        };
      } catch (err) {
        console.warn("Could not inspect iNat project boundary:", err);
        return null;
      }
    });

    const rows = (await Promise.all(checks)).filter(Boolean);
    return rows
      .sort((a, b) => {
        const da = Number(a.distance_m);
        const db = Number(b.distance_m);
        if (Number.isFinite(da) && Number.isFinite(db) && da !== db) return da - db;
        if (Number.isFinite(da) && !Number.isFinite(db)) return -1;
        if (!Number.isFinite(da) && Number.isFinite(db)) return 1;
        return String(a.title || a.name || a.slug || a.id || "").localeCompare(
          String(b.title || b.name || b.slug || b.id || "")
        );
      })
      .slice(0, INAT_PROJECT_RESULT_LIMIT);
  }

  async function searchINatProjects(query, options = {}) {
    const url = new URL("https://api.inaturalist.org/v1/projects");
    url.searchParams.set(
      "per_page",
      String(options.nearby ? INAT_PROJECT_SEARCH_PAGE_SIZE : INAT_PROJECT_RESULT_LIMIT)
    );
    if (query) url.searchParams.set("q", query);
    const origin = nearbySearchOrigin();
    if (options.nearby && origin) {
      url.searchParams.set("lat", String(origin.lat));
      url.searchParams.set("lng", String(origin.lng));
    }
    const data = await fetchINatJson(url);
    const projects = Array.isArray(data.results) ? data.results : [];
    return await filterProjectsWithBoundaries(projects, {
      nearby: options.nearby === true,
      origin
    });
  }

  function renderProjectResults(projects = []) {
    if (!projects.length) return `<div class="gw-muted">No boundary projects found.</div>`;
    return projects
      .map((project) => {
        const meta = [
          Number.isFinite(Number(project.distance_m)) ? formatDistance(project.distance_m) : null,
          project.slug || project.project_type || "iNaturalist project",
          project.__gwPlaceId ? "boundary" : null
        ].filter(Boolean);

        return `
        <div class="gw-rowline gw-field-selector-row" data-gw-project-row>
          <span class="gw-field-selector-main">
            <span>${esc(project.title || project.name || project.slug || project.id)}</span>
            <span class="gw-muted">${esc(meta.join(" / "))}</span>
            <span class="gw-muted gw-field-project-status"></span>
          </span>
          <span class="gw-field-selector-actions">
            <button class="gw-mini-btn" data-gw-load-project="${esc(project.slug || project.id)}" type="button">Load</button>
          </span>
        </div>
      `;
      })
      .join("");
  }

  async function loadINatProjectPatch(input) {
    const projectId = normalizeProjectId(input);
    const resolved = await resolveINatProjectBoundary(projectId);
    if (!resolved) throw new Error("Project has no loadable place boundary.");

    const { project, placeId, geometry } = resolved;
    const rings = geometry.rings || [];
    if (!rings.length) throw new Error("No boundary geometry found.");

    const firstRing = rings[0] || [];
    const patch = upsertPatch({
      id: patchIdFor("inat_project", project.id || project.slug || projectId),
      name: project.title || project.name || project.slug || "iNaturalist project patch",
      source: "inat_project",
      source_id: String(project.id || projectId),
      source_url:
        project.uri ||
        `https://www.inaturalist.org/projects/${project.slug || project.id || projectId}`,
      source_label: "iNaturalist project",
      boundary: firstRing,
      geometry: {
        type: geometry.type || "polygon",
        rings,
        geojson: geometry.geojson || null,
        source_format: geometry.source_format
      },
      survey_geometry: {
        boundary:
          rings.length === 1
            ? firstRing
            : rings.map((ring) => ({
                geojson: {
                  type: "Polygon",
                  coordinates: [ring.map((p) => [p.lng, p.lat])]
                }
              })),
        paths: [],
        exclusions: [],
        denseZones: [],
        assets: [],
        styles: {
          boundary: {
            fillColor: "#6fb7ff",
            lineColor: "#f0d18a",
            lineWeight: 3,
            fillOpacity: 0.12
          }
        }
      },
      metadata: {
        project,
        place_id: placeId,
        imported_from: "inat_project"
      },
      created_at: new Date().toISOString()
    });

    setVisible(true);
    return patch;
  }

  function firstPlaceId(value) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const id = firstPlaceId(item);
        if (id) return id;
      }
      return null;
    }

    if (value && typeof value === "object") {
      return value.id || value.place_id || null;
    }

    return value || null;
  }

  function inferProjectPlaceId(project) {
    const rules = [
      ...(project.project_observation_rules || []),
      ...(project.project_observation_fields || [])
    ];
    const placeRule = rules.find((rule) => {
      const text = [rule.operator, rule.term, rule.operand_type, rule.operand?.type]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes("place");
    });
    return (
      project.place_id ||
      firstPlaceId(project.place) ||
      firstPlaceId(project.place_ids) ||
      firstPlaceId(project.search_parameters?.place_id) ||
      firstPlaceId(project.search_parameters?.places) ||
      firstPlaceId(project.rule_preferences?.place_id) ||
      firstPlaceId(project.rule_preferences?.places) ||
      placeRule?.operand_id ||
      placeRule?.operand?.id ||
      null
    );
  }

  async function loadINatPlaceGeometry(placeId) {
    const key = String(placeId || "").trim();
    if (!key) return { type: "geojson", rings: [] };
    if (placeGeometryCache.has(key)) return await placeGeometryCache.get(key);

    const promise = (async () => {
      const placeUrl = `https://api.inaturalist.org/v1/places/${encodeURIComponent(key)}`;
      try {
        const data = await fetchINatJson(placeUrl);
        const place = firstResult(data);
        const geojson = place?.geometry_geojson || place?.geojson || place?.geometry || null;
        const parsed = parseGeoJsonGeometry(geojson);
        if (parsed.rings.length) {
          return { ...parsed, geojson, source_format: "inat_place_geojson" };
        }
      } catch (err) {
        console.warn("Could not load iNat place GeoJSON:", err);
      }

      const kmlUrl = `https://www.inaturalist.org/places/geometry/${encodeURIComponent(key)}.kml`;
      const resp = await fetch(kmlUrl);
      if (!resp.ok) throw new Error(`iNaturalist KML HTTP ${resp.status}`);
      const text = await resp.text();
      return {
        type: "kml",
        rings: parseKmlRings(text),
        source_format: "inat_place_kml"
      };
    })();

    placeGeometryCache.set(key, promise);

    try {
      return await promise;
    } catch (err) {
      placeGeometryCache.delete(key);
      throw err;
    }
  }

  function parseGeoJsonGeometry(input) {
    if (!input) return { type: "geojson", rings: [] };
    const obj = typeof input === "string" ? JSON.parse(input) : input;
    const rings = [];

    function visit(geo) {
      if (!geo) return;
      if (geo.type === "FeatureCollection") {
        (geo.features || []).forEach(visit);
      } else if (geo.type === "Feature") {
        visit(geo.geometry);
      } else if (geo.type === "Polygon") {
        const ring = coordsToRing(geo.coordinates?.[0] || []);
        if (ring.length >= 3) rings.push(ring);
      } else if (geo.type === "MultiPolygon") {
        (geo.coordinates || []).forEach((poly) => {
          const ring = coordsToRing(poly?.[0] || []);
          if (ring.length >= 3) rings.push(ring);
        });
      }
    }

    visit(obj);
    return { type: obj?.type || "geojson", rings };
  }

  function coordsToRing(coords = []) {
    return coords
      .map((pair) => ({ lng: Number(pair?.[0]), lat: Number(pair?.[1]) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  }

  function parseKmlRings(text) {
    const doc = new window.DOMParser().parseFromString(text, "application/xml");
    return [...doc.querySelectorAll("Polygon coordinates")]
      .map((node) => String(node.textContent || "").trim())
      .map(parseKmlCoordinates)
      .filter((ring) => ring.length >= 3);
  }

  function parseKmlCoordinates(text) {
    return String(text || "")
      .split(/\s+/)
      .map((chunk) => {
        const [lng, lat] = chunk.split(",").map(Number);
        return { lat, lng };
      })
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  }

  function init() {
    saveLayerVisible();
    savePatches();
    render();
    document.addEventListener("DOMContentLoaded", () => {
      setTimeout(() => {
        render();
      }, 100);
    });
    window.addEventListener("gwUserLocationUpdated", render);
    window.addEventListener("gwRecentINatUpdated", render);
    window.addEventListener("gridwild:staticheatloaded", render);
    window.addEventListener("gridwild:filterschange", render);
    window.addEventListener("gridwild:heatchange", render);
    window.addEventListener("gwBootstrapReady", render);
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (!state.actionMenuRoot || event.target?.closest?.(".gw-patch-action-menu")) return;
        closePatchActionMenu();
      },
      { passive: true }
    );
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closePatchActionMenu();
    });
    window.map?.on?.("movestart zoomstart", closePatchActionMenu);
  }

  window.GridWildPatches = {
    focusPatch,
    formatDistance,
    getHomePatch,
    getPatch,
    getPatches: () => patchesWithDistance(),
    isVisible: () => state.layerVisible,
    showLocalPatchHighlights,
    clearLocalPatchHighlights,
    shouldSuppressHudActionMenu,
    isPatchAtLatLng,
    openPatchActionMenuAtLatLng,
    blinkLocalPatches,
    patchQuestTargetCells,
    startPatchFillQuest,
    loadINatProjectPatch,
    nearbyOsmPatchCandidates,
    openLoadPatchModal,
    openPatchDetail,
    openPatchSelector,
    removePatch,
    render,
    setHomePatch,
    setVisible,
    toggleVisible,
    unsetHomePatch,
    upsertPatch
  };

  init();
})();
