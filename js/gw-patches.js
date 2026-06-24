// GridWild Patches
// First-class human-imposed field boundaries, backed by local storage for now.

(function () {
  const PATCHES_KEY = "gw_field_patches_v1";
  const HOME_PATCH_KEY = "gw_home_patch_id_v1";
  const PATCH_VISIBLE_KEY = "gw_patch_layer_visible_v1";
  const PANE = "gwPatchPane";
  const LABEL_PANE = "gwPatchLabelPane";
  const INAT_PROJECT_RESULT_LIMIT = 12;
  const INAT_PROJECT_SEARCH_PAGE_SIZE = 24;
  const INAT_PROJECT_GEOMETRY_CHECK_LIMIT = 18;
  const INAT_PROJECT_NEARBY_GEOMETRY_CHECK_LIMIT = 72;
  const INAT_PROJECT_FOV_MARGIN_RATIO = 0.14;
  const INAT_PROJECT_MAX_FOV_BOUNDS_RATIO = 1;
  const INAT_PLACE_NEARBY_PAGE_SIZE = 50;
  const INAT_PLACE_PROJECT_LOOKUP_LIMIT = 18;
  const INAT_PROJECTS_PER_PLACE_LIMIT = 12;
  const NEARBY_PROJECT_RADIUS_M = 50000;
  const PATCH_COMPLETENESS_MAX_EXACT_CELLS = 12000;
  const PATCH_COMPLETENESS_MAX_SAMPLE_CELLS = 6000;
  const PATCH_HERE_SELECTION_SCAN_LIMIT = 1800;
  const PATCH_QUEST_TARGET_MAX_CELLS = 400;
  const PATCH_QUEST_SCAN_MAX_BBOX_CELLS = 120000;
  const PATCH_VIEW_SEARCH_RADIUS_M = 220;
  const PATCH_VIEW_OSM_FETCH_RADIUS_M = 420;
  const PATCH_VIEW_INAT_SEARCH_RADIUS_M = 900;
  const PATCH_VIEW_OSM_CANDIDATE_LIMIT = 160;
  const PATCH_VIEW_INAT_PROJECT_LIMIT = 18;
  const PATCH_VIEW_INAT_GEOMETRY_CHECK_LIMIT = 96;
  const PATCH_MENU_LONG_HOLD_MS = 620;
  const PATCH_MENU_MOVE_TOLERANCE_PX = 14;
  const PATCH_LABEL_ICON_WIDTH = 158;
  const PATCH_LABEL_ICON_HEIGHT = 36;
  const PATCH_LABEL_ICON_ANCHOR_X = 79;
  const PATCH_LABEL_ICON_ANCHOR_Y = 40;
  const PATCH_LABEL_VIEWPORT_PADDING_PX = 14;
  const PATCH_LABEL_SELECTED_LIFT_PX = 16;
  const PATCH_LABEL_DEFAULT_LIFT_PX = 3;
  const PATCH_GROUP_DICE_THRESHOLD = 0.82;
  const PATCH_GROUP_SAMPLE_STEPS = 22;
  const PATCH_GROUP_YEAR_DICE_THRESHOLD = 0.04;
  const PATCH_GROUP_YEAR_COVERAGE_THRESHOLD = 0.08;
  const PATCH_GROUP_MIN_INTERSECTION_M2 = 35;
  const PATCH_SUBSCRIPTION_POLL_MS = 10 * 60 * 1000;
  const PATCH_SUBSCRIPTION_INITIAL_DELAY_MS = 4500;
  const PATCH_SUBSCRIPTION_SCAN_LIMIT = 6;
  const PATCH_SUBSCRIPTION_PER_PAGE = 40;
  const PATCH_SUBSCRIPTION_SEEN_LIMIT = 160;
  const PATCH_SUBSCRIPTION_ICONIC_TAXA = [
    "Any",
    "Plantae",
    "Animalia",
    "Fungi",
    "Insecta",
    "Arachnida",
    "Aves",
    "Mammalia",
    "Reptilia",
    "Amphibia",
    "Actinopterygii",
    "Mollusca"
  ];
  const PATCH_BOUNDARY_THEMES = {
    default: {
      lineColor: "#ffd85a",
      glowColor: "#fff2a8",
      fillColor: "#ffd85a",
      fillOpacity: 0.1,
      homeFillOpacity: 0.16,
      peekFillOpacity: 0.2,
      candidateFillColor: "#ffed9a",
      candidateFillOpacity: 0.16,
      className: "gw-patch-boundary-gold",
      glowClassName: "gw-patch-boundary-glow-gold",
      peekClassName: "gw-patch-peek-outline-gold",
      labelBg: "rgba(255,216,90,0.94)",
      labelText: "#231a12",
      labelRing: "rgba(255,216,90,0.30)",
      labelGlow: "rgba(255,216,90,0.24)"
    },
    inat_project: {
      lineColor: "#7ddfff",
      glowColor: "#c7f5ff",
      fillColor: "#7ddfff",
      fillOpacity: 0.13,
      homeFillOpacity: 0.19,
      peekFillOpacity: 0.22,
      candidateFillColor: "#a9efff",
      candidateFillOpacity: 0.18,
      className: "gw-patch-boundary-inat",
      glowClassName: "gw-patch-boundary-glow-inat",
      peekClassName: "gw-patch-peek-outline-inat",
      labelBg: "rgba(125,223,255,0.92)",
      labelText: "#06242c",
      labelRing: "rgba(125,223,255,0.38)",
      labelGlow: "rgba(125,223,255,0.28)"
    }
  };

  const projectBoundaryCache = new Map();
  const placeGeometryCache = new Map();
  const patchSubscriptionFetches = new Map();

  const state = {
    patches: loadPatches(),
    homePatchId: loadHomePatchId(),
    layerVisible: loadLayerVisible(),
    layer: null,
    peekLayer: null,
    peekMapClickHandler: null,
    peekRunId: 0,
    peekRows: [],
    selectedPatchId: null,
    lastOpen: { id: null, at: 0 },
    actionMenuRoot: null,
    patchHoldTimer: null,
    patchHoldStart: null,
    labelUpdateRaf: null,
    suppressPatchInfoUntil: 0,
    suppressHudActionMenuUntil: 0,
    subscriptionPollTimer: null,
    subscriptionScanTimer: null,
    subscriptionScanInFlight: false,
    subscriptionScanPending: false
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

  function shortHash(value) {
    const raw = String(value || "");
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
  }

  function plainClone(value) {
    if (!value) return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return null;
    }
  }

  function withoutPatchGroupingFields(patch) {
    if (!patch || typeof patch !== "object") return patch;
    const clone = { ...patch };
    delete clone.child_patches;
    delete clone.group_overlap;
    delete clone.group_parent_id;
    delete clone.group_parent_title;
    delete clone.group_reason;
    delete clone.is_child_patch;
    return clone;
  }

  function isINatProjectPatch(patch) {
    return (
      patch?.source === "inat_project" ||
      patch?.metadata?.imported_from === "inat_project" ||
      /iNaturalist/i.test(String(patch?.source_label || ""))
    );
  }

  function isOsmPatch(patch) {
    return (
      patch?.source === "osm" ||
      patch?.metadata?.imported_from === "osm" ||
      patch?.metadata?.osm_id != null ||
      /^OSM\b/i.test(String(patch?.source_label || ""))
    );
  }

  function isYearINatProjectPatch(patch) {
    if (!isINatProjectPatch(patch)) return false;
    const project = patch?.metadata?.project || {};
    const haystack = [
      patch?.name,
      patch?.title,
      patch?.source_id,
      patch?.source_url,
      project?.title,
      project?.name,
      project?.slug
    ].join(" ");
    return /\b(?:19|20)\d{2}\b/.test(haystack);
  }

  function patchBoundaryTheme(patch) {
    return isINatProjectPatch(patch)
      ? PATCH_BOUNDARY_THEMES.inat_project
      : PATCH_BOUNDARY_THEMES.default;
  }

  function patchBoundarySurveyStyle(patch) {
    const theme = patchBoundaryTheme(patch);
    return {
      fillColor: theme.fillColor,
      lineColor: theme.lineColor,
      lineWeight: 3,
      fillOpacity: theme.fillOpacity
    };
  }

  function patchHudThemeVars(theme) {
    return [
      `--gw-patch-theme-ring:${theme.labelRing}`,
      `--gw-patch-theme-soft-glow:${theme.labelGlow}`,
      `--gw-patch-theme-label-bg:${theme.labelBg}`,
      `--gw-patch-theme-text:${theme.labelText}`
    ].join(";");
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

  function nearbySearchBounds() {
    if (!window.map?.getBounds || !window.L) return null;
    return expandLatLngBounds(map.getBounds(), INAT_PROJECT_FOV_MARGIN_RATIO);
  }

  function normalizeLatLng(latlng) {
    const lat = Number(latlng?.lat);
    const lng = Number(latlng?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }

  function boundsAroundLatLng(latlng, radiusM = PATCH_VIEW_SEARCH_RADIUS_M) {
    const point = normalizeLatLng(latlng);
    if (!point || !window.L) return null;

    const latPad = Math.max(0.00008, Number(radiusM) / 111320);
    const lngScale = Math.max(0.18, Math.cos((point.lat * Math.PI) / 180));
    const lngPad = Math.max(0.00008, Number(radiusM) / (111320 * lngScale));

    return L.latLngBounds(
      [point.lat - latPad, point.lng - lngPad],
      [point.lat + latPad, point.lng + lngPad]
    );
  }

  function currentFovBounds() {
    if (!window.map?.getBounds) return null;
    const bounds = map.getBounds();
    return bounds?.isValid?.() ? bounds : null;
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

  function normalizePatchSubscription(subscription = {}) {
    const rawIconic = String(subscription.iconicTaxon || subscription.iconic_taxon || "Any");
    const iconicTaxon = PATCH_SUBSCRIPTION_ICONIC_TAXA.includes(rawIconic) ? rawIconic : "Any";
    const rawTaxonId = String(subscription.taxonId || subscription.taxon_id || "").trim();
    const taxonId = /^\d+$/.test(rawTaxonId) ? rawTaxonId : "";
    const seenObservationIds = Array.isArray(subscription.seenObservationIds)
      ? subscription.seenObservationIds.map(String).filter(Boolean)
      : [];

    return {
      enabled: subscription.enabled === true,
      iconicTaxon,
      taxonId,
      taxonLabel: String(subscription.taxonLabel || subscription.taxon_label || "").trim(),
      lastCheckedAt: subscription.lastCheckedAt || subscription.last_checked_at || null,
      lastAssignmentAt: subscription.lastAssignmentAt || subscription.last_assignment_at || null,
      lastUnknownCount: Math.max(0, Number(subscription.lastUnknownCount) || 0),
      lastError: String(subscription.lastError || "").trim(),
      seenObservationIds: seenObservationIds.slice(-PATCH_SUBSCRIPTION_SEEN_LIMIT)
    };
  }

  function patchSubscription(patch) {
    return normalizePatchSubscription(patch?.subscription || {});
  }

  function isPatchSubscribed(patch) {
    return patchSubscription(patch).enabled === true;
  }

  function patchSubscriptionTaxonLabel(subscription = {}) {
    const sub = normalizePatchSubscription(subscription);
    if (sub.taxonLabel) return sub.taxonLabel;
    if (sub.taxonId) return `Taxon ${sub.taxonId}`;
    if (sub.iconicTaxon && sub.iconicTaxon !== "Any") return sub.iconicTaxon;
    return "Any life";
  }

  function formatPatchSubscriptionTime(value) {
    if (!value) return "Not checked yet";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not checked yet";
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
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

  function bboxForRings(rings = []) {
    const points = validRingPoints(rings);
    if (!points.length) return null;

    return points.reduce(
      (bounds, point) => ({
        minLat: Math.min(bounds.minLat, point.lat),
        maxLat: Math.max(bounds.maxLat, point.lat),
        minLng: Math.min(bounds.minLng, point.lng),
        maxLng: Math.max(bounds.maxLng, point.lng)
      }),
      {
        minLat: Infinity,
        maxLat: -Infinity,
        minLng: Infinity,
        maxLng: -Infinity
      }
    );
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

    if (typeof window.getGridWildRuntimeMetricsForCell === "function") {
      const metrics = window.getGridWildRuntimeMetricsForCell(ix, iy);
      if (metrics) return metrics;
    }

    const baseMetrics =
      window.__richGridMetrics?.get?.(key) || window.__staticGridCounts?.get?.(key) || null;

    if (typeof window.getDisplayMetricsForCell === "function") {
      return window.getDisplayMetricsForCell(ix, iy, baseMetrics || null) || null;
    }

    return baseMetrics;
  }

  function staticObservationCountForCell(ix, iy) {
    const metrics = displayMetricsForCell(ix, iy);
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
        targetCount: targetInfo.cells.length,
        requiresUniqueCellProgress: true,
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
      description: `Observe one organism in each marked unobserved GridWild square inside ${patchTitle(patch)}. ${storedCount} of ${targetCount} eligible target squares are marked for this run.`,
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

  function observationPoint(obs) {
    const coords = obs?.geojson?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }

    const location = String(obs?.location || "");
    if (location.includes(",")) {
      const [lat, lng] = location.split(",").map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }

    const lat = Number(obs?.latitude || obs?.lat);
    const lng = Number(obs?.longitude || obs?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }

  function normalizeSubscriptionUnknown(obs) {
    const point = observationPoint(obs);
    if (!point || obs?.id == null) return null;
    const taxon = obs.taxon || {};
    return {
      id: String(obs.id),
      lat: point.lat,
      lng: point.lng,
      observedAt: obs.observed_on || obs.time_observed_at || null,
      createdAt: obs.created_at || null,
      taxonName: taxon.preferred_common_name || taxon.name || "Unknown",
      userLogin: obs.user?.login || "",
      url: obs.uri || `https://www.inaturalist.org/observations/${obs.id}`
    };
  }

  function patchSubscriptionFetchKey(patch, subscription, bbox) {
    const sub = normalizePatchSubscription(subscription);
    return [
      patch?.id || "",
      sub.iconicTaxon || "Any",
      sub.taxonId || "",
      Number(bbox.minLat).toFixed(5),
      Number(bbox.minLng).toFixed(5),
      Number(bbox.maxLat).toFixed(5),
      Number(bbox.maxLng).toFixed(5)
    ].join(":");
  }

  async function fetchPatchSubscriptionUnknowns(patch, subscription = {}, options = {}) {
    const rings = patchRings(patch);
    const bbox = bboxForRings(rings);
    if (!bbox) return [];

    const sub = normalizePatchSubscription(subscription);
    const key = patchSubscriptionFetchKey(patch, sub, bbox);
    if (!options.force && patchSubscriptionFetches.has(key)) {
      return patchSubscriptionFetches.get(key);
    }

    const promise = (async () => {
      const url = new URL("https://api.inaturalist.org/v1/observations");
      url.searchParams.set("identified", "false");
      url.searchParams.set("photos", "true");
      url.searchParams.set("geo", "true");
      url.searchParams.set("quality_grade", "needs_id");
      url.searchParams.set("captive", "false");
      url.searchParams.set("order_by", "created_at");
      url.searchParams.set("order", "desc");
      url.searchParams.set(
        "per_page",
        String(Math.min(80, Math.max(1, Number(options.perPage) || PATCH_SUBSCRIPTION_PER_PAGE)))
      );
      url.searchParams.set("nelat", String(bbox.maxLat));
      url.searchParams.set("nelng", String(bbox.maxLng));
      url.searchParams.set("swlat", String(bbox.minLat));
      url.searchParams.set("swlng", String(bbox.minLng));
      url.searchParams.set("geoprivacy", "open");
      url.searchParams.set("taxon_geoprivacy", "open");
      if (sub.iconicTaxon && sub.iconicTaxon !== "Any") {
        url.searchParams.set("iconic_taxa", sub.iconicTaxon);
      }
      if (sub.taxonId) url.searchParams.set("taxon_id", sub.taxonId);

      const resp = await fetch(url.toString());
      if (!resp.ok) throw new Error(`iNaturalist unknowns request failed: HTTP ${resp.status}`);
      const data = await resp.json();
      const results = Array.isArray(data?.results) ? data.results : [];
      return results
        .map(normalizeSubscriptionUnknown)
        .filter(Boolean)
        .filter((obs) => pointInRings(obs, rings));
    })().finally(() => {
      patchSubscriptionFetches.delete(key);
    });

    patchSubscriptionFetches.set(key, promise);
    return promise;
  }

  function patchSubscriptionQuestRecipe(patch, subscription, unknowns = []) {
    const recipe = patchIdentifyQuestRecipe(patch);
    if (!recipe) return null;

    const sub = normalizePatchSubscription(subscription);
    const observationIds = unknowns.map((obs) => String(obs.id)).filter(Boolean);
    const quantity = Math.max(1, Math.min(5, observationIds.length || unknowns.length || 1));

    return {
      ...recipe,
      iconicTaxon: sub.iconicTaxon || "Any",
      quantity,
      target: {
        ...(recipe.target || {}),
        kind: "patch_subscription_unknowns",
        subscriptionId: `${patch.id}:${sub.iconicTaxon || "Any"}:${sub.taxonId || ""}`,
        taxonId: sub.taxonId || "",
        taxonLabel: patchSubscriptionTaxonLabel(sub),
        unknownCount: unknowns.length,
        observationIds,
        generatedAt: new Date().toISOString()
      }
    };
  }

  function patchSubscriptionAssignment(patch, subscription, unknowns = []) {
    const recipe = patchSubscriptionQuestRecipe(patch, subscription, unknowns);
    if (!recipe) return null;

    const sub = normalizePatchSubscription(subscription);
    const ids = unknowns.map((obs) => obs.id).filter(Boolean);
    const taxonLabel = patchSubscriptionTaxonLabel(sub);
    const patchName = patchTitle(patch);
    const count = unknowns.length;
    const countLabel = `${count} unknown observation${count === 1 ? "" : "s"}`;
    const id = `patch_sub_${shortHash(
      `${patch.id}|${sub.iconicTaxon}|${sub.taxonId}|${ids.slice(0, 12).join(",")}`
    )}`;

    return {
      id,
      type: "quest_assignment",
      title: `Identify Unknowns: ${patchName}`,
      copy: `${countLabel} need IDs inside ${patchName}.`,
      created_at: new Date().toISOString(),
      payload: {
        patchId: patch.id,
        patchName,
        taxonLabel,
        unknownCount: count,
        observationIds: ids,
        questTitle: `Identify Unknowns: ${patchName}`,
        questDescription: `Add identifications to ${countLabel} inside ${patchName}.`,
        recipe
      }
    };
  }

  function deliverPatchQuestAssignments(assignments = []) {
    const rows = assignments.filter(Boolean);
    if (!rows.length) return;

    if (window.GridWildPlayerInteractions?.setQuestAssignments) {
      window.GridWildPlayerInteractions.setQuestAssignments(rows);
    } else {
      window.setTimeout(() => {
        window.GridWildPlayerInteractions?.setQuestAssignments?.(rows);
      }, 1200);
    }

    window.dispatchEvent(
      new CustomEvent("gwPatchSubscriptionQuestAssignments", {
        detail: { assignments: rows }
      })
    );
  }

  async function checkPatchSubscriptionNow(patchId, options = {}) {
    const patch = getPatch(patchId);
    if (!patch) return null;
    const sub = patchSubscription(patch);
    if (!sub.enabled) return null;

    const checkedAt = new Date().toISOString();
    try {
      const unknowns = await fetchPatchSubscriptionUnknowns(patch, sub, {
        force: options.force === true
      });
      const seen = new Set(sub.seenObservationIds || []);
      const unseen = unknowns.filter((obs) => !seen.has(String(obs.id)));
      const assignmentUnknowns = unseen.length ? unseen : options.force ? unknowns : [];
      const nextSeen = Array.from(
        new Set([...Array.from(seen), ...unknowns.map((obs) => String(obs.id))])
      ).slice(-PATCH_SUBSCRIPTION_SEEN_LIMIT);
      const assignment = assignmentUnknowns.length
        ? patchSubscriptionAssignment(patch, sub, assignmentUnknowns)
        : null;

      writePatchSubscription(
        patch.id,
        {
          ...sub,
          lastCheckedAt: checkedAt,
          lastAssignmentAt: assignment ? checkedAt : sub.lastAssignmentAt,
          lastUnknownCount: unknowns.length,
          lastError: "",
          seenObservationIds: nextSeen
        },
        { render: false, schedule: false }
      );

      if (assignment) {
        deliverPatchQuestAssignments([assignment]);
        if (options.toastResult) toast("Quest assignment added to your HUD Inbox.");
      } else if (options.toastResult) {
        toast(unknowns.length ? "No new unknowns for this subscription." : "No unknowns found.");
      }

      return { unknowns, assignment };
    } catch (err) {
      console.warn("Could not check patch subscription:", err);
      writePatchSubscription(
        patch.id,
        {
          ...sub,
          lastCheckedAt: checkedAt,
          lastError: err?.message || "Could not check subscription"
        },
        { render: false, schedule: false }
      );
      if (options.toastResult) toast(err?.message || "Could not check subscription.");
      return null;
    }
  }

  async function scanPatchSubscriptions(options = {}) {
    if (state.subscriptionScanInFlight) {
      state.subscriptionScanPending = true;
      return;
    }

    const now = Date.now();
    const candidates = subscribedPatches()
      .map((patch) => ({ patch, subscription: patchSubscription(patch) }))
      .filter(({ subscription }) => {
        if (options.force) return true;
        const last = subscription.lastCheckedAt
          ? new Date(subscription.lastCheckedAt).getTime()
          : 0;
        return !last || now - last >= PATCH_SUBSCRIPTION_POLL_MS * 0.85;
      })
      .slice(0, PATCH_SUBSCRIPTION_SCAN_LIMIT);

    if (!candidates.length) return;

    state.subscriptionScanInFlight = true;
    try {
      for (const { patch } of candidates) {
        await checkPatchSubscriptionNow(patch.id, { force: options.force === true });
      }
    } finally {
      state.subscriptionScanInFlight = false;
      if (state.subscriptionScanPending) {
        state.subscriptionScanPending = false;
        schedulePatchSubscriptionScan(1500);
      }
    }
  }

  function schedulePatchSubscriptionScan(
    delayMs = PATCH_SUBSCRIPTION_INITIAL_DELAY_MS,
    options = {}
  ) {
    if (state.subscriptionScanTimer) window.clearTimeout(state.subscriptionScanTimer);
    state.subscriptionScanTimer = window.setTimeout(
      () => {
        state.subscriptionScanTimer = null;
        scanPatchSubscriptions(options);
      },
      Math.max(0, Number(delayMs) || 0)
    );
  }

  function startPatchSubscriptionPolling() {
    schedulePatchSubscriptionScan(PATCH_SUBSCRIPTION_INITIAL_DELAY_MS);
    if (state.subscriptionPollTimer) return;
    state.subscriptionPollTimer = window.setInterval(
      () => scanPatchSubscriptions({ quiet: true }),
      PATCH_SUBSCRIPTION_POLL_MS
    );
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

  function clampNumber(value, min, max) {
    if (max < min) return (min + max) / 2;
    return Math.max(min, Math.min(max, value));
  }

  function patchLabelLatLngForViewport(latlng, rings = [], options = {}) {
    if (
      !latlng ||
      !window.map?.getBounds ||
      !window.map?.getSize ||
      !window.map?.latLngToContainerPoint ||
      !window.map?.containerPointToLatLng ||
      !window.L?.point
    ) {
      return latlng;
    }

    const bounds = map.getBounds();
    if (!ringsIntersectBounds(rings, bounds)) return latlng;

    const size = map.getSize();
    const preferred = map.latLngToContainerPoint(latlng);
    const padding = PATCH_LABEL_VIEWPORT_PADDING_PX;
    const lift = options.selected ? PATCH_LABEL_SELECTED_LIFT_PX : PATCH_LABEL_DEFAULT_LIFT_PX;
    const visualHeight = PATCH_LABEL_ICON_HEIGHT + (options.selected ? 3 : 0);

    const minX = padding + PATCH_LABEL_ICON_ANCHOR_X;
    const maxX = size.x - padding - (PATCH_LABEL_ICON_WIDTH - PATCH_LABEL_ICON_ANCHOR_X);
    const minY = padding + PATCH_LABEL_ICON_ANCHOR_Y + lift;
    const maxY = size.y - padding + PATCH_LABEL_ICON_ANCHOR_Y + lift - visualHeight;
    const clamped = L.point(
      clampNumber(preferred.x, minX, maxX),
      clampNumber(preferred.y, minY, maxY)
    );

    return map.containerPointToLatLng(clamped);
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

  function ringsBounds(rings = []) {
    const points = validRingPoints(rings);
    if (!points.length || !window.L) return null;
    return L.latLngBounds(points.map((point) => [point.lat, point.lng]));
  }

  function boundsSizeMeters(bounds) {
    if (!bounds?.isValid?.()) return null;
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const se = { lat: sw.lat, lng: ne.lng };
    const nw = { lat: ne.lat, lng: sw.lng };
    const widthM = Math.max(distanceM(sw, se), distanceM(nw, ne));
    const heightM = Math.max(distanceM(sw, nw), distanceM(se, ne));
    const areaM2 = widthM * heightM;
    if (![widthM, heightM, areaM2].every(Number.isFinite) || areaM2 <= 0) return null;
    return { widthM, heightM, areaM2 };
  }

  function ringsFitWithinFovSize(rings = [], fovBounds, ratio = INAT_PROJECT_MAX_FOV_BOUNDS_RATIO) {
    const boundarySize = boundsSizeMeters(ringsBounds(rings));
    const fovSize = boundsSizeMeters(fovBounds);
    if (!boundarySize || !fovSize) return true;

    const widthLimit = fovSize.widthM * ratio;
    const heightLimit = fovSize.heightM * ratio;
    const areaLimit = fovSize.areaM2 * ratio;
    return (
      boundarySize.widthM <= widthLimit &&
      boundarySize.heightM <= heightLimit &&
      boundarySize.areaM2 <= areaLimit
    );
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

  function ringsIntersectBounds(rings = [], bounds) {
    return (Array.isArray(rings) ? rings : []).some((ring) => ringIntersectsBounds(ring, bounds));
  }

  function rawBoundsFromRings(rings = []) {
    const points = validRingPoints(rings);
    if (!points.length) return null;

    return {
      south: Math.min(...points.map((point) => point.lat)),
      north: Math.max(...points.map((point) => point.lat)),
      west: Math.min(...points.map((point) => point.lng)),
      east: Math.max(...points.map((point) => point.lng))
    };
  }

  function rawBoundsIntersect(a, b) {
    if (!a || !b) return false;
    return a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;
  }

  function rawBoundsIntersection(a, b) {
    if (!rawBoundsIntersect(a, b)) return null;
    const box = {
      south: Math.max(a.south, b.south),
      north: Math.min(a.north, b.north),
      west: Math.max(a.west, b.west),
      east: Math.min(a.east, b.east)
    };
    if (box.north <= box.south || box.east <= box.west) return null;
    return box;
  }

  function rawBoundsAreaM2(bounds) {
    if (!bounds) return 0;
    const sw = { lat: bounds.south, lng: bounds.west };
    const se = { lat: bounds.south, lng: bounds.east };
    const nw = { lat: bounds.north, lng: bounds.west };
    const ne = { lat: bounds.north, lng: bounds.east };
    const widthM = Math.max(distanceM(sw, se), distanceM(nw, ne));
    const heightM = Math.max(distanceM(sw, nw), distanceM(se, ne));
    const area = widthM * heightM;
    return Number.isFinite(area) && area > 0 ? area : 0;
  }

  function ringAreaM2(ring = []) {
    const points = validRingPoints([ring]);
    if (points.length < 3) return 0;
    const origin = centroidForPoints(points) || points[0];
    const projected = points.map((point) => localMetersFromLatLng(point, origin));
    let area = 0;
    for (let i = 0; i < projected.length; i++) {
      const a = projected[i];
      const b = projected[(i + 1) % projected.length];
      area += a.x * b.y - b.x * a.y;
    }
    return Math.abs(area) / 2;
  }

  function ringsAreaM2(rings = []) {
    return (Array.isArray(rings) ? rings : []).reduce((sum, ring) => sum + ringAreaM2(ring), 0);
  }

  function patchOverlapMetrics(a, b) {
    const ringsA = patchRings(a).filter((ring) => Array.isArray(ring) && ring.length >= 3);
    const ringsB = patchRings(b).filter((ring) => Array.isArray(ring) && ring.length >= 3);
    const boundsA = rawBoundsFromRings(ringsA);
    const boundsB = rawBoundsFromRings(ringsB);
    const intersectionBounds = rawBoundsIntersection(boundsA, boundsB);
    const areaA = ringsAreaM2(ringsA);
    const areaB = ringsAreaM2(ringsB);

    if (!intersectionBounds || areaA <= 0 || areaB <= 0) {
      return {
        dice: 0,
        coverageA: 0,
        coverageB: 0,
        intersectionAreaM2: 0,
        areaA,
        areaB
      };
    }

    const steps = PATCH_GROUP_SAMPLE_STEPS;
    let both = 0;
    const latSpan = intersectionBounds.north - intersectionBounds.south;
    const lngSpan = intersectionBounds.east - intersectionBounds.west;

    for (let y = 0; y < steps; y++) {
      const lat = intersectionBounds.south + ((y + 0.5) / steps) * latSpan;
      for (let x = 0; x < steps; x++) {
        const lng = intersectionBounds.west + ((x + 0.5) / steps) * lngSpan;
        const point = { lat, lng };
        if (pointInRings(point, ringsA) && pointInRings(point, ringsB)) both++;
      }
    }

    const intersectionAreaM2 = rawBoundsAreaM2(intersectionBounds) * (both / (steps * steps));
    const dice = intersectionAreaM2 > 0 ? (2 * intersectionAreaM2) / (areaA + areaB) : 0;
    return {
      dice: Math.max(0, Math.min(1, dice)),
      coverageA: areaA > 0 ? Math.max(0, Math.min(1, intersectionAreaM2 / areaA)) : 0,
      coverageB: areaB > 0 ? Math.max(0, Math.min(1, intersectionAreaM2 / areaB)) : 0,
      intersectionAreaM2,
      areaA,
      areaB
    };
  }

  function meaningfulYearProjectOverlap(metrics, childCoverage) {
    return (
      Number(metrics?.intersectionAreaM2 || 0) >= PATCH_GROUP_MIN_INTERSECTION_M2 &&
      (Number(metrics?.dice || 0) >= PATCH_GROUP_YEAR_DICE_THRESHOLD ||
        Number(childCoverage || 0) >= PATCH_GROUP_YEAR_COVERAGE_THRESHOLD)
    );
  }

  function patchParentScore(patch, areaM2) {
    return (
      (patch?.id === state.homePatchId ? 1000 : 0) +
      (patch?.candidate ? 0 : 120) +
      (isOsmPatch(patch) ? 40 : 0) +
      (isYearINatProjectPatch(patch) ? -45 : 0) +
      Math.min(60, Math.log10(Math.max(1, Number(areaM2) || 1)) * 12)
    );
  }

  function defaultPatchParentPair(a, b, metrics) {
    const scoreA = patchParentScore(a, metrics.areaA);
    const scoreB = patchParentScore(b, metrics.areaB);
    if (scoreA > scoreB) return { parent: a, child: b };
    if (scoreB > scoreA) return { parent: b, child: a };
    return String(a.id) <= String(b.id) ? { parent: a, child: b } : { parent: b, child: a };
  }

  function patchGroupEdge(a, b) {
    const metrics = patchOverlapMetrics(a, b);
    const aYear = isYearINatProjectPatch(a);
    const bYear = isYearINatProjectPatch(b);

    if (aYear && !bYear && meaningfulYearProjectOverlap(metrics, metrics.coverageA)) {
      return {
        parentId: b.id,
        childId: a.id,
        priority: 30,
        reason: "year_project",
        childCoverage: metrics.coverageA,
        parentCoverage: metrics.coverageB,
        metrics
      };
    }

    if (bYear && !aYear && meaningfulYearProjectOverlap(metrics, metrics.coverageB)) {
      return {
        parentId: a.id,
        childId: b.id,
        priority: 30,
        reason: "year_project",
        childCoverage: metrics.coverageB,
        parentCoverage: metrics.coverageA,
        metrics
      };
    }

    if (metrics.dice < PATCH_GROUP_DICE_THRESHOLD) return null;

    if (isINatProjectPatch(a) && isOsmPatch(b)) {
      return {
        parentId: b.id,
        childId: a.id,
        priority: 20,
        reason: "osm_parent",
        childCoverage: metrics.coverageA,
        parentCoverage: metrics.coverageB,
        metrics
      };
    }

    if (isINatProjectPatch(b) && isOsmPatch(a)) {
      return {
        parentId: a.id,
        childId: b.id,
        priority: 20,
        reason: "osm_parent",
        childCoverage: metrics.coverageB,
        parentCoverage: metrics.coverageA,
        metrics
      };
    }

    const { parent, child } = defaultPatchParentPair(a, b, metrics);
    const childIsA = String(child.id) === String(a.id);
    return {
      parentId: parent.id,
      childId: child.id,
      priority: 10,
      reason: "high_dice",
      childCoverage: childIsA ? metrics.coverageA : metrics.coverageB,
      parentCoverage: childIsA ? metrics.coverageB : metrics.coverageA,
      metrics
    };
  }

  function groupPatchRows(rows = []) {
    const patches = [];
    const byId = new Map();

    (Array.isArray(rows) ? rows : []).forEach((patch) => {
      if (!patch?.id || byId.has(String(patch.id))) return;
      const row = {
        ...patch,
        child_patches: [],
        group_parent_id: null,
        group_parent_title: null,
        group_reason: null,
        group_overlap: null,
        is_child_patch: false
      };
      byId.set(String(row.id), row);
      patches.push(row);
    });

    if (patches.length < 2) return patches;

    const edges = [];
    for (let i = 0; i < patches.length; i++) {
      for (let j = i + 1; j < patches.length; j++) {
        const edge = patchGroupEdge(patches[i], patches[j]);
        if (edge) edges.push(edge);
      }
    }

    edges.sort(
      (a, b) =>
        b.priority - a.priority ||
        Number(b.metrics?.dice || 0) - Number(a.metrics?.dice || 0) ||
        Number(b.metrics?.intersectionAreaM2 || 0) - Number(a.metrics?.intersectionAreaM2 || 0)
    );

    const parentByChild = new Map();
    const edgeByChild = new Map();

    function rootOf(id) {
      let root = String(id || "");
      const seen = new Set();
      while (parentByChild.has(root) && !seen.has(root)) {
        seen.add(root);
        root = parentByChild.get(root);
      }
      return root;
    }

    edges.forEach((edge) => {
      const parentId = String(edge.parentId || "");
      const childId = String(edge.childId || "");
      if (!parentId || !childId || parentId === childId || parentByChild.has(childId)) return;
      const parentRoot = rootOf(parentId);
      if (!parentRoot || parentRoot === childId) return;
      parentByChild.set(childId, parentRoot);
      edgeByChild.set(childId, edge);
    });

    patches.forEach((patch) => {
      const id = String(patch.id);
      const parentId = parentByChild.has(id) ? rootOf(id) : null;
      if (!parentId || parentId === id) return;

      const parent = byId.get(parentId);
      const edge = edgeByChild.get(id);
      if (!parent) return;

      patch.is_child_patch = true;
      patch.group_parent_id = parentId;
      patch.group_parent_title = patchTitle(parent);
      patch.group_reason = edge?.reason || "grouped";
      patch.group_overlap = edge
        ? {
            ...(edge.metrics || {}),
            childCoverage: edge.childCoverage,
            parentCoverage: edge.parentCoverage
          }
        : null;
      parent.child_patches.push(patch);
    });

    patches.forEach((patch) => {
      patch.child_patches.sort(
        (a, b) =>
          Number(b.group_overlap?.dice || 0) - Number(a.group_overlap?.dice || 0) ||
          patchTitle(a).localeCompare(patchTitle(b))
      );
    });

    return patches.filter((patch) => !patch.is_child_patch);
  }

  function parseINatNearbyPlaces(data) {
    const raw = data?.results;
    const groups = Array.isArray(raw)
      ? [raw]
      : raw && typeof raw === "object"
        ? Object.values(raw)
        : [];
    const seen = new Set();
    return groups
      .flat()
      .filter((place) => place?.id)
      .filter((place) => {
        const key = String(place.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function placeLatLng(place) {
    const coords = place?.point_geojson?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }

    const [lat, lng] = String(place?.location || "")
      .split(",")
      .map(Number);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }

  function safeGeoJsonRings(input) {
    try {
      return parseGeoJsonGeometry(input).rings || [];
    } catch {
      return [];
    }
  }

  function placeGeometryRings(place) {
    const rings = safeGeoJsonRings(place?.geometry_geojson || place?.geojson || place?.geometry);
    if (rings.length) return rings;
    return safeGeoJsonRings(place?.bounding_box_geojson);
  }

  function placeFitsFov(place, searchBounds, maxSizeBounds, options = {}) {
    if (!searchBounds?.isValid?.()) return true;
    const rings = placeGeometryRings(place);
    if (rings.length) {
      return (
        ringsIntersectBounds(rings, searchBounds) &&
        (options.rejectOversize === false || ringsFitWithinFovSize(rings, maxSizeBounds))
      );
    }

    const point = placeLatLng(place);
    return point ? searchBounds.contains([point.lat, point.lng]) : false;
  }

  function sortPlacesForProjectLookup(places = []) {
    return places.slice().sort((a, b) => {
      const ar = placeGeometryRings(a);
      const br = placeGeometryRings(b);
      const as = boundsSizeMeters(ringsBounds(ar));
      const bs = boundsSizeMeters(ringsBounds(br));
      const aa = Number.isFinite(as?.areaM2)
        ? as.areaM2
        : Number.isFinite(Number(a?.bbox_area))
          ? Number(a.bbox_area)
          : Infinity;
      const ba = Number.isFinite(bs?.areaM2)
        ? bs.areaM2
        : Number.isFinite(Number(b?.bbox_area))
          ? Number(b.bbox_area)
          : Infinity;
      if (aa !== ba) return aa - ba;
      return String(a?.display_name || a?.name || a?.slug || "").localeCompare(
        String(b?.display_name || b?.name || b?.slug || "")
      );
    });
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
    openPatchActionMenu(patch, { originalEvent, latlng });
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
    if (clone.subscription) clone.subscription = normalizePatchSubscription(clone.subscription);

    if (!clone.survey_geometry) {
      clone.survey_geometry = surveyGeometryForPatch(clone);
    } else if (isINatProjectPatch(clone)) {
      clone.survey_geometry = {
        ...clone.survey_geometry,
        styles: {
          ...(clone.survey_geometry.styles || {}),
          boundary: {
            ...(clone.survey_geometry.styles?.boundary || {}),
            ...patchBoundarySurveyStyle(clone)
          }
        }
      };
    }

    return clone;
  }

  function surveyGeometryForPatch(patch) {
    const boundary = primaryBoundary(patch);
    const boundaryStyle = patchBoundarySurveyStyle(patch);
    return {
      boundary,
      paths: [],
      exclusions: [],
      denseZones: [],
      assets: [],
      styles: {
        boundary: boundaryStyle
      }
    };
  }

  function patchTitle(patch) {
    return patch?.name || patch?.title || patch?.metadata?.title || "Untitled patch";
  }

  function upsertPatch(rawPatch, options = {}) {
    const cleanPatch = withoutPatchGroupingFields(rawPatch) || {};
    const patch = withDerivedPatchFields({
      ...cleanPatch,
      saved_at: cleanPatch.saved_at || new Date().toISOString()
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
    if (String(state.selectedPatchId || "") === String(id)) state.selectedPatchId = null;
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

  function writePatchSubscription(id, subscription, options = {}) {
    const idx = state.patches.findIndex((patch) => String(patch.id) === String(id));
    if (idx < 0) return null;

    const next = normalizePatchSubscription(subscription);
    state.patches[idx] = withDerivedPatchFields({
      ...state.patches[idx],
      subscription: next
    });
    savePatches();
    if (options.render !== false) render();
    if (next.enabled && options.schedule !== false) schedulePatchSubscriptionScan(900);
    return getPatch(id);
  }

  function setPatchSubscription(id, subscription) {
    const patch = getPatch(id);
    if (!patch) return null;
    const previous = patchSubscription(patch);
    return writePatchSubscription(
      id,
      {
        ...previous,
        ...subscription
      },
      { render: true, schedule: true }
    );
  }

  function subscribedPatches() {
    return state.patches.filter(isPatchSubscribed);
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
    if (!map.getPane(LABEL_PANE)) {
      map.createPane(LABEL_PANE);
    }
    map.getPane(LABEL_PANE).style.zIndex = 793;
    map.getPane(LABEL_PANE).style.pointerEvents = "none";

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

      .gw-patch-boundary.gw-patch-boundary-inat {
        filter: drop-shadow(0 0 5px rgba(125,223,255,0.52));
      }

      .gw-patch-boundary.gw-patch-boundary-child {
        filter: drop-shadow(0 0 4px rgba(255,216,90,0.42));
      }

      .gw-patch-boundary.gw-patch-boundary-inat.gw-patch-boundary-child {
        filter: drop-shadow(0 0 4px rgba(125,223,255,0.52));
      }

      .gw-patch-hud-label {
        position: relative;
        isolation: isolate;
        width: 158px;
        pointer-events: none;
        transform: translateY(-2px);
        filter: drop-shadow(0 5px 12px rgba(0,0,0,0.42));
        transition: transform 140ms ease, filter 140ms ease;
      }

      .gw-patch-hud-label::before {
        content: "";
        position: absolute;
        inset: -4px -5px -5px;
        z-index: -1;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(22,19,16,0.94);
        box-shadow: 0 0 0 1px var(--gw-patch-theme-ring, rgba(255,216,90,0.30)), 0 8px 18px rgba(0,0,0,0.30);
      }

      .gw-patch-hud-label.is-selected {
        transform: translateY(-13px) scale(1.045);
        filter: drop-shadow(0 9px 18px rgba(0,0,0,0.58));
      }

      .gw-patch-completeness-bar {
        position: relative;
        height: 7px;
        border-radius: 999px;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.72);
        background: rgba(28,24,21,0.82);
        box-shadow: 0 0 0 1px var(--gw-patch-theme-ring, rgba(255,216,90,0.30)), 0 0 10px var(--gw-patch-theme-soft-glow, rgba(255,216,90,0.24));
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
        color: var(--gw-patch-theme-text, #231a12);
        background: var(--gw-patch-theme-label-bg, rgba(255,216,90,0.94));
        border: 1px solid rgba(255,255,255,0.76);
        font-size: 10px;
        line-height: 1;
        font-weight: 950;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: box-shadow 140ms ease, border-color 140ms ease;
      }

      .gw-patch-hud-label.is-selected .gw-patch-label-name {
        border-color: rgba(0,0,0,0.82);
        box-shadow: 0 0 0 2px rgba(0,0,0,0.72), 0 5px 12px rgba(0,0,0,0.24);
      }

      .gw-patch-completeness-text {
        min-width: 34px;
        border-radius: 999px;
        padding: 3px 6px;
        color: #fff7df;
        background: rgba(20,17,15,0.88);
        border: 1px solid var(--gw-patch-theme-ring, rgba(255,216,90,0.32));
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

      .gw-patch-peek-outline.gw-patch-peek-outline-inat {
        filter: drop-shadow(0 0 14px rgba(125,223,255,0.72));
      }

      .gw-patch-peek-outline.gw-patch-peek-outline-inat:hover {
        filter: drop-shadow(0 0 18px rgba(125,223,255,0.90));
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

  function patchBoundaryBaseStyle(patch, home, options = {}) {
    const theme = patchBoundaryTheme(patch);
    const child = options.child === true || patch?.is_child_patch === true;
    return {
      color: theme.lineColor,
      opacity: child ? 0.92 : 0.96,
      weight: child ? 1.7 : home ? 4 : 3.5,
      fillColor: theme.fillColor,
      fillOpacity: child ? 0 : home ? theme.homeFillOpacity : theme.fillOpacity,
      dashArray: child ? "4 5" : home ? "" : "9 6"
    };
  }

  function patchBoundarySelectedStyle(patch, home, options = {}) {
    const base = patchBoundaryBaseStyle(patch, home, options);
    const child = options.child === true || patch?.is_child_patch === true;
    if (child) {
      return {
        ...base,
        color: "#050505",
        opacity: 1,
        weight: 2.8,
        fillOpacity: 0,
        dashArray: "3 4"
      };
    }

    return {
      ...base,
      color: "#050505",
      opacity: 1,
      weight: home ? 5.5 : 5,
      dashArray: ""
    };
  }

  function setPatchLayerSelectionStyle(layer) {
    if (!layer?._gwPatchId || !layer.setStyle) return;
    const selectedId = String(state.selectedPatchId || "");
    const selected =
      String(layer._gwPatchId) === selectedId ||
      (!!layer._gwPatchGroupParentId && String(layer._gwPatchGroupParentId) === selectedId);
    layer.setStyle(selected ? layer._gwPatchSelectedStyle : layer._gwPatchBaseStyle);
  }

  function applySelectedPatchLayerStyles() {
    [state.layer, state.peekLayer].forEach((group) => {
      group?.eachLayer?.(setPatchLayerSelectionStyle);
    });
  }

  function cellsForPatchHereSelection(patch) {
    const rings = patchRings(patch);
    const bounds = patchCellBounds(rings);
    if (!bounds) return [];

    const bboxCells = (bounds.maxIx - bounds.minIx + 1) * (bounds.maxIy - bounds.minIy + 1);
    const stride = Math.max(1, Math.ceil(Math.sqrt(bboxCells / PATCH_HERE_SELECTION_SCAN_LIMIT)));
    const cells = [];

    for (let iy = bounds.minIy; iy <= bounds.maxIy; iy += stride) {
      for (let ix = bounds.minIx; ix <= bounds.maxIx; ix += stride) {
        const center = cellCenterPoint(ix, iy);
        if (!center || !pointInRings(center, rings)) continue;
        cells.push({
          ix,
          iy,
          key: window.GridWildGrid?.cellKey?.(ix, iy) || `${ix},${iy}`
        });
      }
    }

    return cells;
  }

  function raiseHereForSelectedPatch(patch) {
    if (!patch?.id || !window.GridWildHerePanel?.isOpen?.()) return;
    const rings = patchRings(patch);
    const bounds = patchCellBounds(rings);
    const cells = cellsForPatchHereSelection(patch);
    if (!cells.length || !window.GridWildSelectionTool?.setSelectionFromCells) return;

    window.GridWildSelectionTool.setSelectionFromCells(cells, {
      label: patchTitle(patch),
      source: "patch_selection",
      signature: `patch:${patch.id}:${cells.length}`,
      bounds,
      rings,
      toast: false
    });
    window.GridWildHerePanel.scheduleRefresh?.(10);
  }

  function patchSelectionTarget(patch) {
    if (!patch?.group_parent_id) return patch;
    return findGroupedPatchRow(patch.group_parent_id) || getPatch(patch.group_parent_id) || patch;
  }

  function selectPatch(patch) {
    if (!patch?.id) return;
    const target = patchSelectionTarget(patch);
    selectPatchHudLabel(target?.id || patch.id);
    raiseHereForSelectedPatch(target || patch);
  }

  function selectPatchHudLabel(patchId) {
    state.selectedPatchId = patchId ? String(patchId) : null;
    document.querySelectorAll(".gw-patch-hud-label.is-selected").forEach((el) => {
      el.classList.remove("is-selected");
    });
    setPatchHudLabelState(patchId, "is-selected", true);
    applySelectedPatchLayerStyles();
    updatePatchLabelPositions();
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
      },
      {
        id: "custom",
        icon: "C",
        label: "Custom...",
        sub: "Build target cells from Patch filters"
      }
    ];
  }

  function openPatchQuestTypeMenu(patch, anchor = {}) {
    patch = patchSelectionTarget(patch);
    if (!patch?.id) return;
    const x = Number(anchor.clientX ?? anchor.left) || Math.round(window.innerWidth / 2);
    const y = Number(anchor.clientY ?? anchor.top) || Math.round(window.innerHeight / 2);
    const pos = clampPatchMenuPosition(x, y);

    closePatchActionMenu();
    selectPatch(patch);

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
        } else if (questType === "custom") {
          if (window.GridWildQuestTargetBuilder?.open) {
            window.GridWildQuestTargetBuilder.open({ source: "patch", patch });
          } else {
            toast("Quest Target Builder is still loading.");
          }
        }
      });
    });
  }

  function openPatchActionMenu(patch, evt = {}) {
    patch = patchSelectionTarget(patch);
    if (!patch?.id) return;
    suppressHudActionMenu();
    if (evt?.originalEvent && window.L?.DomEvent?.stop) L.DomEvent.stop(evt.originalEvent);
    const original = evt.originalEvent || evt;
    const x = Number(original?.clientX) || Math.round(window.innerWidth / 2);
    const y = Number(original?.clientY) || Math.round(window.innerHeight / 2);
    const pos = clampPatchMenuPosition(x, y);

    closePatchActionMenu();
    selectPatch(patch);

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
          if (getPatch(patch.id)) openPatchDetail(patch.id, evt?.latlng || null);
          else openPatchPeekInfo(patch, evt?.latlng || null);
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

  function addPatchPolygon(patch, points, home, options = {}) {
    if (!Array.isArray(points) || points.length < 3) return;
    const layer = state.layer;
    const theme = patchBoundaryTheme(patch);
    const child = options.child === true || patch?.is_child_patch === true;
    const groupParentId = patch.group_parent_id || options.parent?.id || null;
    const selectedId = String(state.selectedPatchId || "");
    const selected =
      String(patch.id) === selectedId || (!!groupParentId && String(groupParentId) === selectedId);
    const baseStyle = patchBoundaryBaseStyle(patch, home, { child });
    const selectedStyle = patchBoundarySelectedStyle(patch, home, { child });

    if (!child) {
      L.polygon(
        points.map((p) => [p.lat, p.lng]),
        {
          pane: PANE,
          color: theme.glowColor,
          opacity: 0.22,
          weight: home ? 11 : 9,
          fillOpacity: 0,
          interactive: false,
          bubblingMouseEvents: false,
          className: `gw-patch-boundary-glow ${theme.glowClassName}`
        }
      ).addTo(layer);
    }

    const target = L.polygon(
      points.map((p) => [p.lat, p.lng]),
      {
        pane: PANE,
        ...(selected ? selectedStyle : baseStyle),
        interactive: true,
        bubblingMouseEvents: false,
        className: `gw-patch-boundary ${theme.className}${child ? " gw-patch-boundary-child" : ""}`
      }
    ).addTo(layer);

    target._gwPatchId = patch.id;
    target._gwPatchGroupParentId = groupParentId;
    target._gwPatchBaseStyle = baseStyle;
    target._gwPatchSelectedStyle = selectedStyle;

    target.on("click", (evt) => selectPatchFromMap(patch, evt));
    target.on("dblclick", (evt) => selectPatchFromMap(patch, evt));
    target.on("contextmenu", (evt) => openPatchActionMenu(patch, evt));
    target.on("mouseover", () => setPatchHudLabelState(patch.id, "is-hovered", true));
    target.on("mouseout", () => setPatchHudLabelState(patch.id, "is-hovered", false));
    bindPatchLongHold(target, patch);
  }

  function selectPatchFromMap(patch, evt) {
    if (evt?.originalEvent && window.L?.DomEvent?.stop) L.DomEvent.stop(evt.originalEvent);
    if (Date.now() < state.suppressPatchInfoUntil) return;
    closePatchActionMenu();
    const now = Date.now();
    if (state.lastOpen.id === patch.id && now - state.lastOpen.at < 450) return;
    state.lastOpen = { id: patch.id, at: now };
    selectPatch(patch);
  }

  function addPatchCompletenessLabel(patch, rings, options = {}) {
    const selected =
      options.selected === true || String(patch.id) === String(state.selectedPatchId || "");
    const preferredLatLng = topBoundaryLabelLatLng(rings);
    const latlng = patchLabelLatLngForViewport(preferredLatLng, rings, { selected });
    if (!latlng) return;

    const completeness = patchCompleteness(patch, rings);
    const percentText = formatCompletenessPercent(completeness.percent);
    const percentWidth = `${Math.round(completeness.percent * 1000) / 10}%`;
    const title = patchTitle(patch);
    const color = completenessColor(completeness.percent);
    const theme = patchBoundaryTheme(patch);
    const targetLayer = options.layer || state.layer;
    if (!targetLayer) return;

    const marker = L.marker(latlng, {
      pane: LABEL_PANE,
      interactive: false,
      keyboard: false,
      bubblingMouseEvents: false,
      zIndexOffset: selected ? 1400 : 900,
      icon: L.divIcon({
        className: "",
        html: `
          <div
            class="gw-patch-hud-label${selected ? " is-selected" : ""}"
            data-patch-id="${esc(patch.id)}"
            title="${esc(`${title}: ${percentText} complete${completeness.sampled ? " (estimated)" : ""}`)}"
            style="--gw-patch-completeness-width:${esc(percentWidth)};--gw-patch-completeness-color:${esc(color)};${esc(patchHudThemeVars(theme))};"
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
        iconSize: [PATCH_LABEL_ICON_WIDTH, PATCH_LABEL_ICON_HEIGHT],
        iconAnchor: [PATCH_LABEL_ICON_ANCHOR_X, PATCH_LABEL_ICON_ANCHOR_Y]
      })
    }).addTo(targetLayer);
    marker._gwPatchLabel = true;
    marker._gwPatchId = patch.id;
    marker._gwPatchLabelPreferredLatLng = preferredLatLng;
    marker._gwPatchLabelRings = rings;
  }

  function updatePatchLabelMarker(marker) {
    if (!marker?._gwPatchLabel || !marker.setLatLng) return;
    const selected = String(marker._gwPatchId || "") === String(state.selectedPatchId || "");
    marker.setZIndexOffset?.(selected ? 1400 : 900);
    const latlng = patchLabelLatLngForViewport(
      marker._gwPatchLabelPreferredLatLng,
      marker._gwPatchLabelRings,
      { selected }
    );
    if (latlng) marker.setLatLng(latlng);
  }

  function updatePatchLabelPositions() {
    [state.layer, state.peekLayer].forEach((group) => {
      group?.eachLayer?.(updatePatchLabelMarker);
    });
  }

  function requestPatchLabelPositionUpdate() {
    if (state.labelUpdateRaf) return;
    state.labelUpdateRaf = window.requestAnimationFrame(() => {
      state.labelUpdateRaf = null;
      updatePatchLabelPositions();
    });
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

  function patchTouchesLatLngArea(patch, latlng, bounds, radiusM = PATCH_VIEW_SEARCH_RADIUS_M) {
    const point = normalizeLatLng(latlng);
    if (!point || !patch?.id) return false;
    const rings = patchRings(patch);
    return (
      pointInRings(point, rings) ||
      patchIntersectsBounds(patch, bounds) ||
      distanceToRingsM(point, rings) <= radiusM
    );
  }

  function localPatchesAtLatLng(latlng, options = {}) {
    const point = normalizeLatLng(latlng);
    if (!point) return [];

    const radiusM = Number(options.radiusM) || PATCH_VIEW_SEARCH_RADIUS_M;
    const bounds = options.bounds || boundsAroundLatLng(point, radiusM);
    const savedRows = state.patches
      .map((patch) => ({
        ...patch,
        is_home_patch: patch.id === state.homePatchId,
        distance_m: distanceToRingsM(point, patchRings(patch)),
        candidate: false
      }))
      .filter((patch) => patchTouchesLatLngArea(patch, point, bounds, radiusM));

    const candidateRows = nearbyOsmPatchCandidates({
      origin: point,
      bounds,
      radiusM,
      limit: options.candidateLimit || PATCH_VIEW_OSM_CANDIDATE_LIMIT,
      includeFallback: true
    });
    const seen = new Set();

    return [...savedRows, ...candidateRows]
      .filter((patch) => {
        if (!patch?.id || seen.has(patch.id)) return false;
        seen.add(patch.id);
        return patchTouchesLatLngArea(patch, point, bounds, radiusM);
      })
      .sort((a, b) => Number(a.distance_m || Infinity) - Number(b.distance_m || Infinity));
  }

  function mergePatchRows(rows = []) {
    const seen = new Set();
    return rows.filter((patch) => {
      if (!patch?.id || seen.has(patch.id)) return false;
      seen.add(patch.id);
      return true;
    });
  }

  function patchFromINatProjectCandidate(project) {
    const geometry = project?.__gwBoundaryGeometry || null;
    const rings = Array.isArray(geometry?.rings) ? geometry.rings : [];
    if (!rings.length) return null;

    const projectId = project.id || project.slug || project.__gwPlaceId;
    const patch = withDerivedPatchFields({
      id: patchIdFor("inat_project", projectId),
      name: project.title || project.name || project.slug || "iNaturalist project patch",
      source: "inat_project",
      source_id: String(projectId || ""),
      source_url:
        project.uri ||
        `https://www.inaturalist.org/projects/${project.slug || project.id || projectId}`,
      source_label: "iNaturalist project",
      boundary: rings[0],
      geometry: {
        type: geometry.type || "polygon",
        rings,
        geojson: geometry.geojson || null,
        source_format: geometry.source_format
      },
      metadata: {
        project,
        place_id: project.__gwPlaceId || project.__gwCandidatePlaceId || null,
        imported_from: "inat_project",
        runtime_candidate: true
      },
      created_at: new Date().toISOString()
    });

    return patch
      ? {
          ...patch,
          candidate: true,
          distance_m: Number(project.distance_m)
        }
      : null;
  }

  async function nearbyINatProjectPatchCandidatesAtLatLng(latlng, options = {}) {
    const point = normalizeLatLng(latlng);
    if (!point || !window.L) return [];

    const radiusM = Number(options.radiusM) || PATCH_VIEW_INAT_SEARCH_RADIUS_M;
    const bounds = options.bounds || boundsAroundLatLng(point, radiusM);
    const savedIds = new Set(state.patches.map((patch) => patch.id));
    const projects = await searchINatProjects("", {
      nearby: true,
      origin: point,
      bounds,
      rejectOversize: false,
      geometryCheckLimit: options.geometryCheckLimit || PATCH_VIEW_INAT_GEOMETRY_CHECK_LIMIT,
      resultLimit: options.resultLimit || PATCH_VIEW_INAT_PROJECT_LIMIT
    });

    return projects
      .map(patchFromINatProjectCandidate)
      .filter(Boolean)
      .filter((patch) => !savedIds.has(patch.id))
      .filter((patch) => patchTouchesLatLngArea(patch, point, bounds, radiusM));
  }

  async function nearbyINatProjectPatchCandidates(options = {}) {
    if (!window.map?.getBounds || !window.L) return [];
    const bounds = expandLatLngBounds(window.map.getBounds(), Number(options.marginRatio) || 0.08);
    const savedIds = new Set(state.patches.map((patch) => patch.id));
    const projects = await searchINatProjects("", { nearby: true });
    return projects
      .map(patchFromINatProjectCandidate)
      .filter(Boolean)
      .filter((patch) => !savedIds.has(patch.id))
      .filter((patch) => patchIntersectsBounds(patch, bounds));
  }

  function popupGroupingRows() {
    return mergePatchRows([
      ...patchesWithDistance(),
      ...(Array.isArray(state.peekRows) ? state.peekRows : [])
    ]);
  }

  function findGroupedPatchRow(id) {
    const targetId = String(id || "");
    if (!targetId) return null;

    const grouped = groupPatchRows(popupGroupingRows());
    for (const patch of grouped) {
      if (String(patch.id) === targetId) return patch;
      const child = (patch.child_patches || []).find((row) => String(row.id) === targetId);
      if (child) return child;
    }

    return (
      getPatch(targetId) || state.peekRows.find((patch) => String(patch.id) === targetId) || null
    );
  }

  function groupedPatchForPopup(patch) {
    const grouped = findGroupedPatchRow(patch?.id);
    if (grouped) return grouped;
    return {
      ...patch,
      child_patches: Array.isArray(patch?.child_patches) ? patch.child_patches : []
    };
  }

  function patchGroupReasonLabel(child) {
    if (child?.group_reason === "year_project") return "seasonal project";
    if (child?.group_reason === "osm_parent") return "iNat/OSM overlap";
    return "high overlap";
  }

  function patchGroupMetricLabel(child) {
    const metrics = child?.group_overlap || {};
    const dice = Number(metrics.dice || 0);
    const coverage = Number(metrics.childCoverage || 0);
    if (child?.group_reason === "year_project" && coverage > dice) {
      return `${Math.round(Math.max(0, Math.min(1, coverage)) * 100)}% child overlap`;
    }
    return `Dice ${Math.round(Math.max(0, Math.min(1, dice)) * 100)}%`;
  }

  function renderPatchChildrenList(patch) {
    const children = Array.isArray(patch?.child_patches) ? patch.child_patches : [];
    if (!children.length) return "";

    return `
      <div class="gw-patch-child-list">
        <div class="gw-patch-child-list-title">Grouped Patches</div>
        ${children
          .map((child) => {
            const theme = patchBoundaryTheme(child);
            return `
              <div class="gw-patch-child-row" style="--gw-patch-child-color:${esc(theme.lineColor)};">
                <span class="gw-patch-child-swatch" aria-hidden="true"></span>
                <span class="gw-patch-child-main">
                  <b>${esc(patchTitle(child))}</b>
                  <small>${esc(child.source_label || child.source || "Patch")} / ${esc(patchGroupReasonLabel(child))} / ${esc(patchGroupMetricLabel(child))}</small>
                </span>
                <button class="gw-mini-btn" data-gw-open-child-patch="${esc(child.id)}" type="button">Open</button>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function openPatchChildFromPopup(id, root, latlng = null) {
    const child = findGroupedPatchRow(id);
    if (!child?.id) return;
    root?.remove();
    if (getPatch(child.id)) openPatchDetail(child.id, latlng);
    else openPatchPeekInfo(child, latlng);
  }

  function openPatchPeekInfo(patch, latlng = null) {
    if (!patch?.id) return;
    if (getPatch(patch.id)) {
      openPatchDetail(patch.id, latlng);
      return;
    }

    const displayPatch = groupedPatchForPopup(patch);
    injectFieldModalStyles();
    document
      .querySelectorAll(".gw-quest-modal-backdrop.gw-patch-peek-backdrop")
      .forEach((el) => el.remove());

    const root = document.createElement("div");
    root.className = "gw-quest-modal-backdrop gw-patch-peek-backdrop";
    root.innerHTML = `
      <div class="gw-quest-modal">
        <div class="gw-quest-modal-title">${esc(patchTitle(displayPatch))}</div>
        <div class="gw-quest-modal-subtitle">
          ${esc(displayPatch.source_label || "OSM patch boundary")}
        </div>
        <div class="gw-quest-status-grid">
          <div class="gw-quest-status-line"><span>Distance</span><span>${esc(formatDistance(displayPatch.distance_m ?? distanceM(locationOrigin(), displayPatch.centroid)))}</span></div>
          <div class="gw-quest-status-line"><span>Source</span><span>${esc(displayPatch.source_label || displayPatch.source || "OSM")}</span></div>
        </div>
        ${renderPatchChildrenList(displayPatch)}
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
      const childBtn = evt.target.closest("[data-gw-open-child-patch]");
      if (childBtn) {
        openPatchChildFromPopup(childBtn.dataset.gwOpenChildPatch, root, latlng);
        return;
      }
      if (evt.target === root || evt.target.closest("#gwPatchPeekCloseBtn")) root.remove();
    };
    root.querySelector("#gwPatchPeekMapBtn").onclick = () => focusPatchObject(displayPatch);
    root.querySelector("#gwPatchPeekBookmarkBtn").onclick = () => {
      upsertPatch(displayPatch);
      root.remove();
      openPatchDetail(displayPatch.id, latlng);
    };
    root.querySelector("#gwPatchPeekHomeBtn").onclick = () => {
      upsertPatch(displayPatch);
      setHomePatch(displayPatch.id);
      root.remove();
      openPatchDetail(displayPatch.id, latlng);
    };
  }

  function highlightPatchRows(rows = []) {
    const peekLayer = ensurePeekLayer();
    if (!peekLayer) return 0;

    clearLocalPatchHighlights({ invalidate: false });
    state.peekRows = Array.isArray(rows) ? rows : [];
    let count = 0;

    function addPeekPatchPolygon(patch, options = {}) {
      const theme = patchBoundaryTheme(patch);
      const child = options.child === true || patch?.is_child_patch === true;
      const groupParentId = patch.group_parent_id || options.parent?.id || null;
      const selectedId = String(state.selectedPatchId || "");
      const selected =
        String(patch.id) === selectedId ||
        (!!groupParentId && String(groupParentId) === selectedId);
      const baseStyle = {
        color: child ? theme.lineColor : theme.glowColor,
        opacity: child ? 0.92 : 0.98,
        weight: child ? 1.8 : 4,
        fillColor: patch.candidate ? theme.candidateFillColor : theme.fillColor,
        fillOpacity: child
          ? 0
          : patch.candidate
            ? theme.candidateFillOpacity
            : theme.peekFillOpacity,
        dashArray: child ? "4 5" : patch.candidate ? "10 6" : ""
      };
      const selectedStyle = child
        ? {
            ...baseStyle,
            color: "#050505",
            opacity: 1,
            weight: 3,
            dashArray: "3 4"
          }
        : {
            ...baseStyle,
            color: "#050505",
            opacity: 1,
            weight: 5,
            dashArray: ""
          };
      patchRings(patch).forEach((ring) => {
        if (!Array.isArray(ring) || ring.length < 3) return;
        count++;
        const polygon = L.polygon(
          ring.map((point) => [point.lat, point.lng]),
          {
            pane: PANE,
            ...(selected ? selectedStyle : baseStyle),
            interactive: true,
            bubblingMouseEvents: false,
            className: `gw-patch-peek-outline ${theme.peekClassName}${child ? " gw-patch-boundary-child" : ""}`
          }
        ).addTo(peekLayer);

        polygon._gwPatchId = patch.id;
        polygon._gwPatchGroupParentId = groupParentId;
        polygon._gwPatchBaseStyle = baseStyle;
        polygon._gwPatchSelectedStyle = selectedStyle;

        polygon.on("click", (evt) => {
          if (evt?.originalEvent && window.L?.DomEvent?.stop) L.DomEvent.stop(evt.originalEvent);
          selectPatch(patch);
          if (!getPatch(patch.id)) highlightPatchRows(state.peekRows);
        });
        polygon.on("dblclick", (evt) => {
          if (evt?.originalEvent && window.L?.DomEvent?.stop) L.DomEvent.stop(evt.originalEvent);
          selectPatch(patch);
          if (!getPatch(patch.id)) highlightPatchRows(state.peekRows);
        });
        polygon.on("contextmenu", (evt) => {
          if (evt?.originalEvent && window.L?.DomEvent?.stop) L.DomEvent.stop(evt.originalEvent);
          openPatchActionMenu(patch, evt);
        });
        bindPatchLongHold(polygon, patch);
      });
    }

    groupPatchRows(state.peekRows).forEach((patch) => {
      const selected = String(patch.id) === String(state.selectedPatchId || "");
      addPeekPatchPolygon(patch);
      (patch.child_patches || []).forEach((child) =>
        addPeekPatchPolygon(child, { child: true, parent: patch })
      );
      if (selected && !getPatch(patch.id)) {
        addPatchCompletenessLabel(patch, patchRings(patch), {
          layer: peekLayer,
          selected: true
        });
      }
    });

    if (count && window.map?.on) {
      state.peekMapClickHandler = () => clearLocalPatchHighlights();
      window.map.on("click", state.peekMapClickHandler);
    }

    return count;
  }

  async function showLocalPatchHighlights(options = {}) {
    const runId = ++state.peekRunId;
    setVisible(true);
    const parksHydratePromise =
      window.GridWildOsmFeaturesLayer?.fetchParksForCurrentView?.() || null;
    let rows = localPatchesInFov(options);
    let hydratedINatRows = [];
    highlightPatchRows(rows);

    if (parksHydratePromise?.then) {
      await parksHydratePromise;
      if (state.peekRunId === runId) {
        rows = localPatchesInFov(options);
        highlightPatchRows(rows);
      }
    }

    if (options.retryAfterOsm !== false) {
      const retry = () => {
        if (state.peekRunId !== runId) return;
        const refreshedRows = mergePatchRows([...localPatchesInFov(options), ...hydratedINatRows]);
        if (refreshedRows.length) highlightPatchRows(refreshedRows);
      };
      window.addEventListener("gwOsmFeaturesUpdated", retry, { once: true });
      window.setTimeout(() => window.removeEventListener("gwOsmFeaturesUpdated", retry), 1800);
    }

    if (options.includeINatProjects !== false) {
      try {
        const inatRows = await nearbyINatProjectPatchCandidates(options);
        if (state.peekRunId === runId && inatRows.length) {
          hydratedINatRows = inatRows;
          rows = mergePatchRows([...localPatchesInFov(options), ...hydratedINatRows]);
          highlightPatchRows(rows);
        }
      } catch (err) {
        console.warn("Could not hydrate nearby iNat project patches:", err);
      }
    }

    return rows;
  }

  async function showPatchViewAtLatLng(latlng, options = {}) {
    const point = normalizeLatLng(latlng);
    if (!point || !window.L) return [];

    const runId = ++state.peekRunId;
    setVisible(true);

    const searchRadiusM = Number(options.radiusM) || PATCH_VIEW_SEARCH_RADIUS_M;
    const osmFetchRadiusM = Number(options.osmFetchRadiusM) || PATCH_VIEW_OSM_FETCH_RADIUS_M;
    const inatRadiusM = Number(options.inatRadiusM) || PATCH_VIEW_INAT_SEARCH_RADIUS_M;
    const searchBounds = boundsAroundLatLng(point, searchRadiusM);
    const osmFetchBounds = boundsAroundLatLng(point, osmFetchRadiusM);
    const inatBounds = boundsAroundLatLng(point, inatRadiusM);
    let rows = localPatchesAtLatLng(point, {
      bounds: searchBounds,
      radiusM: searchRadiusM,
      candidateLimit: options.candidateLimit || PATCH_VIEW_OSM_CANDIDATE_LIMIT
    });
    let hydratedINatRows = [];
    highlightPatchRows(rows);

    const parksHydratePromise =
      window.GridWildOsmFeaturesLayer?.fetchParksForBounds?.(osmFetchBounds, {
        broad: true,
        ignoreMinZoom: true,
        profile: "patch-view"
      }) || null;

    if (parksHydratePromise?.then) {
      await parksHydratePromise;
      if (state.peekRunId === runId) {
        rows = localPatchesAtLatLng(point, {
          bounds: searchBounds,
          radiusM: searchRadiusM,
          candidateLimit: options.candidateLimit || PATCH_VIEW_OSM_CANDIDATE_LIMIT
        });
        highlightPatchRows(rows);
      }
    }

    if (options.includeINatProjects !== false) {
      try {
        hydratedINatRows = await nearbyINatProjectPatchCandidatesAtLatLng(point, {
          bounds: inatBounds,
          radiusM: inatRadiusM,
          geometryCheckLimit: options.geometryCheckLimit || PATCH_VIEW_INAT_GEOMETRY_CHECK_LIMIT,
          resultLimit: options.resultLimit || PATCH_VIEW_INAT_PROJECT_LIMIT
        });
        if (state.peekRunId === runId && hydratedINatRows.length) {
          rows = mergePatchRows([
            ...localPatchesAtLatLng(point, {
              bounds: searchBounds,
              radiusM: searchRadiusM,
              candidateLimit: options.candidateLimit || PATCH_VIEW_OSM_CANDIDATE_LIMIT
            }),
            ...hydratedINatRows
          ]).sort((a, b) => Number(a.distance_m || Infinity) - Number(b.distance_m || Infinity));
          highlightPatchRows(rows);
        }
      } catch (err) {
        console.warn("Could not hydrate iNat project patches at selected point:", err);
      }
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

    groupPatchRows(patchesWithDistance()).forEach((patch) => {
      const home = patch.id === state.homePatchId;
      const rings = patchRings(patch);

      rings.forEach((ring) => addPatchPolygon(patch, ring, home));
      (patch.child_patches || []).forEach((child) => {
        const childHome = child.id === state.homePatchId;
        patchRings(child).forEach((ring) =>
          addPatchPolygon(child, ring, childHome, { child: true, parent: patch })
        );
      });
      addPatchCompletenessLabel(patch, rings);
    });
  }

  function focusPatch(id, options = {}) {
    const patch = getPatch(id);
    if (options.select === true) selectPatch(patch);
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

  function minimizePatchSelector(root) {
    const restoreSheetName = window.GridWildSheets?.getOpen?.() || null;
    root?.remove();
    window.GridWildSheets?.closeAll?.();

    if (!window.GridWildInfoPuck?.minimize) return;

    window.GridWildInfoPuck.minimize({
      kind: "patch",
      mark: "P",
      title: "Nearby Patches",
      beforeRestore: restoreSheetName
        ? () => window.GridWildSheets?.open?.(restoreSheetName)
        : null,
      restore: () => openPatchSelector()
    });
  }

  function injectPatchSubscriptionStyles() {
    if (document.getElementById("gwPatchSubscriptionStyles")) return;
    const style = document.createElement("style");
    style.id = "gwPatchSubscriptionStyles";
    style.textContent = `
      .gw-patch-subscription-card {
        margin: 10px 0 2px;
        padding: 10px;
        border-radius: 8px;
        border: 1px solid rgba(240,209,138,0.16);
        background: rgba(255,255,255,0.045);
      }

      .gw-patch-subscription-toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #f4e8cf;
        font-size: 13px;
        font-weight: 950;
      }

      .gw-patch-subscription-toggle input {
        width: 16px;
        height: 16px;
        accent-color: #75e6a4;
      }

      .gw-patch-subscription-settings {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin-top: 9px;
      }

      .gw-patch-subscription-settings[hidden] {
        display: none;
      }

      .gw-patch-subscription-field {
        display: grid;
        gap: 4px;
        color: rgba(239,230,211,0.68);
        font-size: 11px;
        font-weight: 850;
      }

      .gw-patch-subscription-field select,
      .gw-patch-subscription-field input {
        min-width: 0;
        min-height: 32px;
        border-radius: 8px;
        border: 1px solid rgba(240,209,138,0.20);
        background: rgba(20,17,15,0.78);
        color: #f4e8cf;
        padding: 6px 8px;
        font: inherit;
      }

      .gw-patch-subscription-status {
        grid-column: 1 / -1;
        color: rgba(239,230,211,0.62);
        font-size: 11px;
        line-height: 1.3;
      }

      .gw-patch-subscription-actions {
        grid-column: 1 / -1;
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
      }

      @media (max-width: 520px) {
        .gw-patch-subscription-settings {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `;
    document.head.appendChild(style);
  }

  function renderPatchSubscriptionControls(patch) {
    const sub = patchSubscription(patch);
    const enabled = sub.enabled === true;
    const status = sub.lastError
      ? `Last check: ${formatPatchSubscriptionTime(sub.lastCheckedAt)} - ${sub.lastError}`
      : `Last check: ${formatPatchSubscriptionTime(sub.lastCheckedAt)} - ${sub.lastUnknownCount} unknown${sub.lastUnknownCount === 1 ? "" : "s"}`;

    return `
      <div class="gw-patch-subscription-card">
        <label class="gw-patch-subscription-toggle">
          <input id="gwPatchSubscriptionEnabled" type="checkbox" ${enabled ? "checked" : ""}>
          <span>Subscribe</span>
        </label>
        <div class="gw-patch-subscription-settings" data-gw-patch-subscription-settings ${enabled ? "" : "hidden"}>
          <label class="gw-patch-subscription-field">
            <span>Kingdom</span>
            <select id="gwPatchSubscriptionIconicTaxon">
              ${PATCH_SUBSCRIPTION_ICONIC_TAXA.map(
                (taxon) => `
                  <option value="${esc(taxon)}" ${sub.iconicTaxon === taxon ? "selected" : ""}>
                    ${esc(taxon === "Any" ? "Any life" : taxon)}
                  </option>
                `
              ).join("")}
            </select>
          </label>
          <label class="gw-patch-subscription-field">
            <span>Taxon ID</span>
            <input id="gwPatchSubscriptionTaxonId" type="text" inputmode="numeric" pattern="[0-9]*" value="${esc(sub.taxonId)}" placeholder="optional">
          </label>
          <div class="gw-patch-subscription-status">${esc(status)}</div>
          <div class="gw-patch-subscription-actions">
            <button class="gw-quest-btn secondary" id="gwPatchSubscriptionSaveBtn" type="button">Save</button>
            <button class="gw-quest-btn secondary" id="gwPatchSubscriptionCheckBtn" type="button">Check now</button>
          </div>
        </div>
      </div>
    `;
  }

  function patchSubscriptionFormValues(root) {
    const enabled = root.querySelector("#gwPatchSubscriptionEnabled")?.checked === true;
    const iconicTaxon = root.querySelector("#gwPatchSubscriptionIconicTaxon")?.value || "Any";
    const taxonId = String(root.querySelector("#gwPatchSubscriptionTaxonId")?.value || "").trim();
    return {
      enabled,
      iconicTaxon: PATCH_SUBSCRIPTION_ICONIC_TAXA.includes(iconicTaxon) ? iconicTaxon : "Any",
      taxonId,
      taxonLabel: taxonId ? `Taxon ${taxonId}` : ""
    };
  }

  function bindPatchSubscriptionControls(root, id, latlng = null) {
    const checkbox = root.querySelector("#gwPatchSubscriptionEnabled");
    const settings = root.querySelector("[data-gw-patch-subscription-settings]");
    const saveBtn = root.querySelector("#gwPatchSubscriptionSaveBtn");
    const checkBtn = root.querySelector("#gwPatchSubscriptionCheckBtn");
    if (!checkbox) return;

    const saveFromForm = (options = {}) => {
      const values = patchSubscriptionFormValues(root);
      if (settings) settings.hidden = !values.enabled;
      const saved = setPatchSubscription(id, values);
      if (!options.silent) {
        toast(values.enabled ? "Patch subscription saved." : "Patch subscription off.");
      }
      return saved;
    };

    checkbox.addEventListener("change", () => {
      saveFromForm();
    });

    saveBtn?.addEventListener("click", () => {
      saveFromForm();
      root.remove();
      openPatchDetail(id, latlng);
    });

    checkBtn?.addEventListener("click", async () => {
      const saved = saveFromForm({ silent: true });
      if (!isPatchSubscribed(saved)) {
        toast("Subscribe before checking.");
        return;
      }
      checkBtn.disabled = true;
      await checkPatchSubscriptionNow(id, { force: true, toastResult: true });
      root.remove();
      openPatchDetail(id, latlng);
    });
  }

  function openPatchDetail(id, latlng = null) {
    const patch = getPatch(id);
    if (!patch) return;
    const displayPatch = groupedPatchForPopup(patch);
    const home = patch.id === state.homePatchId;
    injectPatchSubscriptionStyles();

    document
      .querySelectorAll(".gw-quest-modal-backdrop.gw-patch-detail-backdrop")
      .forEach((el) => el.remove());
    const root = document.createElement("div");
    root.className = "gw-quest-modal-backdrop gw-patch-detail-backdrop";
    root.innerHTML = `
      <div class="gw-quest-modal">
        <div class="gw-quest-modal-title">${esc(patchTitle(displayPatch))}</div>
        <div class="gw-quest-modal-subtitle">
          ${esc(displayPatch.source_label || displayPatch.source || "Patch")}
          ${home ? `<span class="gw-quest-pill" style="margin-left:6px;">Home patch</span>` : ""}
        </div>
        <div class="gw-quest-status-grid">
          <div class="gw-quest-status-line"><span>Boundary</span><span>${esc(boundaryLabel(displayPatch))}</span></div>
          <div class="gw-quest-status-line"><span>Distance</span><span>${esc(formatDistance(distanceM(locationOrigin(), displayPatch.centroid)))}</span></div>
          <div class="gw-quest-status-line"><span>Source</span><span>${esc(displayPatch.source_label || displayPatch.source || "manual")}</span></div>
        </div>
        ${renderPatchChildrenList(displayPatch)}
        ${renderPatchSubscriptionControls(patch)}
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
      const childBtn = evt.target.closest("[data-gw-open-child-patch]");
      if (childBtn) {
        openPatchChildFromPopup(childBtn.dataset.gwOpenChildPatch, root, latlng);
        return;
      }
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
    bindPatchSubscriptionControls(root, id, latlng);

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
    if (tags.leisure === "common") return "common";
    if (tags.leisure === "dog_park") return "dog park";
    if (tags.leisure === "garden") return "garden";
    if (tags.leisure === "golf_course") return "golf course";
    if (tags.leisure === "nature_reserve") return "nature reserve";
    if (tags.leisure === "pitch") return "field";
    if (tags.leisure === "playground") return "playground";
    if (tags.natural === "wetland") return "wetland";
    if (tags.natural === "scrub") return "scrubland";
    if (tags.natural === "heath") return "heath";
    if (tags.natural === "shrubbery") return "shrubbery";
    if (tags.natural === "tree_row") return "tree row";
    if (tags.natural === "wood" || tags.landuse === "forest") return "woodland";
    if (tags.natural === "grassland" || tags.landuse === "grass" || tags.landuse === "meadow")
      return "grassland";
    if (tags.landuse === "recreation_ground") return "recreation ground";
    if (tags.landuse === "allotments") return "allotments";
    if (tags.landuse === "brownfield") return "brownfield";
    if (tags.landuse === "farmland") return "farmland";
    if (tags.landuse === "farmyard") return "farmyard";
    if (tags.landuse === "greenfield") return "greenfield";
    if (tags.landuse === "greenhouse_horticulture") return "greenhouse";
    if (tags.landuse === "orchard") return "orchard";
    if (tags.landuse === "plant_nursery") return "plant nursery";
    if (tags.landuse === "village_green") return "village green";
    if (tags.landuse === "vineyard") return "vineyard";
    if (tags.landcover === "flowerbed") return "flowerbed";
    if (tags.landcover === "grass") return "grass";
    if (tags.landcover === "greenery") return "greenery";
    if (tags.landcover === "meadow") return "meadow";
    if (tags.landcover === "trees") return "tree cover";
    if (tags.tourism === "camp_site") return "camp site";
    if (tags.tourism === "picnic_site") return "picnic site";
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

  function nearbyOsmPatchCandidates(limitOrOptions = 12) {
    const options =
      limitOrOptions && typeof limitOrOptions === "object"
        ? limitOrOptions
        : { limit: limitOrOptions };
    const limit = Number(options.limit ?? options.candidateLimit ?? 12) || 12;
    const origin = normalizeLatLng(options.origin) || locationOrigin();
    const searchBounds = options.bounds || null;
    const radiusM = Number(options.radiusM);
    const savedIds = new Set(state.patches.map((patch) => patch.id));
    const osmFeatures = window.GridWildOsmFeaturesLayer?.getFeatures?.() || {};
    const features = (osmFeatures.parks || []).filter((feature) => feature.closed !== false);
    const labelContext = buildOsmLabelContext(features, osmFeatures.places || []);

    const rows = features
      .map((feature) => patchFromOsmFeature(feature, labelContext))
      .filter(Boolean)
      .filter((patch) => !savedIds.has(patch.id))
      .filter((patch) => {
        if (!searchBounds?.isValid?.()) return true;
        const rings = patch.geometry?.rings || [patch.boundary];
        return (
          patchIntersectsBounds(patch, searchBounds) ||
          pointInRings(origin, rings) ||
          (Number.isFinite(radiusM) && distanceToRingsM(origin, rings) <= radiusM)
        );
      })
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
    const sourceRows =
      options.includeFallback === true
        ? withoutInheritedDuplicates
        : namedRows.length
          ? namedRows
          : withoutInheritedDuplicates;

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
        if (!patch) return;
        focusPatchObject(patch);
        minimizePatchSelector(root);
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
          ${isPatchSubscribed(patch) ? `<span class="gw-quest-pill">Subscribed</span>` : ""}
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

      .gw-patch-child-list {
        display: grid;
        gap: 6px;
        margin: 12px 0 4px;
        padding: 9px;
        border: 1px solid rgba(240,209,138,0.16);
        border-radius: 8px;
        background: rgba(20,17,15,0.42);
      }

      .gw-patch-child-list-title {
        color: #f0d18a;
        font-size: 10.5px;
        font-weight: 950;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .gw-patch-child-row {
        display: grid;
        grid-template-columns: 12px minmax(0, 1fr) auto;
        gap: 8px;
        align-items: center;
        min-width: 0;
      }

      .gw-patch-child-swatch {
        width: 10px;
        height: 10px;
        border: 2px solid var(--gw-patch-child-color, #ffd85a);
        border-radius: 999px;
        box-shadow: 0 0 8px var(--gw-patch-child-color, #ffd85a);
      }

      .gw-patch-child-main {
        display: grid;
        gap: 2px;
        min-width: 0;
      }

      .gw-patch-child-main b,
      .gw-patch-child-main small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gw-patch-child-main b {
        color: #fff7df;
        font-size: 11.5px;
        line-height: 1.1;
      }

      .gw-patch-child-main small {
        color: rgba(239,230,211,0.66);
        font-size: 10px;
        line-height: 1.15;
        font-weight: 750;
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
      box.innerHTML = "Finding boundary projects in this map view...";
      try {
        const projects = await searchINatProjects("", { nearby: true });
        box.innerHTML = renderProjectResults(projects, { nearby: true });
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
    const searchBounds = options.bounds || null;
    const maxSizeBounds = options.maxSizeBounds || searchBounds;
    const rejectOversize = options.rejectOversize === true || options.nearby === true;
    const geometryLimit =
      Number(options.geometryCheckLimit) ||
      (options.nearby
        ? INAT_PROJECT_NEARBY_GEOMETRY_CHECK_LIMIT
        : INAT_PROJECT_GEOMETRY_CHECK_LIMIT);
    const resultLimit = Number(options.resultLimit) || INAT_PROJECT_RESULT_LIMIT;
    const checks = projects.slice(0, geometryLimit).map(async (project) => {
      try {
        const resolved = await resolveINatProjectBoundary(project);
        if (!resolved) return null;

        const distance = origin ? distanceToRingsM(origin, resolved.geometry.rings) : Infinity;
        if (options.nearby) {
          // Nearby iNat projects must be drawable, in view, and no larger than one FOV.
          if (searchBounds?.isValid?.()) {
            if (!ringsIntersectBounds(resolved.geometry.rings, searchBounds)) return null;
          } else if (!Number.isFinite(distance) || distance > NEARBY_PROJECT_RADIUS_M) {
            return null;
          }
        }

        if (
          rejectOversize &&
          maxSizeBounds?.isValid?.() &&
          !ringsFitWithinFovSize(resolved.geometry.rings, maxSizeBounds)
        ) {
          return null;
        }

        return {
          ...resolved.project,
          __gwPlaceId: resolved.placeId,
          __gwBoundaryGeometry: resolved.geometry,
          __gwInFov: options.nearby === true && searchBounds?.isValid?.(),
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
      .slice(0, resultLimit);
  }

  function fovProjectSearchPoints(bounds, origin) {
    if (!bounds?.isValid?.()) return origin ? [origin] : [];

    const center = bounds.getCenter();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const raw = [
      { lat: center.lat, lng: center.lng },
      { lat: sw.lat, lng: sw.lng },
      { lat: sw.lat, lng: ne.lng },
      { lat: ne.lat, lng: sw.lng },
      { lat: ne.lat, lng: ne.lng },
      origin
    ].filter(Boolean);
    const seen = new Set();
    return raw.filter((point) => {
      const lat = Number(point.lat);
      const lng = Number(point.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
      const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function mergeProjectCandidates(groups = []) {
    const byKey = new Map();
    groups.flat().forEach((project) => {
      const key = projectLookupId(project) || String(project?.title || project?.name || "");
      if (!key || byKey.has(key)) return;
      byKey.set(key, project);
    });
    return Array.from(byKey.values());
  }

  async function fetchINatProjectCandidates(query, options = {}) {
    const url = new URL("https://api.inaturalist.org/v1/projects");
    url.searchParams.set("per_page", String(options.perPage || INAT_PROJECT_RESULT_LIMIT));
    if (query) url.searchParams.set("q", query);
    if (options.placeId) url.searchParams.set("place_id", String(options.placeId));
    const point = options.point || null;
    if (point) {
      url.searchParams.set("lat", String(point.lat));
      url.searchParams.set("lng", String(point.lng));
    }
    const data = await fetchINatJson(url);
    return Array.isArray(data.results) ? data.results : [];
  }

  async function fetchINatPlacesInBounds(bounds, options = {}) {
    if (!bounds?.isValid?.()) return [];
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const url = new URL("https://api.inaturalist.org/v1/places/nearby");
    url.searchParams.set("swlat", String(sw.lat));
    url.searchParams.set("swlng", String(sw.lng));
    url.searchParams.set("nelat", String(ne.lat));
    url.searchParams.set("nelng", String(ne.lng));
    url.searchParams.set("per_page", String(options.perPage || INAT_PLACE_NEARBY_PAGE_SIZE));

    const data = await fetchINatJson(url);
    const maxSizeBounds = options.maxSizeBounds || currentFovBounds() || bounds;
    return sortPlacesForProjectLookup(
      parseINatNearbyPlaces(data).filter((place) =>
        placeFitsFov(place, bounds, maxSizeBounds, {
          rejectOversize: options.rejectOversize
        })
      )
    );
  }

  async function fetchINatProjectCandidatesForPlaces(places = [], options = {}) {
    const selected = sortPlacesForProjectLookup(places).slice(
      0,
      options.placeLimit || INAT_PLACE_PROJECT_LOOKUP_LIMIT
    );
    const settled = await Promise.allSettled(
      selected.map(async (place) => {
        const projects = await fetchINatProjectCandidates(options.query || "", {
          placeId: place.id,
          perPage: options.perPage || INAT_PROJECTS_PER_PLACE_LIMIT
        });
        return projects.map((project) => ({
          ...project,
          __gwCandidatePlaceId: place.id,
          __gwCandidatePlaceName: place.display_name || place.name || place.slug || ""
        }));
      })
    );

    return mergeProjectCandidates(
      settled.filter((result) => result.status === "fulfilled").map((result) => result.value)
    );
  }

  async function searchINatProjects(query, options = {}) {
    const origin = options.origin || nearbySearchOrigin();
    const bounds = options.nearby ? options.bounds || nearbySearchBounds() : null;
    const maxSizeBounds = options.maxSizeBounds || currentFovBounds() || bounds;
    let projects = [];

    if (options.nearby) {
      const points = fovProjectSearchPoints(bounds, origin);
      const settled = await Promise.allSettled([
        fetchINatPlacesInBounds(bounds, {
          maxSizeBounds,
          rejectOversize: options.rejectOversize
        }).then((places) =>
          fetchINatProjectCandidatesForPlaces(places, {
            query,
            perPage: INAT_PROJECTS_PER_PLACE_LIMIT
          })
        ),
        ...points.map((point) =>
          fetchINatProjectCandidates(query, {
            point,
            perPage: INAT_PROJECT_SEARCH_PAGE_SIZE
          })
        )
      ]);
      const batches = settled
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value);
      projects = mergeProjectCandidates(batches);
      if (!projects.length) {
        const failed = settled.find((result) => result.status === "rejected");
        if (failed) throw failed.reason;
      }
    } else {
      projects = await fetchINatProjectCandidates(query, {
        perPage: INAT_PROJECT_RESULT_LIMIT
      });
    }

    return await filterProjectsWithBoundaries(projects, {
      nearby: options.nearby === true,
      origin,
      bounds,
      maxSizeBounds,
      rejectOversize: options.rejectOversize !== false,
      geometryCheckLimit:
        Number(options.geometryCheckLimit) ||
        (options.nearby
          ? INAT_PROJECT_NEARBY_GEOMETRY_CHECK_LIMIT
          : INAT_PROJECT_GEOMETRY_CHECK_LIMIT),
      resultLimit: options.resultLimit
    });
  }

  function renderProjectResults(projects = [], options = {}) {
    if (!projects.length) {
      return `<div class="gw-muted">${
        options.nearby
          ? "No boundary projects found in this map view."
          : "No boundary projects found."
      }</div>`;
    }
    return projects
      .map((project) => {
        const meta = [
          Number.isFinite(Number(project.distance_m)) ? formatDistance(project.distance_m) : null,
          project.slug || project.project_type || "iNaturalist project",
          project.__gwInFov ? "in view" : null,
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
    if (!ringsFitWithinFovSize(rings, currentFovBounds())) {
      throw new Error("Project boundary is larger than the current map view.");
    }

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
          boundary: patchBoundarySurveyStyle({ source: "inat_project" })
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

  function firstPlaceIdFromFieldRows(rows = []) {
    if (!Array.isArray(rows)) return null;
    for (const row of rows) {
      const field = String(row?.field || row?.key || row?.term || "").toLowerCase();
      if (!field.includes("place")) continue;
      const id =
        firstPlaceId(row.value_number) ||
        firstPlaceId(row.value) ||
        firstPlaceId(row.values) ||
        firstPlaceId(row.value_keyword) ||
        firstPlaceId(row.operand_id) ||
        firstPlaceId(row.operand);
      if (id) return id;
    }
    return null;
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
      firstPlaceIdFromFieldRows(project.search_parameters) ||
      firstPlaceIdFromFieldRows(project.rule_preferences) ||
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
    window.addEventListener("gwBootstrapReady", () => {
      render();
      startPatchSubscriptionPolling();
    });
    window.addEventListener("gwPatchesChanged", () => {
      if (subscribedPatches().length) schedulePatchSubscriptionScan(2500);
    });
    window.map?.on?.("move", requestPatchLabelPositionUpdate);
    window.map?.on?.("moveend", updatePatchLabelPositions);
    window.map?.on?.("zoomend", render);
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
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && subscribedPatches().length) {
        schedulePatchSubscriptionScan(800);
      }
    });
    window.map?.on?.("movestart zoomstart", closePatchActionMenu);
    startPatchSubscriptionPolling();
  }

  window.GridWildPatches = {
    checkPatchSubscriptionNow,
    focusPatch,
    formatDistance,
    getHomePatch,
    getPatch,
    getPatches: () => patchesWithDistance(),
    isVisible: () => state.layerVisible,
    showPatchViewAtLatLng,
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
    setPatchSubscription,
    setVisible,
    toggleVisible,
    unsetHomePatch,
    upsertPatch
  };

  init();
})();
