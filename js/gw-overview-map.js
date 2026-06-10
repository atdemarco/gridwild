// -----------------------------------------------------------------------------
// GridWild Field Map / overview inset
// -----------------------------------------------------------------------------

(function () {
  const OVERVIEW_ZOOM_OFFSET = 4;
  const MIN_OVERVIEW_ZOOM = 10;
  const MAX_OVERVIEW_ZOOM = 14;

  let overviewMap = null;
  let viewportRect = null;
  let patchLayer = null;
  let userDot = null;
  let userAccuracy = null;
  let syncing = false;
  let expanded = false;
  let lastPatchSignature = "";

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

      .gw-overview-shell.is-expanded {
        position: fixed;
        left: 50%;
        top: 50%;
        right: auto;
        bottom: auto;
        width: min(820px, calc(100vw - 32px));
        height: min(640px, calc(100vh - 40px));
        z-index: 100020;
        transform: translate(-50%, -50%);
        border-radius: 20px;
        border: 2px solid rgba(215,183,116,0.82);
        background: rgba(20,17,15,0.98);
        box-shadow:
          0 28px 78px rgba(0,0,0,0.58),
          0 0 0 1px rgba(255,255,255,0.08) inset,
          0 0 34px rgba(215,183,116,0.18);
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

      .gw-overview-shell.is-expanded .gw-overview-title {
        left: 14px;
        top: 14px;
        font-size: 11px;
      }

      .gw-overview-minimize {
        display: none;
        position: absolute;
        right: 14px;
        top: 14px;
        z-index: 3;
        width: 34px;
        height: 34px;
        border-radius: 999px;
        border: 1px solid rgba(215,183,116,0.5);
        background: rgba(20,17,15,0.82);
        color: #f0d18a;
        font-size: 20px;
        line-height: 1;
        font-weight: 950;
        cursor: pointer;
        box-shadow: 0 8px 22px rgba(0,0,0,0.34);
      }

      .gw-overview-shell.is-expanded .gw-overview-minimize {
        display: grid;
        place-items: center;
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

      .gw-overview-patch {
        cursor: zoom-in;
        filter: drop-shadow(0 0 3px rgba(255,216,90,0.36));
      }

      .gw-overview-patch-inat {
        filter: drop-shadow(0 0 3px rgba(125,223,255,0.38));
      }

      .gw-overview-patch-home {
        filter:
          drop-shadow(0 0 4px rgba(0,0,0,0.75))
          drop-shadow(0 0 6px rgba(255,255,255,0.26));
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

        .gw-sheet.is-open ~ .gw-overview-shell.is-expanded {
          display: block;
        }

        .gw-overview-shell.is-expanded {
          width: calc(100vw - 20px);
          height: min(76dvh, calc(100dvh - 96px));
          border-radius: 18px;
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
      <button class="gw-overview-minimize" type="button" aria-label="Minimize field map" title="Minimize">-</button>
      <div id="gwOverviewMap"></div>
    `;

    document.body.appendChild(shell);
    shell.addEventListener("click", (event) => {
      if (event.target.closest?.(".gw-overview-minimize")) {
        event.preventDefault();
        event.stopPropagation();
        setExpanded(false);
        return;
      }

      if (!expanded) setExpanded(true);
    });
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

    patchLayer = L.layerGroup().addTo(overviewMap);

    viewportRect = L.rectangle(map.getBounds(), {
      className: "gw-overview-viewport",
      interactive: false
    }).addTo(overviewMap);

    overviewMap.on("click", () => {
      if (!expanded) setExpanded(true);
    });
    map.on("move zoom resize moveend zoomend", scheduleSync);
    window.addEventListener("gwPatchesChanged", () => renderPatchLayer(true));

    setTimeout(syncFromMainMap, 100);
  }

  function setExpanded(show) {
    expanded = show === true;
    document.getElementById("gwOverviewShell")?.classList.toggle("is-expanded", expanded);
    window.setTimeout(() => {
      overviewMap?.invalidateSize?.({ animate: false });
      syncFromMainMap();
    }, 0);
  }

  function getOverviewZoom() {
    const mainZoom = Number(map.getZoom());
    if (!Number.isFinite(mainZoom)) return MAX_OVERVIEW_ZOOM;
    return clamp(mainZoom - OVERVIEW_ZOOM_OFFSET, MIN_OVERVIEW_ZOOM, MAX_OVERVIEW_ZOOM);
  }

  function syncFromMainMap() {
    if (!overviewMap || syncing) return;

    syncing = true;

    const center = map.getCenter();

    // Keep the inset broader than the HUD while following the same zoom direction.
    overviewMap.setView(center, getOverviewZoom(), { animate: false });

    // Still update the little rectangle from the main map bounds.
    // As the main map zooms in, this rectangle gets smaller.
    if (viewportRect) {
      viewportRect.setBounds(map.getBounds());
    }

    renderPatchLayer();
    syncing = false;
  }

  function isINatPatch(patch) {
    return (
      patch?.source === "inat_project" ||
      patch?.metadata?.imported_from === "inat_project" ||
      /iNaturalist/i.test(String(patch?.source_label || ""))
    );
  }

  function patchTheme(patch) {
    return isINatPatch(patch)
      ? {
          lineColor: "#7ddfff",
          fillColor: "#7ddfff",
          glowClass: "gw-overview-patch-inat"
        }
      : {
          lineColor: "#ffd85a",
          fillColor: "#ffd85a",
          glowClass: "gw-overview-patch-gold"
        };
  }

  function normalizedRing(ring = []) {
    return (Array.isArray(ring) ? ring : [])
      .map((point) => ({
        lat: Number(point?.lat),
        lng: Number(point?.lng)
      }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  }

  function patchRings(patch) {
    const rings = Array.isArray(patch?.geometry?.rings) ? patch.geometry.rings : [];
    if (rings.length) return rings.map(normalizedRing).filter((ring) => ring.length >= 3);

    const boundary = normalizedRing(patch?.boundary || patch?.survey_geometry?.boundary || []);
    return boundary.length >= 3 ? [boundary] : [];
  }

  function patchSignature(patches = []) {
    return patches
      .map(
        (patch) =>
          `${patch?.id || ""}:${patch?.is_home_patch ? "home" : ""}:${patch?.updated_at || patch?.saved_at || ""}`
      )
      .sort()
      .join("|");
  }

  function focusPatchFromOverview(patchId) {
    setExpanded(false);
    window.GridWildPatches?.focusPatch?.(patchId, { select: true });
  }

  function renderPatchLayer(force = false) {
    if (!patchLayer || !window.GridWildPatches?.getPatches) return;

    const patches = window.GridWildPatches.getPatches() || [];
    const signature = patchSignature(patches);
    if (!force && signature === lastPatchSignature) return;
    lastPatchSignature = signature;
    patchLayer.clearLayers();

    patches.forEach((patch) => {
      if (!patch?.id) return;
      const theme = patchTheme(patch);
      const home = patch.is_home_patch === true;
      const style = {
        color: home ? "#050505" : theme.lineColor,
        weight: home ? 4 : 2.8,
        opacity: home ? 1 : 0.94,
        fillColor: theme.fillColor,
        fillOpacity: home ? 0.2 : 0.13,
        dashArray: home ? "" : "6 5",
        className: `gw-overview-patch ${theme.glowClass}${home ? " gw-overview-patch-home" : ""}`
      };

      patchRings(patch).forEach((ring) => {
        const polygon = L.polygon(
          ring.map((point) => [point.lat, point.lng]),
          {
            ...style,
            interactive: true,
            bubblingMouseEvents: false
          }
        ).addTo(patchLayer);

        polygon.on("click", (event) => {
          if (event?.originalEvent && window.L?.DomEvent?.stop) {
            L.DomEvent.stop(event.originalEvent);
          }
          if (!expanded) {
            setExpanded(true);
            return;
          }
          focusPatchFromOverview(patch.id);
        });
      });
    });
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
