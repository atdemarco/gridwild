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

      hud.textContent =
        `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)} (±${Math.round(accuracyMeters)} m)`;
    }

// Geolocation
let lastFix = null;
let lastHeading = null;   // degrees, 0 = north


function requestLocationOnce() {
  if (!("geolocation" in navigator)) {
    hud.textContent = "Geolocation not supported in this browser.";
    return;
  }

  hud.textContent = "Requesting location permission…";

  navigator.geolocation.getCurrentPosition(
(pos) => {
  const { latitude, longitude, accuracy } = pos.coords;
  lastFix = { latitude, longitude, accuracy };
  setUserLocation(latitude, longitude, accuracy);

  if (typeof window.handleUserPositionUpdate === "function") {
    window.handleUserPositionUpdate(latitude, longitude, true);
  } else {
    map.setView([latitude, longitude], 18);
  }

  map.once("moveend", () => {
    if (typeof window.scheduleOSMVectorOverlayUpdate === "function") {
      window.scheduleOSMVectorOverlayUpdate();
    }
  });
}
,
    (err) => {
      // Common causes: permission denied, not https, no GPS, timeout
      hud.textContent = `Location error: ${err.message}`;
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000
    }
  );
}

// Live tracking (optional but usually what you want on a phone)
function startWatchingLocation() {
  if (!("geolocation" in navigator)) return null;

  return navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      lastFix = { latitude, longitude, accuracy };
      setUserLocation(latitude, longitude, accuracy);

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

function handleDeviceOrientation(event) {
  // On many phones, alpha is compass-like but browser/platform dependent.
  if (typeof event.alpha !== "number") return;

  // This may need sign-flipping depending on platform testing.
  lastHeading = normalizeHeading(event.alpha);
  updateUserMarkerHeading(lastHeading);
}

function enableDeviceOrientation() {
  window.addEventListener("deviceorientationabsolute", handleDeviceOrientation, true);
  window.addEventListener("deviceorientation", handleDeviceOrientation, true);
}