function makeUserHeadingIcon(headingDeg = 0) {
  return L.divIcon({
    className: "gw-user-heading-icon",
    html: `
      <div class="gw-user-heading-wrap" style="transform: rotate(${headingDeg}deg);">
        <div class="gw-user-heading-body">🧍</div>
        <div class="gw-user-heading-arrow">▲</div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });
}

function updateUserMarkerHeading(headingDeg = 0) {
  if (!userMarker) return;

  const el = userMarker.getElement();
  if (!el) return;

  const wrap = el.querySelector(".gw-user-heading-wrap");
  if (wrap) {
    wrap.style.transform = `rotate(${headingDeg}deg)`;
  }
}

function gpsCircleEnabled() {
  return window.__gwState?.showGpsCircle === true;
}

function removeGpsAccuracyCircle() {
  if (!accuracyCircle) return;
  map.removeLayer(accuracyCircle);
  accuracyCircle = null;
}

function syncGpsAccuracyCircle(latlng, accuracyMeters) {
  if (!gpsCircleEnabled()) {
    removeGpsAccuracyCircle();
    return;
  }

  if (!accuracyCircle) {
    accuracyCircle = L.circle(latlng, {
      radius: Math.max(accuracyMeters || 0, 5)
    }).addTo(map);
    return;
  }

  accuracyCircle.setLatLng(latlng);
  accuracyCircle.setRadius(Math.max(accuracyMeters || 0, 5));
}

function timeLocationVerbose(label, fn, detail = null) {
  const timer = window.GridWildVerboseConsole;
  return timer?.time ? timer.time(label, fn, detail) : fn();
}

function setUserLocation(lat, lng, accuracyMeters) {
  return timeLocationVerbose("setUserLocation", () => {
    window.__gwLastUserLocation = {
      lat: Number(lat),
      lng: Number(lng),
      accuracyMeters: Number(accuracyMeters),
      updatedAt: new Date().toISOString()
    };

    updateGpsHealthBadge(accuracyMeters);
    const latlng = [lat, lng];

    if (!userMarker) {
      userMarker = L.marker(latlng, {
        icon: makeUserHeadingIcon(lastHeading ?? 0)
      })
        .addTo(map)
        .bindPopup("You are here");
    } else {
      userMarker.setLatLng(latlng);
      updateUserMarkerHeading(lastHeading ?? 0);
    }

    syncGpsAccuracyCircle(latlng, accuracyMeters);

    const zoom = map.getZoom();
    const zoomMultiplier = Math.pow(2, zoom - 17).toFixed(2);

    const metersPerPixel = getMapResolution();
    const cellMeters = 20 * 0.3048; // same constant used in grid code
    const cellPixels = (cellMeters / metersPerPixel).toFixed(0);
    const accuracyLabel =
      window.GridWildUnits?.formatDistance?.(accuracyMeters) || `${Math.round(accuracyMeters)} m`;
    const resolutionLabel =
      window.GridWildUnits?.formatDistance?.(metersPerPixel) || `${metersPerPixel.toFixed(2)} m`;

    hud.innerHTML = `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)} (&plusmn;${accuracyLabel})
        <span style="opacity:.65"> <br>Zoom x${zoomMultiplier}
        &bull; ${resolutionLabel}/px
        &bull; cell approx ${cellPixels}px
        </span>`;

    if (window.GridWildOverviewMap) {
      window.GridWildOverviewMap.updateUserLocation(lat, lng, accuracyMeters);
    }

    if (window.GridWildParty?.recordPartyPosition) {
      window.GridWildParty.recordPartyPosition(lat, lng, accuracyMeters);
    }
  });
}

// Geolocation
let lastFix = null;
let lastHeading = null; // degrees, 0 = north
let compassListenersAttached = false;
let compassPermissionState = "unknown";
let compassDeniedToastShown = false;
let compassPreferredSource = null;
let lastCompassAcceptedAt = 0;
let compassSourceSeenAt = {};

const COMPASS_HEADING_SMOOTHING = 0.18;
const COMPASS_HEADING_DEADBAND_DEG = 2.5;
const COMPASS_HEADING_MIN_UPDATE_MS = 80;
const COMPASS_SOURCE_ACTIVE_MS = 4500;
const COMPASS_SOURCE_DECISION_LOG_LIMIT = 80;
const LOCK_ZOOM_CLOSE = 19;
const LOCK_ZOOM_WIDE = 17;
const LOCK_PROGRAMMATIC_MOVE_GRACE_MS = 900;
const LOCK_PAN_BREAK_THRESHOLD_PX = 44;
const LOCK_VIEW_ANIMATION_SECONDS = 0.9;

const GPS_GOOD_THRESHOLD_M = 20;
const MAP_HEADING_ROTATION_ENABLED = true;
const COMPASS_ORIENTATION_HEADS_UP = "headsUp";
const COMPASS_ORIENTATION_NORTH_UP = "northUp";
const COMPASS_ORIENTATION_TRANSITION_MS = 420;
const COMPASS_CAMERA_WRITE_LOG_LIMIT = 80;

let mapHeadingDeg = 0;
let mapHeadingRaf = null;
let mapHeadingTransformApplied = false;
let orientationMode = window.__gwState?.lockToLocation
  ? COMPASS_ORIENTATION_HEADS_UP
  : COMPASS_ORIENTATION_NORTH_UP;
let orientationTransition = null;
let orientationTransitionTarget = null;
let orientationTransitionRaf = null;
let orientationTransitionToken = 0;

function normalizeLockZoomMode(mode) {
  return mode === "wide" ? "wide" : "close";
}

function zoomForLockMode(mode) {
  return normalizeLockZoomMode(mode) === "wide" ? LOCK_ZOOM_WIDE : LOCK_ZOOM_CLOSE;
}

function setProgrammaticLockMoveGuard() {
  window.__gwState = window.__gwState || {};
  window.__gwState.programmaticAutoCenterUntil = Date.now() + LOCK_PROGRAMMATIC_MOVE_GRACE_MS;
}

function setProgrammaticLockMoveGuardFor(seconds = LOCK_VIEW_ANIMATION_SECONDS) {
  window.__gwState = window.__gwState || {};
  const durationMs = Math.max(
    LOCK_PROGRAMMATIC_MOVE_GRACE_MS,
    Math.ceil(Number(seconds) * 1000) + 150
  );
  window.__gwState.programmaticAutoCenterUntil = Date.now() + durationMs;
  window.__gwState.lockViewAnimationUntil = Date.now() + durationMs;
}

function targetCompassOrientationMode() {
  return window.__gwState?.lockToLocation
    ? COMPASS_ORIENTATION_HEADS_UP
    : COMPASS_ORIENTATION_NORTH_UP;
}

function compassOrientationMode() {
  return orientationMode;
}

function compassHeadingOrFallback(fallback = mapHeadingDeg) {
  return lastHeading !== null && Number.isFinite(Number(lastHeading))
    ? Number(lastHeading)
    : Number(fallback) || 0;
}

function cameraBearingForOrientationMode(mode, headingDeg = lastHeading) {
  return mode === COMPASS_ORIENTATION_HEADS_UP
    ? normalizeHeading(Number.isFinite(Number(headingDeg)) ? Number(headingDeg) : mapHeadingDeg)
    : 0;
}

function cameraBearingForMode(headingDeg = lastHeading) {
  if (orientationTransition) {
    return normalizeHeading(Number(mapHeadingDeg) || 0);
  }

  return cameraBearingForOrientationMode(orientationMode, headingDeg);
}

function shouldUseMapBearingOrientation() {
  return orientationTransition !== null || orientationMode === COMPASS_ORIENTATION_HEADS_UP;
}

function shouldTreatCameraAsHeadingUp() {
  return (
    orientationTransition !== null ||
    orientationMode === COMPASS_ORIENTATION_HEADS_UP ||
    targetCompassOrientationMode() === COMPASS_ORIENTATION_HEADS_UP
  );
}

function signedHeadingDeltaDeg(from, to) {
  return ((normalizeHeading(to) - normalizeHeading(from) + 540) % 360) - 180;
}

function easeOrientationTransition(t) {
  const x = Math.max(0, Math.min(1, Number(t) || 0));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function refreshCompassOrientationDebugState() {
  window.__gwCompassOrientationMode = orientationMode;
  window.__gwCompassOrientationTargetMode = targetCompassOrientationMode();
  window.__gwCompassOrientationTransition = orientationTransition;
  window.__gwCompassMapBearing = normalizeHeading(Number(mapHeadingDeg) || 0);
}

function logCameraBearingWrite(source, requestedBearing = cameraBearingForMode()) {
  const mode = compassOrientationMode();
  refreshCompassOrientationDebugState();
  window.__gwCompassCameraWrites = Array.isArray(window.__gwCompassCameraWrites)
    ? window.__gwCompassCameraWrites
    : [];

  const entry = {
    at: Date.now(),
    source: String(source || "unknown"),
    requestedBearing: normalizeHeading(Number(requestedBearing) || 0),
    mode,
    targetMode: targetCompassOrientationMode(),
    transition: orientationTransition
  };
  window.__gwCompassCameraWrites.push(entry);
  if (window.__gwCompassCameraWrites.length > COMPASS_CAMERA_WRITE_LOG_LIMIT) {
    window.__gwCompassCameraWrites.splice(
      0,
      window.__gwCompassCameraWrites.length - COMPASS_CAMERA_WRITE_LOG_LIMIT
    );
  }
  if (window.__gwDebugCompassCamera === true) {
    console.debug("[GridWild compass camera]", entry);
  }
}

function preserveCompassBearingAfterCameraWrite(source) {
  applyMapRotation(cameraBearingForMode(), { source });
}

function animateLockedUserView(latlng, zoom, options = {}) {
  const { animate = true, duration = LOCK_VIEW_ANIMATION_SECONDS, forceFly = false } = options;

  if (!map || !latlng) return;

  const targetZoom = Number.isFinite(Number(zoom)) ? Number(zoom) : map.getZoom();
  const currentZoom = map.getZoom();
  const shouldFly = forceFly || Math.abs(currentZoom - targetZoom) > 0.05;
  const headingUp = shouldTreatCameraAsHeadingUp();

  setProgrammaticLockMoveGuardFor(headingUp ? 0.2 : duration);

  if (headingUp) {
    if (shouldFly) {
      map.setView(latlng, targetZoom, { animate: false });
      preserveCompassBearingAfterCameraWrite("gps-follow-setView");
    } else {
      map.panTo(latlng, { animate: false });
      preserveCompassBearingAfterCameraWrite("gps-follow-panTo");
    }
  } else if (animate && shouldFly && typeof map.flyTo === "function") {
    map.flyTo(latlng, targetZoom, {
      animate: true,
      duration,
      easeLinearity: 0.25
    });
    preserveCompassBearingAfterCameraWrite("gps-follow-flyTo");
  } else if (shouldFly) {
    map.setView(latlng, targetZoom, { animate });
    preserveCompassBearingAfterCameraWrite("gps-follow-setView");
  } else {
    map.panTo(latlng, { animate });
    preserveCompassBearingAfterCameraWrite("gps-follow-panTo");
  }
}

function setLockZoomMode(mode) {
  window.__gwState = window.__gwState || {};
  const nextMode = normalizeLockZoomMode(mode);
  window.__gwState.lockZoomMode = nextMode;
  window.__gwState.lockZoom = zoomForLockMode(nextMode);
  return nextMode;
}

function updateGpsHealthBadge(accuracyMeters) {
  const badge = document.getElementById("gpsHealthIcon");
  if (!badge) return;

  badge.classList.remove("gps-good", "gps-bad", "gps-unknown");

  const n = Number(accuracyMeters);

  if (!Number.isFinite(n)) {
    badge.classList.add("gps-unknown");
    badge.textContent = "?";
    badge.title = "GPS accuracy unknown";
    window.__gwGpsHealthy = false;
    return;
  }

  if (n <= GPS_GOOD_THRESHOLD_M) {
    badge.classList.add("gps-good");
    badge.textContent = "✓";
    badge.title = `GPS healthy: ±${Math.round(n)} m`;
    window.__gwGpsHealthy = true;
  } else {
    badge.classList.add("gps-bad");
    badge.textContent = "!";
    badge.title = `GPS weak: ±${Math.round(n)} m. Too imprecise for reliable grid-square credit.`;
    window.__gwGpsHealthy = false;
  }

  window.__gwLastGpsAccuracy = n;
}

function requestLocationOnce(options = {}) {
  const { toastOnSuccess = false, zoom = 19, force = true } = options;

  if (!("geolocation" in navigator)) {
    hud.textContent = "Geolocation not supported in this browser.";
    showGridWildToast("Location not supported");
    return;
  }

  hud.textContent = "Requesting location permission…";

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;

      lastFix = { latitude, longitude, accuracy };
      setUserLocation(latitude, longitude, accuracy);
      setLockButtonVisual();
      window.dispatchEvent(
        new CustomEvent("gwUserLocationUpdated", {
          detail: { latitude, longitude, accuracy, force }
        })
      );

      // Let the central logic decide whether auto-centering is allowed
      if (typeof window.handleUserPositionUpdate === "function") {
        window.handleUserPositionUpdate(latitude, longitude, force);
      }

      if (toastOnSuccess && window.__gwState?.lockToLocation) {
        showGridWildToast("Follow lock enabled");
        animateLockedUserView([latitude, longitude], zoom, { forceFly: true });
      }

      map.once("moveend", () => {
        if (typeof window.scheduleOSMVectorOverlayUpdate === "function") {
          window.scheduleOSMVectorOverlayUpdate();
        }
      });
    },
    (err) => {
      // Common causes: permission denied, not https, no GPS, timeout
      hud.textContent = `Location error: ${err.message}`;
      showGridWildToast("Could not find location");
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000
    }
  );
}

function setLockButtonVisual() {
  const btn = document.getElementById("recenterFab");
  if (!btn) return;

  const locked = !!window.__gwState?.lockToLocation;
  const mode = normalizeLockZoomMode(window.__gwState?.lockZoomMode);
  btn.classList.toggle("is-locked", locked);
  btn.classList.toggle("is-locked-wide", locked && mode === "wide");
  btn.setAttribute("aria-pressed", locked ? "true" : "false");
  btn.title = locked ? (mode === "wide" ? "Tracking on: wide" : "Tracking on: close") : "Find me";

  if (typeof syncCompassTracking === "function") {
    syncCompassTracking({ requestPermission: false });
  }
}

function enableLocationLock(options = {}) {
  const { zoom = null, mode = null, recenterNow = true, force = true } = options;

  window.__gwState = window.__gwState || {};
  const state = window.__gwState;

  const wasLocked = !!state.lockToLocation;
  const hadFix = !!lastFix;

  state.lockToLocation = true;
  state.suspendAutoCenterUntil = 0;
  const nextMode = setLockZoomMode(mode || state.lockZoomMode || "close");
  const lockZoom = Number.isFinite(Number(zoom)) ? Number(zoom) : zoomForLockMode(nextMode);
  state.lockZoom = lockZoom;

  startCompassTracking({ requestPermission: true });

  if (!wasLocked) {
    if (hadFix) {
      showGridWildToast("Follow lock enabled");
    } else {
      showGridWildToast("Finding location…");
    }
  }

  const cb = document.getElementById("toggleLockLocation");
  if (cb && !cb.checked) {
    cb.checked = true;
    cb.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    setLockButtonVisual();
  }

  if (recenterNow && lastFix) {
    animateLockedUserView([lastFix.latitude, lastFix.longitude], lockZoom, { forceFly: true });

    if (typeof window.handleUserPositionUpdate === "function") {
      window.handleUserPositionUpdate(lastFix.latitude, lastFix.longitude, force);
    }
  } else if (recenterNow && typeof requestLocationOnce === "function") {
    requestLocationOnce({
      toastOnSuccess: !hadFix,
      zoom: lockZoom,
      force
    });
  }
}

function cycleLocationLock(options = {}) {
  window.__gwState = window.__gwState || {};
  const state = window.__gwState;
  const currentMode = normalizeLockZoomMode(state.lockZoomMode);
  const nextMode = state.lockToLocation ? (currentMode === "close" ? "wide" : "close") : "close";

  return enableLocationLock({
    ...options,
    mode: nextMode,
    zoom: zoomForLockMode(nextMode)
  });
}
function showGridWildToast(message = "") {
  let toast = document.getElementById("gwToast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "gwToast";

    Object.assign(toast.style, {
      position: "absolute",
      left: "50%",
      bottom: "118px",
      transform: "translateX(-50%) translateY(10px)",
      zIndex: "999999",
      padding: "10px 14px",
      borderRadius: "999px",
      fontSize: "13px",
      fontWeight: "800",
      letterSpacing: "0.3px",
      color: "#efe6d3",
      background: "rgba(20,17,15,0.94)",
      border: "1px solid rgba(215,183,116,0.34)",
      boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
      opacity: "0",
      transition: "opacity 180ms ease, transform 180ms ease",
      pointerEvents: "none"
    });

    document.body.appendChild(toast);
  }

  toast.textContent = message;

  toast.style.opacity = "1";
  toast.style.transform = "translateX(-50%) translateY(0px)";

  clearTimeout(toast._timer);

  toast._timer = setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(-50%) translateY(10px)";
  }, 1800);
}

function disableLocationLock() {
  if (!window.__gwState) return;
  if (!window.__gwState.lockToLocation) return;

  window.__gwState.lockToLocation = false;
  setLockZoomMode("close");
  showGridWildToast("Follow lock disabled");
  window.__gwState.suspendAutoCenterUntil = Number.POSITIVE_INFINITY;
  startOrientationTransition(COMPASS_ORIENTATION_NORTH_UP, { source: "disableLocationLock" });

  const cb = document.getElementById("toggleLockLocation");
  if (cb && cb.checked) {
    cb.checked = false;
    cb.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    setLockButtonVisual();
  }
}

function disableAutoCenterFromUserGesture(e) {
  if (!window.__gwState?.lockToLocation) return;
  if (Date.now() < (window.__gwState?.programmaticAutoCenterUntil || 0)) return;

  // Only break lock on real user interaction
  if (e?.originalEvent) {
    disableLocationLock();
  }
}

//map.on("dragstart", disableAutoCenterFromUserGesture);
//map.on("zoomstart", disableAutoCenterFromUserGesture);
let gwLockTouchStart = null;
let gwLockBrokenThisTouch = false;
let gwLockDragStartPoint = null;

function isTouchLikeOriginalEvent(evt) {
  return !!(evt?.type?.startsWith?.("touch") || evt?.pointerType === "touch");
}

function pointDistance(a, b) {
  if (!a || !b) return 0;
  const dx = Number(b.x) - Number(a.x);
  const dy = Number(b.y) - Number(a.y);
  return Math.sqrt(dx * dx + dy * dy);
}

function maybeDisableLockForPanDistance(distancePx) {
  if (!window.__gwState?.lockToLocation) return false;
  if (Date.now() < (window.__gwState?.programmaticAutoCenterUntil || 0)) return false;
  if (distancePx < LOCK_PAN_BREAK_THRESHOLD_PX) return false;

  disableLocationLock();
  return true;
}

map.getContainer().addEventListener(
  "touchstart",
  (e) => {
    const t = e.touches?.[0];
    if (!t) return;

    gwLockTouchStart = {
      x: t.clientX,
      y: t.clientY
    };

    gwLockBrokenThisTouch = false;
  },
  { passive: true }
);

map.getContainer().addEventListener(
  "touchmove",
  (e) => {
    if (!window.__gwState?.lockToLocation) return;
    if (!gwLockTouchStart) return;
    if (gwLockBrokenThisTouch) return;

    const t = e.touches?.[0];
    if (!t) return;

    const dx = t.clientX - gwLockTouchStart.x;
    const dy = t.clientY - gwLockTouchStart.y;

    const dist = Math.sqrt(dx * dx + dy * dy);

    if (maybeDisableLockForPanDistance(dist)) {
      gwLockBrokenThisTouch = true;
    }
  },
  { passive: true }
);

map.getContainer().addEventListener(
  "touchend",
  () => {
    gwLockTouchStart = null;
    gwLockBrokenThisTouch = false;
  },
  { passive: true }
);

// Manual pan unlock. Tiny drags/taps should not break follow lock.
map.on("dragstart", (e) => {
  const oe = e?.originalEvent;

  if (!window.__gwState?.lockToLocation) return;
  if (Date.now() < (window.__gwState?.programmaticAutoCenterUntil || 0)) return;

  gwLockDragStartPoint = map.project(map.getCenter(), map.getZoom());

  // Touch-originated Leaflet drags are also watched by touchmove above.
  if (oe?.type && oe.type.startsWith("touch")) return;
  if (oe?.pointerType === "touch") return;
});

map.on("dragend", (e) => {
  if (!gwLockDragStartPoint) return;

  const oe = e?.originalEvent;
  if (isTouchLikeOriginalEvent(oe) && gwLockBrokenThisTouch) {
    gwLockDragStartPoint = null;
    return;
  }

  const endPoint = map.project(map.getCenter(), map.getZoom());
  maybeDisableLockForPanDistance(pointDistance(gwLockDragStartPoint, endPoint));
  gwLockDragStartPoint = null;
});

map.on("zoomstart", disableAutoCenterFromUserGesture);

// Live tracking (optional but usually what you want on a phone)
function startWatchingLocation() {
  if (!("geolocation" in navigator)) return null;

  return navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy, heading, speed } = pos.coords;
      lastFix = { latitude, longitude, accuracy };
      updateHeadingFromGps(heading, speed);
      setUserLocation(latitude, longitude, accuracy);
      setLockButtonVisual();
      window.dispatchEvent(
        new CustomEvent("gwUserLocationUpdated", {
          detail: { latitude, longitude, accuracy }
        })
      );

      if (typeof window.handleUserPositionUpdate === "function") {
        window.handleUserPositionUpdate(latitude, longitude, false);
      }
    },
    (err) => {
      hud.textContent = `Location error: ${err.message}`;
    },
    {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 5000
    }
  );
}

function normalizeHeading(deg) {
  deg = deg % 360;
  if (deg < 0) deg += 360;
  return deg;
}

function smoothHeading(nextHeading) {
  const next = normalizeHeading(nextHeading);
  if (!Number.isFinite(lastHeading)) return next;

  const delta = ((next - lastHeading + 540) % 360) - 180;
  return normalizeHeading(lastHeading + delta * COMPASS_HEADING_SMOOTHING);
}

function headingDeltaDeg(a, b) {
  return Math.abs(((normalizeHeading(a) - normalizeHeading(b) + 540) % 360) - 180);
}

function compassSourceRank(source) {
  if (source === "webkitCompassHeading") return 4;
  if (source === "deviceorientationabsolute") return 3;
  if (source === "deviceorientation") return 2;
  if (source === "gps") return 1;
  return 0;
}

function markCompassSourceSeen(source, now = Date.now()) {
  compassSourceSeenAt = {
    ...compassSourceSeenAt,
    [String(source || "unknown")]: now
  };
  window.__gwCompassSourceSeenAt = { ...compassSourceSeenAt };
}

function recentCompassSources(now = Date.now()) {
  return Object.entries(compassSourceSeenAt)
    .filter(([, seenAt]) => now - Number(seenAt) <= COMPASS_SOURCE_ACTIVE_MS)
    .sort((a, b) => {
      const rankDelta = compassSourceRank(b[0]) - compassSourceRank(a[0]);
      return rankDelta || Number(b[1]) - Number(a[1]);
    });
}

function bestRecentCompassSource(now = Date.now()) {
  return recentCompassSources(now)[0]?.[0] || null;
}

function logCompassSourceDecision(source, headingDeg, decision, reason) {
  window.__gwCompassSourceDecisions = Array.isArray(window.__gwCompassSourceDecisions)
    ? window.__gwCompassSourceDecisions
    : [];

  const entry = {
    at: Date.now(),
    source: String(source || "unknown"),
    heading: normalizeHeading(Number(headingDeg) || 0),
    preferredSource: compassPreferredSource,
    bestRecentSource: bestRecentCompassSource(),
    decision,
    reason
  };

  window.__gwCompassSourceDecisions.push(entry);
  if (window.__gwCompassSourceDecisions.length > COMPASS_SOURCE_DECISION_LOG_LIMIT) {
    window.__gwCompassSourceDecisions.splice(
      0,
      window.__gwCompassSourceDecisions.length - COMPASS_SOURCE_DECISION_LOG_LIMIT
    );
  }

  if (window.__gwDebugCompassCamera === true) {
    console.debug("[GridWild compass source]", entry);
  }
}

function shouldPreferCompassSource(source, now = Date.now()) {
  if (!compassPreferredSource) return true;
  if (source === compassPreferredSource) return true;

  const bestRecentSource = bestRecentCompassSource(now);
  const sourceRank = compassSourceRank(source);
  const preferredRank = compassSourceRank(compassPreferredSource);
  const preferredSeenAt = Number(compassSourceSeenAt[compassPreferredSource] || 0);
  const preferredIsActive = now - preferredSeenAt <= COMPASS_SOURCE_ACTIVE_MS;

  // iOS Safari's webkitCompassHeading is the least ambiguous source when present.
  if (source === "webkitCompassHeading" && sourceRank >= preferredRank) return true;
  if (bestRecentSource && source !== bestRecentSource) return false;
  if (sourceRank > preferredRank) return true;
  if (!preferredIsActive) return true;

  return false;
}

function applyCompassHeading(headingDeg, source = "unknown") {
  if (!Number.isFinite(headingDeg)) return;

  const now = Date.now();
  markCompassSourceSeen(source, now);
  if (!shouldPreferCompassSource(source, now)) {
    logCompassSourceDecision(source, headingDeg, "ignored", "preferred-source-active");
    return;
  }

  const normalizedHeading = normalizeHeading(headingDeg);
  const lastAcceptedHeading = Number.isFinite(lastHeading) ? lastHeading : null;

  if (lastAcceptedHeading !== null) {
    const delta = headingDeltaDeg(normalizedHeading, lastAcceptedHeading);
    if (delta < COMPASS_HEADING_DEADBAND_DEG) {
      logCompassSourceDecision(source, normalizedHeading, "ignored", "deadband");
      return;
    }
    if (now - lastCompassAcceptedAt < COMPASS_HEADING_MIN_UPDATE_MS) {
      logCompassSourceDecision(source, normalizedHeading, "ignored", "min-update-interval");
      return;
    }
  }

  compassPreferredSource = source;
  lastCompassAcceptedAt = now;
  lastHeading = smoothHeading(normalizedHeading);
  window.__gwCompassHeading = lastHeading;
  window.__gwCompassSource = source;
  logCompassSourceDecision(source, normalizedHeading, "accepted", "heading-update");
  updateUserMarkerHeading(lastHeading);
  applyMapRotation(lastHeading, { source });
}

function headingFromDeviceOrientation(event) {
  const webkitHeading = Number(event.webkitCompassHeading);
  if (Number.isFinite(webkitHeading)) {
    return {
      heading: normalizeHeading(webkitHeading),
      source: "webkitCompassHeading"
    };
  }

  const alpha = Number(event.alpha);
  if (!Number.isFinite(alpha)) return null;

  return {
    heading: normalizeHeading(360 - alpha),
    source: event.type || "deviceorientation"
  };
}

function handleDeviceOrientation(event) {
  const reading = headingFromDeviceOrientation(event);
  if (!reading) return;

  applyCompassHeading(reading.heading, reading.source);
}

function updateHeadingFromGps(headingDeg, speed) {
  if (compassListenersAttached) return;
  if (!Number.isFinite(Number(headingDeg))) return;

  const metersPerSecond = Number(speed);
  if (Number.isFinite(metersPerSecond) && metersPerSecond < 0.5) return;

  applyCompassHeading(Number(headingDeg), "gps");
}

function attachCompassListeners() {
  if (compassListenersAttached) return;
  if (!("DeviceOrientationEvent" in window)) return;

  window.addEventListener("deviceorientationabsolute", handleDeviceOrientation, true);
  window.addEventListener("deviceorientation", handleDeviceOrientation, true);
  compassListenersAttached = true;
}

function stopCompassTracking() {
  if (!compassListenersAttached) return;

  window.removeEventListener("deviceorientationabsolute", handleDeviceOrientation, true);
  window.removeEventListener("deviceorientation", handleDeviceOrientation, true);
  compassListenersAttached = false;
}

async function requestCompassPermission() {
  const OrientationEvent = window.DeviceOrientationEvent;
  if (!OrientationEvent || typeof OrientationEvent.requestPermission !== "function") {
    compassPermissionState = "granted";
    return true;
  }

  try {
    const result = await OrientationEvent.requestPermission();
    compassPermissionState = result;
    return result === "granted";
  } catch (err) {
    console.warn("Compass permission request failed:", err);
    compassPermissionState = "error";
    return false;
  }
}

async function startCompassTracking(options = {}) {
  const { requestPermission = false } = options;

  if (!("DeviceOrientationEvent" in window)) {
    compassPermissionState = "unsupported";
    return false;
  }

  if (requestPermission) {
    const ok = await requestCompassPermission();
    if (!ok) {
      stopCompassTracking();
      if (!compassDeniedToastShown) {
        showGridWildToast("Compass unavailable");
        compassDeniedToastShown = true;
      }
      return false;
    }
  }

  if (compassPermissionState !== "denied" && compassPermissionState !== "error") {
    attachCompassListeners();
  }

  return compassListenersAttached;
}

function finishOrientationTransition(targetMode, source) {
  const finalBearing = cameraBearingForOrientationMode(
    targetMode,
    compassHeadingOrFallback(mapHeadingDeg)
  );

  orientationTransitionRaf = null;
  orientationTransition = null;
  orientationTransitionTarget = null;
  orientationMode = targetMode;
  mapHeadingDeg = finalBearing;
  updateUserMarkerHeading(lastHeading ?? 0);
  setMapPaneHeadingTransform();
  logCameraBearingWrite(`${source}:transition-complete`, finalBearing);
}

function startOrientationTransition(targetMode = targetCompassOrientationMode(), options = {}) {
  const source = typeof options === "string" ? options : options?.source || "orientation";
  const nextMode =
    targetMode === COMPASS_ORIENTATION_HEADS_UP
      ? COMPASS_ORIENTATION_HEADS_UP
      : COMPASS_ORIENTATION_NORTH_UP;

  if (orientationTransition && orientationTransitionTarget === nextMode) {
    scheduleMapHeadingTransform();
    return;
  }

  if (!MAP_HEADING_ROTATION_ENABLED) {
    orientationMode = nextMode;
    orientationTransition = null;
    orientationTransitionTarget = null;
    mapHeadingDeg = 0;
    mapHeadingTransformApplied = false;
    refreshCompassOrientationDebugState();
    return;
  }

  const fromBearing = Number(mapHeadingDeg) || 0;
  const heading = compassHeadingOrFallback(fromBearing);
  const toBearing = cameraBearingForOrientationMode(nextMode, heading);
  const delta = signedHeadingDeltaDeg(fromBearing, toBearing);

  if (orientationTransitionRaf) {
    cancelAnimationFrame(orientationTransitionRaf);
    orientationTransitionRaf = null;
  }

  const token = ++orientationTransitionToken;

  orientationTransition = nextMode === COMPASS_ORIENTATION_HEADS_UP ? "toHeadsUp" : "toNorthUp";
  orientationTransitionTarget = nextMode;
  refreshCompassOrientationDebugState();
  logCameraBearingWrite(`${source}:transition-start`, fromBearing);

  if (Math.abs(delta) < 0.5) {
    finishOrientationTransition(nextMode, source);
    return;
  }

  const durationMs = Math.max(
    120,
    Math.min(800, Number(options?.durationMs) || COMPASS_ORIENTATION_TRANSITION_MS)
  );
  const startedAt = performance.now();

  const step = (timestamp) => {
    if (token !== orientationTransitionToken) return;

    const progress = Math.min(1, (timestamp - startedAt) / durationMs);
    const eased = easeOrientationTransition(progress);
    mapHeadingDeg = fromBearing + delta * eased;
    updateUserMarkerHeading(lastHeading ?? 0);
    setMapPaneHeadingTransform();

    if (progress < 1) {
      orientationTransitionRaf = requestAnimationFrame(step);
      return;
    }

    finishOrientationTransition(nextMode, source);
  };

  orientationTransitionRaf = requestAnimationFrame(step);
}

function syncCompassTracking(options = {}) {
  const targetMode = targetCompassOrientationMode();

  if (targetMode === COMPASS_ORIENTATION_HEADS_UP) {
    startCompassTracking(options);
  } else {
    if (compassPermissionState === "granted" || compassListenersAttached) {
      startCompassTracking({ requestPermission: false });
    }
  }

  updateUserMarkerHeading(lastHeading ?? 0);

  if (targetMode !== orientationMode || orientationTransition) {
    startOrientationTransition(targetMode, { source: "syncCompassTracking" });
    return;
  }

  applyMapRotation(lastHeading ?? 0, { source: "syncCompassTracking" });
}

function getCompassState() {
  return {
    active: compassListenersAttached,
    permission: compassPermissionState,
    heading: lastHeading,
    source: window.__gwCompassSource || null,
    mode: compassOrientationMode(),
    targetMode: targetCompassOrientationMode(),
    transition: orientationTransition,
    cameraBearing: cameraBearingForMode(),
    sourceSeenAt: { ...compassSourceSeenAt },
    sourceDecisions: (window.__gwCompassSourceDecisions || []).slice(-12),
    cameraWrites: (window.__gwCompassCameraWrites || []).slice(-12)
  };
}

function getMapPanePosition(mapPane) {
  if (window.L?.DomUtil?.getPosition) {
    const pos = L.DomUtil.getPosition(mapPane);
    if (pos) return pos;
  }

  return L.point(0, 0);
}

function getHeadingTransformOrigin(pos) {
  const size = map.getSize();
  const containerPoint = L.point(size.x / 2, size.y / 2);

  return {
    x: containerPoint.x - pos.x,
    y: containerPoint.y - pos.y
  };
}

function setMapPaneHeadingTransform() {
  if (!MAP_HEADING_ROTATION_ENABLED) return;

  const mapPane = map.getPane("mapPane");
  if (!mapPane) return;

  const rotationDeg = shouldUseMapBearingOrientation() ? -mapHeadingDeg : 0;
  const shouldRotate = Math.abs(rotationDeg) > 0.01;
  if (!shouldRotate && !mapHeadingTransformApplied) return;

  const pos = getMapPanePosition(mapPane);
  const origin = getHeadingTransformOrigin(pos);

  // Leaflet owns the pane translation; GridWild appends heading rotation only.
  mapPane.style.transformOrigin = shouldRotate ? `${origin.x}px ${origin.y}px` : "";
  mapPane.style.transform = shouldRotate
    ? `translate3d(${pos.x}px, ${pos.y}px, 0) rotate(${rotationDeg}deg)`
    : `translate3d(${pos.x}px, ${pos.y}px, 0)`;
  mapHeadingTransformApplied = shouldRotate;
}

function scheduleMapHeadingTransform() {
  if (!MAP_HEADING_ROTATION_ENABLED) return;
  if (shouldUseMapBearingOrientation()) {
    setMapPaneHeadingTransform();
    return;
  }

  if (mapHeadingRaf) return;

  const run = () => {
    mapHeadingRaf = null;
    setMapPaneHeadingTransform();
  };

  if (window.GridWildMapMotionQueue?.requestFrame) {
    mapHeadingRaf = true;
    window.GridWildMapMotionQueue.requestFrame("map-heading", run);
  } else {
    mapHeadingRaf = requestAnimationFrame(run);
  }
}

function applyMapRotation(headingDeg = 0, options = {}) {
  const source = typeof options === "string" ? options : options?.source || "applyMapRotation";
  const ownsTransition =
    source === "orientation-transition" || String(source).endsWith(":transition-complete");
  const requestedBearing =
    orientationTransition && !ownsTransition
      ? normalizeHeading(Number(headingDeg) || 0)
      : cameraBearingForMode(headingDeg);

  if (orientationTransition && !ownsTransition) {
    logCameraBearingWrite(`${source}:suppressed-during-transition`, requestedBearing);
    scheduleMapHeadingTransform();
    return;
  }

  logCameraBearingWrite(source, requestedBearing);

  if (!MAP_HEADING_ROTATION_ENABLED) {
    mapHeadingDeg = 0;
    mapHeadingTransformApplied = false;
    return;
  }

  mapHeadingDeg = requestedBearing;

  scheduleMapHeadingTransform();
}

function enableDeviceOrientation() {
  return startCompassTracking({ requestPermission: true });
}

if (MAP_HEADING_ROTATION_ENABLED) {
  if (window.GridWildMapMotionQueue?.subscribe) {
    window.GridWildMapMotionQueue.subscribe("map-heading-motion", scheduleMapHeadingTransform);
  } else {
    map.on("move zoom resize viewreset moveend zoomend", scheduleMapHeadingTransform);
  }
}

map.on("zoomend", () => {
  if (!lastFix) return;
  const { latitude, longitude, accuracy } = lastFix;
  setUserLocation(latitude, longitude, accuracy);
  setLockButtonVisual();
});

function getMapResolution() {
  const lat = map.getCenter().lat;
  const zoom = map.getZoom();

  const metersPerPixel = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);

  return metersPerPixel;
}

const GW_SCALE_TARGET_PX = 78;
const GW_SCALE_MIN_PX = 44;
const GW_SCALE_MAX_PX = 118;

function scaleDistanceCandidates() {
  if (window.GridWildUnits?.metricEnabled?.()) {
    return [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  }

  return [
    10 / 3.280839895,
    25 / 3.280839895,
    50 / 3.280839895,
    100 / 3.280839895,
    200 / 3.280839895,
    100 / 1.0936132983,
    200 / 1.0936132983,
    0.25 / 0.0006213711922,
    0.5 / 0.0006213711922,
    1 / 0.0006213711922
  ];
}

function chooseScaleDistance(metersPerPixel) {
  const candidates = scaleDistanceCandidates()
    .map((meters) => ({ meters, px: meters / metersPerPixel }))
    .filter((entry) => entry.px >= GW_SCALE_MIN_PX && entry.px <= GW_SCALE_MAX_PX);

  if (candidates.length) {
    return candidates.sort(
      (a, b) => Math.abs(a.px - GW_SCALE_TARGET_PX) - Math.abs(b.px - GW_SCALE_TARGET_PX)
    )[0];
  }

  return scaleDistanceCandidates()
    .map((meters) => ({ meters, px: meters / metersPerPixel }))
    .sort((a, b) => Math.abs(a.px - GW_SCALE_TARGET_PX) - Math.abs(b.px - GW_SCALE_TARGET_PX))[0];
}

function formatZoomMultiplier() {
  const multiplier = Math.pow(2, map.getZoom() - 17);
  if (!Number.isFinite(multiplier) || multiplier <= 0) return "x1";

  if (multiplier >= 10) return `x${multiplier.toFixed(0)}`;
  if (multiplier >= 1) return `x${multiplier.toFixed(2).replace(/\.?0+$/, "")}`;
  return `x${multiplier.toFixed(2)}`;
}

let scaleHatchRaf = null;

function updateMapScaleHatch() {
  return timeLocationVerbose("updateMapScaleHatch", () => {
    const hatch = document.getElementById("gwMapScaleHatch");
    const label = document.getElementById("gwMapScaleHatchLabel");
    if (!hatch || !label) return;

    const scale = chooseScaleDistance(getMapResolution());
    if (!scale) return;

    hatch.style.width = `${Math.round(scale.px)}px`;
    const distanceLabel =
      window.GridWildUnits?.formatDistance?.(scale.meters) || `${Math.round(scale.meters)} m`;
    label.textContent = `${distanceLabel} ${formatZoomMultiplier()}`;
  });
}

function scheduleMapScaleHatch() {
  return timeLocationVerbose("scheduleMapScaleHatch", () => {
    if (scaleHatchRaf) return;
    const run = () => {
      scaleHatchRaf = null;
      updateMapScaleHatch();
    };

    if (window.GridWildMapMotionQueue?.requestFrame) {
      scaleHatchRaf = true;
      window.GridWildMapMotionQueue.requestFrame("map-scale-hatch", run);
    } else {
      scaleHatchRaf = requestAnimationFrame(run);
    }
  });
}

if (window.GridWildMapMotionQueue?.subscribe) {
  window.GridWildMapMotionQueue.subscribe("map-scale-hatch-motion", scheduleMapScaleHatch, {
    events: "zoom zoomend move moveend resize"
  });
} else {
  map.on("zoom zoomend move moveend resize", scheduleMapScaleHatch);
}
window.addEventListener("gridwild:unitschange", scheduleMapScaleHatch);
setTimeout(scheduleMapScaleHatch, 0);

window.addEventListener("gridwild:gpscirclechange", () => {
  if (!lastFix) {
    removeGpsAccuracyCircle();
    return;
  }

  setUserLocation(lastFix.latitude, lastFix.longitude, lastFix.accuracy);
});

window.enableLocationLock = enableLocationLock;
window.cycleLocationLock = cycleLocationLock;
window.disableLocationLock = disableLocationLock;
window.setLockButtonVisual = setLockButtonVisual;
window.requestLocationOnce = requestLocationOnce;
window.startWatchingLocation = startWatchingLocation;
window.animateLockedUserView = animateLockedUserView;
window.startCompassTracking = startCompassTracking;
window.stopCompassTracking = stopCompassTracking;
window.syncCompassTracking = syncCompassTracking;
window.enableDeviceOrientation = enableDeviceOrientation;
window.GridWildCompass = {
  start: startCompassTracking,
  stop: stopCompassTracking,
  sync: syncCompassTracking,
  getState: getCompassState
};
