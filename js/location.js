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

const GPS_GOOD_THRESHOLD_M = 20;

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
      map.setView([latitude, longitude], zoom, { animate: true });
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
  btn.classList.toggle("is-locked", locked);
  btn.setAttribute("aria-pressed", locked ? "true" : "false");
  btn.title = locked ? "Tracking on" : "Find me";

  if (typeof syncCompassTracking === "function") {
    syncCompassTracking({ requestPermission: false });
  }
}

function enableLocationLock(options = {}) {
  const {
    zoom = 19,
    recenterNow = true,
    force = true
  } = options;

  window.__gwState = window.__gwState || {};
  const state = window.__gwState;

  const wasLocked = !!state.lockToLocation;
  const hadFix = !!lastFix;

  state.lockToLocation = true;
  state.suspendAutoCenterUntil = 0;
  state.lockZoom = zoom;

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
    map.setView([lastFix.latitude, lastFix.longitude], zoom, { animate: true });

    if (typeof window.handleUserPositionUpdate === "function") {
      window.handleUserPositionUpdate(lastFix.latitude, lastFix.longitude, force);
    }
  } else if (recenterNow && typeof requestLocationOnce === "function") {
    requestLocationOnce({
      toastOnSuccess: !hadFix,
      zoom,
      force
    });
  }
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
  showGridWildToast("Follow lock disabled");
  window.__gwState.suspendAutoCenterUntil = Number.POSITIVE_INFINITY;
  stopCompassTracking();

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

  // Only break lock on real user interaction
  if (e?.originalEvent || e?.sourceTarget) {
    disableLocationLock();
  }
}

//map.on("dragstart", disableAutoCenterFromUserGesture);
//map.on("zoomstart", disableAutoCenterFromUserGesture);
let gwLockTouchStart = null;
let gwLockBrokenThisTouch = false;

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

  if (dist > 45) {   // swipe threshold in pixels
    disableLocationLock();
    gwLockBrokenThisTouch = true;
  }
}, { passive: true });

map.getContainer().addEventListener("touchend", () => {
  gwLockTouchStart = null;
  gwLockBrokenThisTouch = false;
}, { passive: true });

// Desktop / mouse pan unlock.
// Mobile touch pan is handled above by the 45px swipe threshold.
map.on("dragstart", (e) => {
  const oe = e?.originalEvent;

  // Ignore touch-originated Leaflet drags so mobile does not become too sensitive.
  if (oe?.type && oe.type.startsWith("touch")) return;
  if (oe?.pointerType === "touch") return;

  disableAutoCenterFromUserGesture(e);
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
  } else {
    stopCompassTracking();
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

function applyMapRotation(headingDeg = 0) {
  const mapPane = map.getPane("mapPane");
  if (!mapPane) return;

  mapPane.style.transformOrigin = "50% 50%";
  mapPane.style.transform = `rotate(${-headingDeg}deg)`;
}

function enableDeviceOrientation() {
  return startCompassTracking({ requestPermission: true });
}

map.on("moveend zoomend", () => {
//  applyMapRotation(lastHeading ?? 0);
});

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
window.disableLocationLock = disableLocationLock;
window.setLockButtonVisual = setLockButtonVisual;
window.requestLocationOnce = requestLocationOnce;
window.startWatchingLocation = startWatchingLocation;
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
