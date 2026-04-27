// -----------------------------------------------------------------------------
// GridWild Field Map / overview inset
// -----------------------------------------------------------------------------

(function () {
  const OVERVIEW_ZOOM_OFFSET = 4;   // main zoom 19 -> inset zoom 15
  const MIN_OVERVIEW_ZOOM = 13;
  const MAX_OVERVIEW_ZOOM = 17;

  let overviewMap = null;
  let viewportRect = null;
  let userDot = null;
  let userAccuracy = null;
  let syncing = false;

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function injectStyles() {
    if (document.getElementById("gwOverviewMapStyles")) return;

    const style = document.createElement("style");
    style.id = "gwOverviewMapStyles";
    style.textContent = `
      .gw-overview-shell {
        position: absolute;
        right: 12px;
        bottom: calc(max(10px, env(safe-area-inset-bottom)) + 76px + 16px);
        width: 168px;
        height: 128px;
        z-index: 1320;
        border-radius: 18px;
        overflow: hidden;
        border: 2px solid rgba(215,183,116,0.62);
        background: rgba(20,17,15,0.96);
        box-shadow:
          0 14px 36px rgba(0,0,0,0.42),
          inset 0 1px 0 rgba(255,255,255,0.05);
      }

      .gw-overview-title {
        position: absolute;
        left: 8px;
        top: 7px;
        z-index: 2;
        padding: 3px 7px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 950;
        letter-spacing: 0.07em;
        color: #f0d18a;
        background: rgba(20,17,15,0.78);
        border: 1px solid rgba(215,183,116,0.22);
        pointer-events: none;
        text-transform: uppercase;
      }

      #gwOverviewMap {
        width: 100%;
        height: 100%;
        background: #1c211d;
      }

      #gwOverviewMap .leaflet-control-container {
        display: none;
      }

      .gw-overview-viewport {
        color: #ffe082;
        fill: rgba(255,224,130,0.12);
        fill-opacity: 0.18;
        weight: 2;
        opacity: 0.95;
        dash-array: 4 4;
      }

      .gw-overview-user-dot {
        width: 12px;
        height: 12px;
        border-radius: 999px;
        background: #d8fff2;
        border: 2px solid #0b7a5d;
        box-shadow:
          0 0 0 2px rgba(216,255,242,0.34),
          0 0 12px rgba(216,255,242,0.65);
      }

      @media (max-width: 700px), (pointer: coarse) {
        .gw-overview-shell {
          width: 144px;
          height: 110px;
          right: 10px;
          bottom: calc(max(10px, env(safe-area-inset-bottom)) + 76px + 14px);
        }

        .gw-sheet.is-open ~ .gw-overview-shell {
          display: none;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function makeShell() {
    if (document.getElementById("gwOverviewShell")) return;

    const shell = document.createElement("div");
    shell.id = "gwOverviewShell";
    shell.className = "gw-overview-shell";
    shell.innerHTML = `
      <div class="gw-overview-title">Field Map</div>
      <div id="gwOverviewMap"></div>
    `;

    document.body.appendChild(shell);
  }

  function init() {
    if (!window.L || !window.map) return;

    injectStyles();
    makeShell();

    overviewMap = L.map("gwOverviewMap", {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      tap: false,
      touchZoom: false
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 20
    }).addTo(overviewMap);

    viewportRect = L.rectangle(map.getBounds(), {
      className: "gw-overview-viewport",
      interactive: false
    }).addTo(overviewMap);

    map.on("move zoom resize moveend zoomend", scheduleSync);

    setTimeout(syncFromMainMap, 100);
  }

  function getOverviewZoom() {
    return clamp(
      map.getZoom() - OVERVIEW_ZOOM_OFFSET,
      MIN_OVERVIEW_ZOOM,
      MAX_OVERVIEW_ZOOM
    );
  }

  function syncFromMainMap() {
    if (!overviewMap || syncing) return;

    syncing = true;

    const center = map.getCenter();
    const z = getOverviewZoom();

    overviewMap.setView(center, z, { animate: false });

    if (viewportRect) {
      viewportRect.setBounds(map.getBounds());
    }

    syncing = false;
  }

  let raf = null;
  function scheduleSync() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      syncFromMainMap();
    });
  }

  function updateUserLocation(lat, lng, accuracyMeters) {
    if (!overviewMap) return;

    const latlng = [lat, lng];

    if (!userDot) {
      const icon = L.divIcon({
        className: "",
        html: `<div class="gw-overview-user-dot"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });

      userDot = L.marker(latlng, {
        icon,
        interactive: false
      }).addTo(overviewMap);
    } else {
      userDot.setLatLng(latlng);
    }

    if (!userAccuracy) {
      userAccuracy = L.circle(latlng, {
        radius: Math.max(Number(accuracyMeters) || 0, 5),
        stroke: true,
        weight: 1,
        opacity: 0.55,
        fill: true,
        fillOpacity: 0.08,
        interactive: false
      }).addTo(overviewMap);
    } else {
      userAccuracy.setLatLng(latlng);
      userAccuracy.setRadius(Math.max(Number(accuracyMeters) || 0, 5));
    }
  }

  window.GridWildOverviewMap = {
    init,
    syncFromMainMap,
    updateUserLocation
  };

  document.addEventListener("DOMContentLoaded", init);
})();