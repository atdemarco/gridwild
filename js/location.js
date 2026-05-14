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

function setUserLocation(lat, lng, accuracyMeters) {
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
        }).addTo(map).bindPopup("You are here");
      } else {
        userMarker.setLatLng(latlng);
        updateUserMarkerHeading(lastHeading ?? 0);
      }

      if (!accuracyCircle) {
        accuracyCircle = L.circle(latlng, {
          radius: Math.max(accuracyMeters || 0, 5)
        }).addTo(map);
      } else {
        accuracyCircle.setLatLng(latlng);
        accuracyCircle.setRadius(Math.max(accuracyMeters || 0, 5));
      }

      const zoom = map.getZoom();
      const zoomMultiplier = Math.pow(2, zoom - 17).toFixed(2);

      const metersPerPixel = getMapResolution();
      const cellMeters = 20 * 0.3048; // same constant used in grid code
      const cellPixels = (cellMeters / metersPerPixel).toFixed(0);

      hud.innerHTML =
        `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)} (±${Math.round(accuracyMeters)} m)
        <span style="opacity:.65"> <br>Zoom ×${zoomMultiplier}
        • ${metersPerPixel.toFixed(2)} m/px
        • cell ≈ ${cellPixels}px
        </span>`;

        if (window.GridWildOverviewMap) {
          window.GridWildOverviewMap.updateUserLocation(lat, lng, accuracyMeters);
        }

        if (window.GridWildParty?.recordPartyPosition) {
          window.GridWildParty.recordPartyPosition(lat, lng, accuracyMeters);
        }
    }

// Geolocation
let lastFix = null;
let lastHeading = null;   // degrees, 0 = north
let compassListenersAttached = false;
let compassPermissionState = "unknown";
let compassDeniedToastShown = false;

const COMPASS_HEADING_SMOOTHING = 0.35;
const LOCK_ZOOM_CLOSE = 19;
const LOCK_ZOOM_WIDE = 17;
const LOCK_PROGRAMMATIC_MOVE_GRACE_MS = 900;
const LOCK_PAN_BREAK_THRESHOLD_PX = 44;
const LOCK_VIEW_ANIMATION_SECONDS = 0.9;

const GPS_GOOD_THRESHOLD_M = 20;
const MAP_HEADING_ROTATION_ENABLED = true;

let mapHeadingDeg = 0;
let mapHeadingRaf = null;

function normalizeLockZoomMode(mode) {
  return mode === "wide" ? "wide" : "close";
}

function zoomForLockMode(mode) {
  return normalizeLockZoomMode(mode) === "wide" ? LOCK_ZOOM_WIDE : LOCK_ZOOM_CLOSE;
}

function setProgrammaticLockMoveGuard() {
  window.__gwState = window.__gwState || {};
  window.__gwState.programmaticAutoCenterUntil =
    Date.now() + LOCK_PROGRAMMATIC_MOVE_GRACE_MS;
}

function setProgrammaticLockMoveGuardFor(seconds = LOCK_VIEW_ANIMATION_SECONDS) {
  window.__gwState = window.__gwState || {};
  const durationMs = Math.max(LOCK_PROGRAMMATIC_MOVE_GRACE_MS, Math.ceil(Number(seconds) * 1000) + 150);
  window.__gwState.programmaticAutoCenterUntil = Date.now() + durationMs;
  window.__gwState.lockViewAnimationUntil = Date.now() + durationMs;
}

function animateLockedUserView(latlng, zoom, options = {}) {
  const {
    animate = true,
    duration = LOCK_VIEW_ANIMATION_SECONDS,
    forceFly = false
  } = options;

  if (!map || !latlng) return;

  const targetZoom = Number.isFinite(Number(zoom)) ? Number(zoom) : map.getZoom();
  const currentZoom = map.getZoom();
  const shouldFly = forceFly || Math.abs(currentZoom - targetZoom) > 0.05;

  setProgrammaticLockMoveGuardFor(duration);

  if (animate && shouldFly && typeof map.flyTo === "function") {
    map.flyTo(latlng, targetZoom, {
      animate: true,
      duration,
      easeLinearity: 0.25
    });
  } else if (shouldFly) {
    map.setView(latlng, targetZoom, { animate });
  } else {
    map.panTo(latlng, { animate });
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
  const {
    toastOnSuccess = false,
    zoom = 19,
    force = true
  } = options;

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
  btn.title = locked
    ? (mode === "wide" ? "Tracking on: wide" : "Tracking on: close")
    : "Find me";

  if (typeof syncCompassTracking === "function") {
    syncCompassTracking({ requestPermission: false });
  }
}

function enableLocationLock(options = {}) {
  const {
    zoom = null,
    mode = null,
    recenterNow = true,
    force = true
  } = options;

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
  const nextMode = state.lockToLocation
    ? (currentMode === "close" ? "wide" : "close")
    : "close";

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
  stopCompassTracking();
  applyMapRotation(0);

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
  return !!(
    evt?.type?.startsWith?.("touch") ||
    evt?.pointerType === "touch"
  );
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

map.getContainer().addEventListener("touchstart", (e) => {
  const t = e.touches?.[0];
  if (!t) return;

  gwLockTouchStart = {
    x: t.clientX,
    y: t.clientY
  };

  gwLockBrokenThisTouch = false;
}, { passive: true });

map.getContainer().addEventListener("touchmove", (e) => {
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
}, { passive: true });

map.getContainer().addEventListener("touchend", () => {
  gwLockTouchStart = null;
  gwLockBrokenThisTouch = false;
}, { passive: true });

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

function applyCompassHeading(headingDeg, source = "unknown") {
  if (!window.__gwState?.lockToLocation) return;
  if (!Number.isFinite(headingDeg)) return;

  lastHeading = smoothHeading(headingDeg);
  window.__gwCompassHeading = lastHeading;
  window.__gwCompassSource = source;
  updateUserMarkerHeading(lastHeading);
  applyMapRotation(lastHeading);
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
  if (!window.__gwState?.lockToLocation) return;
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

  if (!window.__gwState?.lockToLocation) {
    stopCompassTracking();
    return false;
  }

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

function syncCompassTracking(options = {}) {
  if (window.__gwState?.lockToLocation) {
    startCompassTracking(options);
    applyMapRotation(lastHeading ?? 0);
  } else {
    stopCompassTracking();
    applyMapRotation(0);
  }
}

function getCompassState() {
  return {
    active: compassListenersAttached,
    permission: compassPermissionState,
    heading: lastHeading,
    source: window.__gwCompassSource || null
  };
}

function getMapPanePosition(mapPane) {
  if (window.L?.DomUtil?.getPosition) {
    const pos = L.DomUtil.getPosition(mapPane);
    if (pos) return pos;
  }

  return L.point(0, 0);
}

function setMapPaneHeadingTransform() {
  const mapPane = map.getPane("mapPane");
  if (!mapPane) return;

  const pos = getMapPanePosition(mapPane);
  const size = map.getSize();
  const originX = (size.x / 2) - pos.x;
  const originY = (size.y / 2) - pos.y;
  const rotationDeg = window.__gwState?.lockToLocation ? -mapHeadingDeg : 0;

  // Leaflet owns the pane translation; GridWild appends heading rotation only.
  mapPane.style.transformOrigin = `${originX}px ${originY}px`;
  mapPane.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) rotate(${rotationDeg}deg)`;
}

function scheduleMapHeadingTransform() {
  if (mapHeadingRaf) return;

  mapHeadingRaf = requestAnimationFrame(() => {
    mapHeadingRaf = null;
    setMapPaneHeadingTransform();
  });
}

function applyMapRotation(headingDeg = 0) {
  mapHeadingDeg = MAP_HEADING_ROTATION_ENABLED
    ? normalizeHeading(Number(headingDeg) || 0)
    : 0;

  scheduleMapHeadingTransform();
}

function enableDeviceOrientation() {
  return startCompassTracking({ requestPermission: true });
}

map.on("move zoom resize viewreset moveend zoomend", scheduleMapHeadingTransform);

map.on("zoomend", () => {
  if (!lastFix) return;
  const { latitude, longitude, accuracy } = lastFix;
  setUserLocation(latitude, longitude, accuracy);
  setLockButtonVisual();
});

function getMapResolution() {
  const lat = map.getCenter().lat;
  const zoom = map.getZoom();

  const metersPerPixel =
    (156543.03392 * Math.cos(lat * Math.PI / 180)) / Math.pow(2, zoom);

  return metersPerPixel;
}

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
