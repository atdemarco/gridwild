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

     // const zoom = map.getZoom();
//const zoomMultiplier = Math.pow(2, zoom - 17).toFixed(2);

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


//hud.textContent =
 // `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)} (±${Math.round(accuracyMeters)} m) • Zoom ×${zoomMultiplier}`;

// original hud text :)  
//      hud.textContent =
 //       `Lat: ${Math.round(lat.toFixed(6),4)}, Lng: ${Math.round(lng.toFixed(6),4)} (±${Math.round(accuracyMeters)} m)`;
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

    // Let the central logic decide whether auto-centering is allowed
    if (typeof window.handleUserPositionUpdate === "function") {
      window.handleUserPositionUpdate(latitude, longitude, true);
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
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000
    }
  );
}


function disableAutoCenterFromUserGesture() {
  //console.log("disableAutoCenterFromUserGesture() Triggering disable auto center from user gesture...")
  if (!window.__gwState) return;
  if (!window.__gwState.lockToLocation) return;

  const cb = document.getElementById("toggleLockLocation");

  window.__gwState.lockToLocation = false;
  window.__gwState.suspendAutoCenterUntil = Number.POSITIVE_INFINITY;

  if (cb && cb.checked) {
    cb.checked = false;
    cb.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

map.on("dragstart", disableAutoCenterFromUserGesture);
map.on("zoomstart", disableAutoCenterFromUserGesture);
map.on("mousedown", disableAutoCenterFromUserGesture);
map.on("touchstart", disableAutoCenterFromUserGesture);



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

function applyMapRotation(headingDeg = 0) {
  const mapPane = map.getPane("mapPane");
  if (!mapPane) return;

  mapPane.style.transformOrigin = "50% 50%";
  mapPane.style.transform = `rotate(${-headingDeg}deg)`;
}

function handleDeviceOrientation(event) {
  if (typeof event.alpha !== "number") return;

  lastHeading = normalizeHeading(event.alpha);

  updateUserMarkerHeading(lastHeading);
  applyMapRotation(lastHeading);
}

function enableDeviceOrientation() {
//  window.addEventListener("deviceorientationabsolute", handleDeviceOrientation, true);
//  window.addEventListener("deviceorientation", handleDeviceOrientation, true);
}

map.on("moveend zoomend", () => {
//  applyMapRotation(lastHeading ?? 0);
});

map.on("zoomend", () => {
  if (!lastFix) return;
  const { latitude, longitude, accuracy } = lastFix;
  setUserLocation(latitude, longitude, accuracy);
});

hud.innerHTML =
//  `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)} (±${Math.round(accuracyMeters)} m)
//   <span style="opacity:.6"> • Zoom ×${zoomMultiplier}</span>`;

   function getMapResolution() {
  const lat = map.getCenter().lat;
  const zoom = map.getZoom();

  const metersPerPixel =
    (156543.03392 * Math.cos(lat * Math.PI / 180)) / Math.pow(2, zoom);

  return metersPerPixel;
}

// ok getting info to label square size in pixels.
function getMapResolution() {
  const lat = map.getCenter().lat;
  const zoom = map.getZoom();

  const metersPerPixel =
    (156543.03392 * Math.cos(lat * Math.PI / 180)) / Math.pow(2, zoom);

  return metersPerPixel;
}